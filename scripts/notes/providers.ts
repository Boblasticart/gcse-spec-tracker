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
  /** How many notes to ask this provider for at once (replies take minutes, so this is what fills the per-minute allowance). Default 1. */
  parallel?: number;
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

/**
 * Sorts a failed HTTP reply into: provider busy or out of allowance (RateLimited),
 * this model can't be used by us (ModelUnavailable: try the next model), or null
 * (an ordinary error, counted against the note).
 */
export function classifyHttpError(status: number, text: string, retryAfterMs = 60_000): Error | null {
  if (status >= 500) return new RateLimited(`busy, HTTP ${status}: ${text.slice(0, 200)}`, false, 90_000);
  // Groq: one request bigger than the model's per-minute token limit will never fit; move on to another model.
  if (status === 429 && /request too large/i.test(text)) return new ModelUnavailable(`HTTP 429: ${text.slice(0, 300)}`);
  if (status === 429) {
    const daily = /per.?day|daily|RPD|quota.*exceeded.*day|free-models-per-day/i.test(text);
    return new RateLimited(`429: ${text.slice(0, 300)}`, daily, retryAfterMs);
  }
  // 403: e.g. an OpenRouter free model only open to certain apps, or a model this key may not use.
  if (status === 403 || status === 404 || status === 413 || (status === 400 && /model/i.test(text))) {
    return new ModelUnavailable(`HTTP ${status}: ${text.slice(0, 300)}`);
  }
  return null;
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
  let text: string;
  try {
    text = await res.text();
  } catch (e) {
    throw new RateLimited(`reply cut off: ${(e as Error).message}`, false, 60_000);
  }
  const err = classifyHttpError(res.status, text, retryAfter(res));
  if (err) throw err;
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
    // gpt-oss models "think" first; keep that short so the note itself fits in the token budget.
    ...(/gpt-oss/.test(p.model) ? { reasoning_effort: "low" } : {}),
  })) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
  const ch = data.choices?.[0];
  const text = ch?.message?.content ?? "";
  // A model that spends its whole token budget thinking replies with nothing: not the note's fault, so after two of these the writer moves on to the next model.
  if (!text && ch?.finish_reason === "length") throw new RateLimited("reply cut off: empty reply (length)", false, 5000);
  if (!text) throw new Error(`empty reply (${ch?.finish_reason ?? "no choice"})`);
  return text;
}

/** The models to try for a provider. "auto-free" asks OpenRouter which free models exist today (biggest context first). */
export async function resolveModels(p: ProviderConfig, key: string): Promise<string[]> {
  const list = p.models?.length ? p.models : [p.model];
  if (list.includes("auto") && p.kind === "gemini") {
    // Each Gemini model has its own free daily allowance: list the Flash models this key can use, newest first.
    try {
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(30_000) });
      const data = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
      const flash = geminiFlashModels(data.models ?? []);
      return [...new Set(list.flatMap((m) => (m === "auto" ? flash : [m])))];
    } catch {
      return list.filter((m) => m !== "auto");
    }
  }
  if (list.includes("auto") && p.url) {
    // Ask an OpenAI-style API which chat models this key can use today.
    try {
      const res = await fetch(p.url.replace(/\/chat\/completions$/, "/models"), { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000) });
      const data = (await res.json()) as { data?: { id: string; active?: boolean; context_window?: number }[] };
      const chat = (data.data ?? [])
        .filter((m) => m.active !== false && !/whisper|guard|tts|orpheus|prompt|compound|playai|distil|embed/i.test(m.id))
        .sort((a, b) => (b.context_window ?? 0) - (a.context_window ?? 0))
        .map((m) => m.id);
      return [...new Set(list.flatMap((m) => (m === "auto" ? chat : [m])))];
    } catch {
      return list.filter((m) => m !== "auto");
    }
  }
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

/** Text-writing Gemini Flash models from a ListModels reply, newest version first (no image, audio, TTS, live or embedding models). */
export function geminiFlashModels(models: readonly { name: string; supportedGenerationMethods?: string[] }[]): string[] {
  const version = (id: string): number => Number(/gemini-(\d+(?:\.\d+)?)/.exec(id)?.[1] ?? 0);
  return models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((id) => /^gemini-.*flash/.test(id) && !/image|tts|audio|live|embed|thinking-exp|robotics|computer/i.test(id))
    .sort((a, b) => version(b) - version(a) || Number(a.includes("lite")) - Number(b.includes("lite")) || a.length - b.length);
}
