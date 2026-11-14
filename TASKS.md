# Job queue for the nightly "GCSE tracker rebuild" runs

Runs read **only this file and `docs/CONTEXT.md`**. Keep this file short: finished jobs are removed from here and logged in one line in `docs/DONE.md`, which runs never need to read.

## Status

```
RUN LOCK:       running since 2026-11-14T01:10Z, session 01Sm3c8ifRJM5XspXTPWhatQ
CURRENT JOB:    J2 Note-writing pipeline
CURRENT STEPS:
- [x] 1. QA gate (`src/lib/notes/qa.ts`): schema, size, SVG sanitiser, depth rules per course; unit tests that pass the existing notes and catch bad ones.
- [x] 2. Playwright render check for figures (overlapping or cut-off labels), run on a batch of notes.
- [x] 3. Note writer (`scripts/notes/write.ts`) that shares work across every AI key the owner has added (see "AI keys for the note writer"): existing note prompt, each provider kept within its own free limits, skip a provider that hits its daily limit and resume after its reset, notes that fail QA retried on another model, each note records which model wrote it, progress file `content/notes/progress.json`, failures list `content/notes/failures.json`.
- [x] 4. Workflow `.github/workflows/notes.yml` (manual + scheduled): write, QA, render check, commit passing notes to `rebuild`.
- [ ] 5. 10-note test batch passes QA and shows on the preview. Keys are set (the workflow sees gemini, groq, openrouter). Needs one real catalogue spec first: add it (content/specs/), then set run-request.json `specs` to it and `limit` 10, push, and check the Write notes run.
LAST RUN ENDED: 2026-11-13 ~21:00 UTC, in chat with the owner (J2 steps 2-4 done; step 5 waits for one real catalogue spec)
```

## Queue (top = next)

**The big goal.** The same kind of notes as the existing ones (summary, core sections, terms, mistakes, exam questions, worked examples, diagrams) for every spec point of the 15 most-entered GCSE subjects, for each board that offers them (AQA, Edexcel, OCR, Eduqas). Owner's choices on 2026-11-12:

- Gemini writes the notes in bulk in GitHub Actions; Claude builds the pipeline and the checks and fixes failures.
- Most popular subject first.
- PE replaces Art & Design.
- Combined Science reuses the separate-science notes, with triple-only parts marked.
- **Skip what already has notes:** AQA Biology 8461, AQA Chemistry 8462, AQA Physics 8463, AQA Geography 8035, Edexcel Maths 1MA1, Edexcel English Literature 1ET0, OCR Computer Science J277. Never rewrite or move those notes.

The spec codes below are a starting list. Check each against the board's own website, and record withdrawn or renamed specs here. Spec-point lists come from the official specification documents, read with WebFetch.

1. **J2 Note-writing pipeline.**
   - A GitHub Actions workflow (manual + scheduled) uses the `GEMINI_API_KEY` repository secret to write notes for queued spec points in the exact existing note format.
   - It must stay within Gemini's rate limits, resume where it stopped, and log progress in a committed progress file.
   - Every note must pass a QA gate before it is committed: schema and size checks, the existing SVG sanitiser, a Playwright render check for overlapping or cut-off labels, and enough depth (diagrams expected for science/maths/CS/geography/PE; fewer for English, languages, history and RS).
   - Failures go on a list that Claude fixes in later runs.
   - Done when: a 10-note test batch passes QA and shows on the preview.
2. **J3 Maths:** AQA 8300, OCR J560, Eduqas (Higher and Foundation where the spec has tiers).
3. **J4 English Language:** AQA 8700, Edexcel 1EN0, OCR J351, Eduqas.
4. **J5 English Literature:** AQA 8702, OCR J352, Eduqas.
5. **J6 Sciences** (Combined, Biology, Chemistry, Physics):
   - Separate sciences: Edexcel 1BI0/1CH0/1PH0, OCR Gateway A J247/J248/J249, OCR Twenty First Century B J257/J258/J259, Eduqas.
   - Combined Science: AQA Trilogy 8464 and Synergy 8465 (reuse AQA notes), Edexcel 1SC0, OCR Gateway A J250, OCR Twenty First Century B J260, Eduqas. These reuse the same board's separate-science notes, with triple-only content marked.
6. **J7 History:** AQA 8145, Edexcel 1HI0, OCR A J410, OCR B J411, Eduqas.
7. **J8 Geography:** Edexcel A 1GA0, Edexcel B 1GB0, OCR A J383, OCR B J384, Eduqas A, Eduqas B.
8. **J9 Religious Studies:** AQA A 8062, AQA B 8063, Edexcel A 1RA0, Edexcel B 1RB0, OCR J625, Eduqas.
9. **J10 French:** AQA 8652, Edexcel 1FR1, Eduqas (check whether OCR still offers it).
10. **J11 Spanish:** AQA 8692, Edexcel 1SP1, Eduqas (check OCR).
11. **J12 Computer Science:** AQA 8525, Edexcel 1CP2, Eduqas.
12. **J13 PE:** AQA 8582, Edexcel 1PE0, OCR J587, Eduqas.
13. **J14 Business:** AQA 8132, Edexcel 1BS0 (spec list exists, no notes yet), OCR J204, Eduqas.

Each subject job is done when every listed spec's points are in the catalogue, every point has a note that passed QA, and the preview shows them.

## Ready for the owner's OK (on the preview, not live yet)

- [ ] J1 Choose your board: pick subjects and exam boards on the dashboard; progress is kept per board. Preview: https://gcse-spec-tracker-git-rebuild-boblasticart.vercel.app/dashboard (only today's boards exist until the subject jobs add more).

## AI keys for the note writer (owner fills in)

Add each key as a GitHub secret: repo **Settings → Secrets and variables → Actions → New repository secret**. Paste the name exactly as below, and the key as the value. Never paste a key into this file or anywhere else in the repo. Only add keys from your own accounts, **one account per company**: several accounts with the same company to get round its limits breaks its rules and can get the accounts blocked. Tick each line once added; runs use whichever keys exist.

- [x] `GEMINI_API_KEY`: Google AI Studio (aistudio.google.com → Get API key).
- [x] `OPENROUTER_API_KEY`: OpenRouter (openrouter.ai → Keys). Runs will use its free models.
- [x] `GROQ_API_KEY`: Groq (console.groq.com → API Keys), the key starting `gsk_`. Add **one** key only, from one account: two Groq accounts to double the limit breaks Groq's rules.
- Optional, any other company you have your own free account with (e.g. Mistral `MISTRAL_API_KEY`, Cohere `COHERE_API_KEY`, GitHub Models `GH_MODELS_TOKEN`): add it and a line here, and runs will use it too.

## Waiting on the owner

- **Needed for the subject jobs (J3 onwards) and J2 step 5:** runs (unattended, and also in chat on 2026-11-13) could not read the exam boards' websites (the web-page reader asked for permission and nobody was there to answer). Open the scheduled task "GCSE tracker rebuild" in Claude and switch on **Automatically approve**, or tell a run in chat that reading aqa.org.uk, qualifications.pearson.com, ocr.org.uk and eduqas.co.uk is fine. Another way: download a spec PDF from the board's website and attach it in chat.
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
