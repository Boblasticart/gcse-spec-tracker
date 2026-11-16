# The automatic content pipeline

One pipeline makes all the AI-written content for the tracker. Today it writes the revision notes; it can make anything else you describe (flashcards, quiz questions, summaries...) without new code.

## What it does by itself

- **Runs every day** at 08:23 UTC in GitHub Actions (the "Write notes" workflow), for up to 5 hours, using your free AI keys (Gemini, Groq, OpenRouter). Nothing needs to be switched on each day.
- **Stays inside the free limits.** Each company has its own daily and per-minute allowance (`content/notes/providers.json`). When one model runs out for the day, it moves to the next.
- **Checks everything before saving.** A note must pass the quality gate (enough depth, complete sections, safe diagrams, no cut-off or overlapping labels). Only passes are saved.
- **Repairs what it safely can**: mislabelled fields, stray HTML, a broken extra diagram or an incomplete key term are fixed or dropped when enough good ones remain. It never invents content.
- **Retries failures by itself.** A rejected item is tried again on another AI straight away, then on later days (after 12 hours), up to 6 runs. Only then is it listed as "stuck".
- **Drops weak models.** A model whose replies almost never pass is skipped for a week, so the allowance goes to models that work.
- **Saves as it goes.** Progress is pushed every 10 items, so a run that is cut off loses nothing.
- **Reports.** After every run it rewrites `content/pipeline/STATUS.md`: how far each job has got, what is stuck, and how each AI model is doing. If a whole run saves nothing, the run is marked failed and GitHub emails you.

New content appears on the preview site. It goes live when `main` is updated (see TASKS.md, "Going live").

## Jobs

`content/pipeline/jobs.json` lists the jobs. They run in order and share the day's allowance, so the first job gets first call on it.

### The notes job

`{ "id": "notes", "kind": "notes", "enabled": true, "specs": [] }` writes a full note for every spec point of every catalogue spec, most popular subject first. Put spec ids in `specs` to limit it.

### A custom job: anything you want

Add a job with `"kind": "custom"`. For every spec point the pipeline sends your prompt, checks the reply, and saves it to `{out}/{spec}/{topic}.json`. Example (already in the file, switched off):

```json
{
  "id": "flashcards",
  "kind": "custom",
  "enabled": true,
  "out": "content/flashcards",
  "specs": ["maths_aqa_h"],
  "courses": [],
  "prompt": "You are a {board} GCSE {subject} examiner. Write revision flashcards for this ONE spec point: \"{point}\" ...",
  "fields": { "summary": { "minChars": 40 }, "cards": { "min": 8, "each": ["q", "a"] } },
  "minBytes": 600,
  "maxBytes": 20000
}
```

- `prompt` can use `{board} {subject} {code} {tier} {paper} {topic} {point} {others}`.
- `fields` says what the AI's reply must contain: `min` + `each` for a list whose items need those parts, `minChars` for a piece of text. Replies that don't match are rejected and retried, with the reason sent back to the AI.
- `out` must be a folder of its own under `content/`.
- `specs` / `courses` limit the job (empty = every spec, including the original eight).
- `enabled: false` pauses a job without losing its progress.

The pipeline only makes the files. Showing a new kind of content in the app is a separate (small) piece of app work.

## Files

| File | What it is |
| --- | --- |
| `content/pipeline/jobs.json` | The jobs. |
| `content/pipeline/STATUS.md` | The latest report. |
| `content/pipeline/state.json` | Today's use per provider and each model's pass rate. |
| `content/notes/providers.json` | The AI providers, their models and limits. |
| `{job folder}/progress.json`, `failures.json` | What is done and what is waiting for another try. |
| `scripts/pipeline/engine.ts` | The engine. `scripts/notes/kind.ts` and `scripts/pipeline/custom.ts` are the two kinds of job. |

To start a run now instead of waiting for tomorrow: change `"run"` in `content/notes/run-request.json` and push to `rebuild`, or press "Run workflow" on the Write notes workflow in GitHub.
