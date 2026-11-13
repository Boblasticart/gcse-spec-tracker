"use client";

import { useDocs, useEngine } from "@/client/sync/react";
import { BOARDS_PATH, CATALOGUE, COURSES, NOT_TAKING, asBoards, chosenSpecId, specLabel, specsForCourse, withBoard, type CourseId } from "@/content";
import { Button } from "@/ui/button";
import { cardClass } from "@/ui/card";

const OFFERED = COURSES.map((c) => ({ ...c, specs: specsForCourse(c.id, CATALOGUE) })).filter((c) => c.specs.length > 0);

/**
 * Settings: which exam board (and tier) the student takes for each subject,
 * or "Not taking". Saved to `settings/boards`; progress is kept per spec, so
 * switching back later shows the earlier progress again.
 *
 * Until a student has confirmed their boards once (new accounts, and older
 * accounts that never chose), the panel sits at the top of the dashboard
 * ("top"); afterwards it lives with the other settings ("settings").
 */
export function BoardsPanel({ placement }: { placement: "top" | "settings" }) {
  const engine = useEngine();
  const phase = useDocs((s) => s.phase);
  const entry = useDocs((s) => s.docs[BOARDS_PATH]);
  const doc = entry?.data;
  const confirmed = entry !== undefined && entry.data !== null && entry.data !== undefined;
  if (phase !== "ready") return null;
  if ((placement === "top") === confirmed) return null;

  const choose = (course: CourseId, specId: string): void => engine.update(BOARDS_PATH, (cur) => withBoard(cur, course, specId));
  const confirm = (): void => engine.update(BOARDS_PATH, (cur) => ({ ...asBoards(cur), ...(cur && typeof cur === "object" ? cur : {}) }));

  return (
    <section id="boards" aria-labelledby="boards-title" className={cardClass(false, placement === "top" ? "mt-8 p-5" : "p-5")}>
      <h2 id="boards-title" className="font-heading text-lg font-semibold">
        {placement === "top" ? "Check your subjects and exam boards" : "Your subjects and exam boards"}
      </h2>
      <p className="mt-1 text-sm text-muted">
        Choose the exam board for each subject you take. You can change these any time; if you switch back, your earlier progress is still there.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {OFFERED.map((c) => {
          const id = `board-${c.id}`;
          return (
            <div key={c.id} className="flex flex-col gap-1">
              <label htmlFor={id} className="text-sm font-medium">
                {c.name}
              </label>
              <select
                id={id}
                value={chosenSpecId(doc, c.id)}
                onChange={(e) => choose(c.id, e.target.value)}
                className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
              >
                {c.specs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {specLabel(s)}
                  </option>
                ))}
                <option value={NOT_TAKING}>Not taking</option>
              </select>
            </div>
          );
        })}
      </div>
      {placement === "top" ? (
        <Button className="mt-4" onClick={confirm}>
          These are right
        </Button>
      ) : null}
    </section>
  );
}
