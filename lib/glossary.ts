import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { canonicalLocale, describeLanguage, type TargetLanguage } from "./languages";
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

// A row's optional language column may name the file's locale or its base
// language (e.g. "es" in es-MX.glossary.csv); anything else is a mistake.
function sameLanguage(rowLanguage: string, fileLanguage: string): boolean {
  const row = (canonicalLocale(rowLanguage) ?? rowLanguage).toLowerCase();
  const file = fileLanguage.toLowerCase();
  return row === file || row === file.split("-")[0];
}

export function parseGlossary(csv: string, language: string): GlossaryRule[] {
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
    const rowLanguage = clean(row["target language"] || row.language);
    if (!source || !target) throw new Error(`Glossary row ${index + 2} is missing source or target.`);
    if (rowLanguage && !sameLanguage(rowLanguage, language)) {
      throw new Error(`Row ${index + 2} says target language "${rowLanguage}" but the file is for "${language}".`);
    }

    const inferredType: RuleType = source === target ? "preserve" : "translate";
    const ruleType = inferredType;
    const matchLevel = clean(row["match level"] || row.match_level || (source.includes(" ") ? "phrase" : "whole_word")) as MatchLevel;
    const enforcement = clean(row.enforcement || (ruleType === "preserve" ? "exact" : "grammatical")) as Enforcement;

    if (!RULE_TYPES.has(ruleType)) throw new Error(`Invalid rule_type on row ${index + 2}: ${ruleType}`);
    if (!MATCH_LEVELS.has(matchLevel)) throw new Error(`Invalid match_level on row ${index + 2}: ${matchLevel}`);
    if (!ENFORCEMENTS.has(enforcement)) throw new Error(`Invalid enforcement on row ${index + 2}: ${enforcement}`);

    return { source, target, language, ruleType, matchLevel, enforcement, revisedBy: clean(row["revised by"]), date: clean(row.date) };
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

const DATA_DIR = path.join(process.cwd(), "data");
const FILE_PATTERN = /^(.+)\.glossary\.csv$/;

type Glossary = { language: TargetLanguage; rules: GlossaryRule[] };
const catalogs = new Map<string, Map<string, Glossary>>();

// Every <locale>.glossary.csv in the directory, parsed once per server instance.
// A bad file is logged and left out so the other languages keep working.
function catalog(dir: string): Map<string, Glossary> {
  const cached = catalogs.get(dir);
  if (cached) return cached;

  const glossaries = new Map<string, Glossary>();
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
  for (const file of files) {
    const name = file.match(FILE_PATTERN)?.[1];
    if (!name) continue;
    const code = canonicalLocale(name);
    if (!code) {
      console.error(`Skipping ${file}: "${name}" is not a valid language code.`);
      continue;
    }
    if (glossaries.has(code)) {
      console.error(`Skipping ${file}: another glossary already covers ${code}.`);
      continue;
    }
    try {
      const rules = parseGlossary(fs.readFileSync(path.join(dir, file), "utf8"), code);
      glossaries.set(code, { language: describeLanguage(code), rules });
    } catch (error) {
      console.error(`Skipping ${file}: ${error instanceof Error ? error.message : error}`);
    }
  }

  catalogs.set(dir, glossaries);
  return glossaries;
}

export function listGlossaries(dir = DATA_DIR): TargetLanguage[] {
  return [...catalog(dir).values()]
    .map((glossary) => glossary.language)
    .sort((a, b) => a.englishName.localeCompare(b.englishName, "en"));
}

export function loadGlossary(code: string, dir = DATA_DIR): Glossary {
  const glossary = catalog(dir).get(canonicalLocale(code) ?? code);
  if (!glossary) throw new Error(`No glossary for "${code}".`);
  return glossary;
}
