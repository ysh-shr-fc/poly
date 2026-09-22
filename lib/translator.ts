import type { DocumentFormat } from "./formats";
import { loadGlossary } from "./glossary";
import { callModel } from "./model";
import { findMatches, protectPreservedTerms, restorePreservedTerms } from "./matcher";
import { JSON_SYSTEM_PROMPT, TEXT_SYSTEM_PROMPT, terminologyInstructions } from "./prompts";
import { translateSegments } from "./segments";
import type { TermMatch, ValidationResult } from "./types";
import { jsonStructureErrors, validateTranslation } from "./validation";
import { extractSegments, rebuildXml, tokenizeXml } from "./xml";

function grammaticalWarnings(matches: TermMatch[]): string[] {
  const grammatical = matches.filter(
    (match) => match.rule.ruleType === "translate" && match.rule.enforcement === "grammatical",
  ).length;
  return grammatical ? [`${grammatical} term match${grammatical === 1 ? "" : "es"} allow grammatical variation.`] : [];
}

function respond(format: DocumentFormat, translation: string, matches: TermMatch[], validation: ValidationResult, glossarySize: number) {
  return {
    format,
    translation,
    matches: matches.map((match) => ({
      source: match.rule.source,
      matchedText: match.matchedText,
      target: match.rule.target,
      ruleType: match.rule.ruleType,
      matchLevel: match.rule.matchLevel,
      enforcement: match.rule.enforcement,
    })),
    validation,
    glossarySize,
  };
}

// Plain text, HTML, and JSON are translated as one document.
async function translateWhole(source: string, format: "text" | "json") {
  const rules = loadGlossary();
  const matches = findMatches(source, rules, "ar");
  const protectedInput = protectPreservedTerms(source, matches);
  const terms = terminologyInstructions(matches);
  const system = { role: "system" as const, content: format === "json" ? JSON_SYSTEM_PROMPT : TEXT_SYSTEM_PROMPT };

  const validate = (output: string) => {
    const result = validateTranslation(source, output, matches, protectedInput.placeholders);
    if (format === "json") {
      const restored = restorePreservedTerms(output, protectedInput.placeholders);
      result.errors.push(...jsonStructureErrors(source, restored));
      result.valid = result.errors.length === 0;
    }
    return result;
  };

  let rawOutput = await callModel(
    [system, { role: "user", content: `Terminology for this submission:\n${terms}\n\nSource:\n${protectedInput.text}` }],
    "Initial translation",
  );
  let validation = validate(rawOutput);

  if (!validation.valid) {
    rawOutput = await callModel([
      system,
      {
        role: "user",
        content: `Repair the candidate translation. Return only the repaired content.\n\nProblems:\n- ${validation.errors.join("\n- ")}\n\nTerminology:\n${terms}\n\nOriginal source:\n${protectedInput.text}\n\nCandidate translation:\n${rawOutput}`,
      },
    ], "Validation repair");
    validation = validate(rawOutput);
  }

  if (!validation.valid) {
    throw new Error(`Translation failed validation: ${validation.errors.join(" ")}`);
  }

  return respond(format, restorePreservedTerms(rawOutput, protectedInput.placeholders), matches, validation, rules.length);
}

// XML markup never reaches the model: only text nodes and CDATA contents are
// translated, then spliced back into the untouched markup.
async function translateXml(source: string) {
  const rules = loadGlossary();
  const pieces = tokenizeXml(source);
  const segments = extractSegments(pieces);
  if (!segments.length) throw new Error("No translatable text was found in this XML document.");

  const { translations, matches } = await translateSegments(segments.map((segment) => segment.text), rules);
  const validation = { valid: true, errors: [], warnings: grammaticalWarnings(matches) };
  return respond("xml", rebuildXml(pieces, segments, translations), matches, validation, rules.length);
}

export async function translateDocument(source: string, format: DocumentFormat) {
  if (format === "xml") return translateXml(source);
  if (format === "json") {
    try {
      JSON.parse(source);
    } catch (error) {
      throw new Error(`This file is not valid JSON: ${error instanceof Error ? error.message : "parse error"}`);
    }
  }
  return translateWhole(source, format);
}
