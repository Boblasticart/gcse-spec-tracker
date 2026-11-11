import type { NextConfig } from "next";

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

export default nextConfig;
