import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { listGlossaries, loadGlossary, parseGlossary } from "../lib/glossary";
import { describeLanguage } from "../lib/languages";
import { jsonSystemPrompt, segmentSystemPrompt, textSystemPrompt } from "../lib/prompts";

const HEADER = "Rule,Target Language,Term,Revised by,Date,Match Level,Enforcement";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "glossaries-"));
const write = (name: string, body: string) => fs.writeFileSync(path.join(dir, name), body);

write("ar.glossary.csv", `${HEADER}\nصمام,ar,valve,,,inflected,grammatical`);
write("pt-br.glossary.csv", `${HEADER}\nválvula,pt-BR,valve,,,whole_word,exact`);
write("es-MX.glossary.csv", "Rule,Term,Match Level,Enforcement\nválvula,valve,whole_word,exact");
write("fr.glossary.csv", `${HEADER}\nvanne,fr,valve,,,whole_word,exact\nصمام,ar,valve box,,,phrase,exact`);
write("notes.csv", `${HEADER}\nx,ar,y,,,whole_word,exact`);
write("klingon!.glossary.csv", `${HEADER}\nx,,y,,,whole_word,exact`);

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("glossary discovery", () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const languages = listGlossaries(dir);

  it("lists one language per valid <locale>.glossary.csv, canonicalized and sorted", () => {
    expect(languages.map((language) => language.code)).toEqual(["ar", "pt-BR", "es-MX"]);
    expect(languages.map((language) => language.englishName)).toEqual(["Arabic", "Portuguese (Brazil)", "Spanish (Mexico)"]);
  });

  it("skips bad files with a reason and keeps the rest", () => {
    const logged = errors.mock.calls.map((call) => String(call[0]));
    expect(logged.some((line) => line.includes("fr.glossary.csv") && line.includes("Row 3"))).toBe(true);
    expect(logged.some((line) => line.includes("klingon!.glossary.csv"))).toBe(true);
    expect(logged.some((line) => line.includes("notes.csv"))).toBe(false);
  });

  it("loads rules by code, accepting any casing", () => {
    expect(loadGlossary("pt-BR", dir).rules[0]).toMatchObject({ source: "valve", target: "válvula", language: "pt-BR" });
    expect(loadGlossary("es-mx", dir).rules).toHaveLength(1);
    expect(() => loadGlossary("de", dir)).toThrow('No glossary for "de"');
  });
});

describe("row language column", () => {
  it("accepts the file code, its base language, or an empty value", () => {
    expect(parseGlossary(`${HEADER}\nválvula,es,valve,,,whole_word,exact\nfiltro,,filter,,,whole_word,exact`, "es-MX")).toHaveLength(2);
  });

  it("rejects a different language", () => {
    expect(() => parseGlossary(`${HEADER}\nválvula,pt,valve,,,whole_word,exact`, "es-MX")).toThrow(
      'Row 2 says target language "pt" but the file is for "es-MX".',
    );
  });
});

describe("language descriptions", () => {
  it("derives names and direction from the code", () => {
    expect(describeLanguage("pt-BR")).toEqual({ code: "pt-BR", englishName: "Portuguese (Brazil)", nativeName: "português (Brasil)", dir: "ltr" });
    expect(describeLanguage("ar").dir).toBe("rtl");
    expect(describeLanguage("fr")).toMatchObject({ englishName: "French", nativeName: "français", dir: "ltr" });
  });

  it("names the target language and code in every prompt", () => {
    const language = describeLanguage("es-MX");
    for (const prompt of [textSystemPrompt(language), jsonSystemPrompt(language), segmentSystemPrompt(language)]) {
      expect(prompt).toContain("into Spanish (Mexico) (es-MX).");
      expect(prompt).not.toContain("Arabic");
    }
  });
});
