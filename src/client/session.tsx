"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { api } from "./api";

export interface SessionUser {
  id: string;
  email: string;
}

interface SessionValue {
  user: SessionUser | null;
  setUser: (u: SessionUser | null) => void;
  /** Re-reads the session from the server (and extends it). */
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ initialUser, children }: { initialUser: SessionUser | null; children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(initialUser);

  const refresh = useCallback(async () => {
    const res = await api<{ user: SessionUser | null }>("/api/auth/me");
    if (res.ok) setUser(res.user);
  }, []);

  // Pages can be served from cache, so check once on load. This also slides the cookie.
  useEffect(() => {
    if (!initialUser) return;
    let live = true;
    void api<{ user: SessionUser | null }>("/api/auth/me").then((res) => {
      if (live && res.ok) setUser(res.user);
    });
    return () => {
      live = false;
    };
  }, [initialUser]);

  const value = useMemo(() => ({ user, setUser, refresh }), [user, refresh]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession must be used inside <SessionProvider>");
  return v;
}
