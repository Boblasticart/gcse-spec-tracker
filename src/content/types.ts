/** Shapes of the content extracted from the legacy tracker (`index.html`). */

export type SubjectId = "phy" | "bio" | "chem" | "maths" | "cs" | "geo" | "eng" | "bus";

/** One spec point. `id` is `${topicId}.${index}`, exactly as the legacy tracker numbers it. */
export interface SpecPoint {
  readonly id: string;
  readonly text: string;
}

/** A topic. `id` is `${subjectId}.${n}`, numbered across all of a subject's papers. */
export interface Topic {
  readonly id: string;
  readonly name: string;
  readonly points: readonly SpecPoint[];
}

export interface SpecPaper {
  readonly name: string;
  readonly topics: readonly Topic[];
}

export interface Subject {
  readonly id: SubjectId;
  readonly name: string;
  readonly board: string;
  readonly code: string;
  readonly papers: readonly SpecPaper[];
}

/** A practice paper PDF in `papers/`. */
export interface PracticePaper {
  /** Legacy key, also used as the "done" key in `gcse-papers-v1`. */
  readonly key: string;
  readonly title: string;
  readonly group: string;
  readonly pages: number;
  readonly marks: number;
  /** Path relative to the site root, e.g. `papers/Physics_4.1_Energy.pdf`. */
  readonly url: string;
}

export type PromptId =
  | "reviewWeaknesses"
  | "writeNote"
  | "writeQuiz"
  | "markQuiz"
  | "markAnswer"
  | "todaysSeven";

/**
 * A legacy AI prompt, kept verbatim as a template: the literal parts
 * (`quasis`) interleaved with the values of `exprs`.
 */
export interface LegacyPrompt {
  readonly id: PromptId;
  /** Function in index.html that builds and sends it. */
  readonly legacyFunction: string;
  readonly line: number;
  readonly functionLines: readonly [number, number];
  readonly quasis: readonly string[];
  /** Legacy JavaScript source of each interpolated value. */
  readonly exprs: readonly string[];
  /** The legacy call that sends it, e.g. `sm.json(prompt,{modelTier:'complex',cache:false})`. */
  readonly call: string;
}

export interface LegacyActionUse {
  readonly fn: string;
  readonly line: number;
}

/** A `data-act` click action in the legacy tracker. */
export interface LegacyAction {
  readonly name: string;
  readonly handlerLine: number;
  /** The legacy handler source, verbatim. */
  readonly handler: string;
  readonly uses: readonly LegacyActionUse[];
}

export interface LegacyView {
  readonly name: string;
  readonly renderFn: string;
  readonly lines: readonly number[];
}

export interface LegacyFunctionInfo {
  readonly name: string;
  readonly startLine: number;
  readonly endLine: number;
}
