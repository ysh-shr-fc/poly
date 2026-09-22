type ChatMessage = { role: "system" | "user"; content: string };

export async function callModel(messages: ChatMessage[], stage = "translation"): Promise<string> {
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";
  const apiKey = process.env.OPENAI_API_KEY;
  const configuredTimeout = Number(process.env.OPENAI_TIMEOUT_MS || 120_000);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 120_000;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error(`${stage} timed out after ${Math.round(timeoutMs / 1000)} seconds while waiting for ${model}.`);
    }
    throw error;
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Translation provider returned ${response.status}: ${detail}`);
  }
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Translation provider returned an empty response.");
  return content.replace(/^```(?:html|xml|json|text)?\s*/i, "").replace(/\s*```$/, "");
}
