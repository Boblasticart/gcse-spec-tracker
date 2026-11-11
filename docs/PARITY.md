# Feature parity checklist

Every feature of the legacy tracker (`index.html`) that the rebuild must keep. It is built from the
`data-act` click actions, the views and the AI prompts that `scripts/extract-legacy.ts` finds
(see `src/content/legacy-map.ts` and `src/content/prompts.ts` for the exact legacy source and line
numbers). A unit test (`tests/unit/parity.test.ts`) fails if a legacy action, view or prompt is
missing from this file.

Tick an item only when the rebuild has it **and** an e2e test covers it. The milestone column says
where it is planned (see `PLAN.md`, section 5).

## Views

| Done | View | Legacy renderer | What it shows | Milestone |
| --- | --- | --- | --- | --- |
| [x] | view `spec` | `renderSpec` | Papers, then topics, then spec points with the 3-way status control, filters and expand all | M6 |
| [x] | view `improve` | `renderImprove` | Points marked *needs work*, spaced-review questions and "mastered or keep practising?" | M6 |
| [x] | view `today` | `renderToday` | Today's 7 exam-style questions, typed answers, marks, review weaknesses | M7 |
| [x] | view `papers` | `renderPapers` | Practice paper PDFs for the subject, open and mark as done | M6 |
| [x] | view `note` | `renderNote` | Notes reader for one spec point, prev/next, "Back" | M6 |
| [x] | view `quiz` | `renderQuiz` | 10-question topic quiz, submit, results, retake, new quiz | M7 |

## Click actions (`data-act`)

| Done | Action | What it does in the legacy tracker | Milestone |
| --- | --- | --- | --- |
| [x] | `tab` | Switch subject tab (remembered in `gcse-spec-tab`); leaves the note/quiz reader for Spec | M5 |
| [x] | `view` | Switch between Spec, Improvement, Today's 7 and Practice papers (with counts in the chips) | M5 |
| [x] | `filter` | Filter spec points: All, Not done, Needs work, Done | M6 |
| [x] | `exp` | Expand all / collapse all topics | M6 |
| [x] | `top` | Open or close one topic | M6 |
| [x] | `st` | Set one point to Not done / Needs work / Done (Not done deletes it from `s` and `c`) | M6 |
| [x] | `all` | Set every point in a topic to one status (bulk) | M6 |
| [x] | `note` | Open the notes reader for a point (remembers where you came from and the scroll position); marks the note read | M6 |
| [x] | `back` | Leave the reader, back to Spec or Improvement at the old scroll position | M6 |
| [x] | `wnote` | Write a note with AI when there is no prepared note (or retry after an error) | M7 |
| [x] | `pdone` | Mark a practice paper as done (date saved) or not done | M6 |
| [x] | `master` | After three correct in a row: class the point as mastered (status Done, label saved) | M6 |
| [x] | `more` | After three correct in a row: keep practising (review again tomorrow) | M6 |
| [x] | `gen` | Generate today's 7 questions for the subject | M7 |
| [x] | `more7` | Add 7 more questions on weak topics | M7 |
| [x] | `submit` | Mark a typed answer against the mark scheme with AI | M7 |
| [x] | `retry` | Try a marked question again | M7 |
| [x] | `cancel` | Cancel a retry | M7 |
| [x] | `review` | Open/close "Review weaknesses" for today's marked answers (AI explanations) | M7 |
| [x] | `dec` | In the review: decide a point is Done, or Needs work (review again tomorrow) | M7 |
| [x] | `quiz` | Open the topic quiz (generated with AI the first time) | M7 |
| [x] | `newquiz` | Throw away the quiz and write a new one | M7 |
| [x] | `submitquiz` | Mark all quiz answers with AI and save the result | M7 |
| [x] | `retake` | Retake the same quiz | M7 |
| [x] | `perm` | claude.ai-only "Change permissions" button. In the rebuild this becomes "Sign in" / a friendly error, because AI runs on our server | M7 |

## AI prompts (ported unchanged in M4)

| Done | Prompt id | Legacy function | Used by |
| --- | --- | --- | --- |
| [x] | `todaysSeven` | `genToday` | `gen`, `more7` (weak topics first; mastered topics when there are none) |
| [x] | `markAnswer` | `markAnswer` | `submit` |
| [x] | `reviewWeaknesses` | `genReview` | `review` |
| [x] | `writeNote` | `genNote` | `wnote`, opening a point with no prepared note |
| [x] | `writeQuiz` | `genQuiz` | `quiz`, `newquiz` |
| [x] | `markQuiz` | `submitQuiz` | `submitquiz` |

## Data and behaviour that is not a button

| Done | Feature | Milestone |
| --- | --- | --- |
| [x] | `progress/{sid}` documents `{s,c,m,w,v:2}` saved per subject, debounced | M3 |
| [x] | Spaced review: `m[pid] = {b,n,c,l,d,p}`, pass at 70%, intervals `REVIEW_INTERVALS` (1, 2, 4, 8, 16, 32 days) | M3/M7 |
| [x] | Questions `q/*`, answers `a/*`, daily sets `daily/*`, reviews `rv/*`, quizzes `quiz/*`, quiz results `qr/*`, AI notes `notes/*` | M3 |
| [ ] | `data/updates.json` applied once per account (`meta/applied`) | M3 |
| [x] | Prepared notes from `data/notes/{pid}.json` and the question bank `data/questions.json` | M6/M7 |
| [x] | Note renderer: bold markup, poems with annotation keys (`POEM_MARK_KEYS`), SVG images cleaned with `SVG_TAGS`, `SVG_ATTRS` and `SAFE_PAINT` | M6 |
| [x] | Practice papers done list (legacy `gcse-papers-v1` in localStorage) moves into the account | M6 |
| [x] | Status line: "Saved to your account" / "Saved on this device only" | M9 |
| [ ] | Old export file (`gcse-spec-tracker-export` v1) import and export | M3 |
| n/a | Legacy local data (`gcse-spec-tracker-v2`, `-v1`): the new site has a different web address, so the browser can't share it. Students use the old tracker's Back up button and Import the file instead | M3 |
