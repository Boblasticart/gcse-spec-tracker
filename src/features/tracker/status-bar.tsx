import { cn } from "@/ui/cn";

/**
 * Legacy `bar`: a done / needs-work bar from [not done, needs work, done]
 * counts. Widths animate when the counts change (not with reduced motion).
 */
export function StatusBar({ counts, mini = false, className }: { counts: readonly [number, number, number]; mini?: boolean; className?: string }) {
  const total = counts[0] + counts[1] + counts[2] || 1;
  const done = (100 * counts[2]) / total;
  const work = (100 * counts[1]) / total;
  return (
    <span
      aria-hidden
      data-done={counts[2]}
      data-work={counts[1]}
      className={cn("flex w-full overflow-hidden rounded-full bg-subtle", mini ? "h-1.5" : "h-2.5", className)}
    >
      <span className="block h-full bg-done transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${done}%` }} />
      <span className="block h-full bg-work transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${work}%` }} />
    </span>
  );
}
