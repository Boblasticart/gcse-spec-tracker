"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/client/api";
import { useSession } from "@/client/session";

import { Button, ButtonLink } from "./button";
import { SyncStatus } from "./sync-status";

export function SiteHeader() {
  const { user, setUser } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const signOut = async (): Promise<void> => {
    setBusy(true);
    await api("/api/auth/sign-out", { method: "POST" });
    setUser(null);
    setBusy(false);
    router.replace("/");
    router.refresh();
  };

  return (
    <header className="border-b border-stone-200 bg-white/80 backdrop-blur dark:border-stone-800 dark:bg-stone-950/80">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <Link href="/" className="font-heading text-lg font-bold tracking-tight">
          GCSE Spec Tracker
        </Link>
        <nav aria-label="Main" className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <SyncStatus />
              <Link href="/dashboard" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-stone-100 dark:hover:bg-stone-800">
                Dashboard
              </Link>
              <span className="hidden text-sm text-stone-500 sm:inline" data-testid="signed-in-as">
                {user.email}
              </span>
              <Button variant="ghost" onClick={signOut} busy={busy}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link href="/auth/sign-in" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-stone-100 dark:hover:bg-stone-800">
                Sign in
              </Link>
              <ButtonLink href="/auth/sign-up">Make an account</ButtonLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
