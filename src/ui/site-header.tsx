"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/client/api";
import { useSession } from "@/client/session";
import { useToast } from "./toast";

import { Button, ButtonLink } from "./button";
import { SyncStatus } from "./sync-status";
import { ThemeToggle } from "@/client/theme/theme-toggle";

export function SiteHeader() {
  const { user, setUser } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const signOut = async (): Promise<void> => {
    setBusy(true);
    await api("/api/auth/sign-out", { method: "POST" });
    setUser(null);
    setBusy(false);
    toast("You're signed out. See you soon!", "success");
    router.replace("/");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <Link href="/" className="font-heading text-lg font-bold tracking-tight">
          GCSE Spec Tracker
        </Link>
        <nav aria-label="Main" className="ml-auto flex items-center gap-2">
          <ThemeToggle className="mr-1" />
          {user ? (
            <>
              <SyncStatus />
              <Link href="/dashboard" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-subtle">
                Dashboard
              </Link>
              <span className="hidden text-sm text-muted sm:inline" data-testid="signed-in-as">
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
      </div>
    </header>
  );
}
