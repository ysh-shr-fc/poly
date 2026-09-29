import { handle } from "@/lib/api";
import { preflight } from "@/lib/cors";
import { listGlossaries } from "@/lib/glossary";

export const runtime = "nodejs";

export const OPTIONS = preflight;

// The target languages that currently have a glossary in data/.
export function GET(request: Request) {
  return handle(request, async () => ({ languages: listGlossaries() }));
}
