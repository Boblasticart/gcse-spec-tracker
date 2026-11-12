import "server-only";

import type { User } from "@prisma/client";

import { taskSchemas, type TaskId, type TaskOutput } from "@/lib/ai/tasks";
import { londonToday } from "@/lib/dates";
import { asProgress } from "@/lib/docs";

import { now } from "../clock";
import { readDoc } from "../docs/service";
import { HttpError } from "../http";
import { geminiModel } from "./gemini";
import { AiOutputError, parseModelJson } from "./json";
import { mockAllowed, mockModel } from "./mock";
import { ModelError, type Model } from "./model";
import { BUILDERS, FAILURE_MESSAGES, type TaskContext } from "./tasks";
import { countAiCall, dailyCap } from "./usage";

/** The model to use: the test mock when allowed, otherwise Gemini (if a key is set). */
export function defaultModel(): Model | null {
  if (mockAllowed()) return mockModel;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  return geminiModel({ apiKey: key, model: process.env.GEMINI_MODEL || "gemini-flash-latest" });
}

/** If AI_ALLOWED_EMAILS is set (comma-separated), only those accounts may use AI. */
export function aiAllowedFor(email: string): boolean {
  const list = (process.env.AI_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !list.length || list.includes(email.toLowerCase());
}

export interface RunOptions {
  model?: Model | null;
  cap?: number;
}

/** Runs one AI task for a signed-in student: checks, counts, prompts, parses and normalises. */
export async function runTask<T extends TaskId>(
  user: Pick<User, "id" | "email">,
  task: T,
  rawInput: unknown,
  opts: RunOptions = {},
): Promise<TaskOutput<T>> {
  const parsed = taskSchemas[task].safeParse(rawInput);
  if (!parsed.success) {
    throw new HttpError(400, "INVALID_INPUT", parsed.error.issues[0]?.message ?? "Some details are missing.");
  }
  if (!aiAllowedFor(user.email)) {
    throw new HttpError(403, "AI_NOT_ALLOWED", "AI marking and writing isn't turned on for this account.");
  }
  const model = opts.model === undefined ? defaultModel() : opts.model;
  if (!model) throw new HttpError(503, "AI_UNAVAILABLE", "AI marking isn't set up yet. Ask the site owner to add the Gemini key.");

  const ctx: TaskContext = {
    today: londonToday(now()),
    progress: async (sid) => asProgress((await readDoc(user.id, `progress/${sid}`))?.data),
  };
  const build = BUILDERS[task] as (input: unknown, ctx: TaskContext) => ReturnType<(typeof BUILDERS)[T]>;
  const built = await build(parsed.data, ctx);

  const cap = opts.cap ?? dailyCap();
  const used = await countAiCall(user.id);
  if (used > cap) {
    throw new HttpError(429, "AI_LIMIT", `You've used today's ${cap} AI requests. They reset at midnight.`, {
      retryAfter: 3600,
    });
  }

  let text: string;
  try {
    text = await model({ task, prompt: built.prompt, input: parsed.data });
  } catch (err) {
    if (err instanceof ModelError && err.kind === "rate_limited") {
      throw new HttpError(429, "AI_BUSY", "The AI is busy right now. Wait a minute and try again.", { retryAfter: 60 });
    }
    if (err instanceof ModelError && err.kind === "key_rejected") {
      console.error(`AI task ${task} failed`, err);
      throw new HttpError(503, "AI_KEY_REJECTED", "Google turned down this site's Gemini key. The site owner needs to check GEMINI_API_KEY in Vercel, then redeploy.");
    }
    console.error(`AI task ${task} failed`, err);
    const ref = err instanceof ModelError ? `G${err.status}` : "X";
    throw new HttpError(502, "AI_FAILED", `${FAILURE_MESSAGES[task]} (ref ${ref})`);
  }
  try {
    return built.finish(parseModelJson(text)) as TaskOutput<T>;
  } catch (err) {
    if (err instanceof AiOutputError) {
      console.error(`AI task ${task} gave unusable output: ${err.message}`);
      throw new HttpError(502, "AI_BAD_OUTPUT", `${FAILURE_MESSAGES[task]} (ref OUT)`);
    }
    throw err;
  }
}
