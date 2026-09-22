import type { TermMatch, ValidationResult } from "./types";
import type { ProtectedInput } from "./matcher";

function htmlTokens(value: string): string[] {
  return value.match(/<[^>]*>/g) ?? [];
}

export function validateTranslation(
  source: string,
  output: string,
  matches: TermMatch[],
  placeholders: ProtectedInput["placeholders"],
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const expectedTags = htmlTokens(source);
  const actualTags = htmlTokens(output);
  if (JSON.stringify(expectedTags) !== JSON.stringify(actualTags)) {
    errors.push("HTML tags or attributes changed.");
  }

  for (const { token } of placeholders) {
    const count = output.split(token).length - 1;
    if (count !== 1) errors.push(`Protected placeholder ${token} appeared ${count} times.`);
  }

  const exactTargets = new Set(
    matches
      .filter((match) => match.rule.ruleType === "translate" && match.rule.enforcement === "exact")
      .map((match) => match.rule.target),
  );
  for (const target of exactTargets) {
    if (!output.includes(target)) errors.push(`Required term is missing: ${target}`);
  }

  const grammatical = matches.filter(
    (match) => match.rule.ruleType === "translate" && match.rule.enforcement === "grammatical",
  ).length;
  if (grammatical) warnings.push(`${grammatical} term match${grammatical === 1 ? "" : "es"} allow grammatical variation.`);

  return { valid: errors.length === 0, errors, warnings };
}

function structureError(source: unknown, output: unknown, path: string): string | null {
  if (typeof source === "string") return typeof output === "string" ? null : `${path} is no longer a string.`;
  if (source === null || typeof source !== "object") {
    return Object.is(source, output) ? null : `${path} changed from ${JSON.stringify(source)} to ${JSON.stringify(output)}.`;
  }
  if (Array.isArray(source)) {
    if (!Array.isArray(output)) return `${path} is no longer an array.`;
    if (source.length !== output.length) return `${path} has ${output.length} items instead of ${source.length}.`;
    for (let i = 0; i < source.length; i++) {
      const error = structureError(source[i], output[i], `${path}[${i}]`);
      if (error) return error;
    }
    return null;
  }
  if (output === null || typeof output !== "object" || Array.isArray(output)) return `${path} is no longer an object.`;
  const sourceKeys = Object.keys(source);
  const outputKeys = Object.keys(output);
  const missing = sourceKeys.find((key) => !(key in output));
  if (missing) return `Key ${JSON.stringify(missing)} is missing at ${path}.`;
  const added = outputKeys.find((key) => !(key in source));
  if (added) return `Unexpected key ${JSON.stringify(added)} at ${path}.`;
  for (const key of sourceKeys) {
    const error = structureError(
      (source as Record<string, unknown>)[key],
      (output as Record<string, unknown>)[key],
      `${path}.${key}`,
    );
    if (error) return error;
  }
  return null;
}

// Strings may change; keys, array lengths, and every non-string value may not.
export function jsonStructureErrors(source: string, output: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return ["Output is not valid JSON."];
  }
  const error = structureError(JSON.parse(source), parsed, "$");
  return error ? [`JSON structure changed: ${error}`] : [];
}
