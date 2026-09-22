import { NextResponse } from "next/server";
import { DOCUMENT_FORMATS, MAX_CHARACTERS, detectFormat, type DocumentFormat } from "@/lib/formats";
import { translateDocument } from "@/lib/translator";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: unknown; format?: unknown; filename?: unknown };
    if (typeof body.text !== "string" || !body.text.trim()) {
      return NextResponse.json({ error: "Enter some English text to translate." }, { status: 400 });
    }
    if (body.text.length > MAX_CHARACTERS) {
      return NextResponse.json({ error: "This version accepts up to 50,000 characters per request." }, { status: 413 });
    }
    const format = DOCUMENT_FORMATS.includes(body.format as DocumentFormat)
      ? (body.format as DocumentFormat)
      : detectFormat(body.text, typeof body.filename === "string" ? body.filename : undefined);
    return NextResponse.json(await translateDocument(body.text, format));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Translation failed.";
    console.error(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
