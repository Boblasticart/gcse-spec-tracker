import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";

import { sessionCookieName, validToken } from "./cookies";
import { getAuthForToken, toPublicUser, type AuthState, type PublicUser } from "./session";

/** The session behind the current page request (for server components and layouts). */
export async function getCurrentAuth(): Promise<AuthState> {
  const jar = await cookies();
  return getAuthForToken(validToken(jar.get(sessionCookieName())?.value));
}

/** True if the browser holds a session cookie at all (even a decoy or expired one). */
export async function hasSessionCookie(): Promise<boolean> {
  const jar = await cookies();
  return !!validToken(jar.get(sessionCookieName())?.value);
}

export async function getCurrentUser(): Promise<PublicUser | null> {
  const auth = await getCurrentAuth();
  return auth.kind === "active" ? toPublicUser(auth.user) : null;
}

/** Only `next` values that stay on this site are used; anything else falls back. */
export function safeNext(next: string | string[] | undefined, fallback = "/dashboard"): string {
  const v = Array.isArray(next) ? next[0] : next;
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\") || v.startsWith("/auth/")) return fallback;
  return v;
}

/** For gated pages: signed-in students pass; everyone else is sent to sign in. */
export async function requirePageUser(path: string): Promise<PublicUser> {
  const auth = await getCurrentAuth();
  if (auth.kind === "active") return toPublicUser(auth.user);
  const next = encodeURIComponent(path);
  if (auth.kind === "pending") redirect(`/auth/verify?next=${next}` as Route);
  redirect(`/auth/sign-in?next=${next}` as Route);
}
