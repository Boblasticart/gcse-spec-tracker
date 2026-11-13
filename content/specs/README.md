# Spec catalogue

One file per spec: `{id}.json` in the `RawSpec` shape (`src/content/types.ts`).
Points are read from the board's official specification document; put its URL in `source`.
After adding or removing a file, run `node scripts/build-catalogue.mjs` (CI checks it).
Point ids come from position (`{id}.{topic}.{point}`, topics numbered across papers), so
never reorder or delete points once students may have progress on them: append instead.
