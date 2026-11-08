import "server-only";

import { isSecureOrigin } from "../env";

/** `__Host-gst` over https; plain `gst` on http (local dev and CI). */
export function sessionCookieName(): string {
  return isSecureOrigin() ? "__Host-gst" : "gst";
}

export function sessionCookie(token: string, maxAgeMs: number): string {
  const parts = [
    `${sessionCookieName()}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAgeMs / 1000))}`,
  ];
  if (isSecureOrigin()) parts.push("Secure");
  return parts.join("; ");
}

export function clearedSessionCookie(): string {
  return sessionCookie("", 0);
}

/** Reads a cookie value from a Cookie header. */
export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      const value = part.slice(eq + 1).trim();
      return value || undefined;
    }
  }
  return undefined;
}

export function sessionTokenFrom(request: Request): string | undefined {
  const token = readCookie(request.headers.get("cookie"), sessionCookieName());
  // Tokens are 43 base64url characters; reject anything else early.
  return token && /^[A-Za-z0-9_-]{20,128}$/.test(token) ? token : undefined;
}
