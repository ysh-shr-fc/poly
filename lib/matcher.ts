import type { GlossaryRule, TermMatch } from "./types";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sourcePattern(rule: GlossaryRule): { source: string; flags: string } {
  const escaped = escapeRegex(rule.source);
  if (rule.matchLevel === "exact") return { source: escaped, flags: "gu" };
  if (rule.matchLevel === "case_insensitive") return { source: escaped, flags: "giu" };

  const core = rule.matchLevel === "phrase" ? escaped.replace(/\\ /g, "\\s+") : escaped;
  const inflection = rule.matchLevel === "inflected" ? "(?:s|es|'s|’s)?" : "";
  return { source: `(?<![\\p{L}\\p{N}_])${core}${inflection}(?![\\p{L}\\p{N}_])`, flags: "giu" };
}

function visibleRanges(input: string): Array<{ text: string; offset: number }> {
  const ranges: Array<{ text: string; offset: number }> = [];
  const tag = /<[^>]*>/g;
  let cursor = 0;
  for (const match of input.matchAll(tag)) {
    const index = match.index ?? 0;
    if (index > cursor) ranges.push({ text: input.slice(cursor, index), offset: cursor });
    cursor = index + match[0].length;
  }
  if (cursor < input.length) ranges.push({ text: input.slice(cursor), offset: cursor });
  return ranges;
}

export function findMatches(input: string, rules: GlossaryRule[]): TermMatch[] {
  const candidates: TermMatch[] = [];
  for (const range of visibleRanges(input)) {
    for (const rule of rules) {
      const pattern = sourcePattern(rule);
      for (const found of range.text.matchAll(new RegExp(pattern.source, pattern.flags))) {
        const localStart = found.index ?? 0;
        candidates.push({
          rule,
          matchedText: found[0],
          start: range.offset + localStart,
          end: range.offset + localStart + found[0].length,
        });
      }
    }
  }

  candidates.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const selected: TermMatch[] = [];
  for (const candidate of candidates) {
    if (selected.some((match) => candidate.start < match.end && candidate.end > match.start)) continue;
    selected.push(candidate);
  }
  return selected.sort((a, b) => a.start - b.start);
}

export type ProtectedInput = {
  text: string;
  placeholders: Array<{ token: string; original: string }>;
};

// `startIndex` lets callers keep tokens unique across several protected inputs.
export function protectPreservedTerms(input: string, matches: TermMatch[], startIndex = 0): ProtectedInput {
  const preserved = matches.filter((match) => match.rule.ruleType === "preserve").sort((a, b) => b.start - a.start);
  const placeholders: ProtectedInput["placeholders"] = [];
  let text = input;
  preserved.forEach((match, index) => {
    const token = `__RB_KEEP_${String(startIndex + index + 1).padStart(4, "0")}__`;
    placeholders.push({ token, original: match.matchedText });
    text = text.slice(0, match.start) + token + text.slice(match.end);
  });
  return { text, placeholders };
}

export function restorePreservedTerms(input: string, placeholders: ProtectedInput["placeholders"]): string {
  return placeholders.reduce((text, item) => text.split(item.token).join(item.original), input);
}
