import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Route } from "next";

import { getCurrentUser, safeNext } from "@/server/auth/current";
import { CredentialsForm } from "@/features/auth/credentials-form";

export const metadata: Metadata = { title: "Make an account" };

export default async function SignUpPage({ searchParams }: PageProps<"/auth/sign-up">) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next as Route);
  return (
    <>
      <h1 className="mb-1 font-heading text-2xl font-bold">Make an account</h1>
      <p className="mb-6 text-muted">Save your progress and pick up on any device.</p>
      <CredentialsForm mode="sign-up" next={next} />
    </>
  );
}
