import { afterEach, describe, expect, it } from "vitest";

import { meRoute, resendOtpRoute, signInRoute, signOutRoute, signUpRoute, verifyOtpRoute } from "@/server/auth/routes";
import { MINUTE, setClockOffsetMs } from "@/server/clock";
import { db } from "@/server/db";
import { getDocsRoute } from "@/server/docs/routes";

import { body, client, hasDb, lastCode, mailTo, uniqueEmail, wrongCode, type Client } from "../../helpers/http";

const PASSWORD = "purple turtles dance at noon";

async function signUp(c: Client, email: string, password = PASSWORD): Promise<Response> {
  return c.call(signUpRoute, { body: { email, password } });
}

async function signIn(c: Client, email: string, password = PASSWORD): Promise<Response> {
  return c.call(signInRoute, { body: { email, password } });
}

async function verify(c: Client, code: string): Promise<Response> {
  return c.call(verifyOtpRoute, { body: { code } });
}

/** A verified account, signed in on a fresh client. */
async function verifiedUser(): Promise<{ c: Client; email: string }> {
  const c = client();
  const email = uniqueEmail();
  await signUp(c, email);
  expect((await verify(c, lastCode(email))).status).toBe(200);
  return { c, email };
}

afterEach(() => setClockOffsetMs(0));

describe.skipIf(!hasDb)("auth flow (Postgres)", () => {
  it("signs up, pauses the session until the code is entered, then activates it", async () => {
    const c = client();
    const email = uniqueEmail();
    const res = await signUp(c, email.toUpperCase());
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ ok: true, next: "verify" });
    expect(c.cookie).toMatch(/^gst=/);
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");

    const user = await db().user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.passwordHash.startsWith("$argon2id$")).toBe(true);

    // Paused: the pending session cannot reach the docs API.
    const docs = await c.call(getDocsRoute);
    expect(docs.status).toBe(401);
    expect(await body(docs)).toMatchObject({ ok: false, code: "OTP_REQUIRED" });
    expect(await body(await c.call(meRoute))).toEqual({ ok: true, user: null, pending: true });

    const pendingCookie = c.cookie;
    const ok = await verify(c, lastCode(email));
    expect(ok.status).toBe(200);
    expect(await body(ok)).toMatchObject({ ok: true, user: { email } });
    expect(c.cookie).not.toBe(pendingCookie); // token rotated

    expect((await c.call(getDocsRoute)).status).toBe(200);
    expect(await body(await c.call(meRoute))).toMatchObject({ user: { email }, pending: false });
    const after = await db().user.findUniqueOrThrow({ where: { email } });
    expect(after.emailVerifiedAt).not.toBeNull();

    // The old pending token no longer works.
    const old = client();
    old.cookie = pendingCookie;
    expect((await old.call(getDocsRoute)).status).toBe(401);
  });

  it("rejects a wrong code without activating", async () => {
    const c = client();
    const email = uniqueEmail();
    await signUp(c, email);
    const res = await verify(c, wrongCode(lastCode(email)));
    expect(res.status).toBe(400);
    expect(await body(res)).toMatchObject({ ok: false, code: "INVALID_CODE" });
    expect((await c.call(getDocsRoute)).status).toBe(401);
    expect((await verify(c, "abc")).status).toBe(400);
  });

  it("expires codes after 10 minutes", async () => {
    const c = client();
    const email = uniqueEmail();
    await signUp(c, email);
    const code = lastCode(email);
    setClockOffsetMs(10 * MINUTE + 1000);
    const res = await verify(c, code);
    expect(res.status).toBe(410);
    expect(await body(res)).toMatchObject({ code: "CODE_EXPIRED" });
  });

  it("expires the paused session after 15 minutes", async () => {
    const c = client();
    const email = uniqueEmail();
    await signUp(c, email);
    setClockOffsetMs(15 * MINUTE + 1000);
    const res = await verify(c, lastCode(email));
    expect(res.status).toBe(410);
    expect(await body(res)).toMatchObject({ code: "SESSION_EXPIRED" });
  });

  it("kills a code after 5 wrong attempts, even if the right one follows", async () => {
    const c = client();
    const email = uniqueEmail();
    await signUp(c, email);
    const code = lastCode(email);
    for (let i = 1; i <= 4; i++) expect((await verify(c, wrongCode(code))).status).toBe(400);
    const fifth = await verify(c, wrongCode(code));
    expect(fifth.status).toBe(429);
    expect(await body(fifth)).toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
    expect(await body(await verify(c, code))).toMatchObject({ code: "TOO_MANY_ATTEMPTS" });

    // A new code works.
    setClockOffsetMs(61_000);
    expect((await c.call(resendOtpRoute, { method: "POST" })).status).toBe(200);
    const fresh = lastCode(email);
    expect((await verify(c, fresh)).status).toBe(200);
  });

  it("enforces the 60 second resend cooldown and 5 codes per hour", async () => {
    const c = client();
    const email = uniqueEmail();
    await signUp(c, email); // code 1
    const tooSoon = await c.call(resendOtpRoute, { method: "POST" });
    expect(tooSoon.status).toBe(429);
    const b = await body<{ code: string; retryAfter: number }>(tooSoon);
    expect(b.code).toBe("RESEND_COOLDOWN");
    expect(b.retryAfter).toBeGreaterThan(50);
    expect(tooSoon.headers.get("retry-after")).toBe(String(b.retryAfter));

    for (let i = 1; i <= 4; i++) {
      setClockOffsetMs(i * 61_000);
      const res = await c.call(resendOtpRoute, { method: "POST" });
      expect(res.status, `resend ${i}`).toBe(200);
    }
    expect(mailTo(email).filter((m) => m.kind === "otp")).toHaveLength(5);
    setClockOffsetMs(5 * 61_000);
    const limited = await c.call(resendOtpRoute, { method: "POST" });
    expect(limited.status).toBe(429);
    expect(await body(limited)).toMatchObject({ code: "RESEND_LIMIT" });

    // Only the newest code counts.
    const newest = lastCode(email);
    const older = mailTo(email).filter((m) => m.kind === "otp")[0]?.code ?? "";
    if (older !== newest) expect((await verify(c, older)).status).toBe(400);
    expect((await verify(c, newest)).status).toBe(200);
  });

  it("signs in with a code and locks after 5 wrong passwords", async () => {
    const { email } = await verifiedUser();
    const c = client();
    for (let i = 1; i <= 5; i++) {
      const res = await signIn(c, email, "wrong password here");
      expect(res.status).toBe(401);
      expect(await body(res)).toMatchObject({ code: "INVALID_CREDENTIALS" });
    }
    const locked = await signIn(c, email);
    expect(locked.status).toBe(429);
    expect(await body(locked)).toMatchObject({ code: "LOCKED" });

    setClockOffsetMs(15 * MINUTE + 1000);
    const ok = await signIn(c, email);
    expect(ok.status).toBe(200);
    expect(await body(ok)).toEqual({ ok: true, next: "verify" });
    expect((await c.call(getDocsRoute)).status).toBe(401);
    const otp = mailTo(email).filter((m) => m.kind === "otp").at(-1);
    expect(otp?.subject).toMatch(/^\d{6} is your GCSE Spec Tracker code$/);
    expect((await verify(c, lastCode(email))).status).toBe(200);
    expect((await c.call(getDocsRoute)).status).toBe(200);
  });

  it("answers an unknown email exactly like a wrong password, lockout included", async () => {
    const { email } = await verifiedUser();
    const ghost = uniqueEmail("ghost");
    const a = await signIn(client(), email, "wrong password here");
    const b = await signIn(client(), ghost, "wrong password here");
    expect(a.status).toBe(b.status);
    expect(await body(a)).toEqual(await body(b));

    const c = client();
    for (let i = 0; i < 4; i++) await signIn(c, ghost, "wrong password here");
    const locked = await signIn(c, ghost, "wrong password here");
    expect(await body(locked)).toMatchObject({ code: "LOCKED" });
  });

  it("limits sign-in attempts per IP", async () => {
    const c = client();
    for (let i = 0; i < 20; i++) await signIn(c, uniqueEmail("spray"), "wrong password here");
    const res = await signIn(c, uniqueEmail("spray"), "wrong password here");
    expect(res.status).toBe(429);
    expect(await body(res)).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("does not reveal that an email already has an account", async () => {
    const { email } = await verifiedUser();
    const fresh = await signUp(client(), uniqueEmail("new"));
    const taken = await signUp(client(), email, "a different password 1");
    expect(taken.status).toBe(fresh.status);
    expect(await body(taken)).toEqual(await body(fresh));
    const shape = (r: Response) => (r.headers.get("set-cookie") ?? "").replace(/=[^;]+;/, "=X;");
    expect(shape(taken)).toBe(shape(fresh));

    // The owner is told, and no code is sent.
    const mails = mailTo(email);
    expect(mails.at(-1)?.kind).toBe("account-exists");
    expect(mails.filter((m) => m.kind === "otp")).toHaveLength(1); // only the original sign-up code

    // The password was not changed, and the decoy session can't be verified.
    expect((await signIn(client(), email)).status).toBe(200);
    expect((await signIn(client(), email, "a different password 1")).status).toBe(401);
  });

  it("lets whoever controls the inbox replace an unverified sign-up", async () => {
    const email = uniqueEmail();
    const first = client();
    await signUp(first, email, "first password is long");
    const second = client();
    await signUp(second, email, "second password is long");
    expect((await first.call(getDocsRoute)).status).toBe(401);
    expect(await body(await verify(first, lastCode(email)))).toMatchObject({ ok: false });
    expect((await verify(second, lastCode(email))).status).toBe(200);
    expect((await signIn(client(), email, "first password is long")).status).toBe(401);
    expect((await signIn(client(), email, "second password is long")).status).toBe(200);
  });

  it("refuses weak passwords and bad input", async () => {
    const res = await signUp(client(), uniqueEmail(), "password123");
    expect(res.status).toBe(400);
    expect(await body(res)).toMatchObject({ code: "WEAK_PASSWORD" });
    const short = await signUp(client(), uniqueEmail(), "short");
    expect(await body(short)).toMatchObject({ code: "WEAK_PASSWORD" });
    const bad = await client().call(signUpRoute, { body: { email: "not-an-email", password: PASSWORD } });
    expect(await body(bad)).toMatchObject({ code: "INVALID_INPUT" });
  });

  it("blocks cross-site requests", async () => {
    const missing = await client().call(signInRoute, { body: { email: uniqueEmail(), password: PASSWORD }, origin: null });
    expect(missing.status).toBe(403);
    const evil = await client().call(signUpRoute, { body: { email: uniqueEmail(), password: PASSWORD }, origin: "https://evil.example" });
    expect(await body(evil)).toMatchObject({ code: "BAD_ORIGIN" });
  });

  it("signs out and revokes the session", async () => {
    const { c } = await verifiedUser();
    const stolen = client();
    stolen.cookie = c.cookie;
    const res = await c.call(signOutRoute, { method: "POST" });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await stolen.call(getDocsRoute)).status).toBe(401);
  });

  it("slides an active session when it is more than a day old", async () => {
    const { c, email } = await verifiedUser();
    const user = await db().user.findUniqueOrThrow({ where: { email } });
    const before = await db().session.findFirstOrThrow({ where: { userId: user.id, status: "ACTIVE" } });
    setClockOffsetMs(2 * 24 * 60 * MINUTE);
    const res = await c.call(meRoute);
    expect(res.headers.get("set-cookie")).toContain(`Max-Age=${30 * 24 * 3600}`);
    const after = await db().session.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.expiresAt.getTime()).toBeGreaterThan(before.expiresAt.getTime());

    setClockOffsetMs(40 * 24 * 60 * MINUTE); // well past 30 days from the last refresh
    expect((await c.call(getDocsRoute)).status).toBe(401);
  });
});

describe.skipIf(!hasDb)("database isolation", () => {
  it("keeps every app table out of public, with row level security on", async () => {
    const rows = await db().$queryRaw<{ relname: string; nspname: string; relrowsecurity: boolean }[]>`
      SELECT c.relname, n.nspname, c.relrowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r' AND c.relname IN ('User','Session','OtpCode','AuthEvent','UserDoc','UsageCounter')`;
    expect(rows).toHaveLength(6);
    for (const r of rows) {
      expect(r.nspname, r.relname).toBe("app");
      expect(r.relrowsecurity, r.relname).toBe(true);
    }
  });
});
