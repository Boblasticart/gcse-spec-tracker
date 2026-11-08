"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { SignInSheet } from "@/ui/sign-in-sheet";

type Prompt = (reason?: string) => void;

const PromptContext = createContext<Prompt | null>(null);

/** One shared "sign in to ..." sheet for the whole app. */
export function SignInPromptProvider({ children }: { children: ReactNode }) {
  const [reason, setReason] = useState<string | null>(null);
  const prompt = useCallback<Prompt>((r) => setReason(r ?? "to save your progress"), []);
  const value = useMemo(() => prompt, [prompt]);
  return (
    <PromptContext.Provider value={value}>
      {children}
      <SignInSheet open={reason !== null} onClose={() => setReason(null)} reason={reason ?? undefined} />
    </PromptContext.Provider>
  );
}

export function useSignInPrompt(): Prompt {
  const p = useContext(PromptContext);
  if (!p) throw new Error("useSignInPrompt must be used inside <SignInPromptProvider>");
  return p;
}
