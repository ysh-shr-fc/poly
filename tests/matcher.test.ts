import { describe, expect, it } from "vitest";
import { parseGlossary } from "../lib/glossary";
import { findMatches, protectPreservedTerms, restorePreservedTerms } from "../lib/matcher";

const rules = parseGlossary(`Rule,Target Language,Term,Revised by,Date,Match Level,Enforcement
صمام,ar,valve,Asleif,2025.12.30,inflected,grammatical
صندوق الصمام,ar,valve box,Asleif,2025.12.30,phrase,exact
Rain Bird,ar,Rain Bird,Asleif,2025.12.30,whole_word,exact
Cycle + Soak™,ar,Cycle + Soak™,Asleif,2025.12.09,exact,exact`, "ar");

describe("glossary matcher", () => {
  it("selects the longest overlapping term", () => {
    const matches = findMatches("Open the valve box and inspect the valves.", rules);
    expect(matches.map((match) => match.rule.source)).toEqual(["valve box", "valve"]);
    expect(matches[1].matchedText).toBe("valves");
  });

  it("does not match inside HTML tags", () => {
    const matches = findMatches('<a title="valve">Rain Bird valve</a>', rules);
    expect(matches.map((match) => match.matchedText)).toEqual(["Rain Bird", "valve"]);
  });

  it("protects and restores preserved terms", () => {
    const source = "A Rain Bird valve.";
    const matches = findMatches(source, rules);
    const protectedInput = protectPreservedTerms(source, matches);
    expect(protectedInput.text).toContain("__RB_KEEP_0001__");
    expect(restorePreservedTerms(protectedInput.text, protectedInput.placeholders)).toBe(source);
  });

  it("maps the existing Copy.ai columns correctly", () => {
    expect(rules[0]).toMatchObject({ source: "valve", target: "صمام", language: "ar", ruleType: "translate" });
    expect(rules[2]).toMatchObject({ source: "Rain Bird", target: "Rain Bird", ruleType: "preserve" });
  });

  it("merges case variants of identity-preservation rules", () => {
    const caseVariants = parseGlossary(`Rule,Target Language,Term,Revised by,Date,Match Level,Enforcement
CirrusPRO,ar,CirrusPRO,Asleif,2025.12.30,whole_word,exact
CIRRUSPRO,ar,CIRRUSPRO,Asleif,2025.12.30,whole_word,exact`, "ar");
    expect(caseVariants).toHaveLength(1);
    const matches = findMatches("CirrusPRO and CIRRUSPRO", caseVariants);
    expect(matches.map((match) => match.matchedText)).toEqual(["CirrusPRO", "CIRRUSPRO"]);
  });

  it("uses the first CSV entry when duplicate terms conflict", () => {
    const conflicts = parseGlossary(`Rule,Target Language,Term,Revised by,Date,Match Level,Enforcement
الترجمة الأولى,ar,Controller,Asleif,2025.12.30,whole_word,exact
الترجمة الثانية,ar,CONTROLLER,Asleif,2025.12.31,exact,grammatical`, "ar");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      source: "Controller",
      target: "الترجمة الأولى",
      matchLevel: "whole_word",
      enforcement: "exact",
    });
  });
});
