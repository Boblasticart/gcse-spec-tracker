import type { TaskId, TaskInput, TaskOutput } from "@/lib/ai/tasks";

import { api } from "./api";

export type AiResult<T extends TaskId> = { ok: true; result: TaskOutput<T> } | { ok: false; code: string; message: string };

/**
 * Asks the server to run one AI task (`POST /api/ai/json`). The server builds
 * the legacy prompt and checks the answer; this never throws.
 */
export async function runAi<T extends TaskId>(task: T, input: TaskInput<T>, signedOutMessage: string): Promise<AiResult<T>> {
  const res = await api<{ result: TaskOutput<T> }>("/api/ai/json", { body: { task, input } });
  if (res.ok) return { ok: true, result: res.result };
  // Legacy "perm": on claude.ai you had to allow AI. Here a signed-out student just needs to sign in.
  if (res.status === 401) return { ok: false, code: res.code, message: signedOutMessage };
  return { ok: false, code: res.code, message: res.message };
}
