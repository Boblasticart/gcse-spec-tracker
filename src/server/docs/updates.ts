import "server-only";

import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { asProgress, isDocPath } from "@/lib/docs";

import repoUpdates from "../../../data/updates.json";
import { now } from "../clock";
import { db } from "../db";

/**
 * One entry of data/updates.json, pushed to the repo after finishing a topic:
 * `{"id":"unique-id","sid":"phy","needsWork":["phy.4.0"],"daily":{"2026-11-02-phy":{...}}}`
 */
export const updateSchema = z.object({
  id: z.string().min(1),
  sid: z.string().optional(),
  needsWork: z.array(z.string()).optional(),
  daily: z.record(z.string(), z.unknown()).optional(),
});

export type RepoUpdate = z.infer<typeof updateSchema>;

/** The entries in the repo's data/updates.json (invalid entries are skipped, as in the legacy adapter). */
export function loadRepoUpdates(raw: unknown = repoUpdates): RepoUpdate[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((u) => {
    const parsed = updateSchema.safeParse(u);
    return parsed.success ? [parsed.data] : [];
  });
}

const META_APPLIED = "meta/applied";

/**
 * Applies repo updates not yet applied to this account, with the legacy
 * adapter's rules: needsWork only turns *Not done* points into *Needs work*,
 * daily sets are only added if missing, and each id is recorded in
 * `meta/applied` so it never runs twice. Returns the ids applied.
 */
export async function applyRepoUpdates(userId: string, updates: RepoUpdate[] = loadRepoUpdates()): Promise<string[]> {
  if (!updates.length) return [];
  return db().$transaction(async (tx) => {
    // Lock this account's meta row so two sign-ins can't apply the same update twice.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const t = now();
    const metaRow = await tx.userDoc.findUnique({ where: { userId_path: { userId, path: META_APPLIED } } });
    const metaIds = metaRow && !metaRow.deleted ? (metaRow.data as { ids?: unknown }).ids : undefined;
    const done = new Set<string>(Array.isArray(metaIds) ? metaIds.filter((x): x is string => typeof x === "string") : []);
    const todo = updates.filter((u) => !done.has(u.id));
    if (!todo.length) return [];

    const upsert = async (path: string, data: unknown, onlyIfMissing: boolean): Promise<void> => {
      if (!isDocPath(path)) return;
      const where = { userId_path: { userId, path } };
      const existing = await tx.userDoc.findUnique({ where });
      if (existing && !existing.deleted && onlyIfMissing) return;
      const json = data as Prisma.InputJsonValue;
      if (existing) {
        await tx.userDoc.update({ where, data: { data: json, deleted: false, version: existing.version + 1, updatedAt: t } });
      } else {
        await tx.userDoc.create({ data: { userId, path, data: json, version: 1, updatedAt: t } });
      }
    };

    const progress = new Map<string, ReturnType<typeof asProgress>>();
    for (const u of todo) {
      if (u.sid && u.needsWork?.length) {
        const key = `progress/${u.sid}`;
        let p = progress.get(key);
        if (!p) {
          const row = await tx.userDoc.findUnique({ where: { userId_path: { userId, path: key } } });
          p = asProgress(row && !row.deleted ? row.data : undefined);
          progress.set(key, p);
        }
        for (const pid of u.needsWork) if (!p.s[pid]) p.s[pid] = 1;
      }
      for (const [id, doc] of Object.entries(u.daily ?? {})) await upsert(`daily/${id}`, doc, true);
      done.add(u.id);
    }
    for (const [path, p] of progress) await upsert(path, p, false);
    await upsert(META_APPLIED, { ids: [...done] }, false);
    return todo.map((u) => u.id);
  });
}
