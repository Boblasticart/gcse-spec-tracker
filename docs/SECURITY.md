# Security notes

What the rebuilt tracker defends against, how, and which test checks it. Unit tests run against a real Postgres 16 in CI; end-to-end tests run against the production build.

## Accounts and sessions

| Threat | Defence | Checked by |
| --- | --- | --- |
| Stolen password database | Passwords hashed with argon2id (`@node-rs/argon2`); 10 to 128 characters; common passwords refused | `tests/unit/auth/password.test.ts` |
| Password guessing | 5 wrong tries locks the account for 15 minutes (unknown emails too, so nothing leaks); 20 sign-in tries per IP per 15 minutes | `tests/unit/auth/flow.test.ts` (lockout) |
| Finding out who has an account | Sign-up and sign-in give the same answers whether or not an email is registered; a sign-up to a verified email emails its owner instead and sets a decoy cookie | `flow.test.ts` (enumeration-safe responses, verified-email sign-up) |
| Stolen session cookie from the database | Only an HMAC (keyed with `SESSION_SECRET`) of each random session token is stored | `tests/unit/auth/crypto.test.ts` |
| Signing in with only a password | Every sign-in needs a 6-digit emailed code, checked on the server with a constant-time HMAC compare; codes expire after 10 minutes and die after 5 wrong tries; resend has a 60 s cooldown and a limit of 5 an hour; a pending session can't use any data API | `flow.test.ts`, `tests/e2e/auth.spec.ts` |
| Session fixation | The session token is replaced when the code is accepted | `flow.test.ts` |
| Cookie theft by script or another site | `__Host-gst` cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` | `crypto.test.ts`, auth e2e |
| Sign-up spam | 5 sign-ups per email and 20 per IP per hour | `flow.test.ts` |
| Audit data kept forever | Sign-in and sign-up events are deleted after 30 days (checked at most once an hour) | `tests/unit/account.test.ts` |

## Data

| Threat | Defence | Checked by |
| --- | --- | --- |
| Reading data through Supabase's public API with the publishable key | All new tables live in the `app` schema with row-level security on and no policies; the schema is revoked from `anon`/`authenticated`/`PUBLIC`; the browser never talks to the database | migration SQL + CI drift check |
| One student reading or changing another's data | Every docs query is scoped by the signed-in user's id; paths are validated against an allowlist of collections; documents are capped at 256 KB and 200 per batch | `tests/unit/docs/api.test.ts` |
| Lost updates between devices | Compare-and-set versions; conflicts return the server copy and progress is merged key by key | `tests/unit/sync/*.test.ts`, `tests/e2e/sync.spec.ts` |
| Cross-site request forgery | Every state-changing route checks `Origin` against `APP_URL`, plus `SameSite` cookies | `flow.test.ts`, `api.test.ts`, `gating.test.ts` |
| Data left on a shared computer | Signing out (or deleting the account) sends waiting changes, then clears this device's offline copy in IndexedDB; the service worker never caches `/api/` responses | `tests/unit/sync/engine.test.ts`, `sw/sw.ts` |
| Right to your data | Download all my data (every doc) and Delete my account (password re-checked; everything removed by cascade) | `account.test.ts`, `tests/e2e/security.spec.ts` |

## The browser

| Threat | Defence | Checked by |
| --- | --- | --- |
| Script injection (XSS) | React escapes all text; note text with `**bold**` is parsed, never injected as HTML; the only raw markup is note figures, rebuilt from an allowlist of SVG tags, attributes and paint values (fails closed on anything unusual) | `tests/unit/notes/svg-parity.test.ts` (all 1,927 figures plus hostile cases) |
| Injected scripts running anyway | Content Security Policy with a fresh nonce per request, `'strict-dynamic'`, no `unsafe-eval` in production (`'wasm-unsafe-eval'` only, for the PDF layout engine), `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`; JSON APIs get `default-src 'none'` | `tests/unit/csp.test.ts`, `security.spec.ts` (headers, nonce in the HTML, and no violations across every screen and the PDF) |
| Clickjacking | `frame-ancestors 'none'` and `X-Frame-Options: DENY` | `security.spec.ts` |
| Leaky referrers, sniffing, powerful features | `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy` turning off camera, microphone, location, payment and USB, `Cross-Origin-Opener-Policy: same-origin`; HSTS on the production deployment | `security.spec.ts` |

## AI

| Threat | Defence | Checked by |
| --- | --- | --- |
| Using the Gemini key as an open proxy | The browser only sends a task name and its data; the server builds the (legacy) prompt itself, so no free-form prompts reach Gemini | `tests/unit/ai/route.test.ts`, `prompts.test.ts` |
| Running up the Gemini bill | Signed-in students only, a daily cap per student (`AI_DAILY_CAP`, default 150) and an optional allowlist of emails (`AI_ALLOWED_EMAILS`) | `route.test.ts` |
| Malformed AI output | Every answer is parsed defensively (fenced or broken JSON, out-of-range marks) and refused if unusable | `tests/unit/ai/json.test.ts`, `finish.test.ts` |
| Test-only switches in production | The mock AI (`AI_MOCK`) and the test clock (`ENABLE_TEST_CLOCK`) are refused whenever `VERCEL` is set | `tests/unit/ai/mock-guard.test.ts`; `src/server/clock.ts` |

## Secrets

No secrets are in the repo. CI uses throwaway values that are only valid in CI. Real values live only in Vercel's environment variables (see the README).
