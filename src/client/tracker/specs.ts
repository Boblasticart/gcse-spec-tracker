"use client";

import { useMemo } from "react";

import { useDoc } from "@/client/sync/react";
import { BOARDS_PATH, chosenSpecs, type Spec } from "@/content";

/** The specs this student studies (signed out, or never chosen: the default eight). */
export function useChosenSpecs(): Spec[] {
  const boards = useDoc(BOARDS_PATH);
  return useMemo(() => chosenSpecs(boards), [boards]);
}
