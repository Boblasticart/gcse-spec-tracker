"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

import { cn } from "./cn";

export const OTP_LENGTH = 6;

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called once all six digits are filled in. */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  describedBy?: string;
}

const digitsOnly = (s: string): string => s.replace(/\D/g, "");

/**
 * Six boxes for a 6-digit code. Typing moves forward, Backspace moves back
 * across boxes, pasting (or phone autofill via `one-time-code`) fills them all.
 */
export function OtpInput({ value, onChange, onComplete, disabled, invalid, autoFocus, describedBy }: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? "");

  const focus = (i: number): void => {
    const el = refs.current[Math.max(0, Math.min(OTP_LENGTH - 1, i))];
    el?.focus();
    el?.select();
  };

  const commit = (next: string, focusIndex: number): void => {
    const clean = digitsOnly(next).slice(0, OTP_LENGTH);
    onChange(clean);
    focus(focusIndex);
    if (clean.length === OTP_LENGTH) onComplete?.(clean);
  };

  /** Writes `typed` starting at box `i` (or the first empty box, as the code has no gaps). */
  const writeAt = (i: number, typed: string): void => {
    const incoming = digitsOnly(typed);
    if (!incoming) return;
    const start = Math.min(i, value.length);
    const merged = (value.slice(0, start) + incoming + value.slice(start + incoming.length)).slice(0, OTP_LENGTH);
    commit(merged, Math.min(start + incoming.length, OTP_LENGTH - 1));
  };

  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[i]) {
        commit(value.slice(0, i) + value.slice(i + 1), i);
      } else if (i > 0) {
        commit(value.slice(0, i - 1) + value.slice(i), i - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focus(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focus(i + 1);
    }
  };

  const onPaste = (i: number) => (e: ClipboardEvent<HTMLInputElement>) => {
    const text = digitsOnly(e.clipboardData.getData("text"));
    if (!text) return;
    e.preventDefault();
    // A whole code always fills from the first box.
    if (text.length >= OTP_LENGTH) commit(text, OTP_LENGTH - 1);
    else writeAt(i, text);
  };

  return (
    <div role="group" aria-label="6-digit code" aria-describedby={describedBy} className="flex justify-between gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          onChange={(e) => {
            const v = e.target.value;
            // Autofill or a typed digit replacing the current one.
            const fresh = v.length > 1 && d && v.startsWith(d) ? v.slice(1) : v;
            if (digitsOnly(fresh).length >= OTP_LENGTH) commit(fresh, OTP_LENGTH - 1);
            else writeAt(i, fresh);
          }}
          onKeyDown={onKeyDown(i)}
          onPaste={onPaste(i)}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          autoFocus={autoFocus && i === 0}
          disabled={disabled}
          aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
          aria-invalid={invalid || undefined}
          className={cn(
            "h-14 w-full min-w-0 rounded-xl border bg-white text-center font-heading text-2xl font-semibold shadow-sm transition outline-none",
            "focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 disabled:opacity-60 dark:bg-stone-900",
            "motion-reduce:transition-none",
            invalid ? "border-rose-500" : d ? "border-indigo-400 dark:border-indigo-500" : "border-stone-300 dark:border-stone-700",
          )}
        />
      ))}
    </div>
  );
}
