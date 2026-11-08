"use client";

import { usePathname } from "next/navigation";
import type { Route } from "next";
import { useEffect, useRef } from "react";

import { ButtonLink } from "./button";

export interface SignInSheetProps {
  open: boolean;
  onClose: () => void;
  /** Short reason shown in the sheet, e.g. "to save your progress". */
  reason?: string;
}

/** A modal asking a signed-out visitor to sign in or make an account, then come back here. */
export function SignInSheet({ open, onClose, reason = "to save your progress" }: SignInSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const next = encodeURIComponent(pathname || "/");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="sign-in-sheet-title"
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-2xl border border-stone-200 bg-white p-0 text-stone-900 shadow-2xl backdrop:bg-stone-950/40 backdrop:backdrop-blur-sm dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100"
    >
      <div className="space-y-4 p-6">
        <h2 id="sign-in-sheet-title" className="font-heading text-xl font-semibold">
          Sign in {reason}
        </h2>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          You can look around without an account. Sign in to tick off spec points, answer questions and keep your
          progress on every device.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <ButtonLink href={`/auth/sign-in?next=${next}` as Route} className="flex-1">
            Sign in
          </ButtonLink>
          <ButtonLink href={`/auth/sign-up?next=${next}` as Route} variant="secondary" className="flex-1">
            Make an account
          </ButtonLink>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg py-2 text-sm text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
        >
          Not now
        </button>
      </div>
    </dialog>
  );
}
