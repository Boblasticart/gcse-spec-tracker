import { headers } from "next/headers";
import type { ReactNode } from "react";

import { requirePageUser } from "@/server/auth/current";

/** Every page in this group needs a fully signed-in (verified) student. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const path = (await headers()).get("x-gst-path") ?? "/dashboard";
  await requirePageUser(path);
  return <>{children}</>;
}
