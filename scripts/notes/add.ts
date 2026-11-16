/**
 * Adds notes written outside the daily AI run (e.g. by Claude in a chat, when
 * the owner asks for it) through exactly the same repairs and quality gate.
 *
 *   npx tsx scripts/notes/add.ts prompt <pointId>            prints the brief for one spec point
 *   npx tsx scripts/notes/add.ts check <pointId.json> <dir>  checks a note; if it passes, puts the checked copy in <dir>
 *   npx tsx scripts/notes/add.ts save <dir> [by]             saves every checked note in <dir> to content/notes (skips points that already have one)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getPoint } from "@/content";

import { notesKind } from "./kind";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BY = "claude/claude-fable-5-2";

async function main(): Promise<void> {
  const [cmd, a, b] = process.argv.slice(2);
  const kind = notesKind(join(ROOT, "content", "notes"), null);
  try {
    if (cmd === "prompt" && a && getPoint(a)) {
      console.log(kind.prompt(a, []));
    } else if (cmd === "check" && a && b) {
      const pid = basename(a).replace(/\.json$/, "");
      if (!getPoint(pid)) throw new Error(`unknown spec point: ${pid} (name the file {pointId}.json)`);
      const { value, errors } = await kind.check(pid, JSON.parse(readFileSync(a, "utf8")), BY);
      if (errors.length) {
        console.log(`REJECTED ${pid}:\n- ${errors.join("\n- ")}`);
        process.exitCode = 1;
      } else {
        mkdirSync(b, { recursive: true });
        writeFileSync(join(b, `${pid}.json`), JSON.stringify(value));
        console.log(`OK ${pid}`);
      }
    } else if (cmd === "save" && a && existsSync(a)) {
      const done = new Set(kind.items().filter((i) => i.done).map((i) => i.id));
      let saved = 0;
      for (const f of readdirSync(a).filter((x) => x.endsWith(".json")).sort()) {
        const pid = f.replace(/\.json$/, "");
        if (!getPoint(pid) || done.has(pid)) continue;
        // Checked again here, so nothing reaches content/notes without passing the gate.
        const { value, errors } = await kind.check(pid, JSON.parse(readFileSync(join(a, f), "utf8")), b ?? BY);
        if (errors.length) console.log(`skipped ${pid}: ${errors[0]}`);
        else {
          kind.save(pid, value);
          saved++;
        }
      }
      console.log(`saved ${saved} note(s)`);
    } else {
      console.error("usage: add.ts prompt <pointId> | check <pointId.json> <dir> | save <dir>");
      process.exitCode = 2;
    }
  } finally {
    await kind.close?.();
  }
}

void main();
