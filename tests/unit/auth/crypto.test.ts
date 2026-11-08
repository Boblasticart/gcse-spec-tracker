import { describe, expect, it } from "vitest";

import { readCookie, sessionCookie } from "@/server/auth/cookies";
import { hashOtpCode, hashSessionToken, isSixDigitCode, newOtpCode, newSessionToken, safeEqualHex } from "@/server/auth/crypto";
import { resetEnvCache } from "@/server/env";

describe("OTP codes", () => {
  it("are always six digits, including leading zeros", () => {
    for (let i = 0; i < 2000; i++) expect(newOtpCode()).toMatch(/^\d{6}$/);
    expect(isSixDigitCode("012345")).toBe(true);
    expect(isSixDigitCode("12345")).toBe(false);
    expect(isSixDigitCode("12345a")).toBe(false);
  });

  it("are not predictable", () => {
    const seen = new Set(Array.from({ length: 500 }, newOtpCode));
    expect(seen.size).toBeGreaterThan(490);
  });

  it("hash with the pepper and the code's own id", () => {
    const a = hashOtpCode("id-1", "123456");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOtpCode("id-1", "123456")).toBe(a);
    expect(hashOtpCode("id-2", "123456")).not.toBe(a);
    expect(hashOtpCode("id-1", "123457")).not.toBe(a);
  });

  it("compare in constant time and reject junk", () => {
    const a = hashOtpCode("x", "000001");
    expect(safeEqualHex(a, a)).toBe(true);
    expect(safeEqualHex(a, hashOtpCode("x", "000002"))).toBe(false);
    expect(safeEqualHex(a, "abcd")).toBe(false);
    expect(safeEqualHex("", "")).toBe(false);
  });
});

describe("session tokens and cookies", () => {
  it("are long random tokens stored only as a keyed hash", () => {
    const t = newSessionToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newSessionToken()).not.toBe(t);
    expect(hashSessionToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(t)).not.toContain(t);
  });

  it("uses gst over http and __Host-gst with Secure over https", () => {
    expect(sessionCookie("tok", 60_000)).toBe("gst=tok; Path=/; HttpOnly; SameSite=Lax; Max-Age=60");
    const before = process.env.APP_URL;
    process.env.APP_URL = "https://tracker.example";
    resetEnvCache();
    try {
      expect(sessionCookie("tok", 1000)).toBe("__Host-gst=tok; Path=/; HttpOnly; SameSite=Lax; Max-Age=1; Secure");
    } finally {
      process.env.APP_URL = before;
      resetEnvCache();
    }
  });

  it("reads cookies from a header", () => {
    expect(readCookie("a=1; gst=abc; b=2", "gst")).toBe("abc");
    expect(readCookie("gst=", "gst")).toBeUndefined();
    expect(readCookie(null, "gst")).toBeUndefined();
  });
});
