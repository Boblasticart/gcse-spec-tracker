"use client";

import { animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

import { cn } from "./cn";

/**
 * Hand-written animated SVG charts (no chart library). Everything animates
 * from its last value to the new one, and jumps straight there when the
 * device asks for reduced motion.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

/** A progress ring: `value` is 0 to 100. */
export function Ring({
  value,
  size = 96,
  stroke = 10,
  label,
  className,
  tone = "done",
}: {
  value: number;
  size?: number;
  stroke?: number;
  label: string;
  className?: string;
  tone?: "done" | "accent";
}) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className={cn("shrink-0", className)} data-value={v}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={tone === "done" ? "var(--done)" : "var(--accent)"}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - v / 100) }}
        transition={reduce ? { duration: 0 } : { duration: 0.9, ease: EASE }}
        data-ring-arc
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-fg font-heading text-[1.1rem] font-bold" aria-hidden>
        {Math.round(v)}%
      </text>
    </svg>
  );
}

/** A number that counts from its previous value to the new one. */
export function Counter({ value, format = (n) => String(Math.round(n)), className, testId }: { value: number; format?: (n: number) => string; className?: string; testId?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const start = from.current;
    from.current = value;
    if (reduce || start === value) {
      el.textContent = format(value);
      return;
    }
    const controls = animate(start, value, { duration: 0.7, ease: EASE, onUpdate: (n) => (el.textContent = format(n)) });
    return () => controls.stop();
  }, [value, reduce, format]);
  return (
    <span ref={ref} className={cn("tabular-nums", className)} data-value={value} data-testid={testId}>
      {format(value)}
    </span>
  );
}

/** Done / needs work / not done as one stacked bar, animating its segments. */
export function StackedBar({ counts, label }: { counts: readonly [number, number, number]; label: string }) {
  const reduce = useReducedMotion();
  const total = counts[0] + counts[1] + counts[2] || 1;
  const w = (n: number): string => `${(100 * n) / total}%`;
  const transition = reduce ? { duration: 0 } : { duration: 0.8, ease: EASE };
  return (
    <div role="img" aria-label={label} className="flex h-3 w-full overflow-hidden rounded-full bg-subtle" data-done={counts[2]} data-work={counts[1]}>
      <motion.span className="block h-full bg-done" initial={{ width: 0 }} animate={{ width: w(counts[2]) }} transition={transition} />
      <motion.span className="block h-full bg-work" initial={{ width: 0 }} animate={{ width: w(counts[1]) }} transition={transition} />
    </div>
  );
}
