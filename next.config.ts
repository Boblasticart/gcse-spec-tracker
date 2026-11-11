import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

/** Changes on every deploy, so the offline page is refreshed. */
function revision(): string {
  const fromCi = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA;
  if (fromCi) return fromCi;
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return randomUUID();
  }
}

/** The service worker (sw/sw.ts), built into public/sw.js by Serwist (webpack builds only). */
const withSerwist = withSerwistInit({
  swSrc: "sw/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  cacheOnNavigation: true,
  // The page sends waiting changes itself when the connection returns; no surprise reloads.
  reloadOnOnline: false,
  additionalPrecacheEntries: [{ url: "/~offline", revision: revision() }],
  // Only small files from public/ go in the install cache; notes and PDFs are cached as they're used.
  globPublicPatterns: ["icons/**/*"],
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  // Native module: load it from node_modules at runtime instead of bundling it.
  serverExternalPackages: ["@node-rs/argon2"],
  // The notes reader reads the legacy prepared notes from data/notes at request time.
  outputFileTracingIncludes: {
    "/notes/[pid]": ["./data/notes/*.json"],
  },
};

export default withSerwist(nextConfig);
