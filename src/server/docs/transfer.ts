import "server-only";

import { z } from "zod";

import { EXPORT_FORMAT, LEGACY_COLLECTIONS, MAX_DOC_BYTES, NEW_COLLECTIONS, isDocPath, type ExportFile } from "@/lib/docs";

import { now } from "../clock";
import { db } from "../db";
import { HttpError } from "../http";
import { putDocs, type DocChange } from "./service";
import { applyRepoUpdates } from "./updates";

/** Collections that are exported and accepted on import (everything except `meta`). */
export const TRANSFER_COLLECTIONS: readonly string[] = [...LEGACY_COLLECTIONS, ...NEW_COLLECTIONS];

export const MAX_IMPORT_DOCS = 5000;

const exportSchema = z.object({
  format: z.literal(EXPORT_FORMAT, { error: "That is not a tracker export file." }),
  version: z.number().optional(),
  collections: z.record(z.string(), z.record(z.string(), z.unknown())),
});

/** Builds the old backup format from every live doc of the account. */
export async function exportDocs(userId: string): Promise<ExportFile> {
  const rows = await db().userDoc.findMany({ where: { userId, deleted: false }, orderBy: { path: "asc" } });
  const collections: ExportFile["collections"] = {};
  for (const c of TRANSFER_COLLECTIONS) collections[c as keyof ExportFile["collections"]] = {};
  for (const r of rows) {
    const c = r.path.slice(0, r.path.indexOf("/"));
    const bucket = collections[c as keyof ExportFile["collections"]];
    if (bucket && TRANSFER_COLLECTIONS.includes(c)) bucket[r.path.slice(c.length + 1)] = r.data;
  }
  return { format: EXPORT_FORMAT, version: 1, exported: now().toISOString(), collections };
}

export interface ImportSummary {
  imported: number;
  skipped: number;
}

/**
 * Imports an export file. Like the legacy adapter: anything with the same
 * path is replaced, unknown collections are ignored, and `meta/applied` is
 * cleared so the repo updates are applied again on top.
 */
export async function importDocs(userId: string, raw: unknown): Promise<ImportSummary> {
  const parsed = exportSchema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, "NOT_AN_EXPORT", "That is not a tracker export file.");
  const changes: DocChange[] = [];
  let skipped = 0;
  for (const [c, docs] of Object.entries(parsed.data.collections)) {
    if (!TRANSFER_COLLECTIONS.includes(c)) {
      skipped += Object.keys(docs).length;
      continue;
    }
    for (const [id, data] of Object.entries(docs)) {
      const path = `${c}/${id}`;
      const ok =
        isDocPath(path) &&
        data !== null &&
        data !== undefined &&
        Buffer.byteLength(JSON.stringify(data), "utf8") <= MAX_DOC_BYTES;
      if (!ok) {
        skipped++;
        continue;
      }
      changes.push({ path, data: data as DocChange["data"], baseVersion: null });
    }
  }
  if (!changes.length) throw new HttpError(400, "EMPTY_IMPORT", "The file has nothing to import.");
  if (changes.length > MAX_IMPORT_DOCS) throw new HttpError(413, "IMPORT_TOO_LARGE", "That file has too many items to import at once.");

  for (let i = 0; i < changes.length; i += 200) await putDocs(userId, changes.slice(i, i + 200), { force: true });
  await putDocs(userId, [{ path: "meta/applied", data: null, baseVersion: null }], { force: true });
  await applyRepoUpdates(userId);
  return { imported: changes.length, skipped };
}

