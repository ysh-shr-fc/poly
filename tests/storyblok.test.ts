import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseGlossary } from "../lib/glossary";
import { describeLanguage } from "../lib/languages";
import { applyTranslations, collectJobs } from "../lib/storyblok/collect";
import { i18nSuffix, offeredLanguages, toGlossaryCode } from "../lib/storyblok/languages";
import { extractRichtext, type RtNode } from "../lib/storyblok/richtext";
import { translatableFields } from "../lib/storyblok/schema";

const callModel = vi.fn();
vi.mock("../lib/model", () => ({ callModel: (...args: unknown[]) => callModel(...args) }));
const { translateStoryContent } = await import("../lib/storyblok/translate");

const schema = translatableFields([
  { name: "page", schema: { title: { type: "text", translatable: true }, slug_note: { type: "text" }, body: { type: "bloks" } } },
  {
    name: "hero",
    schema: {
      headline: { type: "text", translatable: true },
      intro: { type: "richtext", translatable: true },
      image: { type: "asset", translatable: true },
    },
  },
]);

const richtext = (): RtNode => ({
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Rain Bird® valves are " }, { type: "text", text: "durable", marks: [{ type: "bold" }] }, { type: "text", text: "." }] },
    { type: "bullet_list", content: [{ type: "list_item", content: [{ type: "paragraph", content: [{ type: "text", text: "Control the flow rate" }] }] }] },
    { type: "paragraph", content: [{ type: "text", text: "Line one" }, { type: "hard_break" }, { type: "text", text: "Line two" }] },
    { type: "code_block", content: [{ type: "text", text: "const x = 1" }] },
    { type: "paragraph" },
  ],
});

const story = () => ({
  component: "page",
  title: "Golf rotors",
  slug_note: "internal only",
  body: [
    { _uid: "a", component: "hero", headline: "Dependable coverage", intro: richtext(), image: { filename: "x.png" } },
    { _uid: "b", component: "hero", headline: "  ", intro: { type: "doc", content: [] } },
    { _uid: "c", component: "unknown", headline: "ignored" },
  ],
});

describe("schema", () => {
  it("keeps only Translatable text, textarea and richtext fields", () => {
    expect(schema).toEqual({ page: { title: "text" }, hero: { headline: "text", intro: "richtext" } });
  });
});

describe("language mapping", () => {
  it("maps space codes to glossary codes and i18n suffixes", () => {
    expect(toGlossaryCode("es_mx")).toBe("es-MX");
    expect(toGlossaryCode("pt-br")).toBe("pt-BR");
    expect(toGlossaryCode("fr")).toBe("fr");
    expect(i18nSuffix("es-mx")).toBe("es_mx");
  });

  it("offers only languages present in both the space and the glossaries", () => {
    const glossaries = ["ar", "es-MX", "fr"].map(describeLanguage);
    const offered = offeredLanguages([{ code: "default" }, { code: "es_mx" }, { code: "de" }, { code: "fr" }], glossaries);
    expect(offered.map((entry) => [entry.spaceCode, entry.language.code])).toEqual([["es_mx", "es-MX"], ["fr", "fr"]]);
  });
});

describe("rich text", () => {
  it("round-trips unchanged when translations equal the segments", () => {
    const original = richtext();
    const { segments, build } = extractRichtext(original);
    expect(build(segments)).toEqual(original);
  });

  it("turns marked and non-text nodes into numbered tags, skipping code and empty blocks", () => {
    const { segments } = extractRichtext(richtext());
    expect(segments).toEqual([
      "Rain Bird® valves are <1>durable</1>.",
      "Control the flow rate",
      "Line one<1/>Line two",
    ]);
  });

  it("puts translated text back into the original nodes and marks", () => {
    const { build } = extractRichtext(richtext());
    const doc = build(["Las válvulas Rain Bird® son <1>duraderas</1>.", "Controle el caudal", "Línea uno<1/>Línea dos"]);
    expect(doc.content![0].content).toEqual([
      { type: "text", text: "Las válvulas Rain Bird® son " },
      { type: "text", text: "duraderas", marks: [{ type: "bold" }] },
      { type: "text", text: "." },
    ]);
    expect(doc.content![2].content![1]).toEqual({ type: "hard_break" });
    expect(doc.content![3].content).toEqual([{ type: "text", text: "const x = 1" }]);
  });

  it("rejects translations that drop or duplicate tags", () => {
    const { build } = extractRichtext(richtext());
    expect(() => build(["Sin etiquetas.", "a", "b<1/>c"])).toThrow("Rich text tags changed");
    expect(() => build(["<1>uno</1> <1>dos</1>", "a", "b<1/>c"])).toThrow("Rich text tags changed");
  });

  it("escapes angle brackets and ampersands in text", () => {
    const doc: RtNode = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Use <5 psi & more" }] }] };
    const { segments, build } = extractRichtext(doc);
    expect(segments[0]).toBe("Use &lt;5 psi &amp; more");
    expect(build(["Use &lt;5 psi &amp; más"]).content![0].content![0].text).toBe("Use <5 psi & más");
  });
});

describe("collecting and applying", () => {
  it("collects only translatable fields, including nested blocks", () => {
    const { jobs, skipped } = collectJobs(story(), schema, "es_mx");
    expect(jobs.map((job) => `${job.field}:${job.segments.length}`)).toEqual(["title:1", "headline:1", "intro:3"]);
    expect(skipped).toEqual({ existing: 0, empty: 2 });
  });

  it("skips fields that already have a translation unless overwrite is set", () => {
    const content = story();
    (content as Record<string, unknown>).title__i18n__es_mx = "Ya traducido";
    expect(collectJobs(content, schema, "es_mx").skipped.existing).toBe(1);
    expect(collectJobs(content, schema, "es_mx").jobs.map((job) => job.field)).not.toContain("title");
    expect(collectJobs(content, schema, "es_mx", true).jobs.map((job) => job.field)).toContain("title");
  });

  it("writes translations next to the originals and leaves everything else alone", () => {
    const content = story();
    const before = structuredClone(content);
    const { jobs } = collectJobs(content, schema, "es_mx");
    const translations = jobs.flatMap((job) => job.segments.map((segment) => `ES(${segment})`));
    applyTranslations(jobs, translations, "es_mx");

    const hero = content.body[0] as Record<string, unknown>;
    expect(content).toMatchObject({ title: "Golf rotors", title__i18n__es_mx: "ES(Golf rotors)" });
    expect(hero.headline__i18n__es_mx).toBe("ES(Dependable coverage)");
    expect((hero.intro__i18n__es_mx as RtNode).type).toBe("doc");
    expect(hero.intro).toEqual((before.body[0] as Record<string, unknown>).intro);
    expect(content.slug_note).toBe("internal only");
    expect(content.body[2]).toEqual(before.body[2]);
  });

  it("leaves content untouched if a rich text rebuild fails", () => {
    const content = story();
    const { jobs } = collectJobs(content, schema, "es_mx");
    const bad = jobs.flatMap((job) => job.segments.map(() => "no tags"));
    expect(() => applyTranslations(jobs, bad, "es_mx")).toThrow();
    expect(JSON.stringify(content)).not.toContain("__i18n__");
  });
});

describe("translateStoryContent", () => {
  const rules = parseGlossary("Rule,Term,Match Level,Enforcement\nRain Bird,Rain Bird,whole_word,exact\ncaudal,flow rate,phrase,exact", "es-MX");
  const target = { i18nSuffix: "es_mx", language: describeLanguage("es-MX"), rules };

  beforeEach(() => {
    callModel.mockReset();
    callModel.mockImplementation(async (messages: Array<{ content: string }>) => {
      const content = messages[1].content;
      const items = JSON.parse(content.slice(content.indexOf("[")));
      return JSON.stringify(items.map((item: { id: number; text: string }) => ({ id: item.id, text: item.text.replace("flow rate", "caudal") })));
    });
  });

  it("translates a story end to end with glossary rules and reports a summary", async () => {
    const content = story();
    const result = await translateStoryContent(content, schema, target);
    expect(result).toMatchObject({ fieldsTranslated: 3, segments: 5, skipped: { existing: 0, empty: 2 } });
    expect(result.matches.map((match) => match.matchedText)).toEqual(expect.arrayContaining(["Rain Bird", "flow rate"]));
    const hero = content.body[0] as Record<string, unknown>;
    expect(JSON.stringify(hero.intro__i18n__es_mx)).toContain("Control the caudal");
    expect(JSON.stringify(hero.intro__i18n__es_mx)).toContain("Rain Bird®");
  });

  it("refuses stories over the character cap before calling the model", async () => {
    await expect(translateStoryContent(story(), schema, target, { maxCharacters: 10 })).rejects.toMatchObject({ code: "too_large" });
    expect(callModel).not.toHaveBeenCalled();
  });

  it("does nothing when there is nothing to translate", async () => {
    const result = await translateStoryContent({ component: "page", title: "" }, schema, target);
    expect(result.fieldsTranslated).toBe(0);
    expect(callModel).not.toHaveBeenCalled();
  });
});
