import { ApiError } from "./errors";

// Counters live in Upstash Redis (Vercel Marketplace) because serverless instances share no memory.
// Configured by UPSTASH_REDIS_REST_URL/TOKEN or the KV_REST_API_URL/TOKEN names the integration may set.
// If the store isn't configured or is unreachable the limiter fails open and logs, so an outage
// of the store doesn't take translation down. Caps are per API key, not per person.
function store() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

function limit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function pipeline(commands: Array<Array<string | number>>): Promise<number[]> {
  const config = store()!;
  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw new Error(`Rate-limit store returned ${response.status}`);
  const results = (await response.json()) as Array<{ result?: number; error?: string }>;
  const failed = results.find((entry) => entry.error);
  if (failed) throw new Error(failed.error);
  return results.map((entry) => Number(entry.result ?? 0));
}

let warned = false;

// Throws ApiError("rate_limited") when the key has used up its per-minute requests or daily characters.
export async function consume(caller: string, characters: number): Promise<void> {
  if (!store()) {
    if (!warned) console.warn("Rate limiting is off: no Upstash Redis credentials are configured.");
    warned = true;
    return;
  }

  const perMinute = limit("TRANSLATOR_RATE_PER_MINUTE", 30);
  const perDay = limit("TRANSLATOR_DAILY_CHARS", 500_000);
  const now = Date.now();
  const minuteKey = `rl:${caller}:m:${Math.floor(now / 60_000)}`;
  const dayKey = `rl:${caller}:d:${new Date(now).toISOString().slice(0, 10)}`;

  let requests: number;
  let chars: number;
  try {
    [requests, , chars] = await pipeline([
      ["INCR", minuteKey],
      ["EXPIRE", minuteKey, 120],
      ["INCRBY", dayKey, characters],
      ["EXPIRE", dayKey, 172_800],
    ]);
  } catch (error) {
    console.error("Rate limiting skipped:", error instanceof Error ? error.message : error);
    return;
  }

  if (requests > perMinute) {
    const retryAfter = String(60 - Math.floor((now % 60_000) / 1000));
    throw new ApiError("rate_limited", `Limit of ${perMinute} requests per minute reached. Try again shortly.`, {}, { "Retry-After": retryAfter });
  }
  if (chars > perDay) {
    throw new ApiError("rate_limited", `Daily limit of ${perDay.toLocaleString("en-US")} characters reached for this key.`, {}, { "Retry-After": "3600" });
  }
}
