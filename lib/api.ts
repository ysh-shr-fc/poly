import { randomUUID } from "node:crypto";
import { authorize, type Caller } from "./auth";
import { corsHeaders } from "./cors";
import { ApiError, toApiError } from "./errors";

export type ApiContext = { requestId: string; caller: Caller };

function respond(body: unknown, status: number, headers: Record<string, string>): Response {
  return Response.json(body, { status, headers });
}

// Wraps a route: request id, CORS headers on every response (including errors, so a browser
// can read them), API-key or same-origin auth, and a uniform { error: { code, message } } body.
export async function handle(request: Request, run: (context: ApiContext) => Promise<unknown>): Promise<Response> {
  const requestId = randomUUID();
  const headers = { ...corsHeaders(request), "X-Request-Id": requestId };
  try {
    const caller = authorize(request);
    if (!caller) {
      throw new ApiError(
        "unauthorized",
        "Send a valid API key as 'Authorization: Bearer <key>'.",
        {},
        { "WWW-Authenticate": "Bearer" },
      );
    }
    console.info(JSON.stringify({ requestId, caller: caller.name, method: request.method, path: new URL(request.url).pathname }));
    return respond(await run({ requestId, caller }), 200, headers);
  } catch (caught) {
    const error = toApiError(caught);
    if (error.status >= 500) console.error(requestId, caught);
    return respond({ error: { code: error.code, message: error.message, ...error.extra } }, error.status, { ...headers, ...error.headers });
  }
}
