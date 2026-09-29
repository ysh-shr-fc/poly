import { createHash, timingSafeEqual } from "node:crypto";

export const MIN_KEY_LENGTH = 32;

export type ApiKey = { name: string; key: string };
export type Caller = { name: string; viaKey: boolean };

// TRANSLATOR_API_KEYS = "cms-prod:<key>,crm:<key>". The name is split off at the first colon.
export function parseKeys(value: string | undefined): ApiKey[] {
  const keys: ApiKey[] = [];
  for (const entry of (value ?? "").split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    const name = colon === -1 ? "" : trimmed.slice(0, colon).trim();
    const key = colon === -1 ? "" : trimmed.slice(colon + 1).trim();
    if (!name || key.length < MIN_KEY_LENGTH) {
      console.error(`Ignoring an API key entry${name ? ` for "${name}"` : ""}: expected name:key with a key of at least ${MIN_KEY_LENGTH} characters.`);
      continue;
    }
    keys.push({ name, key });
  }
  return keys;
}

const digest = (value: string) => createHash("sha256").update(value).digest();

function bearerToken(request: Request): string | null {
  const match = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

// Hashing first makes the comparison length-independent; checking every key
// avoids leaking which entry matched through timing.
export function matchKey(token: string, keys: ApiKey[]): ApiKey | null {
  const hashed = digest(token);
  let found: ApiKey | null = null;
  for (const candidate of keys) {
    if (timingSafeEqual(hashed, digest(candidate.key))) found = candidate;
  }
  return found;
}

// The web form calls from the site itself and cannot hold a secret. Note that a
// non-browser client can forge these headers, so this only keeps the form working;
// it is not a defence for the endpoint.
export function isSameOrigin(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "same-origin") return true;
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

export function authorize(request: Request, keysValue = process.env.TRANSLATOR_API_KEYS): Caller | null {
  const token = bearerToken(request);
  if (token) {
    const keys = parseKeys(keysValue);
    if (!keys.length) console.error("A bearer token was sent but TRANSLATOR_API_KEYS has no valid entries; rejecting.");
    const match = matchKey(token, keys);
    return match ? { name: match.name, viaKey: true } : null;
  }
  return isSameOrigin(request) ? { name: "web-form", viaKey: false } : null;
}
