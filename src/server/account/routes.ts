import "server-only";

import { z } from "zod";

import { requireUser } from "../auth/session";
import { assertSameOrigin, handler, json, parseJson } from "../http";
import { deleteAccount, exportAccount } from "./service";

/** GET /api/account/export  every doc in the account, as a download. */
export const exportAccountRoute = handler(async (request: Request) => {
  const auth = await requireUser(request);
  const file = await exportAccount(auth);
  return new Response(JSON.stringify(file, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="gcse-tracker-account-${file.exported.slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
});

const deleteBody = z.object({ password: z.string({ error: "Enter your password." }).min(1, { error: "Enter your password." }).max(512) });

/** POST /api/account/delete  { password }  deletes the account for good and signs out. */
export const deleteAccountRoute = handler(async (request: Request) => {
  assertSameOrigin(request);
  const auth = await requireUser(request);
  const { password } = await parseJson(request, deleteBody);
  const { setCookie } = await deleteAccount(auth, password);
  const headers = new Headers({ "set-cookie": setCookie });
  return json({ ok: true }, { headers });
});
