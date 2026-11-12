"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/client/api";
import { useSession } from "@/client/session";
import { useEngine } from "@/client/sync/react";
import { useToast } from "./toast";

import { Button, ButtonLink, buttonClass } from "./button";
import { SyncStatus } from "./sync-status";
import { ThemeToggle } from "@/client/theme/theme-toggle";

export function SiteHeader() {
  const { user, setUser } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const engine = useEngine();

  const signOut = async (): Promise<void> => {
    setBusy(true);
    // Send anything still waiting before this device forgets the account's data.
    await engine.flush();
    await api("/api/auth/sign-out", { method: "POST" });
    setUser(null);
    setBusy(false);
    toast("You're signed out. See you soon!", "success");
    router.replace("/");
    router.refresh();
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const close = (): void => setMenuOpen(false);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 sm:gap-4">
        <Link href="/" onClick={close} className="min-w-0 truncate font-heading text-base font-bold tracking-tight sm:text-lg">
          GCSE Spec Tracker
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {user ? <SyncStatus /> : null}
          {/* Wider screens: everything in one row. */}
          <nav aria-label="Main" className="hidden items-center gap-2 sm:flex">
            <ThemeToggle className="mr-1" />
            {user ? (
              <>
                <Link href="/dashboard" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-subtle">
                  Dashboard
                </Link>
                <span className="hidden max-w-56 truncate text-sm text-muted lg:inline" data-testid="signed-in-as">
                  {user.email}
                </span>
                <Button variant="ghost" onClick={signOut} busy={busy}>
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Link href="/auth/sign-in" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-subtle">
                  Sign in
                </Link>
                <ButtonLink href="/auth/sign-up">Make an account</ButtonLink>
              </>
            )}
          </nav>
          {/* Phones: a menu button. */}
          <button
            type="button"
            className="grid size-10 place-items-center rounded-lg border border-line bg-surface sm:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      {menuOpen ? (
        <nav id="mobile-menu" aria-label="Menu" className="border-t border-line bg-bg px-4 py-3 sm:hidden">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted">Theme</span>
            <ThemeToggle />
          </div>
          {user ? (
            <div className="mt-3 grid gap-2">
              <p className="truncate text-sm text-muted">{user.email}</p>
              <Link href="/dashboard" onClick={close} className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm font-medium">
                Dashboard
              </Link>
              <Button
                variant="secondary"
                className="justify-start"
                busy={busy}
                onClick={() => {
                  close();
                  void signOut();
                }}
              >
                Sign out
              </Button>
            </div>
          ) : (
            <div className="mt-3 grid gap-2">
              <Link href="/auth/sign-in" onClick={close} className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm font-medium">
                Sign in
              </Link>
              <Link href="/auth/sign-up" onClick={close} className={buttonClass("primary")}>
                Make an account
              </Link>
            </div>
          )}
        </nav>
      ) : null}
    </header>
  );
}
