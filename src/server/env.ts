import "server-only";

import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /** Public origin of the app, e.g. https://gcse-spec-tracker.vercel.app. Used for CSRF checks and links. */
    APP_URL: z.url(),
    /** Secret mixed into every stored OTP hash. */
    OTP_PEPPER: z.string().min(32, "OTP_PEPPER must be at least 32 characters"),
    /** Secret key for the session token hashes. */
    SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
    MAIL_TRANSPORT: z.enum(["gmail", "file", "memory"]).default("gmail"),
    MAIL_DIR: z.string().default(".mail"),
    GMAIL_USER: z.email().optional(),
    GMAIL_APP_PASSWORD: z.string().optional(),
    MAIL_FROM_NAME: z.string().default("GCSE Spec Tracker"),
    /** Test-only: lets e2e tests move the server clock. Refused in production unless CI is set. */
    ENABLE_TEST_CLOCK: z.enum(["0", "1"]).default("0"),
  })
  .superRefine((env, ctx) => {
    if (env.MAIL_TRANSPORT === "gmail" && (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD)) {
      ctx.addIssue({ code: "custom", message: "GMAIL_USER and GMAIL_APP_PASSWORD are needed to send email" });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Reads and checks the environment once, on first use (never at build time). */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".") || "env"}: ${i.message}`).join("; ");
    throw new Error(`Invalid server configuration: ${problems}`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests that change process.env between cases. */
export function resetEnvCache(): void {
  cached = undefined;
}

export function isSecureOrigin(): boolean {
  return new URL(getEnv().APP_URL).protocol === "https:";
}
