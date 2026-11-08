"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useState, type FormEvent } from "react";

import { api } from "@/client/api";
import { Button } from "@/ui/button";
import { Field, FormAlert } from "@/ui/field";

import { rememberEmail } from "./messages";

export interface CredentialsFormProps {
  mode: "sign-in" | "sign-up";
  next: string;
}

/** Email + password form for both sign-in and sign-up. Success goes to the code screen. */
export function CredentialsForm({ mode, next }: CredentialsFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const signUp = mode === "sign-up";
  const q = `?next=${encodeURIComponent(next)}`;

  const submit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await api<{ next: "verify" }>(`/api/auth/${mode}`, { body: { email, password } });
    if (res.ok) {
      rememberEmail(email);
      router.push(`/auth/verify${q}` as Route);
      return;
    }
    setError({ code: res.code, message: res.message });
    setBusy(false);
  };

  const passwordError = error && (error.code === "WEAK_PASSWORD" || error.code === "INVALID_CREDENTIALS") ? error.message : null;
  const emailError = error?.code === "INVALID_INPUT" && /email/i.test(error.message) ? error.message : null;
  const formError = error && !passwordError && !emailError ? error.message : null;

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {formError && <FormAlert>{formError}</FormAlert>}
      <Field
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={emailError}
      />
      <Field
        label="Password"
        type={show ? "text" : "password"}
        name="password"
        autoComplete={signUp ? "new-password" : "current-password"}
        required
        minLength={signUp ? 10 : undefined}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint={signUp ? "At least 10 characters. A short sentence is easy to remember and hard to guess." : undefined}
        error={passwordError}
        trailing={
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-pressed={show}
            className="rounded-md px-2 py-1 text-xs font-semibold text-muted hover:bg-subtle"
          >
            {show ? "Hide" : "Show"}
          </button>
        }
      />
      <Button type="submit" busy={busy} className="w-full">
        {signUp ? "Make my account" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted">
        {signUp ? "Already have an account? " : "New here? "}
        <Link
          href={(signUp ? `/auth/sign-in${q}` : `/auth/sign-up${q}`) as Route}
          className="font-semibold text-accent-text hover:underline"
        >
          {signUp ? "Sign in" : "Make an account"}
        </Link>
      </p>
    </form>
  );
}
