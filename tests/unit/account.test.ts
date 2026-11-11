import { describe, expect, it } from "vitest";

import { deleteAccountRoute, exportAccountRoute } from "@/server/account/routes";
import { pruneAuthEventsIfDue, resetPruneTimer } from "@/server/account/service";
import { signUpRoute, verifyOtpRoute } from "@/server/auth/routes";
import { db } from "@/server/db";
import { putDocsRoute } from "@/server/docs/routes";

import { body, client, hasDb, lastCode, uniqueEmail, type Client } from "../helpers/http";

const PASSWORD = "purple turtles dance at noon";

async function verifiedUser(): Promise<{ c: Client; email: string }> {
  const c = client();
  const email = uniqueEmail();
  await c.call(signUpRoute, { body: { email, password: PASSWORD } });
  expect((await c.call(verifyOtpRoute, { body: { code: lastCode(email) } })).status).toBe(200);
  return { c, email };
}

describe.skipIf(!hasDb)("account export and deletion (Postgres)", () => {
  it("exports every doc, including the rebuild's new ones", async () => {
    const { c, email } = await verifiedUser();
    const put = await c.call(putDocsRoute, {
      method: "PUT",
      body: { changes: [{ path: "progress/phy", data: { s: { "phy.0.0": 2 } }, baseVersion: 0 }, { path: "stats/time", data: { days: { "2026-11-11": 60 } }, baseVersion: 0 }] },
    });
    expect(put.status).toBe(200);
    const res = await c.call(exportAccountRoute, { method: "GET" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const file = (await res.json()) as { format: string; account: { email: string }; docs: { path: string }[] };
    expect(file.format).toBe("gcse-spec-tracker-account");
    expect(file.account.email).toBe(email);
    expect(file.docs.map((d) => d.path)).toEqual(expect.arrayContaining(["progress/phy", "stats/time"]));
  });

  it("deletes the account and all its data only with the right password", async () => {
    const { c, email } = await verifiedUser();
    await c.call(putDocsRoute, { method: "PUT", body: { changes: [{ path: "a/q1", data: { aw: 1 }, baseVersion: 0 }] } });
    const wrong = await c.call(deleteAccountRoute, { body: { password: "not my password at all" } });
    expect(wrong.status).toBe(400);
    expect(((await body(wrong)) as { code: string }).code).toBe("WRONG_PASSWORD");
    expect(await db().user.count({ where: { email } })).toBe(1);

    const ok = await c.call(deleteAccountRoute, { body: { password: PASSWORD } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    expect(await db().user.count({ where: { email } })).toBe(0);
    expect(await db().userDoc.count({ where: { path: "a/q1", user: { email } } })).toBe(0);
    expect((await c.call(exportAccountRoute, { method: "GET" })).status).toBe(401);
  });

  it("prunes audit events older than 30 days, at most once an hour", async () => {
    const old = await db().authEvent.create({ data: { kind: "SIGN_UP", email: uniqueEmail(), createdAt: new Date(Date.now() - 31 * 24 * 3600 * 1000) } });
    const recent = await db().authEvent.create({ data: { kind: "SIGN_UP", email: uniqueEmail() } });
    resetPruneTimer();
    expect(await pruneAuthEventsIfDue()).toBeGreaterThanOrEqual(1);
    expect(await db().authEvent.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await db().authEvent.findUnique({ where: { id: recent.id } })).not.toBeNull();
    expect(await pruneAuthEventsIfDue()).toBe(0);
  });
});
