import { afterEach, describe, expect, it, vi } from "vitest";
import { authorize, isSameOrigin, matchKey, parseKeys } from "../lib/auth";
import { allowedOrigins, corsHeaders, preflight } from "../lib/cors";
import { ApiError, toApiError } from "../lib/errors";
import { consume } from "../lib/ratelimit";

const KEY_A = "a".repeat(40);
const KEY_B = "b".repeat(40);
const KEYS = `cms-prod:${KEY_A}, crm:${KEY_B}`;
const request = (headers: Record<string, string> = {}) => new Request("https://poly.example.com/api/translate", { method: "POST", headers });

describe("API keys", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});

  it("parses name:key pairs and skips malformed or short entries", () => {
    expect(parseKeys(`${KEYS},short:abc,nocolon,:${KEY_A}`).map((entry) => entry.name)).toEqual(["cms-prod", "crm"]);
    expect(parseKeys(undefined)).toEqual([]);
  });

  it("keeps colons inside the key", () => {
    expect(parseKeys(`odd:${KEY_A}:tail`)[0].key).toBe(`${KEY_A}:tail`);
  });

  it("matches only exact keys", () => {
    const keys = parseKeys(KEYS);
    expect(matchKey(KEY_B, keys)?.name).toBe("crm");
    expect(matchKey(KEY_B + "x", keys)).toBeNull();
    expect(matchKey("", keys)).toBeNull();
  });

  it("authorizes bearer keys and names the caller", () => {
    expect(authorize(request({ authorization: `Bearer ${KEY_A}` }), KEYS)).toEqual({ name: "cms-prod", viaKey: true });
    expect(authorize(request({ authorization: `bearer ${KEY_B}` }), KEYS)).toEqual({ name: "crm", viaKey: true });
  });

  it("rejects wrong keys, and any key when none are configured", () => {
    expect(authorize(request({ authorization: "Bearer nope" }), KEYS)).toBeNull();
    expect(authorize(request({ authorization: `Bearer ${KEY_A}` }), undefined)).toBeNull();
  });

  it("does not fall back to same-origin when a wrong key is sent", () => {
    expect(authorize(request({ authorization: "Bearer nope", "sec-fetch-site": "same-origin" }), KEYS)).toBeNull();
  });

  it("lets the same-origin web form through without a key", () => {
    expect(isSameOrigin(request({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOrigin(request({ origin: "https://poly.example.com" }))).toBe(true);
    expect(authorize(request({ origin: "https://poly.example.com" }), KEYS)).toEqual({ name: "web-form", viaKey: false });
  });

  it("rejects cross-site and headerless requests without a key", () => {
    expect(authorize(request({ origin: "https://cms.example.com", "sec-fetch-site": "cross-site" }), KEYS)).toBeNull();
    expect(authorize(request(), KEYS)).toBeNull();
  });
});

describe("CORS", () => {
  const origins = allowedOrigins("https://cms.example.com/, https://other.example.com");

  it("normalizes the allowlist", () => {
    expect(origins).toEqual(["https://cms.example.com", "https://other.example.com"]);
    expect(allowedOrigins(undefined)).toEqual([]);
  });

  it("allows only listed origins, echoing the exact origin", () => {
    const listed = corsHeaders(request({ origin: "https://cms.example.com" }), origins);
    expect(listed["Access-Control-Allow-Origin"]).toBe("https://cms.example.com");
    expect(listed["Access-Control-Allow-Headers"]).toContain("authorization");
    expect(listed.Vary).toBe("Origin");
    const unlisted = corsHeaders(request({ origin: "https://evil.example.com" }), origins);
    expect(unlisted["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(corsHeaders(request(), origins)["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("answers preflights with 204 and no key", () => {
    vi.stubEnv("TRANSLATOR_ALLOWED_ORIGINS", "https://cms.example.com");
    const response = preflight(request({ origin: "https://cms.example.com" }));
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://cms.example.com");
    vi.unstubAllEnvs();
  });
});

describe("error classification", () => {
  it.each([
    ["Translation failed validation: HTML tags changed.", "validation_failed", 422],
    ["This file is not valid JSON: Unexpected token", "invalid_document", 422],
    ["Malformed XML: </a> closes <b> (character 5).", "invalid_document", 422],
    ["No translatable text was found in this XML document.", "invalid_document", 422],
    ["Translation provider returned 429: slow down", "upstream_error", 502],
    ["Translation provider is unreachable: connect ECONNREFUSED 127.0.0.1:4010", "upstream_error", 502],
    ["Translation provider returned an empty response.", "upstream_error", 502],
    ["Initial translation timed out after 120 seconds while waiting for gpt.", "upstream_error", 502],
    ["OPENAI_API_KEY is not configured.", "internal_error", 500],
  ])("%s → %s", (message, code, status) => {
    const error = toApiError(new Error(message));
    expect([error.code, error.status]).toEqual([code, status]);
  });

  it("passes ApiErrors through", () => {
    const original = new ApiError("too_large", "big");
    expect(toApiError(original)).toBe(original);
    expect(original.status).toBe(413);
  });
});

describe("rate limiter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const stubStore = (requests: number, characters: number) => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.com");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t");
    const fetchMock = vi.fn(async () => Response.json([{ result: requests }, { result: 1 }, { result: characters }, { result: 1 }]));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it("allows calls under the limits", async () => {
    const fetchMock = stubStore(3, 1_000);
    await expect(consume("cms-prod", 500)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects when the per-minute count is exceeded, with Retry-After", async () => {
    stubStore(31, 1_000);
    await expect(consume("cms-prod", 500)).rejects.toMatchObject({ code: "rate_limited", status: 429 });
    await expect(consume("cms-prod", 500)).rejects.toHaveProperty("headers.Retry-After");
  });

  it("rejects when the daily character cap is exceeded", async () => {
    stubStore(1, 500_001);
    await expect(consume("cms-prod", 500)).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("fails open when the store is missing or down", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(consume("cms-prod", 1)).resolves.toBeUndefined();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.com");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    await expect(consume("cms-prod", 1)).resolves.toBeUndefined();
  });
});
