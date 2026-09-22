import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import type { Enforcement, GlossaryRule, MatchLevel, RuleType } from "./types";

type CsvRow = Record<string, string | undefined>;

const MATCH_LEVELS = new Set<MatchLevel>([
  "exact",
  "case_insensitive",
  "whole_word",
  "phrase",
  "inflected",
]);
const ENFORCEMENTS = new Set<Enforcement>(["exact", "grammatical"]);
const RULE_TYPES = new Set<RuleType>(["translate", "preserve"]);

function clean(value: string | undefined): string {
  return (value ?? "").trim().replace(/^"+|"+$/g, "").trim();
}

export function parseGlossary(csv: string): GlossaryRule[] {
  const result = Papa.parse<CsvRow>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim().toLowerCase(),
  });

  if (result.errors.length) {
    throw new Error(`Glossary CSV error: ${result.errors[0].message}`);
  }

  const rules = result.data.map((row, index): GlossaryRule => {
    // Copy.ai's existing schema names the English source “Term” and the
    // required output “Rule”. Canonical aliases remain supported for easier
    // programmatic use outside the table export.
    const source = clean(row.term || row.source);
    const target = clean(row.rule || row.target);
    const language = clean(row["target language"] || row.language || "ar").toLowerCase();
    if (!source || !target) throw new Error(`Glossary row ${index + 2} is missing source or target.`);

    const inferredType: RuleType = source === target ? "preserve" : "translate";
    const ruleType = inferredType;
    const matchLevel = clean(row["match level"] || row.match_level || (source.includes(" ") ? "phrase" : "whole_word")) as MatchLevel;
    const enforcement = clean(row.enforcement || (ruleType === "preserve" ? "exact" : "grammatical")) as Enforcement;

    if (!RULE_TYPES.has(ruleType)) throw new Error(`Invalid rule_type on row ${index + 2}: ${ruleType}`);
    if (!MATCH_LEVELS.has(matchLevel)) throw new Error(`Invalid match_level on row ${index + 2}: ${matchLevel}`);
    if (!ENFORCEMENTS.has(enforcement)) throw new Error(`Invalid enforcement on row ${index + 2}: ${enforcement}`);

    return { source, target, language, ruleType, matchLevel, enforcement };
  });

  const seen = new Map<string, GlossaryRule>();
  for (const rule of rules) {
    const key = `${rule.language}\u0000${rule.source.toLocaleLowerCase("en")}`;
    // CSV order defines priority. Once a case-insensitive term key has been
    // registered, later variants or conflicting definitions are ignored.
    if (seen.has(key)) continue;
    seen.set(key, rule);
  }

  return [...seen.values()];
}

let cached: GlossaryRule[] | null = null;

export function loadGlossary(): GlossaryRule[] {
  if (cached) return cached;
  const filename = path.join(process.cwd(), "data", "glossary.csv");
  cached = parseGlossary(fs.readFileSync(filename, "utf8"));
  return cached;
}
