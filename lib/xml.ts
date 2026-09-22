// A small, lossless XML scanner. Markup is kept byte-for-byte; only text nodes
// and CDATA contents are exposed for translation and spliced back in place.

export type XmlPiece =
  | { kind: "markup"; raw: string }
  | { kind: "text"; raw: string }
  | { kind: "cdata"; raw: string };

function fail(message: string, position: number): never {
  throw new Error(`Malformed XML: ${message} (character ${position + 1}).`);
}

// Finds the closing `>` of a tag or declaration, skipping quoted attribute
// values and DOCTYPE internal subsets.
function tagEnd(input: string, start: number): number {
  let quote = "";
  let depth = 0;
  for (let i = start + 1; i < input.length; i++) {
    const char = input[i];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "[") {
      depth++;
    } else if (char === "]") {
      depth--;
    } else if (char === ">" && depth <= 0) {
      return i;
    }
  }
  return fail("unclosed tag", start);
}

export function tokenizeXml(input: string): XmlPiece[] {
  const pieces: XmlPiece[] = [];
  const open: Array<{ name: string; at: number }> = [];
  let i = 0;

  while (i < input.length) {
    if (input[i] !== "<") {
      const next = input.indexOf("<", i);
      const end = next === -1 ? input.length : next;
      pieces.push({ kind: "text", raw: input.slice(i, end) });
      i = end;
      continue;
    }

    if (input.startsWith("<!--", i)) {
      const end = input.indexOf("-->", i + 4);
      if (end === -1) fail("unclosed comment", i);
      pieces.push({ kind: "markup", raw: input.slice(i, end + 3) });
      i = end + 3;
    } else if (input.startsWith("<![CDATA[", i)) {
      const end = input.indexOf("]]>", i + 9);
      if (end === -1) fail("unclosed CDATA section", i);
      pieces.push({ kind: "markup", raw: "<![CDATA[" });
      pieces.push({ kind: "cdata", raw: input.slice(i + 9, end) });
      pieces.push({ kind: "markup", raw: "]]>" });
      i = end + 3;
    } else if (input.startsWith("<?", i)) {
      const end = input.indexOf("?>", i + 2);
      if (end === -1) fail("unclosed processing instruction", i);
      pieces.push({ kind: "markup", raw: input.slice(i, end + 2) });
      i = end + 2;
    } else {
      const end = tagEnd(input, i);
      const raw = input.slice(i, end + 1);
      const name = raw.match(/^<\/?([^\s/>]+)/)?.[1];
      if (raw.startsWith("</")) {
        const expected = open.pop();
        if (!expected || expected.name !== name) {
          fail(expected ? `</${name}> closes <${expected.name}>` : `unexpected </${name}>`, i);
        }
      } else if (name && !raw.startsWith("<!") && !raw.endsWith("/>")) {
        open.push({ name, at: i });
      }
      pieces.push({ kind: "markup", raw });
      i = end + 1;
    }
  }

  if (open.length) fail(`<${open[open.length - 1].name}> is never closed`, open[open.length - 1].at);
  return pieces;
}

const NAMED_ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

export function decodeXmlText(raw: string): string {
  return raw.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (entity, body: string) => {
    if (body[0] === "#") {
      const code = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });
}

export function encodeXmlText(value: string): string {
  // Leave references to DTD-defined entities (e.g. &nbsp;) intact.
  return value.replace(/&(?!#?\w+;)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function encodeCdata(value: string): string {
  return value.replace(/]]>/g, "]]]]><![CDATA[>");
}

export type XmlSegment = {
  pieceIndex: number;
  prefix: string;
  text: string;
  suffix: string;
};

// Leading whitespace and stray bullet glyphs (common in CMS exports) are kept
// out of the model's hands and reattached verbatim.
const PREFIX = /^[\s·•‣⁃▪◦]*/u;
const SUFFIX = /\s*$/u;

export function extractSegments(pieces: XmlPiece[]): XmlSegment[] {
  const segments: XmlSegment[] = [];
  pieces.forEach((piece, pieceIndex) => {
    if (piece.kind === "markup") return;
    const value = piece.kind === "text" ? decodeXmlText(piece.raw) : piece.raw;
    const prefix = value.match(PREFIX)?.[0] ?? "";
    const rest = value.slice(prefix.length);
    const suffix = rest.match(SUFFIX)?.[0] ?? "";
    const text = rest.slice(0, rest.length - suffix.length);
    if (/\p{L}/u.test(text)) segments.push({ pieceIndex, prefix, text, suffix });
  });
  return segments;
}

export function rebuildXml(pieces: XmlPiece[], segments: XmlSegment[], translations: string[]): string {
  const replaced = new Map<number, string>();
  segments.forEach((segment, index) => {
    const piece = pieces[segment.pieceIndex];
    const value = segment.prefix + translations[index] + segment.suffix;
    replaced.set(segment.pieceIndex, piece.kind === "cdata" ? encodeCdata(value) : encodeXmlText(value));
  });
  return pieces.map((piece, index) => replaced.get(index) ?? piece.raw).join("");
}
