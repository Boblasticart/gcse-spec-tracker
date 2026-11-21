/**
 * Calls the AI providers the owner has keys for. Each one is a plain HTTPS
 * JSON API: Gemini's own, or the OpenAI-style chat API (Groq, OpenRouter, ...).
 */
import { AiOutputError, closeTruncatedJson, parseModelJson } from "@/server/ai/json";

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
  /** false = don't ask the provider for JSON mode (its own JSON check is stricter than our repairs). Default true. */
  json?: boolean;
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

/** Long notes from "thinking" models can take many minutes. Replies are streamed, so a slow start is not mistaken for a dead connection. */
const TIMEOUT_MS = 900_000;

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
  // 400: only when the provider says the model itself is the problem (retired, unknown, too small for the request).
  // A reply that failed the provider's own JSON check is an ordinary failed attempt, not a broken model.
  const badModel = status === 400 && !/failed to (generate|validate) json/i.test(text) && /max_tokens|context (window|length)|decommissioned|no longer|not (found|supported|exist)|does not exist|unknown model|invalid model/i.test(text);
  if (status === 403 || status === 404 || status === 413 || badModel) {
    return new ModelUnavailable(`HTTP ${status}: ${text.slice(0, 300)}`);
  }
  return null;
}

/** The JSON messages in a streamed ("server-sent events") reply. A plain JSON reply comes back as one message. */
export function parseSse(text: string): unknown[] {
  const out: unknown[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      out.push(JSON.parse(data));
    } catch {
      // a cut-off last line: ignore it
    }
  }
  if (!out.length) {
    try {
      out.push(JSON.parse(text));
    } catch {
      // not JSON either: the caller reports an empty reply
    }
  }
  return out;
}

/** Joins a streamed Gemini reply's text (skipping "thinking" parts). */
export function geminiStreamText(chunks: readonly unknown[]): { text: string; finish: string } {
  type Chunk = { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[] };
  let text = "";
  let finish = "";
  for (const c of chunks as Chunk[]) {
    const cand = c?.candidates?.[0];
    for (const part of cand?.content?.parts ?? []) if (!part.thought) text += part.text ?? "";
    if (cand?.finishReason) finish = cand.finishReason;
  }
  return { text, finish };
}

/** Joins a streamed OpenAI-style reply's text. */
export function openaiStreamText(chunks: readonly unknown[]): { text: string; finish: string } {
  type Chunk = { choices?: { delta?: { content?: string | null }; message?: { content?: string | null }; finish_reason?: string | null }[] };
  let text = "";
  let finish = "";
  for (const c of chunks as Chunk[]) {
    const ch = c?.choices?.[0];
    text += ch?.delta?.content ?? ch?.message?.content ?? "";
    if (ch?.finish_reason) finish = ch.finish_reason;
  }
  return { text, finish };
}

/** Sends a request and returns the streamed reply's messages. */
async function post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown[]> {
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
  const chunks = parseSse(text);
  // A provider that fails part-way through a stream reports it inside the stream.
  const failed = chunks.find((c) => !!c && typeof c === "object" && "error" in c) as { error?: unknown } | undefined;
  // Groq checks the JSON itself and stops the stream when the model's JSON is broken: that is this note failing, not the
  // provider being busy (counted as busy, two of these used to switch off Groq's only good model for the whole day).
  if (failed && /failed to (generate|validate) json/i.test(JSON.stringify(failed.error))) throw new AiOutputError("The reply failed the provider's JSON check.");
  if (failed) throw new RateLimited(`busy, reply cut off: ${JSON.stringify(failed.error).slice(0, 200)}`, false, 90_000);
  return chunks;
}

/** Sends one prompt and returns the model's text reply. */
export async function complete(p: ProviderConfig, key: string, prompt: string): Promise<string> {
  if (p.kind === "mock") {
    const { readFileSync } = await import("node:fs");
    return readFileSync(new URL("../../data/notes/phy.0.1.json", import.meta.url), "utf8");
  }
  if (p.kind === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.model)}:streamGenerateContent?alt=sse`;
    const chunks = await post(url, { "x-goog-api-key": key }, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: p.maxTokens, temperature: 0.4 },
    });
    const { text, finish } = geminiStreamText(chunks);
    if (!text) throw new Error(`empty reply (${finish || "no candidate"})`);
    return checkFinished(text, finish, "STOP");
  }
  const chunks = await post(p.url ?? "", { authorization: `Bearer ${key}` }, {
    model: p.model,
    messages: [{ role: "user", content: prompt }],
    // json: false = let the model reply freely and repair the JSON here (Groq's own check rejects LaTeX backslashes we can fix).
    ...(p.json === false ? {} : { response_format: { type: "json_object" } }),
    max_tokens: p.maxTokens,
    temperature: 0.4,
    stream: true,
    // gpt-oss models "think" first; keep that short so the note itself fits in the token budget.
    ...(/gpt-oss/.test(p.model) ? { reasoning_effort: "low" } : {}),
  });
  const { text, finish } = openaiStreamText(chunks);
  // A model that spends its whole token budget thinking replies with nothing: not the note's fault, so after two of these the writer moves on to the next model.
  if (!text && finish === "length") throw new RateLimited("reply cut off: empty reply (length)", false, 5000);
  if (!text) throw new Error(`empty reply (${finish || "no choice"})`);
  return checkFinished(text, finish, "stop");
}

/**
 * A reply that stopped early (token limit, Gemini's RECITATION or SAFETY stop) is usually half a note. If it can't be
 * read, say why it stopped, so the failures list and STATUS show the real cause instead of just "did not return JSON".
 */
export function checkFinished(text: string, finish: string, normal: string): string {
  if (!finish || finish === normal) return text;
  try {
    parseModelJson(text);
    return text;
  } catch {
    // Cut off near the end (the usual case for long notes): keep the complete part and let the checks decide.
    const closed = closeTruncatedJson(text);
    if (closed && closed.length >= text.length * 0.8) {
      try {
        parseModelJson(closed);
        return closed;
      } catch {
        // fall through
      }
    }
    throw new AiOutputError(`The reply stopped early (${finish}) after ${text.length} characters.`);
  }
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
