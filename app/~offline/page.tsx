import type { Metadata } from "next";

import { ButtonLink } from "@/ui/button";

export const metadata: Metadata = { title: "You're offline" };

/** Shown by the service worker for pages this device hasn't opened before while offline. */
export default function OfflinePage() {
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="font-heading text-3xl font-bold tracking-tight">You&apos;re offline</h1>
      <p className="mt-3 text-muted">
        This page hasn&apos;t been saved on this device yet. Pages you&apos;ve opened before still work, and anything you tick is saved here and sent to
        your account when you&apos;re back online.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <ButtonLink href="/dashboard">Go to my dashboard</ButtonLink>
        <ButtonLink href="/" variant="secondary">
          Home
        </ButtonLink>
      </div>
    </main>
  );
}
