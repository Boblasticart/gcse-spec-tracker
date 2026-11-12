# Job queue for the nightly "GCSE tracker rebuild" runs

Runs read **only this file and `docs/CONTEXT.md`**. Keep this file short: finished jobs are removed from here and logged in one line in `docs/DONE.md`, which runs never need to read.

## Status

```
RUN LOCK:       none
CURRENT JOB:    none
CURRENT STEPS:  none
LAST RUN ENDED: 2026-11-12 (queue reset; the rebuild M0 to M12 is finished and archived)
```

## Queue (top = next)

_Empty. The owner will add new jobs here._

## Ready for the owner's OK (on the preview, not live yet)

_None._

## Waiting on the owner

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
