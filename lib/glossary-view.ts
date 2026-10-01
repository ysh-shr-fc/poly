import type { GlossaryRule } from "./types";

export const PAGE_SIZE = 25;

export type RuleFilter = "all" | "translate" | "preserve";

export type GlossaryQuery = { q?: string; type?: RuleFilter; page?: number };

export type GlossaryView = {
  rows: GlossaryRule[];
  counts: { all: number; translate: number; preserve: number };
  matches: number;
  page: number;
  pages: number;
  start: number;
};

export function parseFilter(value: string | undefined): RuleFilter {
  return value === "translate" || value === "preserve" ? value : "all";
}

export function parsePage(value: string | undefined): number {
  const page = Number.parseInt(value ?? "", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

const byTerm = (a: GlossaryRule, b: GlossaryRule) =>
  a.source.toLowerCase() < b.source.toLowerCase() ? -1 : a.source.toLowerCase() > b.source.toLowerCase() ? 1 : 0;

// Sorts A–Z, filters by type and by a case-insensitive search over the English term and the required output,
// puts a rule whose term is exactly the search text first, and returns one page.
export function viewGlossary(rules: GlossaryRule[], query: GlossaryQuery = {}, pageSize = PAGE_SIZE): GlossaryView {
  const sorted = [...rules].sort(byTerm);
  const counts = {
    all: sorted.length,
    translate: sorted.filter((rule) => rule.ruleType === "translate").length,
    preserve: sorted.filter((rule) => rule.ruleType === "preserve").length,
  };

  const needle = (query.q ?? "").trim().toLowerCase();
  const type = query.type ?? "all";
  const matching = sorted.filter(
    (rule) =>
      (type === "all" || rule.ruleType === type) &&
      (!needle || rule.source.toLowerCase().includes(needle) || rule.target.toLowerCase().includes(needle)),
  );
  if (needle) {
    // Stable sort: exact term matches move to the front, everything else keeps its A–Z order.
    matching.sort((a, b) => Number(b.source.toLowerCase() === needle) - Number(a.source.toLowerCase() === needle));
  }

  const pages = Math.max(1, Math.ceil(matching.length / pageSize));
  const page = Math.min(Math.max(1, query.page ?? 1), pages);
  const start = (page - 1) * pageSize;
  return { rows: matching.slice(start, start + pageSize), counts, matches: matching.length, page, pages, start };
}

// Splits text around the first occurrence of the search text so the page can highlight it.
export function splitMatch(text: string, q: string | undefined): [string, string, string] {
  const needle = (q ?? "").trim().toLowerCase();
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  return at < 0 ? [text, "", ""] : [text.slice(0, at), text.slice(at, at + needle.length), text.slice(at + needle.length)];
}

// /glossaries?lang=es-MX&q=valve&type=translate&page=2, leaving out defaults.
export function glossaryHref(lang: string, query: GlossaryQuery = {}): string {
  const params = new URLSearchParams({ lang });
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.type && query.type !== "all") params.set("type", query.type);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  return `/glossaries?${params.toString()}`;
}
