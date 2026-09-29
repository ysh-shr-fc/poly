// TRANSLATOR_ALLOWED_ORIGINS = "https://app.example.com,https://other.example.com"
// Exact origins only (scheme + host + port). Empty means no cross-origin browser access.
export function allowedOrigins(value = process.env.TRANSLATOR_ALLOWED_ORIGINS): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

// CORS only lets listed pages read responses; it does not authenticate anyone.
export function corsHeaders(request: Request, origins = allowedOrigins()): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin" };
  const origin = request.headers.get("origin");
  if (origin && origins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "authorization, content-type";
    headers["Access-Control-Expose-Headers"] = "X-Request-Id, Retry-After";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}

// Preflights carry no credentials, so they are answered without checking the API key.
export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
