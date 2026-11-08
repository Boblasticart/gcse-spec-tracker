import "server-only";

import { ModelError, type Model } from "./model";

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface GeminiReply {
  candidates?: { content?: { parts?: { text?: unknown; thought?: unknown }[] } }[];
  error?: { message?: string };
}

/** Gemini in JSON mode, as the old Cloudflare Worker called it. */
export function geminiModel({ apiKey, model = "gemini-flash-latest", timeoutMs = 90_000, fetchImpl = fetch }: GeminiOptions): Model {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  return async ({ prompt }) => {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new ModelError("failed", `Gemini request failed: ${(err as Error).message}`);
    }
    const data = (await res.json().catch(() => null)) as GeminiReply | null;
    if (!res.ok) {
      if (res.status === 429) throw new ModelError("rate_limited", "Gemini rate limit reached.");
      throw new ModelError("failed", data?.error?.message ?? `Gemini error ${res.status}`);
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
