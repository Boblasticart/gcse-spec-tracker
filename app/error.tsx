"use client";

import { useEffect } from "react";

import { Button, ButtonLink } from "@/ui/button";

/** Shown when a page hits an unexpected error. Saved progress is never lost: unsaved changes wait on this device. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="font-heading text-3xl font-bold tracking-tight">Something went wrong</h1>
      <p className="mt-3 text-muted">
        Sorry, this page hit a problem. Anything you ticked is kept on this device and will be saved. Try again, or go back to your dashboard.
      </p>
      {error.digest ? <p className="mt-2 text-xs text-muted">Reference: {error.digest}</p> : null}
      <div className="mt-6 flex justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/dashboard" variant="secondary">
          My dashboard
        </ButtonLink>
      </div>
    </main>
  );
}
