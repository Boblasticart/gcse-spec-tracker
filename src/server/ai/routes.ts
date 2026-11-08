import "server-only";

import { z } from "zod";

import { TASK_IDS, type TaskId } from "@/lib/ai/tasks";

import { requireUser } from "../auth/session";
import { assertSameOrigin, handler, json, parseJson } from "../http";
import { runTask } from "./service";

const bodySchema = z.object({
  task: z.enum(TASK_IDS as [TaskId, ...TaskId[]], { error: "Unknown AI task." }),
  input: z.unknown(),
});

/** POST /api/ai/json  { task, input }  ->  { ok: true, result } */
export const aiJsonRoute = handler(async (request: Request) => {
  assertSameOrigin(request);
  const { user } = await requireUser(request);
  const { task, input } = await parseJson(request, bodySchema);
  const result = await runTask(user, task, input);
  return json({ ok: true, result });
});
