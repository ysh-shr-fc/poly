import { handle } from "@/lib/api";
import { preflight } from "@/lib/cors";
import { ApiError } from "@/lib/errors";
import { DOCUMENT_FORMATS, MAX_CHARACTERS, detectFormat, type DocumentFormat } from "@/lib/formats";
import { listGlossaries } from "@/lib/glossary";
import { consume } from "@/lib/ratelimit";
import { translateDocument } from "@/lib/translator";

export const runtime = "nodejs";
export const maxDuration = 300;

export const OPTIONS = preflight;

type Body = { text?: unknown; format?: unknown; filename?: unknown; language?: unknown };

async function readBody(request: Request): Promise<Body> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new ApiError("invalid_request", "Send the request body as JSON with Content-Type: application/json.");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError("invalid_request", "The request body is not valid JSON.");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError("invalid_request", "The request body must be a JSON object.");
  }
  return body as Body;
}

export function POST(request: Request) {
  return handle(request, async ({ caller }) => {
    const body = await readBody(request);
    if (typeof body.text !== "string" || !body.text.trim()) {
      throw new ApiError("invalid_request", "Enter some English text to translate.");
    }
    if (body.text.length > MAX_CHARACTERS) {
      throw new ApiError("too_large", "This version accepts up to 50,000 characters per request.");
    }
    const available = listGlossaries().map((language) => language.code);
    if (typeof body.language !== "string" || !available.includes(body.language)) {
      throw new ApiError(
        "unsupported_language",
        `Choose a target language with a glossary: ${available.join(", ") || "none are configured"}.`,
        { available },
      );
    }
    if (body.format !== undefined && !DOCUMENT_FORMATS.includes(body.format as DocumentFormat)) {
      throw new ApiError("invalid_request", `format must be one of: ${DOCUMENT_FORMATS.join(", ")}.`);
    }
    const format = (body.format as DocumentFormat | undefined)
      ?? detectFormat(body.text, typeof body.filename === "string" ? body.filename : undefined);

    // Only API keys are metered; the same-origin web form is left as it was.
    if (caller.viaKey) await consume(caller.name, body.text.length);
    return translateDocument(body.text, format, body.language);
  });
}
