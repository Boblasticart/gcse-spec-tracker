import "server-only";

import type { Session, User } from "@prisma/client";

import { addMs, now } from "../clock";
import { db, withReadRetry } from "../db";
import { HttpError } from "../http";
import { sessionCookie, sessionTokenFrom } from "./cookies";
import { hashSessionToken, newSessionToken } from "./crypto";
import { AUTH_POLICY } from "./policy";

export interface PublicUser {
  id: string;
  email: string;
}

export const toPublicUser = (u: Pick<User, "id" | "email">): PublicUser => ({ id: u.id, email: u.email });

export type AuthState =
  | { kind: "none" }
  | { kind: "expired" }
  | { kind: "pending"; session: Session; user: User }
  | { kind: "active"; session: Session; user: User; refreshedCookie?: string };

/** Looks up the session behind the request's cookie. Expired sessions are deleted. */
export function getAuth(request: Request): Promise<AuthState> {
  return getAuthForToken(sessionTokenFrom(request));
}

/** Looks up a session by its raw cookie token. */
export async function getAuthForToken(token: string | undefined): Promise<AuthState> {
  if (!token) return { kind: "none" };
  const tokenHash = hashSessionToken(token);
  const found = await withReadRetry(() =>
    db().session.findUnique({ where: { tokenHash }, include: { user: true } }),
  );
  if (!found) return { kind: "none" };
  const { user, ...session } = found;
  const t = now();
  if (session.expiresAt <= t) {
    await db().session.deleteMany({ where: { id: session.id } });
    return { kind: "expired" };
  }
  if (session.status === "PENDING_OTP") return { kind: "pending", session, user };

  if (t.getTime() - session.lastSeenAt.getTime() > AUTH_POLICY.slideAfterMs) {
    const expiresAt = addMs(t, AUTH_POLICY.activeSessionMs);
    await db().session.updateMany({ where: { id: session.id }, data: { lastSeenAt: t, expiresAt } });
    return {
      kind: "active",
      session: { ...session, lastSeenAt: t, expiresAt },
      user,
      refreshedCookie: sessionCookie(token, AUTH_POLICY.activeSessionMs),
    };
  }
  return { kind: "active", session, user };
}

export interface Authed {
  user: User;
  session: Session;
  /** Set-Cookie value to send back when the session was extended. */
  refreshedCookie?: string;
}

/** Only fully verified (ACTIVE) sessions pass. Pending sessions get OTP_REQUIRED. */
export async function requireUser(request: Request): Promise<Authed> {
  const auth = await getAuth(request);
  if (auth.kind === "active") return auth;
  if (auth.kind === "pending") {
    throw new HttpError(401, "OTP_REQUIRED", "Enter the code we emailed you to finish signing in.");
  }
  throw new HttpError(401, "SIGN_IN_REQUIRED", "Please sign in to do that.");
}

export interface NewSession {
  token: string;
  session: Session;
}

export async function createSession(
  userId: string,
  status: Session["status"],
  meta: { ip: string; userAgent: string | null },
): Promise<NewSession> {
  const token = newSessionToken();
  const t = now();
  const ttl = status === "ACTIVE" ? AUTH_POLICY.activeSessionMs : AUTH_POLICY.pendingSessionMs;
  const session = await db().session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      status,
      createdAt: t,
      lastSeenAt: t,
      expiresAt: addMs(t, ttl),
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });
  return { token, session };
}
