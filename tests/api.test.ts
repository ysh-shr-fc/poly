import { beforeEach, describe, expect, it, vi } from "vitest";

const translateDocument = vi.fn();
vi.mock("@/lib/translator", () => ({ translateDocument: (...args: unknown[]) => translateDocument(...args) }));

const { POST, OPTIONS } = await import("@/app/api/translate/route");
const languages = await import("@/app/api/languages/route");

const KEY = "k".repeat(40);
const post = (body: unknown, headers: Record<string, string> = {}, raw = false) =>
  new Request("https://poly.example.com/api/translate", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}`, ...headers },
    body: raw ? (body as string) : JSON.stringify(body),
  });

beforeEach(() => {
  translateDocument.mockReset();
  translateDocument.mockResolvedValue({ format: "text", translation: "hola" });
  vi.stubEnv("TRANSLATOR_API_KEYS", `cms-prod:${KEY}`);
  vi.stubEnv("TRANSLATOR_ALLOWED_ORIGINS", "https://cms.example.com");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/translate", () => {
  it("translates the form's payload for a keyed caller", async () => {
    const response = await POST(post({ text: "Hello", language: "ar", format: "text" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ format: "text", translation: "hola" });
    expect(translateDocument).toHaveBeenCalledWith("Hello", "text", "ar");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("detects the format from the filename when none is sent", async () => {
    await POST(post({ text: "<a>x</a>", language: "ar", filename: "page.xml" }));
    expect(translateDocument).toHaveBeenCalledWith("<a>x</a>", "xml", "ar");
  });

  it("returns 401 with WWW-Authenticate and CORS headers when no key is sent", async () => {
    const response = await POST(post({ text: "Hello", language: "ar" }, { authorization: "", origin: "https://cms.example.com", "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(response.headers.get("access-control-allow-origin")).toBe("https://cms.example.com");
    expect((await response.json()).error.code).toBe("unauthorized");
    expect(translateDocument).not.toHaveBeenCalled();
  });

  it("lets the same-origin web form call without a key", async () => {
    const response = await POST(post({ text: "Hello", language: "ar" }, { authorization: "", "sec-fetch-site": "same-origin" }));
    expect(response.status).toBe(200);
  });

  it("rejects unlisted origins from reading the response", async () => {
    const response = await POST(post({ text: "Hello", language: "ar" }, { origin: "https://evil.example.com" }));
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it.each([
    ["not json", { raw: "{oops" }, 400, "invalid_request"],
    ["empty text", { body: { text: "  ", language: "ar" } }, 400, "invalid_request"],
    ["too long", { body: { text: "x".repeat(50_001), language: "ar" } }, 413, "too_large"],
    ["unknown language", { body: { text: "Hi", language: "de" } }, 400, "unsupported_language"],
    ["missing language", { body: { text: "Hi" } }, 400, "unsupported_language"],
    ["bad format", { body: { text: "Hi", language: "ar", format: "yaml" } }, 400, "invalid_request"],
    ["array body", { body: [1] }, 400, "invalid_request"],
  ])("%s → %i %s", async (_name, input, status, code) => {
    const response = "raw" in input ? await POST(post(input.raw, {}, true)) : await POST(post(input.body));
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
  });

  it("lists available languages on unsupported_language", async () => {
    const body = await (await POST(post({ text: "Hi", language: "de" }))).json();
    expect(body.error.available).toContain("ar");
  });

  it("requires a JSON content type", async () => {
    const response = await POST(post("text=Hi", { "content-type": "text/plain" }, true));
    expect(response.status).toBe(400);
  });

  it("maps pipeline failures to stable codes", async () => {
    translateDocument.mockRejectedValueOnce(new Error("Malformed XML: unexpected </a> (character 3)."));
    expect((await (await POST(post({ text: "<a>", language: "ar" }))).json()).error.code).toBe("invalid_document");
    translateDocument.mockRejectedValueOnce(new Error("Translation provider returned 500: boom"));
    expect((await POST(post({ text: "Hi", language: "ar" }))).status).toBe(502);
  });
});

describe("OPTIONS and GET /api/languages", () => {
  it("answers the preflight without a key", async () => {
    const response = OPTIONS(new Request("https://poly.example.com/api/translate", { method: "OPTIONS", headers: { origin: "https://cms.example.com" } }));
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-headers")).toContain("authorization");
  });

  it("lists languages for keyed callers and rejects anonymous ones", async () => {
    const ok = await languages.GET(new Request("https://poly.example.com/api/languages", { headers: { authorization: `Bearer ${KEY}` } }));
    expect((await ok.json()).languages.map((language: { code: string }) => language.code)).toContain("ar");
    const denied = await languages.GET(new Request("https://poly.example.com/api/languages"));
    expect(denied.status).toBe(401);
  });
});
