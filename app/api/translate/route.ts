import { NextResponse } from "next/server";
import { DOCUMENT_FORMATS, MAX_CHARACTERS, detectFormat, type DocumentFormat } from "@/lib/formats";
import { listGlossaries } from "@/lib/glossary";
import { translateDocument } from "@/lib/translator";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: unknown; format?: unknown; filename?: unknown; language?: unknown };
    if (typeof body.text !== "string" || !body.text.trim()) {
      return NextResponse.json({ error: "Enter some English text to translate." }, { status: 400 });
    }
    if (body.text.length > MAX_CHARACTERS) {
      return NextResponse.json({ error: "This version accepts up to 50,000 characters per request." }, { status: 413 });
    }
    const available = listGlossaries().map((language) => language.code);
    if (typeof body.language !== "string" || !available.includes(body.language)) {
      return NextResponse.json(
        { error: `Choose a target language with a glossary: ${available.join(", ") || "none are configured"}.` },
        { status: 400 },
      );
    }
    const format = DOCUMENT_FORMATS.includes(body.format as DocumentFormat)
      ? (body.format as DocumentFormat)
      : detectFormat(body.text, typeof body.filename === "string" ? body.filename : undefined);
    return NextResponse.json(await translateDocument(body.text, format, body.language));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Translation failed.";
    console.error(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
