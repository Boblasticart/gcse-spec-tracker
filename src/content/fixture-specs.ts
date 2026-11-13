/**
 * Made-up specs used only by the tests (CI sets NEXT_PUBLIC_SPEC_FIXTURES=1).
 * They are never built into the preview or live site.
 */
import type { RawSpec } from "./types";

export const FIXTURE_SPECS: readonly RawSpec[] = [
  {
    id: "phy_fixture",
    course: "physics",
    name: "Physics",
    board: "Testboard",
    code: "TB100",
    papers: [
      {
        name: "Paper 1",
        topics: [
          { name: "Fixture topic: Waves", points: ["Wave speed equation", "Transverse and longitudinal waves"] },
          { name: "Fixture topic: Magnets", points: ["Magnetic fields"] },
        ],
      },
    ],
  },
  {
    id: "fr_fixture",
    course: "french",
    name: "French",
    board: "Testboard",
    code: "TB200",
    tier: "Higher",
    papers: [{ name: "Paper 1", topics: [{ name: "Fixture topic: Identity", points: ["Family and friends"] }] }],
  },
];
