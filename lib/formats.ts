// Shared by the browser and the API route, so keep this free of Node imports.

export type DocumentFormat = "text" | "json" | "xml";

export const DOCUMENT_FORMATS: DocumentFormat[] = ["text", "json", "xml"];

export const ACCEPTED_EXTENSIONS = [".txt", ".json", ".xml", ".html", ".htm", ".md"];

export const MAX_CHARACTERS = 50_000;

const EXTENSION_FORMATS: Record<string, DocumentFormat> = {
  ".json": "json",
  ".xml": "xml",
  ".txt": "text",
  ".html": "text",
  ".htm": "text",
  ".md": "text",
};

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

export function isAcceptedFile(filename: string): boolean {
  return ACCEPTED_EXTENSIONS.includes(extensionOf(filename));
}

function looksLikeJson(trimmed: string): boolean {
  if (!/^[[{]/.test(trimmed)) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

// Pasted HTML fragments stay on the text path; only unambiguous XML markers
// (a declaration or CDATA) switch pasted content to XML handling.
export function detectFormat(text: string, filename?: string): DocumentFormat {
  const fromExtension = filename ? EXTENSION_FORMATS[extensionOf(filename)] : undefined;
  if (fromExtension) return fromExtension;

  const trimmed = text.replace(/^﻿/, "").trim();
  if (trimmed.startsWith("<?xml") || (trimmed.startsWith("<") && trimmed.includes("<![CDATA["))) return "xml";
  if (looksLikeJson(trimmed)) return "json";
  return "text";
}

export function formatLabel(format: DocumentFormat): string {
  if (format === "xml") return "XML · markup locked";
  if (format === "json") return "JSON · keys preserved";
  return "Text & HTML";
}

export function translatedFilename(format: DocumentFormat, language: string, sourceName?: string): string {
  if (!sourceName) return `translation.${language}.${format === "text" ? "txt" : format}`;
  const extension = extensionOf(sourceName);
  const base = extension ? sourceName.slice(0, -extension.length) : sourceName;
  return `${base}.${language}${extension || ".txt"}`;
}
