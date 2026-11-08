import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    "public/**",
    // Legacy GitHub Pages site: kept exactly as it is.
    "index.html",
    "adapter.js",
    "supabase-config.js",
    "worker/**",
    "supabase/**",
    "data/**",
    "papers/**",
  ]),
]);
