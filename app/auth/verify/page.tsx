import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Route } from "next";

import { getCurrentAuth, hasSessionCookie, safeNext } from "@/server/auth/current";
import { VerifyForm } from "@/features/auth/verify-form";

export const metadata: Metadata = { title: "Enter your code" };

export default async function VerifyPage({ searchParams }: PageProps<"/auth/verify">) {
  const next = safeNext((await searchParams).next);
  if (!(await hasSessionCookie())) redirect(`/auth/sign-in?next=${encodeURIComponent(next)}` as Route);
  const auth = await getCurrentAuth();
  if (auth.kind === "active") redirect(next as Route);
  const initialError =
    auth.kind === "expired" ? { code: "SESSION_EXPIRED", message: "This sign-in timed out. Please sign in again." } : null;
  return (
    <>
      <h1 className="mb-3 font-heading text-2xl font-bold">Check your email</h1>
      <VerifyForm next={next} initialError={initialError} />
    </>
  );
}
