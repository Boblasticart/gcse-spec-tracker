import { describe, expect, it } from "vitest";

import { burnPasswordCheck, hashPassword, passwordProblem, verifyPassword } from "@/server/auth/password";

describe("password rules", () => {
  it("needs 10 to 128 characters", () => {
    expect(passwordProblem("short pw!")).toBe("TOO_SHORT");
    expect(passwordProblem("a".repeat(129))).toBe("TOO_LONG");
    expect(passwordProblem("purple turtles dance")).toBeNull();
    expect(passwordProblem("x".repeat(128))).toBeNull();
  });

  it("counts characters, not bytes", () => {
    expect(passwordProblem("ééééééééé")).toBe("TOO_SHORT");
    expect(passwordProblem("éééééééééé")).toBeNull();
  });

  it("refuses common passwords whatever the case", () => {
    expect(passwordProblem("Password123")).toBe("TOO_COMMON");
    expect(passwordProblem("QWERTYUIOP")).toBe("TOO_COMMON");
  });
});

describe("password hashing", () => {
  it("uses argon2id and verifies", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "correct horse battery")).toBe(true);
    expect(await verifyPassword(h, "correct horse batterY")).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same password here")).not.toBe(await hashPassword("same password here"));
  });

  it("treats a broken hash as a mismatch", async () => {
    expect(await verifyPassword("not-a-hash", "whatever123")).toBe(false);
    expect(await burnPasswordCheck("anything at all")).toBe(false);
  });
});
