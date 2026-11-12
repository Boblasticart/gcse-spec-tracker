# What every run needs to know (keep this short)

**The app.** GCSE Spec Tracker:
- Next.js 16 (App Router, `next build --webpack`) + TypeScript strict, Tailwind v4, `motion`, Zustand, Serwist PWA, `@react-pdf/renderer`, Prisma 6 on the owner's Supabase Postgres (tables in schema `app`, RLS on, no policies; only server code touches the DB).
- Live: https://gcse-spec-tracker.vercel.app (Vercel builds `main`). Preview: https://gcse-spec-tracker-git-rebuild-boblasticart.vercel.app (Vercel builds `rebuild`).
- The owner is a UK GCSE student (GitHub `Boblasticart`). Write to them in plain, friendly English with no jargon.

**Where things are.**
- `app/` routes: `(public)` signed-out pages, `(app)` gated pages, `api/*`.
- `src/features/*` screens.
- `src/server/*` auth, db, mail, ai, docs.
- `src/client/*` sync engine, store, theme.
- `src/content/*` generated from legacy `index.html` by `npm run content:extract`.
- `prisma/` schema and hand-written migrations.
- `sw/` service worker.
- `tests/` Vitest + Playwright.
- Auth limits all live in `src/server/auth/policy.ts`.
- Feature list: `docs/PARITY.md`. Security notes: `docs/SECURITY.md`. Owner setup guide: `README.md`. Full rebuild history and decisions: `docs/archive/PLAN-rebuild.md` (read only if a job needs the background).

**Never change:** `data/`, `papers/`, `index.html`, `adapter.js`, `supabase/`, `worker/`, `supabase-config.js` (the old GitHub Pages site and content). Wrap or adapt instead. Saved document shapes (`progress/{sid}` = `{s,c,m,w,v:2}`, `a/*`, `daily/*`, `q/*`, `rv/*`, `quiz/*`, `qr/*`, `notes/*`, `papers/done`, `stats/time`, `meta/applied`) stay compatible.

**Never commit** secrets, `.env` files, the owner's real progress export, or anything read from their Supabase.

**How to work (the workspace cannot install npm packages):**
1. Get the code: `git clone https://github.com/Boblasticart/gcse-spec-tracker`, then `git checkout rebuild && git pull`. If access is refused, call `add_repo` (owner `Boblasticart`, repo `gcse-spec-tracker`, access `push`).
2. Write code + tests, commit, push to `rebuild`. GitHub Actions (`.github/workflows/ci.yml`) installs, typechecks, lints, runs Vitest against Postgres 16, builds, and runs Playwright with `AI_MOCK=1`.
3. Watch CI:
   - Poll `gh api "repos/Boblasticart/gcse-spec-tracker/actions/runs?branch=rebuild&per_page=1"` every ~30 s.
   - On failure: `.../actions/runs/<id>/jobs`, then `.../actions/jobs/<job_id>/logs`.
   - Fix and push until green.
4. Dependencies: to change them, edit `package.json` and delete `package-lock.json` in the same commit; CI regenerates and commits the lockfile.
5. The workspace cannot delete branches, change repo settings, or call Vercel or Supabase. Ask the owner (add it under "Waiting on the owner" in TASKS.md).
6. Database changes: add a new hand-written migration in `prisma/migrations/` (CI checks for drift), keep RLS enabled on new tables. Vercel runs `prisma migrate deploy` on build.
