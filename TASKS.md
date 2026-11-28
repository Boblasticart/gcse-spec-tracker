# Job queue for the nightly "GCSE tracker rebuild" runs

Runs read **only this file and `docs/CONTEXT.md`**. Keep this file short: finished jobs are removed from here and logged in one line in `docs/DONE.md`, which runs never need to read.

## Status

```
RUN LOCK:       none
CURRENT JOB:    none (J2b done; J3 Maths carries on by itself via the daily pipeline run)
CURRENT STEPS:  none
LAST RUN ENDED: 2026-11-28 UTC (nightly). Pipeline healthy (last run 27 Nov 19:28, 112 saved; 1656 of 5168 done before Claude's notes); 28 Nov pipeline run not started yet at 16:20 UTC (GitHub delays its schedule; still inside 26 h). Same 2 maths items stuck, left for now. Claude wrote 82 notes (phy_ocra 11.4-20.4, so phy_ocra is finished; phy_ocrb 0.0-3.10), all passed the gate; CI green. (The 27 Nov run wrote 80 notes, phy_edx 12.6-phy_ocra 11.2, but was cut off before releasing the lock.) Pipeline ~112 + Claude 82 = about 194 a day, about 306 short of 500. Next run: phy_ocrb 3.11 onwards (~29 left), then chem_ocrb / chem_ocra / bio_ocrb / bio_ocra gaps (the pipeline also works on these, so list what is missing first). Subagents: 4 points each, ~25k tokens per note; give each its own gen folder in the scratchpad.
```

## Claude is also writing notes (owner asked in chat, 2026-11-16; restarted 2026-11-20: "lets utilise groq key more until limit and well let you write notes lets aim for 500 every day")

- **Goal set by the owner (2026-11-20): about 500 new notes a day, wanted by Friday 27 Nov.** Pipeline plus Claude together. If that isn't reachable, the owner will get more AI keys: say plainly in each message how many were made and how far short of 500 it is.
- **Every nightly run, after the pipeline check, writes notes with the rest of its usage.** Claude-written notes go through the same repairs and quality gate (`scripts/notes/add.ts`), are saved to the same files and marked `by: claude/...`; the pipeline skips points that already have a note.
- How: list missing points (kind.items() where !done), then hand 3 points each to a few general-purpose subagents in parallel: each runs `tsx scripts/notes/add.ts prompt <id>`, writes `<id>.json` in the scratchpad, runs `add.ts check <file> <okdir>` and fixes until OK. Then `tsx scripts/notes/add.ts save <okdir> claude/<model>`, commit, push. About 35k tokens per note. The check needs Playwright: if `@playwright/test` is missing, make a stand-in package that re-exports /opt/npm-tools/node_modules/playwright and set `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`.
- To avoid clashing with the pipeline (which is on maths, then English), Claude works on the sciences: `bio_edx` first, then `chem_edx`, `phy_edx`, then the OCR sciences. Only topic files are touched, never progress.json / failures.json.
- Done so far: 18 bio_edx notes (16 Nov) + 12 (20 Nov: bio_edx 0.2, 0.3, 0.6, 0.7, 0.10, 0.11, 1.0, 1.3, 1.4, 1.7, 1.8, 1.11) + 12 (21 Nov: bio_edx 1.12, 2.3-2.13) + 60 (22 Nov: bio_edx 2.14-6.13, 4 rounds of 5 subagents x 3 points) + 76 (23 Nov: bio_edx 6.14-8.14, so bio_edx is finished; chem_edx 0.0-3.14) + chem_edx 4.0-9.17 and phy_edx 0.0-4.2 (24-25 Nov) + 75 (26 Nov: phy_edx 4.3-12.5) + 80 (27 Nov: phy_edx 12.6-14.6, phy_ocra 0.0-11.2) + 82 (28 Nov: phy_ocra 11.4-20.4, phy_ocrb 0.0-3.10). Next: phy_ocrb 3.11 onwards, then the other OCR science gaps. The check needs `@playwright/test`, and Node ignores NODE_PATH for imports: put the stand-in package at `node_modules/@playwright/test` inside the repo (gitignored) or use an import resolve hook that falls back to /opt/npm-tools/node_modules. Stop when the owner says stop.

## Queue (top = next)

**The big goal.** The same kind of notes as the existing ones (summary, core sections, terms, mistakes, exam questions, worked examples, diagrams) for every spec point of the 15 most-entered GCSE subjects, for each board that offers them (AQA, Edexcel, OCR, Eduqas). Owner's choices on 2026-11-12:

- Gemini writes the notes in bulk in GitHub Actions; Claude builds the pipeline and the checks and fixes failures.
- Most popular subject first.
- PE replaces Art & Design.
- Combined Science reuses the separate-science notes, with triple-only parts marked.
- **Skip what already has notes:** AQA Biology 8461, AQA Chemistry 8462, AQA Physics 8463, AQA Geography 8035, Edexcel Maths 1MA1, Edexcel English Literature 1ET0, OCR Computer Science J277. Never rewrite or move those notes.

The spec codes below are a starting list. Check each against the board's own website, and record withdrawn or renamed specs here. Spec-point lists come from the official specification documents, read with WebFetch.

2. **J3 Maths:** AQA 8300, OCR J560, Eduqas (Higher and Foundation where the spec has tiers).
   - Steps: [ ] 1. every point of maths_aqa_h, maths_aqa_f, maths_ocr_h, maths_eduqas_h, maths_eduqas_f has a note that passed QA (the pipeline does this). [ ] 2. Add OCR J560 Foundation (needs the spec PDF from the owner). [ ] 3. Spot-check 5 maths notes on the preview, then list J3 under "Ready for the owner's OK".
   - 2026-11-15: with the owner approving the four board websites in chat, ALL specs were read in one sitting: 52 catalogue specs, about 5,200 points, in content/specs/ (sources in each file). Every subject job (J3 to J14) now only needs its notes written by the Write notes workflow, plus checks.
   - Not offered any more (skipped): Eduqas GCSE Biology/Chemistry/Physics (withdrawn), Eduqas French/Spanish (discontinued 2025), OCR French/Spanish (withdrawn 2017).
   - Still to add: Combined Science specs (AQA 8464/8465, Edexcel 1SC0, OCR J250/J260) reusing the separate-science notes; OCR J560 Foundation (tier columns unreadable).
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

- [ ] J2 Note-writing pipeline: notes written by Gemini/Groq/OpenRouter in GitHub, every note checked (layout, depth, safe diagrams, no overlapping or cut-off labels) before it is saved; first 11 AQA Maths notes passed. Preview: https://gcse-spec-tracker-git-rebuild-boblasticart.vercel.app/notes/maths_aqa_f.0.0
- [ ] J2b Automatic pipeline: general engine runs any job on the same AI keys; notes job on it; custom jobs via JSON config; notes auto-publish to main; 186+ notes written and published so far. Preview: https://gcse-spec-tracker-git-rebuild-boblasticart.vercel.app/notes/maths_aqa_f.0.0

## AI keys for the note writer (owner fills in)

Add each key as a GitHub secret: repo **Settings → Secrets and variables → Actions → New repository secret**. Paste the name exactly as below, and the key as the value. Never paste a key into this file or anywhere else in the repo. Only add keys from your own accounts, **one account per company**: several accounts with the same company to get round its limits breaks its rules and can get the accounts blocked. Tick each line once added; runs use whichever keys exist.

- [x] `GEMINI_API_KEY`: Google AI Studio (aistudio.google.com → Get API key).
- [x] `OPENROUTER_API_KEY`: OpenRouter (openrouter.ai → Keys). Runs will use its free models.
- [x] `GROQ_API_KEY`: Groq (console.groq.com → API Keys), the key starting `gsk_`. Add **one** key only, from one account: two Groq accounts to double the limit breaks Groq's rules.
- Optional, any other company you have your own free account with (e.g. Mistral `MISTRAL_API_KEY`, Cohere `COHERE_API_KEY`, GitHub Models `GH_MODELS_TOKEN`): add it and a line here, and runs will use it too.

## Waiting on the owner

- **Needed for J3 step 2 only (all other specs were read on 2026-11-15):** nightly runs cannot read the exam boards' websites (each site needs permission nobody is there to give). The owner attaches the OCR J560 Maths specification PDF in a chat, and a run adds the Foundation tier from it. Runs must not fetch board sites any other way.
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
   - **One standing exception (owner, in chat 2026-11-16): finished notes go live by themselves.** At the end of every run the pipeline copies only the note files (`content/notes/{spec}/{topic}.json`) to `main` and records that commit as merged into `rebuild` (`publishNotesLive` in scripts/pipeline/engine.ts; switch: `publish_live` in content/pipeline/jobs.json). Code, specs and every other file still need the owner's OK.
7. **Check the pipeline (every run).** The pipeline (docs/PIPELINE.md) runs itself daily at 08:23 UTC and retries its own failures. Read `content/pipeline/STATUS.md` first. Only step in when: no "Write notes" run has started in the last 26 hours (set `"run"` in `content/notes/run-request.json` to today's date and push); items are listed as stuck; or a model is wasting the allowance. Fix the cause (prompt, providers.json, checks, repairs), never by hand-writing notes.
8. **End of run.** Set RUN LOCK back to `none`, fill in LAST RUN ENDED and push. Then send the owner one short, friendly, jargon-free message saying what was done, what's next, and what they need to do.
