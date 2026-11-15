/**
 * Calls the AI providers the owner has keys for. Each one is a plain HTTPS
 * JSON API: Gemini's own, or the OpenAI-style chat API (Groq, OpenRouter, ...).
 */
export interface ProviderConfig {
  id: string;
  /** Name of the environment variable (GitHub secret) holding the key. */
  env: string;
  /** "mock" replays an existing prepared note (tests, NOTES_MOCK=1). */
  kind: "gemini" | "openai" | "mock";
  url?: string;
  model: string;
  /** Models to try in order when one is retired or too big for the free tier ("auto-free" = OpenRouter's current free models). */
  models?: string[];
  rpm: number;
  rpd: number;
  maxTokens: number;
}

/** Thrown when a provider says we've hit its limit; `daily` = done for today. */
export class RateLimited extends Error {
  constructor(
    message: string,
    readonly daily: boolean,
    readonly retryAfterMs: number,
  ) {
    super(message);
    this.name = "RateLimited";
  }
}

/** Thrown when this model can't be used (retired, not free any more, or request too large for its limits): try the next one. */
export class ModelUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelUnavailable";
  }
}

/** Long notes from "thinking" models can take several minutes. */
const TIMEOUT_MS = 600_000;

function retryAfter(res: Response): number {
  const s = Number(res.headers.get("retry-after"));
  return Number.isFinite(s) && s > 0 ? s * 1000 : 60_000;
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    // Timeouts and dropped connections are the provider being busy, not the note's fault.
    throw new RateLimited(`no reply: ${(e as Error).message}`, false, 60_000);
  }
  const text = await res.text();
  if (res.status >= 500) throw new RateLimited(`busy, HTTP ${res.status}: ${text.slice(0, 200)}`, false, 90_000);
  if (res.status === 429) {
    const daily = /per.?day|daily|RPD|quota.*exceeded.*day|free-models-per-day/i.test(text);
    throw new RateLimited(`429: ${text.slice(0, 300)}`, daily, retryAfter(res));
  }
  if (res.status === 404 || res.status === 413 || (res.status === 400 && /model/i.test(text))) {
    throw new ModelUnavailable(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as unknown;
}

/** Sends one prompt and returns the model's text reply. */
export async function complete(p: ProviderConfig, key: string, prompt: string): Promise<string> {
  if (p.kind === "mock") {
    const { readFileSync } = await import("node:fs");
    return readFileSync(new URL("../../data/notes/phy.0.1.json", import.meta.url), "utf8");
  }
  if (p.kind === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.model)}:generateContent`;
    const data = (await post(url, { "x-goog-api-key": key }, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: p.maxTokens, temperature: 0.4 },
    })) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] };
    const c = data.candidates?.[0];
    const text = (c?.content?.parts ?? []).map((x) => x.text ?? "").join("");
    if (!text) throw new Error(`empty reply (${c?.finishReason ?? "no candidate"})`);
    return text;
  }
  const data = (await post(p.url ?? "", { authorization: `Bearer ${key}` }, {
    model: p.model,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_tokens: p.maxTokens,
    temperature: 0.4,
  })) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
  const ch = data.choices?.[0];
  const text = ch?.message?.content ?? "";
  if (!text) throw new Error(`empty reply (${ch?.finish_reason ?? "no choice"})`);
  return text;
}

/** The models to try for a provider. "auto-free" asks OpenRouter which free models exist today (biggest context first). */
export async function resolveModels(p: ProviderConfig, key: string): Promise<string[]> {
  const list = p.models?.length ? p.models : [p.model];
  if (!list.includes("auto-free")) return list;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000) });
    const data = (await res.json()) as { data?: { id: string; context_length?: number }[] };
    const free = (data.data ?? [])
      .filter((m) => m.id.endsWith(":free") && (m.context_length ?? 0) >= 32_000)
      .sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0))
      .map((m) => m.id)
      .slice(0, 6);
    return list.flatMap((m) => (m === "auto-free" ? free : [m]));
  } catch {
    return list.filter((m) => m !== "auto-free");
  }
}
