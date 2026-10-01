import { describe, expect, it } from "vitest";
import { parseGlossary } from "../lib/glossary";
import { glossaryHref, parseFilter, parsePage, splitMatch, viewGlossary } from "../lib/glossary-view";

const rules = parseGlossary(`Rule,Target Language,Term,Revised by,Date,Match Level,Enforcement
controlador,es-MX,Controller,Alison,2025.12.29,whole_word,exact
controladores mapeados,es-MX,Mapped Controllers,,,whole_word,exact
Rain Bird,es-MX,Rain Bird,Alison,2025.12.29,whole_word,exact
válvula,es-MX,valve,,,whole_word,grammatical
paquete de controlador central,es-MX,Central Controller Package,,,phrase,exact
"500 psi",es-MX,500 psi,,,exact,exact`, "es-MX");

describe("glossary columns", () => {
  it("keeps who revised a rule and when", () => {
    const rain = rules.find((rule) => rule.source === "Rain Bird");
    expect(rain).toMatchObject({ revisedBy: "Alison", date: "2025.12.29" });
    expect(rules.find((rule) => rule.source === "valve")).toMatchObject({ revisedBy: "", date: "" });
  });
});

describe("viewGlossary", () => {
  it("sorts A–Z and counts rule types over the whole glossary", () => {
    const view = viewGlossary(rules);
    expect(view.rows.map((rule) => rule.source)).toEqual(["500 psi", "Central Controller Package", "Controller", "Mapped Controllers", "Rain Bird", "valve"]);
    expect(view.counts).toEqual({ all: 6, translate: 4, preserve: 2 });
    expect(view).toMatchObject({ matches: 6, page: 1, pages: 1, start: 0 });
  });

  it("filters by type", () => {
    expect(viewGlossary(rules, { type: "preserve" }).rows.map((rule) => rule.source)).toEqual(["500 psi", "Rain Bird"]);
    expect(viewGlossary(rules, { type: "translate" }).matches).toBe(4);
  });

  it("searches terms and required output, ignoring case, with exact term matches first", () => {
    const view = viewGlossary(rules, { q: "controller" });
    expect(view.rows.map((rule) => rule.source)).toEqual(["Controller", "Central Controller Package", "Mapped Controllers"]);
    expect(viewGlossary(rules, { q: "VÁLVULA" }).rows.map((rule) => rule.source)).toEqual(["valve"]);
    expect(viewGlossary(rules, { q: "zzz" })).toMatchObject({ rows: [], matches: 0, pages: 1 });
  });

  it("pages results and clamps out-of-range pages", () => {
    const view = viewGlossary(rules, { page: 2 }, 4);
    expect(view).toMatchObject({ page: 2, pages: 2, start: 4 });
    expect(view.rows.map((rule) => rule.source)).toEqual(["Rain Bird", "valve"]);
    expect(viewGlossary(rules, { page: 99 }, 4).page).toBe(2);
    expect(viewGlossary(rules, { page: -3 }, 4).page).toBe(1);
  });

  it("does not modify the glossary it is given", () => {
    const before = rules.map((rule) => rule.source);
    viewGlossary(rules, { q: "c" });
    expect(rules.map((rule) => rule.source)).toEqual(before);
  });
});

describe("helpers", () => {
  it("parses query values safely", () => {
    expect(parseFilter("preserve")).toBe("preserve");
    expect(parseFilter("anything")).toBe("all");
    expect(parseFilter(undefined)).toBe("all");
    expect(parsePage("3")).toBe(3);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage(undefined)).toBe(1);
  });

  it("splits text around the first match for highlighting", () => {
    expect(splitMatch("Mapped Controllers", "controller")).toEqual(["Mapped ", "Controller", "s"]);
    expect(splitMatch("valve", "pump")).toEqual(["valve", "", ""]);
    expect(splitMatch("valve", undefined)).toEqual(["valve", "", ""]);
  });

  it("builds glossary links without defaults", () => {
    expect(glossaryHref("es-MX")).toBe("/glossaries?lang=es-MX");
    expect(glossaryHref("fr", { q: " Rain Bird ", type: "preserve", page: 3 })).toBe("/glossaries?lang=fr&q=Rain+Bird&type=preserve&page=3");
    expect(glossaryHref("ar", { type: "all", page: 1 })).toBe("/glossaries?lang=ar");
  });
});
