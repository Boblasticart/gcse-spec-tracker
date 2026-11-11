import { describe, expect, it } from "vitest";

import { buildCsp, newNonce, SECURITY_HEADERS } from "@/lib/csp";

describe("content security policy", () => {
  it("locks scripts to the nonce and forbids framing", () => {
    const csp = buildCsp("abc", { dev: false, https: true });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic' 'wasm-unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(buildCsp("abc", { dev: true, https: false })).toContain("'unsafe-eval'");
    expect(buildCsp("abc", { dev: false, https: false })).not.toContain("upgrade-insecure-requests");
  });

  it("makes a fresh 128-bit nonce each time", () => {
    const a = newNonce();
    expect(Buffer.from(a, "base64")).toHaveLength(16);
    expect(newNonce()).not.toBe(a);
  });

  it("sends the standard hardening headers", () => {
    const keys = SECURITY_HEADERS.map((h) => h.key);
    expect(keys).toEqual(expect.arrayContaining(["X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "X-Frame-Options"]));
  });
});
