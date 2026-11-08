import "server-only";

import { londonToday } from "@/lib/dates";

import { now } from "../clock";
import { db } from "../db";

export const DEFAULT_DAILY_CAP = 150;

export function dailyCap(): number {
  const v = Number(process.env.AI_DAILY_CAP);
  return Number.isInteger(v) && v > 0 ? v : DEFAULT_DAILY_CAP;
}

/**
 * Counts one AI call for the student today (UK date) and returns the new
 * total. Atomic, so parallel requests can't slip past the cap.
 */
export async function countAiCall(userId: string): Promise<number> {
  const day = londonToday(now());
  const rows = await db().$queryRaw<{ aiCalls: number }[]>`
    INSERT INTO "UsageCounter" ("userId", "day", "aiCalls")
    VALUES (${userId}::uuid, ${day}::date, 1)
    ON CONFLICT ("userId", "day") DO UPDATE SET "aiCalls" = "UsageCounter"."aiCalls" + 1
    RETURNING "aiCalls"`;
  return rows[0]?.aiCalls ?? 1;
}
