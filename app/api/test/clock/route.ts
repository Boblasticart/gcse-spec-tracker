import { z } from "zod";

import { clockOffsetMs, setClockOffsetMs, testClockAllowed } from "@/server/clock";
import { handler, HttpError, json, parseJson } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_FOUND = (): HttpError => new HttpError(404, "NOT_FOUND", "Not found.");

/** Test-only: move the server clock (e2e time travel). 404 unless ENABLE_TEST_CLOCK=1 and not on Vercel. */
export const POST = handler(async (request: Request) => {
  if (!testClockAllowed()) throw NOT_FOUND();
  const { offsetMs } = await parseJson(request, z.object({ offsetMs: z.number().int().min(0).max(400 * 24 * 3600 * 1000) }));
  setClockOffsetMs(offsetMs);
  return json({ ok: true, offsetMs });
});

export const GET = handler(async () => {
  if (!testClockAllowed()) throw NOT_FOUND();
  return json({ ok: true, offsetMs: clockOffsetMs() });
});
