import "server-only";

import { requireUser } from "../auth/session";
import { db, withReadRetry } from "../db";
import { handler, json } from "../http";

export interface DocDto {
  path: string;
  data: unknown;
  version: number;
  updatedAt: string;
}

/** GET /api/docs: every live document of the signed-in student. (Delta and PUT arrive in M3.) */
export const getDocsRoute = handler(async (request: Request) => {
  const { user, refreshedCookie } = await requireUser(request);
  const rows = await withReadRetry(() =>
    db().userDoc.findMany({ where: { userId: user.id, deleted: false }, orderBy: { path: "asc" } }),
  );
  const docs: DocDto[] = rows.map((r) => ({
    path: r.path,
    data: r.data,
    version: r.version,
    updatedAt: r.updatedAt.toISOString(),
  }));
  const headers = new Headers();
  if (refreshedCookie) headers.append("set-cookie", refreshedCookie);
  return json({ ok: true, docs }, { headers });
});
