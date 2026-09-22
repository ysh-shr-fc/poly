export type RuleType = "translate" | "preserve";
export type MatchLevel = "exact" | "case_insensitive" | "whole_word" | "phrase" | "inflected";
export type Enforcement = "exact" | "grammatical";

export type GlossaryRule = {
  source: string;
  target: string;
  language: string;
  ruleType: RuleType;
  matchLevel: MatchLevel;
  enforcement: Enforcement;
};

export type TermMatch = {
  rule: GlossaryRule;
  matchedText: string;
  start: number;
  end: number;
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};
