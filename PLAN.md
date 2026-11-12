# GCSE Spec Tracker rebuild: master plan

This file is the single source of truth for the scheduled rebuild runs. Every run reads it from top to bottom, works on the next unticked milestone(s), and records what it did in the **Run log** at the end.

- **Owner:** Boblasticart (a GCSE student, UK, Europe/London). Speak to them in plain, friendly English with no jargon.
- **Repo:** `Boblasticart/gcse-spec-tracker`. **All rebuild work happens on the `rebuild` branch.** `main` is the live GitHub Pages site and must keep working until milestone M12.
- **Backup:** the original tracker on claude.ai (https://claude.ai/artifact/JekQDSyjnc9B4HyB2rf3MR) is never touched by these runs.
- **Usage limits:** the owner's Claude usage resets daily at 01:00 and weekly on Wednesday at 01:00 (UK time). One run fires daily at 01:10.

---

## 0. Status (every run reads this first and keeps it updated)

```
RUN LOCK:        none
CURRENT:         ALL MILESTONES DONE (M0 to M12). The rebuild is finished: runs should only confirm this and stop.
CURRENT STEPS:   none
LAST GREEN CI:   https://github.com/Boblasticart/gcse-spec-tracker/actions/runs (rebuild, 2026-11-12, all green)
LAST RUN ENDED:  2026-11-12 (live chat: M12 go-live confirmed by the owner)
```

**How the status block works:**

- **RUN LOCK** shows which run is working right now, as `running since <UTC time>, session <id>`.
  - At the very start of a run, fetch the latest `rebuild` branch and read this block.
  - If the lock was set less than 6 hours ago by another session, another run is still working. Stop at once without changing anything, and don't message the owner.
  - If it is `none` or older than 6 hours (a run that crashed or was cut off when usage ran out), take it: write your own time and session, then commit and push **before doing any other work** (commit message `Run lock: take`). If the push is rejected because someone else pushed first, fetch, re-read, and stop if their lock is now set.
  - At the end of the run, set it back to `none` and fill in `LAST RUN ENDED`.
- **CURRENT** is the milestone being worked on.
- **CURRENT STEPS** lists that milestone's steps as `[x]`/`[ ]` lines (the run writes them when it starts the milestone). Tick each step as soon as its code is pushed and its CI is green, and push the tick straight away. A later run continues from the first unticked step and **never redoes a ticked step**. Check against the actual files and CI rather than guessing: if a ticked step's files are missing, untick it and note why in the run log.
- **LAST GREEN CI** is the link to the most recent green Actions run on `rebuild`.
- When a milestone's acceptance checks are green, tick it in section 5, move CURRENT to the next milestone and clear CURRENT STEPS.


## 1. Goal

Rebuild the tracker as a production-ready Next.js + TypeScript app on Vercel with:

1. **Auth:** email + password, then a 6-digit code emailed to them, checked on the server, before the session works. Public content is viewable signed out; interactive parts are gated.
2. **Persistence:** everything the student does is saved per account in Postgres (the owner's Supabase project). On sign-in it rehydrates seamlessly.
3. **UI:** a clean, student-friendly dashboard (Linear/Vercel feel), flicker-free dark mode, and tasteful micro-interactions.
4. **Live progress visualisation:** it animates when items change.
5. **PWA:** works offline. Changes made offline are queued in IndexedDB and synced when back online. Progress summaries can be downloaded as a PDF.

**Rule from the owner:** do not remove or alter existing content or data schemas; wrap or adapt them. In practice:

- `data/`, `papers/`, `index.html`, `adapter.js`, `supabase/`, `worker/` and the Supabase `public.tracker_docs` table all stay as they are.
- Document shapes inside the tracker stay identical, e.g. `progress/{sid}` = `{s,c,m,w,v:2}`, plus `a/*`, `daily/*`, `q/*`, `rv/*`, `quiz/*`, `qr/*`, `notes/*` and `meta/applied`.
- New things get new names.

## 2. Decisions already made (do not reopen)

| Area | Decision |
| --- | --- |
| Framework | Next.js (latest stable 16.x, App Router) + TypeScript `strict`, at the **repo root** alongside the old static files |
| Hosting | **Vercel** (Hobby plan), Git integration. Production branch `main`; previews from `rebuild` |
| Database | The owner's Supabase Postgres project (`rjhhtzbrnprkcajbhaez`), used as plain Postgres via **Prisma** |
| DB isolation | All new tables live in a **separate Postgres schema `app`** (`?schema=app` in `DATABASE_URL`). Each new table gets `ENABLE ROW LEVEL SECURITY` with **no policies**. This is critical: Supabase exposes `public` through its Data API with the publishable key. The browser never talks to the DB; only Next.js server code does |
| Auth | **Our own** auth: `argon2id` password hashes (`@node-rs/argon2`), opaque random session tokens (only a SHA-256 hash is stored), and server-checked 6-digit OTP codes. No Supabase Auth, no NextAuth |
| Email | **Gmail SMTP with an app password**, via `nodemailer` (`smtp.gmail.com:465`). Env: `GMAIL_USER`, `GMAIL_APP_PASSWORD`. In tests: `MAIL_TRANSPORT=file` writes emails to `.mail/` as JSON |
| AI marking | A Next.js route `/api/ai/json` calls Gemini directly (`GEMINI_API_KEY`, model `gemini-flash-latest`, JSON mode). The old Cloudflare Worker is no longer needed but is kept in the repo |
| Styling | Tailwind CSS v4, `class`-strategy dark mode. Fonts via `next/font`: Bricolage Grotesque (headings) and Figtree (body), as now |
| Motion | `motion` (Framer Motion). Everything respects `prefers-reduced-motion` |
| Charts | Hand-written animated SVG components (no chart library) |
| PWA | Serwist (`@serwist/next`), an IndexedDB outbox via `idb` |
| PDF | `@react-pdf/renderer`, lazy-loaded, client-side so it works offline |
| Client state | Zustand store, hydrated from `/api/docs` |
| Validation | `zod` on every API input |
| Tests | Vitest (unit/API) + Playwright (e2e) **run in GitHub Actions**, with a Postgres 16 service container |

## 3. How each run works (read carefully)

**The workspace cannot download npm packages.** Installing, building and testing therefore happen in **GitHub Actions**. A run's loop is:

0. **Check the run lock** in section 0 first (see the rules there). Stop if another run holds it; otherwise take it and push.
1. **Get the code.** `git clone https://github.com/Boblasticart/gcse-spec-tracker` (if access fails, call `add_repo` with owner `Boblasticart`, repo `gcse-spec-tracker`, access `push`). Then `git checkout rebuild` and `git pull`.
2. **Read this file.** Note anything under **Waiting on the owner**. Pick the first milestone that isn't ticked. If the last run-log entry says a milestone was left half-done, finish that first.
3. **Write the code** for a coherent chunk with its tests. Keep the code modular and typed. Never put secrets in the repo.
4. **Commit and push** to `rebuild`. Then watch CI:
   - `gh api "repos/Boblasticart/gcse-spec-tracker/actions/runs?branch=rebuild&per_page=1"` until it completes (poll every ~30 s).
   - Read failures with `gh api repos/Boblasticart/gcse-spec-tracker/actions/runs/<id>/jobs`, then `.../actions/jobs/<job_id>/logs`.
   - Fix, push, and repeat until green. `package-lock.json` must be generated in CI (see M0) and committed back, because the workspace can't run `npm install`.
5. **Only tick a milestone when CI is green** for its acceptance checks. Commit `PLAN.md` with the tick and a run-log line straight away, so a usage cut-off loses at most one milestone.
6. **Keep going** to the next milestone until the work is done or usage runs out. Aim to use the whole day's allowance. Wednesday's run has a fresh weekly allowance too, so do the biggest milestone then.
7. **If you need something from the owner** (accounts, keys, a decision), add it under **Waiting on the owner** in plain steps, send them a short message, and carry on with anything that doesn't depend on it.
8. **End of run:** update section 0 (release the lock, record where you got to), push, then send the owner a short plain-English message covering what got done, what's next, and anything they need to do.
9. **When every milestone is ticked:** say so, and tell the owner they can delete the "GCSE tracker rebuild" scheduled task. Later runs should then just confirm completion and stop.

**Things that can't be done from the workspace:** deleting branches, changing repo settings, or calling Vercel or Supabase directly. Ask the owner. The workspace *can* push commits (including `.github/workflows/*`) and read Actions runs and logs.

## 4. Architecture

```
app/                      Next.js App Router
  (public)/               landing, spec browser, notes reader, papers (viewable signed out)
  (app)/                  dashboard, today, improve, quiz, review (gated)
  auth/sign-in, sign-up, verify
  api/auth/*              sign-up, sign-in, verify-otp, resend-otp, sign-out, me
  api/docs                GET (hydrate / delta), PUT (batch upsert with versions)
  api/docs/import|export  old export-file format (gcse-spec-tracker-export v1)
  api/ai/json             Gemini proxy (signed-in only, per-user daily cap)
proxy.ts (or middleware.ts, whichever the installed Next version uses)
                          cheap cookie check + redirects; the real check is server-side
src/server/               db (Prisma), auth (password, session, otp, rate limit), mail, ai, docs
src/content/              typed SPEC/PAPERS/prompts extracted from legacy index.html (generated)
src/client/               store (Zustand), sync engine, outbox (IndexedDB), hooks
src/ui/                   design system: Button, Card, Tabs, Segmented, OtpInput, Toast, Ring, Bars...
prisma/schema.prisma      models in schema "app"; migrations committed
scripts/                  extract-legacy.ts, sync-content.mjs (copies data/ and papers/ into public/ at build)
sw/                       Serwist service worker source
.github/workflows/ci.yml  install, typecheck, lint, vitest, prisma migrate (pg service), next build, playwright
```

### Data model (Prisma, schema `app`, RLS enabled with no policies on every table)

- `User`: `id uuid`, `email` (unique, lower-cased), `passwordHash`, `emailVerifiedAt?`, `failedLogins int`, `lockedUntil?`, `createdAt`, `updatedAt`
- `Session`: `id uuid`, `userId`, `tokenHash` (unique), `status` (`PENDING_OTP` | `ACTIVE`), `createdAt`, `expiresAt`, `lastSeenAt`, `ip?`, `userAgent?`
  - A pending session lasts 15 min. An active session lasts 30 days, sliding (refreshed when more than 1 day old). Revoked on sign-out.
- `OtpCode`: `id`, `userId`, `sessionId`, `purpose` (`SIGN_UP` | `SIGN_IN`), `codeHash` (HMAC-SHA256 with `OTP_PEPPER`), `expiresAt` (10 min), `attempts int` (max 5), `consumedAt?`, `createdAt`
- `AuthEvent`: `id`, `kind`, `email?`, `userId?`, `ip?`, `createdAt`. Used for rate limits and audit; prune after 30 days.
- `UserDoc`: `userId`, `path` (unique together, e.g. `progress/phy`), `data jsonb`, `version int`, `deleted bool`, `updatedAt`. Same shapes as the old tracker.
- `UsageCounter`: `userId`, `day`, `aiCalls`. Caps Gemini use per student per day (default 150).

### Auth flow (security rules)

- **Sign-up** (`email`, `password`):
  - Password: 10 to 128 characters, not in a small common-password list.
  - New email: create the user (unverified), create a `PENDING_OTP` session, email a code, and set the cookie.
  - Email belongs to an **unverified** user: replace the password hash and send a new code (whoever controls the inbox wins).
  - Email belongs to a **verified** user: return the *same* response, and email the owner "someone tried to make an account with your email". This avoids leaking which emails have accounts.
- **Sign-in:**
  - Wrong email or password gets one generic error.
  - Lockout: 5 failures leads to a 15 min lock. IP limit: 20 attempts per 15 min.
  - Success creates a `PENDING_OTP` session (the "paused" session) and emails a code.
- **Verify:**
  - Constant-time compare of the HMAC.
  - Wrong code: increment attempts. At 5, the code is dead and they must resend.
  - Expired code: show a clear message with a resend button.
  - Success: mark the code consumed, mark the session `ACTIVE`, rotate the token (new cookie), and set `emailVerifiedAt` on first success.
- **Resend:** 60 s cooldown; max 5 per hour per user.
- **Cookie:** `__Host-gst` (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`). In dev/CI over http use `gst` without the `__Host-` prefix.
- **CSRF:** every state-changing route checks `Origin` against `APP_URL`, plus `SameSite`.
- **Gating:** server components and API routes call `requireUser()`, which only accepts `ACTIVE` sessions. The UI wraps interactive bits in `<Gate>`, which opens the sign-in sheet.
- **Errors:** DB reconnects use Prisma retry for transient errors (P1001/P1017) on idempotent reads. API responses are typed `{ok:false, code, message}`.
- **Headers:** security headers (CSP, `frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy`).

### Sync engine

- **On sign-in:** `GET /api/docs` loads every doc for the user into the Zustand store. The store is cached in IndexedDB for instant loads next time.
- **On change:** update the store (the UI updates instantly), add the change to the IndexedDB outbox, then flush to `PUT /api/docs` with each doc's `baseVersion`.
- **On conflict:** the server returns its copy. For `progress/*`, merge the `s/c/m/w` maps key by key, with locally changed keys winning. Other docs are last-writer-wins.
- **Offline:** the outbox waits. It flushes on the `online` event, on Background Sync where supported, and on app start.
- **`data/updates.json`:** entries are applied once per account on the server at sign-in, with the same rules as the GitHub Pages adapter.

## 5. Milestones

Tick a box only when its acceptance checks pass in CI. Rough size: 1 to 2 milestones per run.

- [x] **M0 Foundations.**
  - Scaffold Next.js + TS strict + Tailwind v4 + ESLint + Vitest + Playwright at the repo root, without touching the old files.
  - Add a CI workflow (Node 22, Postgres 16 service, `npm install`; `npm ci` once a lockfile exists).
  - Add a one-off **`bootstrap-lockfile` job** that runs when `package-lock.json` is missing: it commits the lockfile back to `rebuild` (needs `permissions: contents: write`), or uploads it as an artifact for the next run to commit.
  - Add `scripts/extract-legacy.ts`, which reads `index.html` and writes typed `src/content/spec.ts`, `papers.ts` and `prompts.ts`. Make every `data-act` action, every view (`spec`, `improve`, `today`, `papers`, `note`, `quiz`) and every prompt traceable.
  - Write `docs/PARITY.md`: a checklist of every legacy feature, built from those actions (`tab`, `view`, `filter`, `exp`, `all`, `top`, `st`, `dec`, `note`, `wnote`, `back`, `gen`, `more7`, `more`, `submit`, `retry`, `master`, `review`, `quiz`, `newquiz`, `submitquiz`, `retake`, `pdone`, `perm`, `cancel`).
  - Add `scripts/sync-content.mjs` (copies `data/` and `papers/` into `public/`, gitignored, run in `prebuild`/`predev`).
  - Accept when: CI green with typecheck, lint, a sample unit test and `next build`; the parity checklist is committed.
- [x] **M1 Auth backend.**
  - Prisma schema and migration (schema `app`, with RLS enabled in the migration SQL).
  - `src/server/auth/*`, the mailer (gmail/file), rate limits, and the `/api/auth/*` routes.
  - Accept when: Vitest covers hashing, OTP generation and compare, expiry, the attempt limit, resend cooldown, lockout, enumeration-safe responses, the verified-email sign-up case, and that pending sessions can't call `/api/docs`. Tests run against the CI Postgres.
- [x] **M2 Auth UI + gating.**
  - Sign-up, sign-in and verify pages; a 6-box OTP input (paste, autofill `one-time-code`, backspace across boxes); the resend countdown; clear error states.
  - `proxy.ts`/`middleware.ts`, `<Gate>`, a signed-out public browse experience, and sign-out.
  - Accept when: Playwright runs sign-up, then reads the code from `.mail/`, verifies, reaches the dashboard, signs out, and is blocked from a gated page. It also covers a wrong code, an expired code (time travel via a test-only clock env), and too many attempts.
- [x] **M3 Persistence + sync.**
  - The `UserDoc` API (GET, delta, PUT with versions, import/export of the old export file), the Zustand store, the hydration on sign-in, the conflict merge, and the server-side `updates.json`.
  - Accept when: tests cover the merge rules and import of `tracker-progress-export.json`-style data (use a small fixture, **never** the owner's real export). An e2e test shows that ticking a point, reloading and signing in on a new browser context shows the same state.
- [x] **M4 AI routes.**
  - `/api/ai/json` (Gemini, JSON mode, the per-user daily cap, a friendly rate-limit message).
  - Port the legacy prompts unchanged: generating today's 7 focused on weak topics (bring back mastered topics when there are no weak ones), marking with mark-scheme explanations, review weaknesses, note writing, and quizzes.
  - Accept when: unit tests with a mocked Gemini cover every prompt path and malformed or fenced JSON.
- [x] **M5 Design system + shell.**
  - Tokens (CSS variables), typography, flicker-free dark mode (inline script in `<head>` sets the `dark` class before paint; System/Light/Dark toggle), the layout with subject tabs, and the components with micro-interactions: button press/hover, card lift, checklist toggle spring, input focus, toast.
  - Accessibility: visible focus, AA contrast, keyboard paths, `aria-*`, and `prefers-reduced-motion`.
  - Accept when: Playwright checks there's no theme flash (no class change after first paint), axe has no serious violations, and screenshots at 375 px and 1280 px are attached to CI.
- [x] **M6 Screens I.**
  - Spec view (papers, then topics, then points; the 3-way status control; filters; expand all; bulk), Improvement view, Notes reader (renders the existing note JSON exactly; study the legacy renderer, including `SAFE_PAINT`/`SVG_TAGS` sanitising for note images), and Practice papers (open the PDF, mark as done).
  - Accept when: those parity items are ticked in `docs/PARITY.md`, with e2e coverage of each action.
- [x] **M7 Screens II.**
  - Today's 7 (typed answers, marking result with the mark scheme, `more7`, retry, "you did well: more questions or mark as mastered?"), Review weaknesses, and Quizzes (new, submit, retake).
  - Accept when: the remaining parity items are ticked, with e2e coverage using the mocked AI.
- [x] **M8 Live progress dashboard.**
  - Animated SVG: per-subject mastery rings, done / needs work / not done bars, questions answered, marks %, streak, and study minutes. Study minutes come from a new `stats/time` doc, logged from active time on question and quiz screens, paused when the tab is hidden.
  - Accept when: e2e ticking an item changes the numbers with a transition, and unit tests cover the metric maths.
- [x] **M9 PWA + offline.**
  - Serwist: precache the app shell, cache `data/questions.json`, notes and papers at runtime (papers cache-first once opened), add an offline fallback page, a manifest and icons, the IndexedDB outbox and replay, and a header status ("Saved", "Offline: 3 changes waiting", "Syncing...").
  - Accept when: Playwright goes offline, ticks items, reloads (the app still loads), goes back online, and the server has the changes.
- [x] **M10 PDF report.**
  - A "Download progress PDF" button builds a styled report client-side: cover, per-subject mastery, needs-work list, recent marks, streak and study time. It works offline.
  - Accept when: e2e downloads the PDF, it is non-empty, and it contains the student's email and the subject names.
- [x] **M11 Hardening + docs.**
  - Security headers and CSP review, account deletion and full data export, AuthEvent pruning, and error pages.
  - Rewrite the README with an owner setup guide (Vercel, Gmail app password, Supabase connection strings, env vars) and a "moving from the GitHub Pages version" section (sign up, then Import the old export file).
  - Accept when: CI is green and `docs/SECURITY.md` lists the threat checks done.
- [x] **M12 Go live.**
  - The owner tests the Vercel preview of `rebuild`; after their OK, fast-forward `main` to `rebuild`.
  - Keep the old static site reachable (e.g. `public/legacy/` or leave GitHub Pages on `main` as is).
  - Accept when: the owner confirms that production works.

## 6. Waiting on the owner

Needed by **M2** (so the Vercel preview works) and before **M12**. Runs: keep this list up to date.

1. **Vercel:** sign in at vercel.com with GitHub, then **Add New → Project → import `gcse-spec-tracker`**. Framework: Next.js. Build command: `npm run vercel-build` (runs `prisma migrate deploy && next build`).
2. **Supabase connection strings:** in the Supabase dashboard click **Connect → ORMs → Prisma**. Copy the pooled `DATABASE_URL` (port 6543, add `&schema=app`) and `DIRECT_URL` (port 5432, add `?schema=app`). Put the database password in where it says `[YOUR-PASSWORD]`.
3. **Gmail app password:** turn on 2-Step Verification for the Google account that will send the codes, then create an app password at myaccount.google.com/apppasswords.
4. **Gemini API key** (the key holder must be 18+).
5. **Vercel environment variables:** `DATABASE_URL`, `DIRECT_URL`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `GEMINI_API_KEY`, `OTP_PEPPER` and `SESSION_SECRET` (each a long random string; runs give the owner a one-line way to make them), and `APP_URL` (the Vercel URL).
6. **Optional AI settings** (Vercel environment variables): `AI_ALLOWED_EMAILS` = your own email address(es), comma-separated, so only you can spend your Gemini allowance (recommended, because anyone can make an account); `AI_DAILY_CAP` (default 150 per student per day); `GEMINI_MODEL` (default `gemini-flash-latest`).
7. **Delete the leftover test branch `ci-probe`** on GitHub (Branches page, then the bin icon). It is harmless but untidy.
8. **M12 approved by the owner on 2026-11-12** (in a live chat, after testing every feature on the preview). **Approve going live (M12):** when the Vercel preview of the `rebuild` branch works for you, edit this file on GitHub and add a line here saying `M12 approved by the owner on <date>` (or tell Claude in a chat). The next run then makes it live. Nothing goes live before that. The full setup guide is now in the README ("Setting up the new app").

## 7. Run log

Newest at the bottom. One or two lines per run: date, milestones finished, anything left half-done, CI run link.

- 2026-11-07 (planning session): Added section 0 (run lock and step-level tracking) so runs never overlap or redo work.
- 2026-11-07 (planning session): Plan written. Checked that GitHub Actions can install packages, run Postgres 16 and that logs are readable from the workspace (Next 16.4.5, Serwist 9.5.13 available). Daily scheduled run created for 01:10 UK time.
- 2026-11-08 (scheduled run): M0 done. Next 16.4.5 scaffold, CI (bootstrap-lockfile committed `package-lock.json`), `scripts/extract-legacy.ts` (dependency-free lexer, runs on Node type stripping) generating `src/content/{spec,papers,prompts,legacy-map}.ts`, `docs/PARITY.md`, sync-content. 21 unit + 2 e2e tests green: https://github.com/Boblasticart/gcse-spec-tracker/actions/runs/42433717305. Decision: to change dependencies, edit `package.json` and delete `package-lock.json` in the same commit; CI regenerates and commits it.
- 2026-11-08 (scheduled run): M1 done. Prisma 6.19 (decision: stay on Prisma 6, not 7, for a stable `url`/`directUrl` + `?schema=app` setup), hand-written init migration (RLS on all 6 tables, schema revoked from PUBLIC/anon/authenticated) with a CI drift check, auth service + `/api/auth/*` + minimal `GET /api/docs`. 50 tests green incl. 16 against Postgres: https://github.com/Boblasticart/gcse-spec-tracker/actions/runs/42434527012. Decisions: session token hash is HMAC-SHA256 keyed with `SESSION_SECRET`; sign-up to a verified email sets a decoy cookie (no session) so responses match, and verify answers it with `INVALID_CODE` (so no "attempts left" count is ever shown); extra limits of 5 sign-ups per email and 20 per IP per hour; unknown emails lock out after 5 failures too.
- 2026-11-08 (scheduled run): M2 done. Sign-up/sign-in/verify pages, 6-box OTP input, resend countdown, `<Gate>` + sign-in sheet, `proxy.ts` + server-side gate in `app/(app)/layout.tsx`, public landing and `/spec/[subject]`, test-only `/api/test/clock` (needs `ENABLE_TEST_CLOCK=1`, refused whenever `VERCEL` is set). 8 e2e + 52 unit tests green: https://github.com/Boblasticart/gcse-spec-tracker/actions/runs/42435205966. Playwright runs with 1 worker because the auth tests move the server clock.
- 2026-11-08 (scheduled run): M3 done. `GET/PUT /api/docs` (compare-and-set versions, conflicts return the server copy, deltas include deletions), `/api/docs/import|export` (old export format; big files split in the browser), `data/updates.json` applied once per account at sign-in and on full load (advisory lock), `SyncEngine` + Zustand store with a pluggable outbox (memory now), 3-way progress merge, status control on `/spec/[subject]`, Backup panel on the dashboard. 80 unit + 11 e2e green: https://github.com/Boblasticart/gcse-spec-tracker/actions/runs/42436147449. Decisions: practice-paper "done" dates will live in a new `papers/done` doc; the legacy localStorage import is not possible across sites (PARITY marks it n/a: use Back up + Import).
- 2026-11-08 (scheduled run): M4 done. Decision: `/api/ai/json` takes `{ task, input }` (todaysSeven, markAnswer, reviewWeaknesses, writeNote, writeQuiz, markQuiz) and the **server** builds the prompt from the extracted legacy templates, so the Gemini key can't be used as an open proxy. Today's 7 picks points server-side from the saved `progress/{sid}` with the legacy sort. Tests evaluate the legacy template + legacy code from index.html in a VM and require identical prompts. Mock model behind `AI_MOCK=1` (never on Vercel) for e2e; optional `AI_ALLOWED_EMAILS`. Green: https://github.com/Boblasticart/gcse-spec-tracker/actions/runs/42436626971.
- 2026-11-08 (scheduled run): M5 done. Tokens in `app/globals.css` (AA-checked light/dark), inline theme script + System/Light/Dark radio toggle, `TrackerShell` (subject tabs + view chips; routes `/spec|/papers/[subject]` public, `/improve|/today/[subject]` gated placeholders), `motion` spring on the status control, Card lift, Toasts, skip link. Playwright checks no theme flash, axe (no serious/critical, light + dark, signed in and out) and uploads a `screenshots` artifact (375/1280, light/dark): https://github.com/Boblasticart/gcse-spec-tracker/actions/runs/42437508621. Note for M11: the theme script is inline, so the CSP needs its hash or a nonce.
- 2026-11-11 (scheduled run, started late at 20:43 UTC; the 2026-11-08 run's lock was stale and no runs happened on 11-09/11-10): M6 done. Dependency-free note SVG sanitiser (`src/lib/notes/svg.ts`, fails closed on DOCTYPE/unknown entities/prefixed elements) proven identical to the legacy `cleanSvg` (jsdom, dev-only) on all 1,927 figures in data/notes; notes reader `/notes/[pid]` (prepared notes read on the server, `outputFileTracingIncludes` for data/notes), spec view, Improvement view, practice papers (`papers/done`), placeholder `/quiz/[topic]`. 166 unit + 25 e2e green: https://github.com/Boblasticart/gcse-spec-tracker/actions/runs/43099068474. Decisions: spec filter/open topics/Back target live in memory only (lost on reload, as in the legacy tracker); Improvement "questions waiting" are read-only cards until M7; note figures always sit on white so legacy colours stay readable in dark mode. GitHub Actions runs sat queued for ~25 min at the start of this run, then recovered.
- 2026-11-11 (same run): M7 done. Question card (legacy qcard/submitQ/recordResult, checked against the legacy code in a VM), Today's 7 (gen; more7 uses untried bank questions first, as legacy), weakness review (review/dec, `rv/*`), topic quizzes `/quiz/[topic]` (written on first open, 80% pass marks the topic Done), AI notes written and saved in the reader when there is no prepared note. All parity actions now ticked. `AI_MOCK=1` is set only on the CI e2e step. 29 e2e green: https://github.com/Boblasticart/gcse-spec-tracker/actions/runs/43101140040. Decisions: the weakness review says "{board} terms to use" instead of always "AQA"; question drafts are kept in memory while the page is open (like legacy `DR`).
- 2026-11-11 (same run): M8 done. Metric maths (`src/lib/tracker/metrics.ts`: mastery, counts, answered incl. quiz answers, marks %, streak = days with an answer, quiz or 1+ min of study, counted back from today or yesterday, London days), `useStudyTimer` (Today's 7, Improvement, quizzes; pauses when hidden or idle for 2 min; saves every 30 s and on leaving; max 6 h a day) into the new `stats/time` doc `{days:{YYYY-MM-DD:seconds},v:1}`, animated `Ring`/`Counter`/`StackedBar` (motion, reduced-motion aware), dashboard with overall and per-subject rings. 32 e2e green: https://github.com/Boblasticart/gcse-spec-tracker/actions/runs/43101944250. Decision: `stats/time` is last-writer-wins, so two devices studying at the same moment can lose a few seconds (acceptable).
- 2026-11-11 (extra run asked for by the owner, 21:49 to before 01:10 UK so it can't overlap the scheduled run): M9 done. Sync engine keeps its outbox and a snapshot of the last server copy in IndexedDB (`idb`, one record per account), opens from the snapshot when there is no connection, holds changes while offline and sends them on reconnect; header shows Saved / Syncing… / "Offline: N changes waiting"; sign-out sends waiting changes, then clears this device's copy. Serwist via `@serwist/next` with `next build --webpack` (decision: the webpack plugin is the stable route; `@serwist/turbopack` is still experimental), SW source in `sw/sw.ts` with its own tsconfig; /api never cached; notes + question bank stale-while-revalidate; PDFs cache-first once opened; `/~offline` fallback; only icons/ from public/ are precached (notes and PDFs would be ~100 MB). Manifest + generated icons in public/icons. Decision: no Background Sync; the page sends waiting changes on reconnect and on start. 34 e2e green: https://github.com/Boblasticart/gcse-spec-tracker/actions/runs/43107147412.
- 2026-11-11 (extra run): M10 done. `buildReport` (pure, unit-tested) + `ReportDocument` (@react-pdf/renderer, Helvetica so no font downloads, cover + mastery by subject + needs work + recent marks + streak/study time), loaded only on click and built in the browser; works offline (e2e checks both). e2e reads the PDF text with pdfjs-dist (dev only). Fix: e2e sign-ups now each send their own `x-real-ip`, because the suite had grown past the 20-sign-ups-per-IP-per-hour limit. 36 e2e green: https://github.com/Boblasticart/gcse-spec-tracker/actions/runs/43109980322.
- 2026-11-11 (extra run): M11 done. Per-request nonce CSP from `proxy.ts` (`'strict-dynamic'`, `'wasm-unsafe-eval'` for the PDF layout engine, `connect-src` allows `data:` for the same reason, `upgrade-insecure-requests` only on https), hardening headers for every response, `default-src 'none'` on APIs, HSTS on production; Download all my data (`/api/account/export`, every doc) and Delete my account (`/api/account/delete`, password re-checked, cascade); auth events pruned after 30 days at most hourly from sign-up/sign-in; 404/error/global-error pages; README owner setup guide + `.env.example`; `docs/SECURITY.md`. 197 unit + 40 e2e green: https://github.com/Boblasticart/gcse-spec-tracker/actions/runs/43113392780. Only M12 remains, and it needs the owner. Lock released at 22:45 UTC, well before the 01:10 scheduled run.
- 2026-11-12 (scheduled run): No M12 approval found on `rebuild` or `main`, so no changes made. Latest CI on `rebuild` green. `ci-probe` branch still exists (owner item 7).
- 2026-11-12 (live chat with the owner, no lock needed for small fixes): owner set up Vercel (project `gcse-spec-tracker`; a duplicate `gcse-spec-tracker-ocwb` can be deleted), Supabase strings, Gmail app password and Gemini key (new `AQ.` format; we send it as `x-goog-api-key`, which supports it). Fixes: Vercel Framework Preset had to be Next.js; the origin check now also accepts Vercel's own deployment addresses (`VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`), which fixed "This request did not come from the tracker" on the preview. Sign-up with an emailed code works on https://gcse-spec-tracker-git-rebuild-boblasticart.vercel.app. Vercel builds of `main` fail until go-live (expected). Next: owner tests the features, then approves M12.
- 2026-11-12 (live chat): fixed on the preview: Vercel build now runs the full `npm run build` (copies data/ and papers/ into public/, fixing PDF and question-bank 404s); Gemini key rejections, timeouts, overloads and unusable replies now show a short reference code; Gemini thinking capped (1024 tokens, with fallback), maxOutputTokens 32768, two retries on 503/500, replies as bare arrays or with renamed fields accepted. Owner reports every feature tested and working on https://gcse-spec-tracker-git-rebuild-boblasticart.vercel.app.
- 2026-11-12 (live chat): owner approved M12. `main` fast-forwarded to `rebuild` (2e5793f); legacy files unchanged; Vercel production build green (https://vercel.com/boblasticart/gcse-spec-tracker/DL5DhjrJcMaZP45UhG5doxnfi1Vr) and the GitHub Pages build of `main` green. M12 is ticked once the owner confirms the production address works.
- 2026-11-12 (live chat): M12 done. The owner set APP_URL to https://gcse-spec-tracker.vercel.app, redeployed production from `main`, and confirmed everything works on the live site. Every milestone is ticked; the owner can delete the "GCSE tracker rebuild" scheduled task. The old GitHub Pages site still runs from the unchanged legacy files on `main`.

