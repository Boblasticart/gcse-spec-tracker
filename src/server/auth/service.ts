import "server-only";

import { randomUUID } from "node:crypto";

import type { OtpPurpose, Session, User } from "@prisma/client";

import { addMs, now } from "../clock";
import { db, isUniqueViolation } from "../db";
import { getEnv } from "../env";
import { HttpError, type RequestMeta } from "../http";
import { accountExistsEmail, otpEmail, sendMail } from "../mail";
import { clearedSessionCookie, sessionCookie, sessionTokenFrom } from "./cookies";
import { hashOtpCode, hashSessionToken, isSixDigitCode, newOtpCode, newSessionToken, safeEqualHex } from "./crypto";
import { countEvents, logEvent } from "./events";
import { burnPasswordCheck, hashPassword, PASSWORD_MESSAGES, passwordProblem, verifyPassword } from "./password";
import { AUTH_POLICY } from "./policy";
import { createSession, getAuth, toPublicUser, type PublicUser } from "./session";

/** What a route sends back: a JSON body plus an optional Set-Cookie. */
export interface AuthResult<B> {
  body: B;
  setCookie?: string;
}

export interface VerifyNext {
  ok: true;
  next: "verify";
}

export const normaliseEmail = (email: string): string => email.trim().toLowerCase();

const secondsUntil = (when: Date, from: Date): number => Math.max(1, Math.ceil((when.getTime() - from.getTime()) / 1000));

const pendingCookie = (token: string): string => sessionCookie(token, AUTH_POLICY.pendingSessionMs);

async function issueOtp(user: Pick<User, "id" | "email">, session: Pick<Session, "id">, purpose: OtpPurpose): Promise<void> {
  const id = randomUUID();
  const code = newOtpCode();
  const t = now();
  await db().otpCode.create({
    data: {
      id,
      userId: user.id,
      sessionId: session.id,
      purpose,
      codeHash: hashOtpCode(id, code),
      expiresAt: addMs(t, AUTH_POLICY.otpTtlMs),
      createdAt: t,
    },
  });
  try {
    await sendMail(otpEmail(user.email, code, purpose));
  } catch (err) {
    console.error("Could not send OTP email", err);
    throw new HttpError(502, "MAIL_FAILED", "We couldn't send the email just now. Please try again in a minute.");
  }
  await logEvent("OTP_SENT", { userId: user.id, email: user.email });
}

/**
 * Sign up. The response is the same whether or not the email already has a
 * verified account, so it can't be used to find out who has an account.
 */
export async function signUp(input: { email: string; password: string }, meta: RequestMeta): Promise<AuthResult<VerifyNext>> {
  const email = normaliseEmail(input.email);
  const problem = passwordProblem(input.password);
  if (problem) throw new HttpError(400, "WEAK_PASSWORD", PASSWORD_MESSAGES[problem]);

  const t = now();
  const hourAgo = addMs(t, -60 * 60_000);
  const [byEmail, byIp] = await Promise.all([
    countEvents(["SIGN_UP", "SIGN_UP_EXISTING"], { email }, hourAgo),
    countEvents(["SIGN_UP", "SIGN_UP_EXISTING"], { ip: meta.ip }, hourAgo),
  ]);
  if (byEmail >= AUTH_POLICY.signUpPerEmailPerHour || byIp >= AUTH_POLICY.signUpPerIpPerHour) {
    throw new HttpError(429, "RATE_LIMITED", "Too many tries. Please wait an hour and try again.", { retryAfter: 3600 });
  }

  // Hash first in every case so all paths take about the same time.
  const passwordHash = await hashPassword(input.password);
  const existing = await db().user.findUnique({ where: { email } });

  if (existing?.emailVerifiedAt) {
    return existingAccountSignUp(existing, meta);
  }

  let user: User;
  try {
    user = existing
      ? // Unverified: whoever controls the inbox wins, so replace the password
        // and end any earlier pending sign-ups.
        await db().$transaction(async (tx) => {
          await tx.session.deleteMany({ where: { userId: existing.id } });
          return tx.user.update({ where: { id: existing.id }, data: { passwordHash, failedLogins: 0, lockedUntil: null } });
        })
      : await db().user.create({ data: { email, passwordHash, createdAt: t } });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Two sign-ups raced; the other one won. Answer exactly as for an existing account.
    const winner = await db().user.findUniqueOrThrow({ where: { email } });
    return existingAccountSignUp(winner, meta);
  }

  const { token, session } = await createSession(user.id, "PENDING_OTP", meta);
  await logEvent("SIGN_UP", { email, userId: user.id, ip: meta.ip });
  await issueOtp(user, session, "SIGN_UP");
  return { body: { ok: true, next: "verify" }, setCookie: pendingCookie(token) };
}

async function existingAccountSignUp(user: User, meta: RequestMeta): Promise<AuthResult<VerifyNext>> {
  const recent = await countEvents(
    ["SIGN_UP_EXISTING"],
    { email: user.email },
    addMs(now(), -AUTH_POLICY.accountExistsEmailEveryMs),
  );
  await logEvent("SIGN_UP_EXISTING", { email: user.email, userId: user.id, ip: meta.ip });
  if (recent === 0) {
    try {
      await sendMail(accountExistsEmail(user.email, getEnv().APP_URL));
    } catch (err) {
      console.error("Could not send account-exists email", err);
    }
  }
  // A decoy cookie that matches no session, shaped exactly like a real one.
  return { body: { ok: true, next: "verify" }, setCookie: pendingCookie(newSessionToken()) };
}

const INVALID_CREDENTIALS = (): HttpError =>
  new HttpError(401, "INVALID_CREDENTIALS", "That email and password don't match. Check them and try again.");

const LOCKED = (retryAfter: number): HttpError =>
  new HttpError(429, "LOCKED", "Too many wrong tries. Please wait 15 minutes and try again.", { retryAfter });

/** Sign in with email + password. Success pauses the session until the emailed code is entered. */
export async function signIn(input: { email: string; password: string }, meta: RequestMeta): Promise<AuthResult<VerifyNext>> {
  const email = normaliseEmail(input.email);
  const t = now();

  const ipAttempts = await countEvents(["SIGN_IN_ATTEMPT"], { ip: meta.ip }, addMs(t, -AUTH_POLICY.signInIpWindowMs));
  if (ipAttempts >= AUTH_POLICY.signInIpMaxAttempts) {
    throw new HttpError(429, "RATE_LIMITED", "Too many sign-in attempts from here. Please wait 15 minutes.", {
      retryAfter: Math.ceil(AUTH_POLICY.signInIpWindowMs / 1000),
    });
  }
  await logEvent("SIGN_IN_ATTEMPT", { email, ip: meta.ip });

  const user = await db().user.findUnique({ where: { email } });

  if (!user) {
    // Lock unknown emails the same way, so lockout doesn't reveal which emails exist.
    const fails = await countEvents(["SIGN_IN_FAIL"], { email }, addMs(t, -AUTH_POLICY.lockoutMs));
    if (fails >= AUTH_POLICY.signInMaxFailures) throw LOCKED(Math.ceil(AUTH_POLICY.lockoutMs / 1000));
    await burnPasswordCheck(input.password);
    await logEvent("SIGN_IN_FAIL", { email, ip: meta.ip });
    throw INVALID_CREDENTIALS();
  }

  if (user.lockedUntil && user.lockedUntil > t) throw LOCKED(secondsUntil(user.lockedUntil, t));

  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) {
    const failures = (user.lockedUntil ? 0 : user.failedLogins) + 1;
    const lock = failures >= AUTH_POLICY.signInMaxFailures;
    await db().user.update({
      where: { id: user.id },
      data: lock
        ? { failedLogins: 0, lockedUntil: addMs(t, AUTH_POLICY.lockoutMs) }
        : { failedLogins: failures, lockedUntil: null },
    });
    await logEvent("SIGN_IN_FAIL", { email, userId: user.id, ip: meta.ip });
    if (lock) await logEvent("SIGN_IN_LOCKED", { email, userId: user.id, ip: meta.ip });
    throw INVALID_CREDENTIALS();
  }

  if (user.failedLogins !== 0 || user.lockedUntil) {
    await db().user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  }
  const { token, session } = await createSession(user.id, "PENDING_OTP", meta);
  await logEvent("SIGN_IN_OK", { email, userId: user.id, ip: meta.ip });
  await issueOtp(user, session, user.emailVerifiedAt ? "SIGN_IN" : "SIGN_UP");
  return { body: { ok: true, next: "verify" }, setCookie: pendingCookie(token) };
}

// No "attempts left" count: a decoy session (see existingAccountSignUp) must answer the same way.
const INVALID_CODE = (): HttpError =>
  new HttpError(400, "INVALID_CODE", "That code isn't right. Check the email and try again.");
const TOO_MANY_ATTEMPTS = (): HttpError =>
  new HttpError(429, "TOO_MANY_ATTEMPTS", "Too many wrong codes. Ask for a new code and try again.");
const CODE_EXPIRED = (): HttpError =>
  new HttpError(410, "CODE_EXPIRED", "This code has expired. Ask for a new one.");
const SESSION_EXPIRED = (): HttpError =>
  new HttpError(410, "SESSION_EXPIRED", "This sign-in timed out. Please sign in again.");

export interface Verified {
  ok: true;
  user: PublicUser;
}

/** Checks the emailed code. Success activates the session and rotates its token. */
export async function verifyOtp(request: Request, code: string, meta: RequestMeta): Promise<AuthResult<Verified>> {
  if (!sessionTokenFrom(request)) throw new HttpError(401, "SIGN_IN_REQUIRED", "Please sign in again.");
  const auth = await getAuth(request);
  if (auth.kind === "expired") throw SESSION_EXPIRED();
  if (auth.kind === "active") return { body: { ok: true, user: toPublicUser(auth.user) } };
  // A decoy cookie from an existing-account sign-up looks like any wrong code.
  if (auth.kind === "none") throw INVALID_CODE();

  const { session, user } = auth;
  const t = now();
  const otp = await db().otpCode.findFirst({
    where: { sessionId: session.id },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.consumedAt) throw CODE_EXPIRED();
  if (otp.attempts >= AUTH_POLICY.otpMaxAttempts) throw TOO_MANY_ATTEMPTS();
  if (otp.expiresAt <= t) throw CODE_EXPIRED();

  const matches = isSixDigitCode(code) && safeEqualHex(hashOtpCode(otp.id, code), otp.codeHash);
  if (!matches) {
    const bumped = await db().otpCode.updateMany({
      where: { id: otp.id, attempts: { lt: AUTH_POLICY.otpMaxAttempts } },
      data: { attempts: { increment: 1 } },
    });
    await logEvent("OTP_FAIL", { userId: user.id, email: user.email, ip: meta.ip });
    const attempts = bumped.count === 1 ? otp.attempts + 1 : AUTH_POLICY.otpMaxAttempts;
    if (attempts >= AUTH_POLICY.otpMaxAttempts) throw TOO_MANY_ATTEMPTS();
    throw INVALID_CODE();
  }

  const token = newSessionToken();
  const activated = await db().$transaction(async (tx) => {
    const consumed = await tx.otpCode.updateMany({
      where: { id: otp.id, consumedAt: null, attempts: { lt: AUTH_POLICY.otpMaxAttempts }, expiresAt: { gt: t } },
      data: { consumedAt: t },
    });
    if (consumed.count !== 1) return null;
    await tx.session.update({
      where: { id: session.id },
      data: {
        status: "ACTIVE",
        tokenHash: hashSessionToken(token),
        expiresAt: addMs(t, AUTH_POLICY.activeSessionMs),
        lastSeenAt: t,
      },
    });
    return tx.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: user.emailVerifiedAt ?? t },
    });
  });
  if (!activated) throw CODE_EXPIRED();

  await logEvent("OTP_OK", { userId: user.id, email: user.email, ip: meta.ip });
  return {
    body: { ok: true, user: toPublicUser(activated) },
    setCookie: sessionCookie(token, AUTH_POLICY.activeSessionMs),
  };
}

export interface Resent {
  ok: true;
  /** Seconds before another resend is allowed. */
  retryAfter: number;
}

/** Sends a fresh code for the paused session (60 s cooldown, 5 per hour). */
export async function resendOtp(request: Request): Promise<AuthResult<Resent>> {
  const cooldown = Math.ceil(AUTH_POLICY.resendCooldownMs / 1000);
  if (!sessionTokenFrom(request)) throw new HttpError(401, "SIGN_IN_REQUIRED", "Please sign in again.");
  const auth = await getAuth(request);
  if (auth.kind === "expired") throw SESSION_EXPIRED();
  if (auth.kind === "active") throw new HttpError(409, "ALREADY_VERIFIED", "You're already signed in.");
  if (auth.kind === "none") return { body: { ok: true, retryAfter: cooldown } };

  const { session, user } = auth;
  const t = now();
  const last = await db().otpCode.findFirst({ where: { sessionId: session.id }, orderBy: { createdAt: "desc" } });
  if (last) {
    const readyAt = addMs(last.createdAt, AUTH_POLICY.resendCooldownMs);
    if (readyAt > t) {
      throw new HttpError(429, "RESEND_COOLDOWN", "Please wait a moment before asking for another code.", {
        retryAfter: secondsUntil(readyAt, t),
      });
    }
  }
  const hourAgo = addMs(t, -60 * 60_000);
  const recent = await db().otpCode.findMany({
    where: { userId: user.id, createdAt: { gt: hourAgo } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  const oldest = recent[0];
  if (recent.length >= AUTH_POLICY.resendMaxPerHour && oldest) {
    throw new HttpError(429, "RESEND_LIMIT", "That's a lot of codes. Please wait a while before asking for another.", {
      retryAfter: secondsUntil(addMs(oldest.createdAt, 60 * 60_000), t),
    });
  }

  await db().session.update({ where: { id: session.id }, data: { expiresAt: addMs(t, AUTH_POLICY.pendingSessionMs) } });
  await issueOtp(user, session, last?.purpose ?? (user.emailVerifiedAt ? "SIGN_IN" : "SIGN_UP"));
  return { body: { ok: true, retryAfter: cooldown } };
}

/** Ends the session behind the cookie (if any) and clears the cookie. */
export async function signOut(request: Request, meta: RequestMeta): Promise<AuthResult<{ ok: true }>> {
  const token = sessionTokenFrom(request);
  if (token) {
    const session = await db().session.findUnique({ where: { tokenHash: hashSessionToken(token) } });
    if (session) {
      await db().session.deleteMany({ where: { id: session.id } });
      await logEvent("SIGN_OUT", { userId: session.userId, ip: meta.ip });
    }
  }
  return { body: { ok: true }, setCookie: clearedSessionCookie() };
}

export interface Me {
  ok: true;
  user: PublicUser | null;
  /** True while a sign-in is waiting for its emailed code. */
  pending: boolean;
}

export async function me(request: Request): Promise<AuthResult<Me>> {
  const auth = await getAuth(request);
  if (auth.kind === "active") {
    return { body: { ok: true, user: toPublicUser(auth.user), pending: false }, setCookie: auth.refreshedCookie };
  }
  return { body: { ok: true, user: null, pending: auth.kind === "pending" } };
}
