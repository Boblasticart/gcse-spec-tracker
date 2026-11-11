import type { Metadata } from "next";

import { ButtonLink } from "@/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-16 text-center">
      <p className="text-sm font-semibold text-accent-text">404</p>
      <h1 className="mt-1 font-heading text-3xl font-bold tracking-tight">We can&apos;t find that page</h1>
      <p className="mt-3 text-muted">The link may be old, or the page may have moved. Your progress is safe.</p>
      <div className="mt-6 flex justify-center gap-2">
        <ButtonLink href="/">Home</ButtonLink>
        <ButtonLink href="/dashboard" variant="secondary">
          My dashboard
        </ButtonLink>
      </div>
    </main>
  );
}
