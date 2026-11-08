"use client";

import { motion } from "motion/react";

import { useSignInPrompt } from "@/client/sign-in-prompt";
import { useSession } from "@/client/session";
import { useDoc, useDocs, useEngine } from "@/client/sync/react";
import { STATUS_LABELS, statusOf, withStatus, type PointStatus } from "@/client/tracker/progress";
import { cn } from "@/ui/cn";

const FILL = ["bg-todo", "bg-work", "bg-done"] as const;
const ON_FILL = ["text-on-todo", "text-on-fill", "text-on-fill"] as const;

/** The legacy 3-way status control (Not done / Needs work / Done) for one spec point, with a springy highlight. */
export function PointStatusControl({ sid, pid, label }: { sid: string; pid: string; label: string }) {
  const { user } = useSession();
  const prompt = useSignInPrompt();
  const engine = useEngine();
  const path = `progress/${sid}`;
  const progress = useDoc(path);
  const ready = useDocs((s) => s.phase === "ready");
  const current = user ? statusOf(progress, pid) : null;

  const choose = (status: PointStatus): void => {
    if (!user) {
      prompt("to track your progress");
      return;
    }
    if (status !== current) engine.update(path, (doc) => withStatus(doc, pid, status));
  };

  return (
    <div
      role="group"
      aria-label={`Status of ${label}`}
      className="inline-flex shrink-0 gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5 text-xs font-semibold"
    >
      {STATUS_LABELS.map((text, i) => {
        const pressed = current === i;
        return (
          <button
            key={text}
            type="button"
            aria-pressed={pressed}
            disabled={!!user && !ready}
            onClick={() => choose(i as PointStatus)}
            className={cn(
              "relative rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-50 active:scale-95 motion-reduce:active:scale-100",
              pressed ? ON_FILL[i] : "text-muted hover:bg-subtle hover:text-fg",
            )}
          >
            {pressed && (
              <motion.span
                layoutId={`status-${pid}`}
                aria-hidden
                className={cn("absolute inset-0 rounded-md shadow-sm", FILL[i])}
                transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.7 }}
              />
            )}
            <span className="relative">{text}</span>
          </button>
        );
      })}
    </div>
  );
}
