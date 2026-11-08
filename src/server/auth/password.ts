import "server-only";

import { hash, verify } from "@node-rs/argon2";

import { COMMON_PASSWORDS } from "./common-passwords";

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/**
 * OWASP-recommended argon2id settings (19 MiB, 2 passes, 1 lane).
 * @node-rs/argon2 uses argon2id by default; the hash string records it.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export type PasswordProblem = "TOO_SHORT" | "TOO_LONG" | "TOO_COMMON";

export function passwordProblem(password: string): PasswordProblem | null {
  if ([...password].length < PASSWORD_MIN) return "TOO_SHORT";
  if ([...password].length > PASSWORD_MAX) return "TOO_LONG";
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return "TOO_COMMON";
  return null;
}

export const PASSWORD_MESSAGES: Readonly<Record<PasswordProblem, string>> = {
  TOO_SHORT: `Use at least ${PASSWORD_MIN} characters. A short sentence works well.`,
  TOO_LONG: `Use ${PASSWORD_MAX} characters or fewer.`,
  TOO_COMMON: "That password is too easy to guess. Try a short sentence instead.",
};

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Runs a verify against a throwaway hash so that "no such email" takes as
 * long as "wrong password". Always returns false.
 */
export async function burnPasswordCheck(password: string): Promise<false> {
  dummyHash ??= hashPassword("not-a-real-password-just-for-timing");
  await verifyPassword(await dummyHash, password);
  return false;
}
