/**
 * A "custom" job: any new kind of content, described entirely in
 * content/pipeline/jobs.json with no code. For every spec point it sends the
 * job's prompt, checks the JSON reply has what the job asks for, and saves it
 * to {out}/{spec}/{topic}.json as {pointId: reply} (the same layout as notes).
 */
import { join } from "node:path";

import { CATALOGUE, allPoints, getPoint } from "@/content";
import { HTML_TAG } from "@/lib/notes/qa";

import { COURSE_ORDER } from "../notes/kind";
import { readJson, writeJson, type Kind } from "./engine";

/** What one field of the reply must be. */
export interface FieldRule {
  /** A list with at least this many items. */
  min?: number;
  /** Each list item must have these fields filled in. */
  each?: string[];
  /** A piece of text at least this long. */
  minChars?: number;
}

export interface CustomJob {
  id: string;
  kind: "custom";
  enabled?: boolean;
  /** Folder under the repo root, e.g. "content/flashcards". */
  out: string;
  /** Only these spec ids / courses (empty or missing = all). */
  specs?: string[];
  courses?: string[];
  /** Prompt with placeholders {board} {subject} {code} {tier} {paper} {topic} {point} {others}. */
  prompt: string;
  /** Fields the JSON reply must contain. */
  fields: Record<string, FieldRule>;
  minBytes?: number;
  maxBytes?: number;
}

const filled = (v: unknown): boolean => (typeof v === "string" ? v.trim() !== "" : typeof v === "number" ? Number.isFinite(v) : Array.isArray(v) ? v.length > 0 : false);

/** Problems with a job's settings (empty = fine). */
export function customJobProblems(job: CustomJob): string[] {
  const out: string[] = [];
  if (!/^[a-z][a-z0-9_-]{1,30}$/.test(job.id ?? "")) out.push("id must be lower-case letters, digits, - or _");
  if (!/^content\/[a-z][a-z0-9_-]{1,30}$/.test(job.out ?? "") || job.out === "content/notes" || job.out === "content/specs" || job.out === "content/pipeline") {
    out.push('out must be its own folder under content/, e.g. "content/flashcards"');
  }
  if (typeof job.prompt !== "string" || !job.prompt.includes("{point}")) out.push("prompt must mention {point}");
  if (!job.fields || typeof job.fields !== "object" || !Object.keys(job.fields).length) out.push("fields must list at least one field the reply needs");
  return out;
}

/** Fills the job's prompt for one spec point. */
export function customPrompt(job: CustomJob, pid: string, errors: readonly string[]): string {
  const ref = getPoint(pid)!;
  const values: Record<string, string> = {
    board: ref.subject.board,
    subject: ref.subject.name,
    code: ref.subject.code,
    tier: ref.subject.tier ?? "",
    paper: ref.paperName,
    topic: ref.topic.name,
    point: ref.point.text,
    others: ref.topic.points.filter((x) => x.id !== pid).map((x) => x.text).join("; ") || "none",
  };
  const lines = [job.prompt.replace(/\{(board|subject|code|tier|paper|topic|point|others)\}/g, (_, k: string) => values[k] ?? "")];
  if (errors.length) lines.push("", "A previous attempt was rejected for these reasons; fix all of them:", ...errors.slice(0, 12).map((e) => `- ${e}`));
  lines.push("", `Reply with one JSON object only, with these fields: ${Object.keys(job.fields).join(", ")}. No HTML.`);
  return lines.join("\n");
}

/** Checks a reply against the job's field rules. */
export function customCheck(job: CustomJob, raw: unknown): string[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return ["reply is not a JSON object"];
  const o = raw as Record<string, unknown>;
  const errors: string[] = [];
  for (const [name, rule] of Object.entries(job.fields)) {
    const v = o[name];
    if (rule.min !== undefined || rule.each) {
      if (!Array.isArray(v)) {
        errors.push(`${name} must be a list`);
        continue;
      }
      if (v.length < (rule.min ?? 1)) errors.push(`${v.length} ${name} (expected at least ${rule.min ?? 1})`);
      const need = rule.each ?? [];
      const bad = v.filter((item) => (need.length ? !item || typeof item !== "object" || need.some((k) => !filled((item as Record<string, unknown>)[k])) : !filled(item))).length;
      if (bad) errors.push(`${bad} ${name} are incomplete (each needs: ${need.join(", ") || "text"})`);
    } else if (typeof v !== "string" || v.trim().length < (rule.minChars ?? 1)) {
      errors.push(`${name} must be text of at least ${rule.minChars ?? 1} characters`);
    }
  }
  const text = JSON.stringify(raw);
  const bytes = new TextEncoder().encode(text).length;
  if (bytes < (job.minBytes ?? 0)) errors.push(`reply is only ${bytes} bytes (expected at least ${job.minBytes})`);
  if (bytes > (job.maxBytes ?? 60_000)) errors.push(`reply is ${bytes} bytes (max ${job.maxBytes ?? 60_000})`);
  if (HTML_TAG.test(text)) errors.push("text contains HTML tags");
  return errors;
}

export function customKind(job: CustomJob, root: string): Kind {
  const dir = join(root, job.out);
  const fileOf = (pid: string): string => {
    const [spec, topic] = pid.split(".");
    return join(dir, spec!, `${topic}.json`);
  };
  return {
    id: job.id,
    dir,
    items() {
      const out: { id: string; group: string; done: boolean }[] = [];
      const shards = new Map<string, Record<string, unknown>>();
      const specs = [...CATALOGUE].sort((a, b) => COURSE_ORDER.indexOf(a.course) - COURSE_ORDER.indexOf(b.course));
      for (const s of specs) {
        if (job.specs?.length && !job.specs.includes(s.id)) continue;
        if (job.courses?.length && !job.courses.includes(s.course)) continue;
        for (const p of allPoints(s)) {
          const file = fileOf(p.id);
          if (!shards.has(file)) shards.set(file, readJson<Record<string, unknown>>(file, {}));
          out.push({ id: p.id, group: s.id, done: shards.get(file)![p.id] !== undefined });
        }
      }
      return out;
    },
    prompt: (pid, errors) => customPrompt(job, pid, errors),
    check(pid, raw, by) {
      const errors = customCheck(job, raw);
      const value = errors.length ? raw : { ...(raw as Record<string, unknown>), pid, by, ts: new Date().toISOString() };
      return Promise.resolve({ value, errors });
    },
    save(pid, value) {
      const file = fileOf(pid);
      const shard = readJson<Record<string, unknown>>(file, {});
      shard[pid] = value;
      writeJson(file, shard);
    },
  };
}
