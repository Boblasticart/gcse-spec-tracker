import { describe, expect, it } from "vitest";

import { allowedOrigins } from "@/server/http";

describe("allowed origins (CSRF check)", () => {
  it("is just APP_URL off Vercel", () => {
    expect([...allowedOrigins({ VERCEL_URL: "x.vercel.app" } as NodeJS.ProcessEnv)]).toEqual([new URL(process.env.APP_URL!).origin]);
  });

  it("adds the addresses Vercel gives the deployment, and ignores junk", () => {
    const o = allowedOrigins({
      VERCEL: "1",
      VERCEL_URL: "gcse-abc123.vercel.app",
      VERCEL_BRANCH_URL: "gcse-git-rebuild-me.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "evil.com/path",
    } as NodeJS.ProcessEnv);
    expect(o.has("https://gcse-abc123.vercel.app")).toBe(true);
    expect(o.has("https://gcse-git-rebuild-me.vercel.app")).toBe(true);
    expect([...o].some((x) => x.includes("evil"))).toBe(false);
  });
});
