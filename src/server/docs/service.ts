import "server-only";

import { Prisma, type UserDoc } from "@prisma/client";
import { z } from "zod";

import { MAX_BATCH, MAX_DOC_BYTES, isDocPath, type ChangeResult, type DocDto } from "@/lib/docs";

import { addMs, now } from "../clock";
import { db, isUniqueViolation, withReadRetry } from "../db";
import { HttpError } from "../http";

export type { ChangeResult, DocDto };

export const toDto = (r: Pick<UserDoc, "path" | "data" | "version" | "deleted" | "updatedAt">): DocDto => ({
  path: r.path,
  data: r.deleted ? null : r.data,
  version: r.version,
  deleted: r.deleted,
  updatedAt: r.updatedAt.toISOString(),
});

/** How far back a delta cursor reaches, to cover clock skew between server instances. */
const CURSOR_SKEW_MS = 5_000;

export interface DocsPage {
  docs: DocDto[];
  /** Pass back as `since` to get only what changed after this call. */
  cursor: string;
}

/** Every live doc (full hydrate), or everything changed since `since` including deletions (delta). */
export async function listDocs(userId: string, since?: Date): Promise<DocsPage> {
  const cursor = addMs(now(), -CURSOR_SKEW_MS).toISOString();
  const rows = await withReadRetry(() =>
    db().userDoc.findMany({
      where: since ? { userId, updatedAt: { gte: since } } : { userId, deleted: false },
      orderBy: { path: "asc" },
    }),
  );
  return { docs: rows.map(toDto), cursor };
}

const jsonValue: z.ZodType<Prisma.InputJsonValue> = z.custom<Prisma.InputJsonValue>(
  (v) => v !== null && v !== undefined && typeof v !== "function",
);

export const changeSchema = z.object({
  path: z.string().refine(isDocPath, { error: "Unknown document path." }),
  /** `null` deletes the doc. */
  data: jsonValue.nullable(),
  /** The version this change was made on top of; null/0 when the doc did not exist. */
  baseVersion: z.number().int().min(0).nullable(),
});

export const putSchema = z.object({
  changes: z.array(changeSchema).min(1).max(MAX_BATCH),
});

export type DocChange = z.infer<typeof changeSchema>;

function checkSize(change: DocChange): void {
  if (change.data === null) return;
  const bytes = Buffer.byteLength(JSON.stringify(change.data), "utf8");
  if (bytes > MAX_DOC_BYTES) {
    throw new HttpError(413, "DOC_TOO_LARGE", `"${change.path}" is too big to save (${Math.ceil(bytes / 1024)} KB).`);
  }
}

/**
 * Applies one change with compare-and-set on `version`. If someone else
 * saved first, nothing is written and the server's copy comes back.
 */
async function applyChange(userId: string, change: DocChange, force: boolean): Promise<ChangeResult> {
  const t = now();
  const where = { userId_path: { userId, path: change.path } };
  const deleted = change.data === null;
  const data = (change.data ?? {}) as Prisma.InputJsonValue;
  const base = change.baseVersion ?? 0;

  const current = await db().userDoc.findUnique({ where });
  if (force || (current ? current.version === base : base === 0)) {
    if (!current) {
      if (deleted) return { path: change.path, status: "ok", version: 0, updatedAt: t.toISOString() };
      try {
        const row = await db().userDoc.create({ data: { userId, path: change.path, data, version: 1, deleted, updatedAt: t } });
        return { path: change.path, status: "ok", version: row.version, updatedAt: row.updatedAt.toISOString() };
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    } else {
      const { count } = await db().userDoc.updateMany({
        where: { userId, path: change.path, version: current.version },
        data: { data, deleted, version: current.version + 1, updatedAt: t },
      });
      if (count === 1) {
        return { path: change.path, status: "ok", version: current.version + 1, updatedAt: t.toISOString() };
      }
    }
  }
  const latest = await db().userDoc.findUnique({ where });
  return { path: change.path, status: "conflict", server: latest ? toDto(latest) : null };
}

/** Saves a batch of changes. Each change succeeds or conflicts on its own. */
export async function putDocs(userId: string, changes: DocChange[], opts: { force?: boolean } = {}): Promise<ChangeResult[]> {
  changes.forEach(checkSize);
  const seen = new Set<string>();
  for (const c of changes) {
    if (seen.has(c.path)) throw new HttpError(400, "DUPLICATE_PATH", `"${c.path}" appears twice in one save.`);
    seen.add(c.path);
  }
  const results: ChangeResult[] = [];
  for (const change of changes) results.push(await applyChange(userId, change, !!opts.force));
  return results;
}

/** Reads one live doc's data (or undefined). */
export async function readDoc(userId: string, path: string): Promise<{ data: unknown; version: number } | undefined> {
  const row = await db().userDoc.findUnique({ where: { userId_path: { userId, path } } });
  return row && !row.deleted ? { data: row.data, version: row.version } : undefined;
}
