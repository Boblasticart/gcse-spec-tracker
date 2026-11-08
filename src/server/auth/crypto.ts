import "server-only";

import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { getEnv } from "../env";

/** A new opaque session token for the cookie (256 bits). */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What is stored for a session token: HMAC-SHA256 with SESSION_SECRET. */
export function hashSessionToken(token: string): string {
  return createHmac("sha256", getEnv().SESSION_SECRET).update(token).digest("hex");
}

/** A uniformly random 6-digit code, e.g. "042917". */
export function newOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** HMAC-SHA256 of the code with OTP_PEPPER, bound to the OTP row id. */
export function hashOtpCode(otpId: string, code: string): string {
  return createHmac("sha256", getEnv().OTP_PEPPER).update(`${otpId}:${code}`).digest("hex");
}

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

export function isSixDigitCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}
