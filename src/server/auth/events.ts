import "server-only";

import type { AuthEventKind, Prisma } from "@prisma/client";

import { now } from "../clock";
import { db } from "../db";

export interface EventFields {
  email?: string | null;
  userId?: string | null;
  ip?: string | null;
}

export async function logEvent(kind: AuthEventKind, fields: EventFields): Promise<void> {
  await db().authEvent.create({
    data: {
      kind,
      email: fields.email ?? null,
      userId: fields.userId ?? null,
      ip: fields.ip ?? null,
      createdAt: now(),
    },
  });
}

/** How many events of these kinds matched since `since`. */
export async function countEvents(
  kinds: AuthEventKind[],
  match: { email: string } | { ip: string },
  since: Date,
): Promise<number> {
  const where: Prisma.AuthEventWhereInput = { kind: { in: kinds }, createdAt: { gt: since }, ...match };
  return db().authEvent.count({ where });
}

/** Deletes audit events older than `olderThan` (used by the prune job in M11). */
export async function pruneEvents(olderThan: Date): Promise<number> {
  const { count } = await db().authEvent.deleteMany({ where: { createdAt: { lt: olderThan } } });
  return count;
}
