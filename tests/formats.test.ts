import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectFormat, translatedFilename } from "../lib/formats";
import { jsonStructureErrors } from "../lib/validation";
import { extractSegments, rebuildXml, tokenizeXml } from "../lib/xml";

const golf = fs.readFileSync(path.join(__dirname, "fixtures", "golf-page.xml"), "utf8");

describe("format detection", () => {
  it("prefers the file extension", () => {
    expect(detectFormat("{}", "strings.xml")).toBe("xml");
    expect(detectFormat("<p>x</p>", "copy.json")).toBe("json");
    expect(detectFormat('{"a":1}', "notes.txt")).toBe("text");
  });

  it("sniffs pasted content", () => {
    expect(detectFormat(golf)).toBe("xml");
    expect(detectFormat('<page><t><![CDATA[Hi]]></t></page>')).toBe("xml");
    expect(detectFormat('  {"title": "Valve"}')).toBe("json");
    expect(detectFormat("<p>Rain Bird valve</p>")).toBe("text");
    expect(detectFormat("{not json")).toBe("text");
  });

  it("names downloads after the source file", () => {
    expect(translatedFilename("xml", "pt-BR", "golf.xml")).toBe("golf.pt-BR.xml");
    expect(translatedFilename("json", "ar")).toBe("translation.ar.json");
    expect(translatedFilename("text", "fr")).toBe("translation.fr.txt");
  });
});

describe("XML segments", () => {
  it("round-trips the document byte-for-byte", () => {
    const pieces = tokenizeXml(golf);
    const segments = extractSegments(pieces);
    expect(rebuildXml(pieces, segments, segments.map((segment) => segment.text))).toBe(golf);
  });

  it("exposes only text and CDATA contents, without bullets or padding", () => {
    const segments = extractSegments(tokenizeXml(golf));
    expect(segments.map((segment) => segment.text)).toEqual([
      "Rain Bird - The Intelligent Use of Water™ - Rain Bird® 702/752 Series: Dependable Coverage Throughout Your Course",
      "Make 75% faster nozzle changes, with no need for removing internals.",
      "IC CONNECT",
      "Control DC Latching Solenoids with the IC-TFU Device",
    ]);
    expect(segments[1].prefix).toBe("·                ");
  });

  it("leaves markup untouched when text is replaced", () => {
    const pieces = tokenizeXml(golf);
    const segments = extractSegments(pieces);
    const output = rebuildXml(pieces, segments, segments.map((_, index) => `ترجمة ${index}`));
    const markup = (xml: string) => tokenizeXml(xml).filter((piece) => piece.kind === "markup").map((piece) => piece.raw);
    expect(markup(output)).toEqual(markup(golf));
    expect(output).toContain("<![CDATA[·                ترجمة 1]]>");
  });

  it("leaves internal fields such as <name> in English", () => {
    const pieces = tokenizeXml(golf);
    const segments = extractSegments(pieces);
    const output = rebuildXml(pieces, segments, segments.map(() => "ترجمة"));
    expect(output).toContain("<name>test english for golf 09112026</name>");
  });

  it("translates <name> when it is removed from the skip list", () => {
    const segments = extractSegments(tokenizeXml(golf), new Set());
    expect(segments[0].text).toBe("test english for golf 09112026");
  });

  it("decodes entities for translation and re-encodes them", () => {
    const pieces = tokenizeXml("<a title='x > y'>Valves &amp; pipes</a>");
    const segments = extractSegments(pieces);
    expect(segments[0].text).toBe("Valves & pipes");
    expect(rebuildXml(pieces, segments, ["صمامات & أنابيب"])).toBe("<a title='x > y'>صمامات &amp; أنابيب</a>");
  });

  it("keeps translated CDATA well formed", () => {
    const pieces = tokenizeXml("<a><![CDATA[x]]></a>");
    const segments = extractSegments(pieces);
    expect(rebuildXml(pieces, segments, ["a]]>b"])).toBe("<a><![CDATA[a]]]]><![CDATA[>b]]></a>");
  });

  it("rejects malformed XML with a clear message", () => {
    expect(() => tokenizeXml("<a><b></a>")).toThrow("</a> closes <b>");
    expect(() => tokenizeXml("<a><![CDATA[x</a>")).toThrow("unclosed CDATA");
    expect(() => tokenizeXml("<a>")).toThrow("<a> is never closed");
  });
});

describe("JSON structure validation", () => {
  const source = '{"title": "Valve", "sizes": [1, 2], "meta": {"id": "rb-1", "live": true}}';

  it("accepts translated string values", () => {
    expect(jsonStructureErrors(source, '{"title": "صمام", "sizes": [1, 2], "meta": {"id": "rb-1", "live": true}}')).toEqual([]);
  });

  it("rejects translated keys, changed values, and invalid JSON", () => {
    expect(jsonStructureErrors(source, '{"العنوان": "صمام", "sizes": [1, 2], "meta": {"id": "rb-1", "live": true}}')[0]).toContain('Key "title" is missing');
    expect(jsonStructureErrors(source, '{"title": "صمام", "sizes": [1], "meta": {"id": "rb-1", "live": true}}')[0]).toContain("$.sizes has 1 items");
    expect(jsonStructureErrors(source, '{"title": "صمام", "sizes": [1, 2], "meta": {"id": "rb-1", "live": "نعم"}}')[0]).toContain("$.meta.live changed");
    expect(jsonStructureErrors(source, "```json")).toEqual(["Output is not valid JSON."]);
  });
});
