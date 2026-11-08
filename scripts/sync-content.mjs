/**
 * Copies the legacy content folders (`data/` and `papers/`) into `public/`
 * so Next.js serves them at the same URLs as the GitHub Pages site
 * (`/data/notes/bio.0.0.json`, `/papers/Physics_4.1_Energy.pdf`).
 * The copies are gitignored; the originals are never modified.
 * Runs before `next dev` and `next build`.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FOLDERS = ["data", "papers"];

for (const name of FOLDERS) {
  const from = join(root, name);
  const to = join(root, "public", name);
  if (!existsSync(from)) {
    console.error(`sync-content: missing ${name}/`);
    process.exit(1);
  }
  rmSync(to, { recursive: true, force: true });
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`sync-content: copied ${name}/ to public/${name}/`);
}
