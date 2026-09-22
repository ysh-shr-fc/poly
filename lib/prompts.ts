import type { TermMatch } from "./types";

export function terminologyInstructions(matches: TermMatch[]): string {
  const seen = new Set<string>();
  const lines = matches
    .filter((match) => match.rule.ruleType === "translate")
    .filter((match) => {
      const key = `${match.rule.source}\u0000${match.rule.target}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((match) => {
      const flexibility = match.rule.enforcement === "grammatical" ? "grammatical inflection allowed" : "use exactly";
      return `- ${match.rule.source} → ${match.rule.target} (${flexibility})`;
    });
  return lines.join("\n") || "- No glossary terms matched.";
}

const BASE_RULES =
  "Preserve every HTML tag and attribute byte-for-byte and in the same order. Keep tokens shaped like __RB_KEEP_0001__ unchanged. Apply the supplied terminology. Do not add facts, explanations, Markdown fences, or headings.";

export const TEXT_SYSTEM_PROMPT = `Translate English corporate irrigation content into Arabic. Return only the translated content. ${BASE_RULES}`;

export const JSON_SYSTEM_PROMPT = `Translate English corporate irrigation content into Arabic. The content is a JSON document. Translate only human-readable string values; never change keys, numbers, booleans, nulls, IDs, URLs, or the structure. Return only the complete, valid JSON document. ${BASE_RULES}`;

export const SEGMENT_SYSTEM_PROMPT = `Translate English corporate irrigation content into Arabic. You receive a JSON array of items shaped like {"id": 1, "text": "..."}. Return only a JSON array with one {"id", "text"} object per input item, keeping each id and replacing text with its Arabic translation. Translate each item on its own; never merge, split, reorder, or skip items. Product names, model numbers, and codes that are not ordinary English words stay as written. ${BASE_RULES}`;
