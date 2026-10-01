// Storyblok rich text is { type: "doc", content: [...] }. Node types, attributes and marks are never sent to the
// model: each block of inline content becomes one string, with marked or non-text nodes standing in as numbered tags.
//   "Use <1>MemoryArc®</1> to save time.<2/>"   (<1> = a marked text node, <2/> = e.g. a hard break)
// The existing tag check in lib/validation.ts then keeps those tags intact, and the nodes are put back afterwards.

export type RtNode = {
  type: string;
  text?: string;
  content?: RtNode[];
  marks?: unknown[];
  attrs?: Record<string, unknown>;
  [key: string]: unknown;
};

type Unit = { node: RtNode; slots: RtNode[]; prefix: string; suffix: string };

const SKIPPED_BLOCKS = new Set(["code_block"]);

const escapeText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unescapeText = (value: string) => value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function serialize(children: RtNode[]): { text: string; slots: RtNode[] } {
  const slots: RtNode[] = [];
  let text = "";
  for (const child of children) {
    if (child.type === "text" && !child.marks?.length) {
      text += escapeText(child.text ?? "");
    } else if (child.type === "text") {
      slots.push(child);
      text += `<${slots.length}>${escapeText(child.text ?? "")}</${slots.length}>`;
    } else {
      slots.push(child);
      text += `<${slots.length}/>`;
    }
  }
  return { text, slots };
}

function deserialize(value: string, unit: Unit): RtNode[] {
  const out: RtNode[] = [];
  const used = new Set<number>();
  let open: { slot: number; text: string } | null = null;

  for (const part of value.split(/(<\/?\d+\/?>)/)) {
    const selfClosing = part.match(/^<(\d+)\/>$/);
    const opening = part.match(/^<(\d+)>$/);
    const closing = part.match(/^<\/(\d+)>$/);
    if (selfClosing) {
      const slot = Number(selfClosing[1]);
      if (open || !unit.slots[slot - 1] || used.has(slot)) throw new Error("Rich text tags changed in translation.");
      out.push(unit.slots[slot - 1]);
      used.add(slot);
    } else if (opening) {
      if (open) throw new Error("Rich text tags changed in translation.");
      open = { slot: Number(opening[1]), text: "" };
    } else if (closing) {
      const slot = Number(closing[1]);
      if (!open || open.slot !== slot || !unit.slots[slot - 1] || used.has(slot)) {
        throw new Error("Rich text tags changed in translation.");
      }
      out.push({ ...unit.slots[slot - 1], text: unescapeText(open.text) });
      used.add(slot);
      open = null;
    } else if (open) {
      open.text += part;
    } else if (part) {
      out.push({ type: "text", text: unescapeText(part) });
    }
  }

  if (open || used.size !== unit.slots.length) throw new Error("Rich text tags changed in translation.");
  return out;
}

export function extractRichtext(doc: RtNode): { segments: string[]; build: (translated: string[]) => RtNode } {
  const copy = structuredClone(doc);
  const units: Unit[] = [];
  const segments: string[] = [];

  const visit = (node: RtNode) => {
    if (!node.content || SKIPPED_BLOCKS.has(node.type)) return;
    if (node.content.some((child) => child.type === "text")) {
      const { text, slots } = serialize(node.content);
      const prefix = text.match(/^\s*/)?.[0] ?? "";
      const core = text.slice(prefix.length).replace(/\s+$/, "");
      if (/\p{L}/u.test(core)) {
        units.push({ node, slots, prefix, suffix: text.slice(prefix.length + core.length) });
        segments.push(core);
      }
      return;
    }
    node.content.forEach(visit);
  };
  visit(copy);

  return {
    segments,
    build(translated) {
      units.forEach((unit, index) => {
        unit.node.content = deserialize(unit.prefix + translated[index] + unit.suffix, unit);
      });
      return copy;
    },
  };
}
