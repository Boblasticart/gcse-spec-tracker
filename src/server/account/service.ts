import "server-only";

import { clearedSessionCookie } from "../auth/cookies";
import { pruneEvents } from "../auth/events";
import { verifyPassword } from "../auth/password";
import type { Authed } from "../auth/session";
import { addMs, now } from "../clock";
import { db } from "../db";
import { HttpError } from "../http";

/** Everything the account holds, in one file (the old backup format only has the legacy collections). */
export interface AccountExport {
  format: "gcse-spec-tracker-account";
  version: 1;
  exported: string;
  account: { email: string; createdAt: string; emailVerifiedAt: string | null };
  docs: { path: string; data: unknown; version: number; updatedAt: string }[];
}

export async function exportAccount(auth: Authed): Promise<AccountExport> {
  const rows = await db().userDoc.findMany({ where: { userId: auth.user.id, deleted: false }, orderBy: { path: "asc" } });
  return {
    format: "gcse-spec-tracker-account",
    version: 1,
    exported: now().toISOString(),
    account: {
      email: auth.user.email,
      createdAt: auth.user.createdAt.toISOString(),
      emailVerifiedAt: auth.user.emailVerifiedAt?.toISOString() ?? null,
    },
    docs: rows.map((r) => ({ path: r.path, data: r.data, version: r.version, updatedAt: r.updatedAt.toISOString() })),
  };
}

/**
 * Deletes the account and everything in it (sessions, codes, docs and AI
 * usage go with it via ON DELETE CASCADE; audit events lose the user link).
 * The password is checked again first.
 */
export async function deleteAccount(auth: Authed, password: string): Promise<{ setCookie: string }> {
  if (!(await verifyPassword(auth.user.passwordHash, password))) {
    throw new HttpError(400, "WRONG_PASSWORD", "That password isn't right, so nothing was deleted.");
  }
  await db().user.delete({ where: { id: auth.user.id } });
  return { setCookie: clearedSessionCookie() };
}

/** How long sign-in and sign-up audit events are kept. */
export const AUTH_EVENT_DAYS = 30;
const PRUNE_EVERY_MS = 60 * 60 * 1000;
let lastPrune = 0;

/** Deletes old audit events, at most once an hour per server instance. Never throws. */
export async function pruneAuthEventsIfDue(): Promise<number> {
  const t = now();
  if (t.getTime() - lastPrune < PRUNE_EVERY_MS) return 0;
  lastPrune = t.getTime();
  try {
    return await pruneEvents(addMs(t, -AUTH_EVENT_DAYS * 24 * 60 * 60 * 1000));
  } catch {
    return 0;
  }
}

/** Test hook: lets the next call prune again. */
export function resetPruneTimer(): void {
  lastPrune = 0;
}
