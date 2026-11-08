"use client";

import { useEffect, useSyncExternalStore } from "react";

import { cn } from "@/ui/cn";

import { THEME_KEY, type ThemeChoice } from "./script";

const CHOICES: { value: ThemeChoice; label: string; icon: string }[] = [
  { value: "system", label: "System", icon: "M3 5h18v11H3zM8 20h8M12 16v4" },
  { value: "light", label: "Light", icon: "M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14-1.41-1.41M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z" },
  { value: "dark", label: "Dark", icon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" },
];

const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((l) => l());

function readChoice(): ThemeChoice {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "light" || t === "dark" ? t : "system";
}

function apply(choice: ThemeChoice): void {
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.setAttribute("data-theme", choice);
  emit();
}

export function setTheme(choice: ThemeChoice): void {
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  apply(choice);
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** System / Light / Dark. "System" follows the device setting live. */
export function ThemeToggle({ className }: { className?: string }) {
  const choice = useSyncExternalStore(subscribe, readChoice, () => "system" as ThemeChoice);

  useEffect(() => {
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (): void => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn("inline-flex rounded-lg border border-line bg-surface-2 p-0.5", className)}
      onKeyDown={(e) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
        e.preventDefault();
        const step = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
        const i = CHOICES.findIndex((c) => c.value === choice);
        const nextChoice = CHOICES[(i + step + CHOICES.length) % CHOICES.length];
        if (!nextChoice) return;
        setTheme(nextChoice.value);
        e.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${nextChoice.value}"]`)?.focus();
      }}
    >
      {CHOICES.map((c) => (
        <button
          key={c.value}
          type="button"
          role="radio"
          data-value={c.value}
          tabIndex={choice === c.value ? 0 : -1}
          aria-checked={choice === c.value}
          aria-label={c.label}
          title={c.label}
          onClick={() => setTheme(c.value)}
          className={cn(
            "grid size-7 place-items-center rounded-md transition-colors",
            choice === c.value ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg",
          )}
        >
          <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d={c.icon} />
          </svg>
        </button>
      ))}
    </div>
  );
}
