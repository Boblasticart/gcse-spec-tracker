"use client";

import { useState, type ReactNode } from "react";

import { useSession } from "@/client/session";

import { SignInSheet } from "./sign-in-sheet";

/**
 * Wraps interactive parts of public pages. Signed-in students use them as
 * normal; for everyone else, any click inside opens the sign-in sheet instead.
 */
export function Gate({ children, reason }: { children: ReactNode; reason?: string }) {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  if (user) return <>{children}</>;
  return (
    <>
      <div
        data-gated=""
        onClickCapture={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {children}
      </div>
      <SignInSheet open={open} onClose={() => setOpen(false)} reason={reason} />
    </>
  );
}
