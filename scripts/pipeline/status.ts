/** Writes content/pipeline/STATUS.md: a plain-English report of where every job has got to. */
import { join } from "node:path";

import { MAX_TRIES, isPoor, isStuck, readJson, type Failures, type JobResult, type Kind, type State } from "./engine";

export function statusReport(kinds: readonly Kind[], state: State, results: readonly JobResult[], now = new Date()): string {
  const out: string[] = ["# Pipeline status", "", `Last run finished: ${now.toISOString().slice(0, 16).replace("T", " ")} UTC. This file is written by the pipeline after every run.`, ""];
  for (const kind of kinds) {
    const items = kind.items();
    const failures = readJson<Failures>(join(kind.dir, "failures.json"), {});
    const done = items.filter((i) => i.done).length;
    const open = items.filter((i) => !i.done);
    const stuck = open.filter((i) => isStuck(failures[i.id]));
    const r = results.find((x) => x.id === kind.id);
    out.push(`## ${kind.id}`, "", `**${done} of ${items.length} done**${items.length ? ` (${Math.floor((done / items.length) * 100)}%)` : ""}. This run: ${r?.written ?? 0} saved, ${r?.rejected ?? 0} failed the checks.`, "");
    const groups = new Map<string, { done: number; total: number }>();
    for (const i of items) {
      const g = groups.get(i.group) ?? { done: 0, total: 0 };
      g.total++;
      if (i.done) g.done++;
      groups.set(i.group, g);
    }
    const started = [...groups].filter(([, g]) => g.done > 0);
    if (started.length) {
      out.push("| Spec | Done | Of |", "| --- | ---: | ---: |");
      for (const [name, g] of started) out.push(`| ${name}${g.done === g.total ? " (finished)" : ""} | ${g.done} | ${g.total} |`);
      out.push("");
    }
    out.push(`Not started yet: ${[...groups].filter(([, g]) => g.done === 0).length} specs. Waiting for another try: ${open.filter((i) => failures[i.id] && !isStuck(failures[i.id])).length} items.`, "");
    if (stuck.length) {
      out.push(`**Stuck (failed ${MAX_TRIES} runs, needs a person to look): ${stuck.length}**`, "");
      for (const i of stuck.slice(0, 30)) out.push(`- ${i.id}: ${(failures[i.id]?.errors[0] ?? "").slice(0, 140)}`);
      out.push("");
    }
  }
  out.push("## AI providers", "", "| Provider | Requests today |", "| --- | ---: |");
  for (const [id, u] of Object.entries(state.usage)) out.push(`| ${id} | ${u.day === now.toISOString().slice(0, 10) ? u.n : 0} |`);
  out.push("", "| Model | Passed | Failed | |", "| --- | ---: | ---: | --- |");
  for (const [by, h] of Object.entries(state.models).sort((a, b) => b[1].ok - a[1].ok)) out.push(`| ${by} | ${h.ok} | ${h.bad} | ${isPoor(h) ? "skipped for now" : ""} |`);
  return `${out.join("\n")}\n`;
}
