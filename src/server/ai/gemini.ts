import "server-only";

import { ModelError, type Model } from "./model";

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  /** Max thinking tokens (null = the model's default). */
  thinkingBudget?: number | null;
  fetchImpl?: typeof fetch;
}

interface GeminiReply {
  candidates?: { content?: { parts?: { text?: unknown; thought?: unknown }[] } }[];
  error?: { message?: string };
}

/** Gemini in JSON mode, as the old Cloudflare Worker called it. */
export function geminiModel({ apiKey, model = "gemini-flash-latest", timeoutMs = 100_000, thinkingBudget = 1024, fetchImpl = fetch }: GeminiOptions): Model {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const call = (prompt: string, withThinking: boolean): Promise<Response> =>
    fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.3,
          // Keep "thinking" short: long thinking made answers take over 90 seconds.
          ...(withThinking ? { thinkingConfig: { thinkingBudget: thinkingBudget } } : {}),
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  return async ({ prompt }) => {
    let res: Response;
    try {
      res = await call(prompt, thinkingBudget !== null);
      // Models that don't accept a thinking setting: ask again without it.
      if (res.status === 400 && thinkingBudget !== null) {
        const peek = (await res.clone().json().catch(() => null)) as GeminiReply | null;
        if (/thinking/i.test(peek?.error?.message ?? "")) res = await call(prompt, false);
      }
    } catch (err) {
      const timedOut = (err as Error).name === "TimeoutError";
      throw new ModelError("failed", `Gemini request failed: ${(err as Error).message}`, timedOut ? 504 : 0);
    }
    const data = (await res.json().catch(() => null)) as GeminiReply | null;
    if (!res.ok) {
      if (res.status === 429) throw new ModelError("rate_limited", "Gemini rate limit reached.");
      const why = data?.error?.message ?? "";
      if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key|credential|token/i.test(why))) {
        throw new ModelError("key_rejected", `Gemini refused the key (${res.status}): ${why}`);
      }
      throw new ModelError("failed", `Gemini error ${res.status}: ${why || "no details"}`, res.status);
    }
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .filter((p) => !p.thought && typeof p.text === "string")
      .map((p) => p.text as string)
      .join("");
    if (!text) throw new ModelError("failed", "Gemini sent back an empty answer.");
    return text;
  };
}
