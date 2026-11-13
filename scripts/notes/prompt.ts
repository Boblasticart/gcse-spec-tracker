/**
 * The bulk note prompt. It is the app's own note prompt (LEGACY_PROMPTS.writeNote)
 * scaled up to the depth of the existing prepared notes, so generated notes
 * look and read like the ones students already have, and pass the QA gate.
 */
import type { PointRef } from "@/content";
import { COURSE_DEPTH, MINIMUMS } from "@/lib/notes/qa";

export function buildNotePrompt(ref: PointRef, retryErrors: readonly string[] = []): string {
  const { subject: s, topic, paperName, point } = ref;
  const depth = COURSE_DEPTH[s.course];
  const m = MINIMUMS[depth];
  const others = topic.points.filter((x) => x.id !== point.id).map((x) => x.text).join("; ") || "none";
  const spec = [s.board, s.name, s.code, s.tier && !s.code.includes(s.tier) ? `${s.tier} tier` : ""].filter(Boolean).join(" ");
  const figures =
    m.figures === 0
      ? "- Diagrams: only if they truly help (e.g. a timeline or structure plan); otherwise svg: [] and no fig."
      : `- Diagrams: ${m.figures} to ${m.figures + 2} detailed, correct, clearly labelled, colourful diagrams in total (in svg, or as fig inside a core section).`;
  const lines = [
    `You are a senior ${s.board} GCSE ${s.name} examiner writing complete revision notes for a student aiming for grade 9. The notes must be as full and detailed as a top student's colour-coded revision notes: nothing the spec requires may be missing.`,
    "",
    `Specification: ${spec}. Section: ${paperName} > ${topic.name}.`,
    `Write notes for this ONE spec point: "${point.text}".`,
    `Other points in the same topic (context only, do not cover them): ${others}.`,
    "",
    "Rules:",
    `- Accurate to the ${s.board} specification, using the exact terminology that mark schemes reward. If unsure of a detail, leave it out rather than guess. Include Higher tier and triple-only content where this point has it. Cover EVERY property, definition, process, equation, example, set text detail and required practical the spec names for this point.`,
    "- Grade 9 depth: the reasoning that links ideas, with explanations of WHY, in plain language a 15 year old can follow.",
    `- summary: 2 to 4 sentences (at least ${m.summary} characters) giving the big picture.`,
    `- core: ${m.core + 2} to ${m.core + 6} sections. Each has a heading h, a paragraph p, bullets (use many), and optionally: table {head:[..],rows:[[..]]} for comparisons and property lists, callouts [{k:"def"|"key"|"tip"|"warn",t:"",p:""}] (def = definitions to copy word for word, key = must-know fact, tip = exam tip, warn = common trap), and fig [{cap,svg}] to place a diagram inside that section.`,
    figures,
    '- SVG rules: viewBox "0 0 400 240"; fill and stroke as hex colours only (soft fills such as #dbeafe #fde68a #bbf7d0 #fecaca #e9d5ff with darker strokes such as #1b2540); font-size 11 to 13; only svg, g, path, rect, circle, ellipse, line, polyline, polygon, text, tspan, defs, marker, linearGradient, radialGradient, stop. Every label must be correct, sit fully inside the 400 x 240 picture (allow for its width), and must not touch or overlap any other label: leave at least 14 units between label rows. Every figure needs a caption cap.',
    "- analogy: a vivid analogy that maps correctly, plus where it breaks down.",
    `- terms: ${m.terms + 2} to ${m.terms + 8} key terms with precise definitions. mistakes: ${m.mistakes + 1} to ${m.mistakes + 4} commonly wrong answers seen in real exams (w = what students write, r = what the mark scheme wants).`,
    `- exam: ${m.exam + 1} to ${m.exam + 4} questions of the kind commonly asked on this point in real ${s.board} papers, each {q,marks,model:[each mark-scheme point as one line],tip}. Mix 1, 2, 4 and 6 mark questions where the point allows.`,
    m.worked > 0
      ? `- worked: ${m.worked} to ${m.worked + 1} worked examples (with numbers if the point involves calculation; otherwise model answers or applied examples), each {q,steps:[..],ans}.`
      : "- worked: worked examples or model paragraphs if they help, otherwise [].",
    "- Use **double asterisks** to bold a key phrase. Plain text equations. No HTML anywhere outside SVG.",
  ];
  if (retryErrors.length) {
    lines.push("", "A previous attempt was rejected for these reasons; fix all of them:", ...retryErrors.slice(0, 12).map((e) => `- ${e}`));
  }
  lines.push(
    "",
    "Reply with JSON only:",
    '{"summary":"","core":[{"h":"","p":"","bullets":[""],"table":null,"callouts":[{"k":"def","t":"","p":""}],"fig":[]}],"analogy":{"t":"","p":""},"terms":[{"t":"","d":""}],"mistakes":[{"w":"","r":""}],"exam":[{"q":"","marks":2,"model":[""],"tip":""}],"worked":[{"q":"","steps":[""],"ans":""}],"svg":[{"cap":"","svg":"<svg viewBox=\\"0 0 400 240\\">...</svg>"}]}',
  );
  return lines.join("\n");
}
