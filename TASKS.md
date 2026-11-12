# Job queue for the nightly "GCSE tracker rebuild" runs

Runs read **only this file and `docs/CONTEXT.md`**. Keep this file short: finished jobs are removed from here and logged in one line in `docs/DONE.md`, which runs never need to read.

## Status

```
RUN LOCK:       none
CURRENT JOB:    none
CURRENT STEPS:  none
LAST RUN ENDED: 2026-11-12 (new queue J1 to J14 added by the owner)
```

## Queue (top = next)

**The big goal.** The same kind of notes as the existing ones (summary, core sections, terms, mistakes, exam questions, worked examples, diagrams) for every spec point of the 15 most-entered GCSE subjects, for each board that offers them (AQA, Edexcel, OCR, Eduqas). Owner's choices on 2026-11-12:

- Gemini writes the notes in bulk in GitHub Actions; Claude builds the pipeline and the checks and fixes failures.
- Most popular subject first.
- PE replaces Art & Design.
- Combined Science reuses the separate-science notes, with triple-only parts marked.
- **Skip what already has notes:** AQA Biology 8461, AQA Chemistry 8462, AQA Physics 8463, AQA Geography 8035, Edexcel Maths 1MA1, Edexcel English Literature 1ET0, OCR Computer Science J277. Never rewrite or move those notes.

The spec codes below are a starting list. Check each against the board's own website, and record withdrawn or renamed specs here. Spec-point lists come from the official specification documents, read with WebFetch.

1. **J1 Choose your board, and many specs.**
   - Students pick a board (and tier, where there is one) for each subject in Settings and at sign-up. Existing accounts keep their current boards.
   - Add a spec catalogue (subject, board, code, papers, topics, points) that holds 60+ specs. Existing point ids such as `phy.0.1` stay valid.
   - Choose note storage that scales to about 7,000 notes (about 300 MB) without going into the Vercel server bundle, e.g. per-spec static JSON or a Postgres notes table. Record the decision in docs/CONTEXT.md.
   - Done when: e2e switches a subject's board and sees that spec's topics, existing progress is untouched, and CI is green.
2. **J2 Note-writing pipeline.**
   - A GitHub Actions workflow (manual + scheduled) uses the `GEMINI_API_KEY` repository secret to write notes for queued spec points in the exact existing note format.
   - It must stay within Gemini's rate limits, resume where it stopped, and log progress in a committed progress file.
   - Every note must pass a QA gate before it is committed: schema and size checks, the existing SVG sanitiser, a Playwright render check for overlapping or cut-off labels, and enough depth (diagrams expected for science/maths/CS/geography/PE; fewer for English, languages, history and RS).
   - Failures go on a list that Claude fixes in later runs.
   - Done when: a 10-note test batch passes QA and shows on the preview.
3. **J3 Maths:** AQA 8300, OCR J560, Eduqas (Higher and Foundation where the spec has tiers).
4. **J4 English Language:** AQA 8700, Edexcel 1EN0, OCR J351, Eduqas.
5. **J5 English Literature:** AQA 8702, OCR J352, Eduqas.
6. **J6 Sciences** (Combined, Biology, Chemistry, Physics):
   - Separate sciences: Edexcel 1BI0/1CH0/1PH0, OCR Gateway A J247/J248/J249, OCR Twenty First Century B J257/J258/J259, Eduqas.
   - Combined Science: AQA Trilogy 8464 and Synergy 8465 (reuse AQA notes), Edexcel 1SC0, OCR Gateway A J250, OCR Twenty First Century B J260, Eduqas. These reuse the same board's separate-science notes, with triple-only content marked.
7. **J7 History:** AQA 8145, Edexcel 1HI0, OCR A J410, OCR B J411, Eduqas.
8. **J8 Geography:** Edexcel A 1GA0, Edexcel B 1GB0, OCR A J383, OCR B J384, Eduqas A, Eduqas B.
9. **J9 Religious Studies:** AQA A 8062, AQA B 8063, Edexcel A 1RA0, Edexcel B 1RB0, OCR J625, Eduqas.
10. **J10 French:** AQA 8652, Edexcel 1FR1, Eduqas (check whether OCR still offers it).
11. **J11 Spanish:** AQA 8692, Edexcel 1SP1, Eduqas (check OCR).
12. **J12 Computer Science:** AQA 8525, Edexcel 1CP2, Eduqas.
13. **J13 PE:** AQA 8582, Edexcel 1PE0, OCR J587, Eduqas.
14. **J14 Business:** AQA 8132, Edexcel 1BS0 (spec list exists, no notes yet), OCR J204, Eduqas.

Each subject job is done when every listed spec's points are in the catalogue, every point has a note that passed QA, and the preview shows them.

## Ready for the owner's OK (on the preview, not live yet)

_None._

## Waiting on the owner

- **Needed for J2:** add the Gemini key as a GitHub secret: repo **Settings → Secrets and variables → Actions → New repository secret**, name `GEMINI_API_KEY`, value = your Gemini key. If Gemini's free daily limit makes the notes too slow, you may want to switch on billing in Google AI Studio (runs will say if so).
- Delete the leftover branch `ci-probe` on GitHub (optional, harmless).
- Delete the duplicate Vercel project `gcse-spec-tracker-ocwb` (optional).

## Rules (short)

1. **Lock.**
   - Start of a run: read Status. If RUN LOCK was set by another session less than 6 hours ago, stop at once without changing anything or messaging.
   - Otherwise set `RUN LOCK: running since <UTC time>, session <id>`, commit `Run lock: take` and push before any other work. If the push is rejected: fetch, re-read, and stop if someone else holds it.
2. **Empty queue.** If the Queue and "Ready for the owner's OK" are both empty, release the lock, disable this scheduled task (`list_triggers`, find "GCSE tracker rebuild", `update_trigger enabled=false`) and stop without messaging.
3. **Start a job.** Take the top job. Write its steps as `- [ ]` lines under CURRENT STEPS, set CURRENT JOB, then push.
4. **Steps.**
   - Work through the steps in order, and never redo a ticked step.
   - Tick a step only when its code is pushed to `rebuild` and GitHub Actions is green; push the tick at once.
   - If a ticked step's work is missing, untick it.
5. **Finish a job.** When every step is green:
   - remove the job from Queue;
   - add one line under "Ready for the owner's OK" with the preview link;
   - add one line to `docs/DONE.md` (date, job, CI link);
   - clear CURRENT JOB and CURRENT STEPS, push, and go on to the next job.
6. **Going live.**
   - Only when the owner says OK in a chat, or ticks `[x]` beside a line under "Ready for the owner's OK".
   - Then fast-forward `main` to `rebuild` (only if `main` is an ancestor and CI is green), push `main`, and remove those lines.
   - Never push to `main` otherwise.
7. **End of run.** Set RUN LOCK back to `none`, fill in LAST RUN ENDED and push. Then send the owner one short, friendly, jargon-free message saying what was done, what's next, and what they need to do.
