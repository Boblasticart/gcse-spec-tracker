import type { HTMLAttributes } from "react";

import { cn } from "./cn";

/** Card surface. Interactive cards lift slightly on hover (not with reduced motion). */
export function cardClass(interactive = false, extra?: string): string {
  return cn(
    "rounded-2xl border border-line bg-surface shadow-card",
    interactive &&
      "transition duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift motion-reduce:transition-none motion-reduce:hover:translate-y-0",
    extra,
  );
}

export function Card({ className, interactive = false, ...props }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return <div className={cardClass(interactive, className)} {...props} />;
}
