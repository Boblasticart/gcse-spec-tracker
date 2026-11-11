import { describe, expect, it } from "vitest";

import { normNote } from "@/lib/notes/normalize";
import { layoutPoem } from "@/lib/notes/poem";

const poem = (pd: boolean) =>
  normNote({
    poem: {
      title: "T",
      poet: "P",
      pd,
      stanzas: [
        { label: "One", lines: ["the cat sat on the mat", "", "a", "b", "c"], notes: [{ w: "the", n: "first", k: "struct" }, { w: "the", n: "second" }, { w: "missing", n: "x", k: "nope" }] },
        { label: "Two", lines: ["sixth line"], gist: "g", notes: [{ w: "line", n: "y", k: "ctx" }] },
      ],
    },
  }).poem!;

describe("legacy poemHtml layout", () => {
  it("numbers notes across stanzas and places each on a free occurrence", () => {
    const [s1, s2] = layoutPoem(poem(true));
    expect(s1!.notes.map((n) => [n.num, n.k])).toEqual([
      [1, "struct"],
      [2, "lang"],
      [3, "lang"],
    ]);
    expect(s1!.lines![0]!.segments).toEqual([
      { text: "the", num: 1, k: "struct" },
      { text: " cat sat on " },
      { text: "the", num: 2, k: "lang" },
      { text: " mat" },
    ]);
    expect(s1!.lines![1]!.segments).toEqual([]);
    expect(s2!.notes[0]!.num).toBe(4);
  });

  it("prints the first line number and every fifth", () => {
    const [s1, s2] = layoutPoem(poem(true));
    expect(s1!.lines!.map((l) => l.no)).toEqual([1, null, null, null, 5]);
    expect(s2!.lines!.map((l) => l.no)).toEqual([null]);
  });

  it("shows the gist instead of the lines when the poem is not public domain", () => {
    const [s1, s2] = layoutPoem(poem(false));
    expect(s1!.lines).toBeNull();
    expect(s2!.gist).toBe("g");
    expect(s1!.notes).toHaveLength(3);
  });
});
