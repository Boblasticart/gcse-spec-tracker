import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { signUpRoute, verifyOtpRoute } from "@/server/auth/routes";
import { db } from "@/server/db";
import { exportDocsRoute, getDocsRoute, importDocsRoute, putDocsRoute } from "@/server/docs/routes";
import { applyRepoUpdates, loadRepoUpdates } from "@/server/docs/updates";

import { body, client, hasDb, lastCode, uniqueEmail, type Client } from "../../helpers/http";

const fixture = JSON.parse(readFileSync(join(__dirname, "..", "..", "fixtures", "tracker-export-small.json"), "utf8")) as Record<string, unknown>;

async function signedIn(): Promise<{ c: Client; userId: string }> {
  const c = client();
  const email = uniqueEmail("docs");
  await c.call(signUpRoute, { body: { email, password: "purple turtles dance at noon" } });
  await c.call(verifyOtpRoute, { body: { code: lastCode(email) } });
  const user = await db().user.findUniqueOrThrow({ where: { email } });
  return { c, userId: user.id };
}

type Results = { results: { path: string; status: string; version?: number; server?: { data: unknown; version: number } | null }[] };

const put = (c: Client, changes: unknown[], origin?: string) =>
  c.call(putDocsRoute, { method: "PUT", body: { changes }, origin });

describe.skipIf(!hasDb)("docs API (Postgres)", () => {
  it("creates, updates with versions and returns conflicts with the server copy", async () => {
    const { c } = await signedIn();
    const created = await body<Results>(await put(c, [{ path: "progress/phy", data: { s: { "phy.0.0": 2 }, c: {}, m: {}, w: {}, v: 2 }, baseVersion: 0 }]));
    expect(created.results[0]).toMatchObject({ status: "ok", version: 1 });

    const updated = await body<Results>(await put(c, [{ path: "progress/phy", data: { s: {}, c: {}, m: {}, w: {}, v: 2 }, baseVersion: 1 }]));
    expect(updated.results[0]).toMatchObject({ status: "ok", version: 2 });

    const stale = await body<Results>(await put(c, [{ path: "progress/phy", data: { s: { x: 1 } }, baseVersion: 1 }]));
    expect(stale.results[0]).toMatchObject({ status: "conflict", server: { version: 2, data: { s: {} } } });

    const all = await body<{ docs: { path: string; version: number }[]; cursor: string }>(await c.call(getDocsRoute));
    expect(all.docs.find((d) => d.path === "progress/phy")?.version).toBe(2);
    expect(typeof all.cursor).toBe("string");
  });

  it("creating a doc that already exists is a conflict", async () => {
    const { c } = await signedIn();
    await put(c, [{ path: "a/q1", data: { text: "first" }, baseVersion: 0 }]);
    const again = await body<Results>(await put(c, [{ path: "a/q1", data: { text: "second" }, baseVersion: 0 }]));
    expect(again.results[0]).toMatchObject({ status: "conflict", server: { version: 1, data: { text: "first" } } });
  });

  it("deletes docs and reports them in deltas", async () => {
    const { c } = await signedIn();
    const before = await body<{ cursor: string }>(await c.call(getDocsRoute));
    await put(c, [{ path: "quiz/phy.0", data: { qs: [1] }, baseVersion: 0 }]);
    await put(c, [{ path: "quiz/phy.0", data: null, baseVersion: 1 }]);
    const full = await body<{ docs: { path: string }[] }>(await c.call(getDocsRoute));
    expect(full.docs.some((d) => d.path === "quiz/phy.0")).toBe(false);
    const delta = await body<{ docs: { path: string; deleted: boolean; data: unknown }[] }>(
      await c.call(getDocsRoute, { path: `/api/docs?since=${encodeURIComponent(before.cursor)}` }),
    );
    expect(delta.docs.find((d) => d.path === "quiz/phy.0")).toMatchObject({ deleted: true, data: null });
  });

  it("keeps each student's docs separate", async () => {
    const one = await signedIn();
    const two = await signedIn();
    await put(one.c, [{ path: "notes/phy.0.0", data: { mine: true }, baseVersion: 0 }]);
    const theirs = await body<{ docs: { path: string }[] }>(await two.c.call(getDocsRoute));
    expect(theirs.docs.some((d) => d.path === "notes/phy.0.0")).toBe(false);
  });

  it("rejects bad paths, huge docs, duplicates, cross-site and signed-out saves", async () => {
    const { c } = await signedIn();
    expect((await put(c, [{ path: "../etc/passwd", data: {}, baseVersion: 0 }])).status).toBe(400);
    expect((await put(c, [{ path: "progress/a/b", data: {}, baseVersion: 0 }])).status).toBe(400);
    const huge = await put(c, [{ path: "notes/big", data: { t: "x".repeat(300 * 1024) }, baseVersion: 0 }]);
    expect(huge.status).toBe(413);
    const dup = await put(c, [
      { path: "a/x", data: {}, baseVersion: 0 },
      { path: "a/x", data: {}, baseVersion: 0 },
    ]);
    expect(await body(dup)).toMatchObject({ code: "DUPLICATE_PATH" });
    expect((await put(c, [{ path: "a/y", data: {}, baseVersion: 0 }], "https://evil.example")).status).toBe(403);
    expect((await put(client(), [{ path: "a/z", data: {}, baseVersion: 0 }])).status).toBe(401);
  });

  it("imports the old export file, ignoring unknown collections", async () => {
    const { c, userId } = await signedIn();
    const res = await c.call(importDocsRoute, { body: fixture });
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ ok: true, imported: 4, skipped: 1 });
    const doc = await db().userDoc.findUniqueOrThrow({ where: { userId_path: { userId, path: "progress/bio" } } });
    expect(doc.data).toMatchObject({ s: { "bio.0.0": 2, "bio.0.1": 1 }, v: 2 });
    const qr = await db().userDoc.findUnique({ where: { userId_path: { userId, path: "qr/bio.0" } } });
    expect(qr?.data).toEqual({ pct: 80, date: "2026-10-20" });

    // Importing again replaces items with the same name.
    const again = await c.call(importDocsRoute, { body: fixture });
    expect(await body(again)).toMatchObject({ imported: 4 });

    const bad = await c.call(importDocsRoute, { body: { format: "something-else", collections: {} } });
    expect(await body(bad)).toMatchObject({ code: "NOT_AN_EXPORT" });
  });

  it("exports in the old format, round-tripping an import", async () => {
    const { c } = await signedIn();
    await c.call(importDocsRoute, { body: fixture });
    const res = await c.call(exportDocsRoute);
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="gcse-tracker-backup-\d{4}-\d{2}-\d{2}\.json"/);
    const file = await body<{ format: string; version: number; collections: Record<string, Record<string, unknown>> }>(res);
    expect(file.format).toBe("gcse-spec-tracker-export");
    expect(file.version).toBe(1);
    const collections = fixture.collections as Record<string, Record<string, unknown>>;
    expect(file.collections.progress?.bio).toEqual(collections.progress?.bio);
    expect(file.collections.daily).toEqual(collections.daily);
    expect(file.collections.meta).toBeUndefined();
  });

  it("applies repo updates once, with the legacy rules", async () => {
    const { userId } = await signedIn();
    await db().userDoc.create({
      data: { userId, path: "progress/phy", data: { s: { "phy.4.1": 2 }, c: {}, m: {}, w: {}, v: 2 }, version: 1, updatedAt: new Date() },
    });
    await db().userDoc.create({ data: { userId, path: "daily/2026-11-02-phy", data: { kept: true }, version: 1, updatedAt: new Date() } });
    const updates = loadRepoUpdates([
      { id: "u1", sid: "phy", needsWork: ["phy.4.0", "phy.4.1"], daily: { "2026-11-02-phy": { replaced: true }, "2026-11-03-phy": { added: true } } },
      { nonsense: true },
    ]);
    expect(updates).toHaveLength(1);
    expect(await applyRepoUpdates(userId, updates)).toEqual(["u1"]);
    expect(await applyRepoUpdates(userId, updates)).toEqual([]);

    const get = async (path: string) => (await db().userDoc.findUniqueOrThrow({ where: { userId_path: { userId, path } } })).data;
    expect(await get("progress/phy")).toMatchObject({ s: { "phy.4.0": 1, "phy.4.1": 2 } }); // Done stays Done
    expect(await get("daily/2026-11-02-phy")).toEqual({ kept: true }); // existing daily sets are kept
    expect(await get("daily/2026-11-03-phy")).toEqual({ added: true });
    expect(await get("meta/applied")).toEqual({ ids: ["u1"] });
  });
});
