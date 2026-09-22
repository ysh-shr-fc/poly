import { describe, expect, it } from "vitest";
import { validateTranslation } from "../lib/validation";

describe("translation validation", () => {
  it("accepts unchanged HTML and required exact terms", () => {
    const match = {
      rule: { source: "flow rate", target: "معدل التدفق", language: "ar", ruleType: "translate" as const, matchLevel: "phrase" as const, enforcement: "exact" as const },
      matchedText: "flow rate", start: 3, end: 12,
    };
    const result = validateTranslation("<p>A flow rate</p>", "<p>معدل التدفق</p>", [match], []);
    expect(result.valid).toBe(true);
  });

  it("rejects changed HTML", () => {
    const result = validateTranslation('<p class="x">Text</p>', "<p>نص</p>", [], []);
    expect(result.valid).toBe(false);
  });
});
