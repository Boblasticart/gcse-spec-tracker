import "server-only";

import { z } from "zod";

import { requireUser } from "../auth/session";
import { assertSameOrigin, handler, HttpError, json, parseJson } from "../http";
import { listDocs, putDocs, putSchema } from "./service";
import { exportDocs, importDocs } from "./transfer";
import { applyRepoUpdates } from "./updates";

function withCookie(res: Response, cookie?: string): Response {
  if (cookie) res.headers.append("set-cookie", cookie);
  return res;
}

/** Largest import body accepted (bigger exports are split into parts by the browser). */
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

/**
 * GET /api/docs            every live doc (applies new repo updates first)
 * GET /api/docs?since=ISO  only changes since then, including deletions
 */
export const getDocsRoute = handler(async (request: Request) => {
  const { user, refreshedCookie } = await requireUser(request);
  const sinceRaw = new URL(request.url).searchParams.get("since");
  let since: Date | undefined;
  if (sinceRaw) {
    since = new Date(sinceRaw);
    if (Number.isNaN(since.getTime())) throw new HttpError(400, "INVALID_INPUT", "`since` must be a date.");
  } else {
    await applyRepoUpdates(user.id);
  }
  const page = await listDocs(user.id, since);
  return withCookie(json({ ok: true, ...page }), refreshedCookie);
});

/** PUT /api/docs  { changes: [{ path, data | null, baseVersion }] } */
export const putDocsRoute = handler(async (request: Request) => {
  assertSameOrigin(request);
  const { user, refreshedCookie } = await requireUser(request);
  const { changes } = await parseJson(request, putSchema);
  const results = await putDocs(user.id, changes);
  return withCookie(json({ ok: true, results }), refreshedCookie);
});

/** GET /api/docs/export  the old backup file, as a download. */
export const exportDocsRoute = handler(async (request: Request) => {
  const { user } = await requireUser(request);
  const file = await exportDocs(user.id);
  const day = file.exported.slice(0, 10);
  return json(file, {
    headers: { "content-disposition": `attachment; filename="gcse-tracker-backup-${day}.json"` },
  });
});

/** POST /api/docs/import  body: an export file (or a part of one). */
export const importDocsRoute = handler(async (request: Request) => {
  assertSameOrigin(request);
  const { user } = await requireUser(request);
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_IMPORT_BYTES) throw new HttpError(413, "IMPORT_TOO_LARGE", "That file is too big to import in one go.");
  const raw = await parseJson(request, z.unknown());
  const summary = await importDocs(user.id, raw);
  return json({ ok: true, ...summary });
});
