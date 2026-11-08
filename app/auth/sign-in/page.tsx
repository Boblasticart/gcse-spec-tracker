import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Route } from "next";

import { getCurrentUser, safeNext } from "@/server/auth/current";
import { CredentialsForm } from "@/features/auth/credentials-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/auth/sign-in">) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next as Route);
  return (
    <>
      <h1 className="mb-1 font-heading text-2xl font-bold">Sign in</h1>
      <p className="mb-6 text-stone-600 dark:text-stone-400">Welcome back. We&apos;ll email you a code to finish.</p>
      <CredentialsForm mode="sign-in" next={next} />
    </>
  );
}
