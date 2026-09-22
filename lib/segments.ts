import { callModel } from "./model";
import { findMatches, protectPreservedTerms, restorePreservedTerms, type ProtectedInput } from "./matcher";
import type { TargetLanguage } from "./languages";
import { segmentSystemPrompt, terminologyInstructions } from "./prompts";
import type { GlossaryRule, TermMatch } from "./types";
import { validateTranslation } from "./validation";

// Keeps each model call comfortably within output limits.
const BATCH_CHARACTERS = 8_000;
const BATCH_ITEMS = 40;

type Prepared = {
  id: number;
  source: string;
  matches: TermMatch[];
  protectedInput: ProtectedInput;
};

type Item = { id: number; text: string };

function prepare(segments: string[], rules: GlossaryRule[]): Prepared[] {
  let placeholderCount = 0;
  return segments.map((source, index) => {
    const matches = findMatches(source, rules);
    const protectedInput = protectPreservedTerms(source, matches, placeholderCount);
    placeholderCount += protectedInput.placeholders.length;
    return { id: index + 1, source, matches, protectedInput };
  });
}

function batch(items: Prepared[]): Prepared[][] {
  const batches: Prepared[][] = [];
  let current: Prepared[] = [];
  let size = 0;
  for (const item of items) {
    const length = item.protectedInput.text.length;
    if (current.length && (size + length > BATCH_CHARACTERS || current.length >= BATCH_ITEMS)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += length;
  }
  if (current.length) batches.push(current);
  return batches;
}

export function parseItems(raw: string): Map<number, string> {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  const parsed: unknown = JSON.parse(start !== -1 && end > start ? raw.slice(start, end + 1) : raw);
  if (!Array.isArray(parsed)) throw new Error("Model response was not a JSON array.");
  const items = new Map<number, string>();
  for (const entry of parsed) {
    const { id, text } = (entry ?? {}) as Partial<Item>;
    if (typeof id === "number" && typeof text === "string") items.set(id, text);
  }
  return items;
}

async function requestItems(language: TargetLanguage, content: string, stage: string): Promise<Map<number, string> | string> {
  const raw = await callModel([{ role: "system", content: segmentSystemPrompt(language) }, { role: "user", content }], stage);
  try {
    return parseItems(raw);
  } catch {
    return "Model response was not a valid JSON array of {id, text} items.";
  }
}

function check(item: Prepared, output: string | undefined, parseError?: string): string[] {
  if (parseError) return [parseError];
  if (output === undefined) return ["Item was missing from the model response."];
  return validateTranslation(item.source, output, item.matches, item.protectedInput.placeholders).errors;
}

async function translateBatch(items: Prepared[], language: TargetLanguage): Promise<Map<number, string>> {
  const terms = terminologyInstructions(items.flatMap((item) => item.matches));
  const payload = JSON.stringify(items.map((item) => ({ id: item.id, text: item.protectedInput.text })), null, 1);

  const first = await requestItems(language, `Terminology for this submission:\n${terms}\n\nItems:\n${payload}`, "Initial translation");
  const outputs = typeof first === "string" ? new Map<number, string>() : first;
  const failed = items
    .map((item) => ({ item, errors: check(item, outputs.get(item.id), typeof first === "string" ? first : undefined) }))
    .filter(({ errors }) => errors.length);
  if (!failed.length) return outputs;

  const repairPayload = JSON.stringify(
    failed.map(({ item, errors }) => ({
      id: item.id,
      source: item.protectedInput.text,
      candidate: outputs.get(item.id) ?? null,
      problems: errors,
    })),
    null,
    1,
  );
  const repaired = await requestItems(
    language,
    `Repair these candidate translations. For each item, fix the listed problems and return {"id", "text"} with the corrected ${language.englishName}.\n\nTerminology:\n${terms}\n\nItems:\n${repairPayload}`,
    "Validation repair",
  );

  const stillFailing: string[] = [];
  for (const { item } of failed) {
    const output = typeof repaired === "string" ? undefined : repaired.get(item.id);
    const errors = check(item, output, typeof repaired === "string" ? repaired : undefined);
    if (errors.length) stillFailing.push(`Segment ${item.id} (“${item.source.slice(0, 60)}”): ${errors.join(" ")}`);
    else outputs.set(item.id, output!);
  }
  if (stillFailing.length) {
    throw new Error(`Translation failed validation for ${stillFailing.length} segment(s):\n${stillFailing.join("\n")}`);
  }
  return outputs;
}

export async function translateSegments(segments: string[], rules: GlossaryRule[], language: TargetLanguage) {
  const prepared = prepare(segments, rules);
  const results = await Promise.all(batch(prepared).map((items) => translateBatch(items, language)));
  const outputs = new Map(results.flatMap((result) => [...result]));

  const translations = prepared.map((item) =>
    restorePreservedTerms(outputs.get(item.id)!, item.protectedInput.placeholders),
  );
  return { translations, matches: prepared.flatMap((item) => item.matches) };
}
