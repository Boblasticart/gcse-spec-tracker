import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { HTML_TAG } from "@/lib/notes/qa";

import { classifyHttpError, RateLimited } from "../../scripts/notes/providers";
import { dropFigures, figureNumbers, repairNote } from "../../scripts/notes/repair";
import { customCheck, customJobProblems, customPrompt, type CustomJob } from "../../scripts/pipeline/custom";
import { MAX_TRIES, countsAgainstAllowance, ensureGitIdentity, isPoor, pendingItems, usableModels, type Failures, type Kind, type State } from "../../scripts/pipeline/engine";
import { statusReport } from "../../scripts/pipeline/status";

const HOUR = 3600_000;
const svg = (label: string): string => `<svg viewBox="0 0 400 240"><rect x="10" y="10" width="100" height="50" fill="#dbeafe" stroke="#1b2540"/><text x="20" y="40" font-size="12">${label}</text></svg>`;

describe("pipeline engine", () => {
  it("queues new items, and failed ones only after their wait and within their tries", () => {
    const now = Date.parse("2026-11-20T08:00:00Z");
    const ago = (h: number): string => new Date(now - h * HOUR).toISOString();
    const items = ["new", "done", "recent", "old", "stuck"].map((id) => ({ id, done: id === "done" }));
    const failures: Failures = {
      recent: { errors: ["x"], tried: ["a"], ts: ago(2) },
      old: { errors: ["x"], tried: ["a"], ts: ago(30), n: 2 },
      stuck: { errors: ["x"], tried: ["a"], ts: ago(30), n: MAX_TRIES },
    };
    expect(pendingItems(items, failures, false, now)).toEqual(["new", "old"]);
    expect(pendingItems(items, failures, true, now)).toEqual(["new", "recent", "old", "stuck"]);
  });

  it("gives a checkout with no commit name one, and keeps an existing one", () => {
    const dir = mkdtempSync(join(tmpdir(), "idt-"));
    const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
    const git = (c: string): string => execSync(`git ${c}`, { cwd: dir, env }).toString().trim();
    git("init -q");
    const saved = { g: process.env.GIT_CONFIG_GLOBAL, s: process.env.GIT_CONFIG_NOSYSTEM };
    process.env.GIT_CONFIG_GLOBAL = "/dev/null";
    process.env.GIT_CONFIG_NOSYSTEM = "1";
    try {
      ensureGitIdentity(dir);
      expect(git("config user.name")).toBe("notes-bot");
      git('config user.name "someone"');
      ensureGitIdentity(dir);
      expect(git("config user.name")).toBe("someone");
      git("commit -q --allow-empty -m test");
    } finally {
      if (saved.g === undefined) delete process.env.GIT_CONFIG_GLOBAL;
      else process.env.GIT_CONFIG_GLOBAL = saved.g;
      if (saved.s === undefined) delete process.env.GIT_CONFIG_NOSYSTEM;
      else process.env.GIT_CONFIG_NOSYSTEM = saved.s;
    }
  });

  it("gives back requests the provider refused because it was overloaded", () => {
    const busy = classifyHttpError(503, '{"code":503,"message":"high demand"}');
    expect(busy).toBeInstanceOf(RateLimited);
    expect(countsAgainstAllowance(busy as RateLimited)).toBe(false);
    expect(countsAgainstAllowance(new RateLimited('busy, reply cut off: {"code":503}', false, 90_000))).toBe(false);
    expect(countsAgainstAllowance(new RateLimited("reply cut off: empty reply (length)", false, 5000))).toBe(true);
    expect(countsAgainstAllowance(new RateLimited("no reply: fetch failed", false, 60_000))).toBe(true);
    expect(countsAgainstAllowance(new RateLimited("busy, HTTP 503", true, 0))).toBe(true);
  });

  it("skips models that almost never pass, unless none are left", () => {
    expect(isPoor({ ok: 0, bad: 9 })).toBe(false);
    expect(isPoor({ ok: 1, bad: 11 })).toBe(true);
    expect(isPoor({ ok: 4, bad: 8 })).toBe(false);
    const state: State = { v: 1, usage: {}, models: { "g/lite": { ok: 0, bad: 40, since: "2026-11-16" }, "g/flash": { ok: 9, bad: 20, since: "2026-11-16" } } };
    expect(usableModels("g", ["flash", "lite", "new"], state)).toEqual(["flash", "new"]);
    expect(usableModels("g", ["lite"], state)).toEqual(["lite"]);
  });

  it("writes a status report with totals and stuck items", () => {
    const kind: Kind = {
      id: "demo",
      dir: "/nonexistent",
      items: () => [
        { id: "a.0.0", group: "a", done: true },
        { id: "a.0.1", group: "a", done: false },
        { id: "b.0.0", group: "b", done: false },
      ],
      prompt: () => "",
      check: () => Promise.resolve({ value: null, errors: [] }),
      save: () => undefined,
    };
    const report = statusReport([kind], { v: 1, usage: { gemini: { day: "2026-11-20", n: 7 } }, models: {} }, [{ id: "demo", written: 1, rejected: 2, attempts: 3 }], new Date("2026-11-20T09:00:00Z"));
    expect(report).toContain("**1 of 3 done** (33%)");
    expect(report).toContain("| a | 1 | 2 |");
    expect(report).toContain("| gemini | 7 |");
  });
});

describe("note repairs", () => {
  it("renames mislabelled fields and drops incomplete items", () => {
    const { note, repairs } = repairNote(
      {
        summary: "A <b>big</b> idea<br>here",
        terms: [{ term: "Mass", definition: "Amount of matter" }, { t: "Empty" }],
        mistakes: [{ wrong: "w", correct: "r" }],
        exam: [{ question: "Q?", marks: "2", answer: "one\ntwo" }, "A plain tip", { q: "no marks" }],
        worked: [{ problem: "P", solution: "step 1\nstep 2", answer: "42" }],
      },
      "text",
    );
    const n = note as Record<string, unknown[]> & { summary: string };
    expect(n.summary).toBe("A **big** idea here");
    expect(n.terms).toEqual([{ term: "Mass", definition: "Amount of matter", t: "Mass", d: "Amount of matter" }]);
    expect(n.mistakes?.[0]).toMatchObject({ w: "w", r: "r" });
    expect(n.exam).toHaveLength(2);
    expect(n.exam?.[0]).toMatchObject({ q: "Q?", marks: 2, model: ["one", "two"] });
    expect(n.worked?.[0]).toMatchObject({ q: "P", steps: ["step 1", "step 2"], ans: "42" });
    expect(repairs.join(" ")).toContain("incomplete terms");
  });

  it("tells real HTML tags from maths", () => {
    for (const html of ["<b>", "</p>", "<br/>", '<a href="x">', "<div class=x>", "<script>"]) expect(HTML_TAG.test(html)).toBe(true);
    for (const maths of ["a<b and c>d", "if x<a then y>2", "p<0.05 and q>1", "3 < b > 2"]) expect(HTML_TAG.test(maths)).toBe(false);
  });

  it("leaves maths comparisons alone", () => {
    const { note } = repairNote({ summary: "If a<b and c>d then a < b" }, "text");
    expect((note as { summary: string }).summary).toBe("If a<b and c>d then a < b");
  });

  it("drops broken diagrams only when enough good ones remain", () => {
    const good = (l: string): { cap: string; svg: string } => ({ cap: l, svg: svg(l) });
    const broken = { cap: "", svg: "<svg" };
    const four = repairNote({ svg: [good("a"), broken, good("b")], core: [{ h: "H", p: "P", fig: [good("c")] }] }, "diagram").note as { svg: unknown[] };
    expect(four.svg).toHaveLength(2);
    const three = repairNote({ svg: [good("a"), broken, good("b")] }, "diagram").note as { svg: unknown[] };
    expect(three.svg).toHaveLength(3);

    const note = { svg: [good("a"), good("b")], core: [{ fig: [good("c"), good("d")] }] };
    expect(figureNumbers(["maths_aqa_f.1.0 figure 4: cut-off: x", "figure 2: figure has no caption", "summary is short"])).toEqual([4, 2]);
    expect(dropFigures(note, [4, 2], 3)).toBe(false);
    expect(dropFigures(note, [4], 3)).toBe(true);
    expect(note.svg).toHaveLength(2);
    expect(note.core[0]!.fig.map((f) => f.cap)).toEqual(["c"]);
  });
});

describe("custom jobs", () => {
  const job: CustomJob = {
    id: "flashcards",
    kind: "custom",
    out: "content/flashcards",
    prompt: "Cards for {board} {subject}: {point}",
    fields: { summary: { minChars: 10 }, cards: { min: 2, each: ["q", "a"] } },
    minBytes: 20,
  };

  it("checks a reply against the job's fields", () => {
    expect(customCheck(job, { summary: "What it is about", cards: [{ q: "1?", a: "1" }, { q: "2?", a: "2" }] })).toEqual([]);
    const errors = customCheck(job, { summary: "short", cards: [{ q: "1?" }] });
    expect(errors).toHaveLength(3);
    expect(customCheck(job, "nope")).toEqual(["reply is not a JSON object"]);
  });

  it("fills the prompt for a spec point and adds retry reasons", () => {
    const prompt = customPrompt(job, "phy.0.1", ["1 cards (expected at least 2)"]);
    expect(prompt).toContain("Cards for AQA");
    expect(prompt).not.toContain("{point}");
    expect(prompt).toContain("- 1 cards (expected at least 2)");
    expect(prompt).toContain("summary, cards");
  });

  it("refuses unsafe settings, and the shipped jobs file is valid", () => {
    expect(customJobProblems(job)).toEqual([]);
    expect(customJobProblems({ ...job, out: "content/notes" })).toHaveLength(1);
    expect(customJobProblems({ ...job, out: "../data" })).toHaveLength(1);
    expect(customJobProblems({ ...job, prompt: "no placeholder" })).toHaveLength(1);
    const config = JSON.parse(readFileSync(new URL("../../content/pipeline/jobs.json", import.meta.url), "utf8")) as { jobs: (CustomJob | { kind: "notes"; id: string })[] };
    expect(config.jobs[0]).toMatchObject({ id: "notes", kind: "notes" });
    for (const j of config.jobs) if (j.kind === "custom") expect(customJobProblems(j)).toEqual([]);
  });
});
