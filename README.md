# GCSE Spec Tracker

The GitHub version of the GCSE Spec Tracker, hosted on GitHub Pages. It uses:

- **Supabase** for sign-in and to save each person's progress separately
- **Gemini** (through a small Cloudflare Worker) to write questions and mark typed answers

The original tracker on claude.ai stays as the working copy where new features get tried first.

## What's in this repo

| Path | What it is |
| --- | --- |
| `index.html` | The tracker itself (same code as the claude.ai version, plus two lines that load the adapter) |
| `adapter.js` | Connects the tracker to Supabase and the marking server |
| `supabase-config.js` | **Your settings go here** (step 5) |
| `supabase/setup.sql` | Creates the database table and its security rules (step 2) |
| `data/notes/` | 500 prepared revision notes, one file per spec point |
| `data/questions.json` | Question bank with mark schemes |
| `data/updates.json` | Spec points to set to *Needs work* after we finish a topic together |
| `papers/` | The 56 practice papers (PDF) |
| `worker/worker.js` | The marking server, which holds the Gemini key |

The repo is public, so notes, questions and papers are visible to anyone. Your progress and answers are **not** in the repo. They live in your Supabase database.

---

## One-time setup

### 1. Create the Supabase project

1. At [supabase.com/dashboard](https://supabase.com/dashboard), click **New project**. Name it `gcse-spec-tracker` and choose the region **West EU (London)**.
2. Set a database password. Save it in a password manager. The tracker doesn't need it, but you'll need it if you ever connect to the database directly.
3. Wait a minute or two while the project starts up.

### 2. Create the database table

1. Open **SQL Editor** in the left sidebar and click **New query**.
2. Open `supabase/setup.sql` in this repo, copy all of it, paste it into the editor and click **Run**. You should see *Success. No rows returned*.
3. Open **Table Editor**. You'll see a new table called `tracker_docs`, with a green **RLS enabled** label next to it. RLS (row-level security) is what stops anyone reading anyone else's data.

### 3. Turn on sign-in

Go to **Authentication → URL Configuration**:

- **Site URL:** `https://boblasticart.github.io/gcse-spec-tracker/`
- **Redirect URLs:** add `https://boblasticart.github.io/gcse-spec-tracker/**`

**Email sign-in** is already switched on, so you can stop here if you like. You type your email, get a link and click it to sign in, with no password. The built-in email sender only sends a few emails per hour, which is fine for a few people.

**Google sign-in** is optional and takes about 10 more minutes:

1. In Supabase, open **Authentication → Sign In / Providers → Google** and copy the **Callback URL** shown there. It ends in `/auth/v1/callback`.
2. In [console.cloud.google.com](https://console.cloud.google.com), create a project. Go to **Google Auth Platform**, set up **Branding** (app name and your email) and **Audience** (choose *External*, then add yourself as a test user).
3. Go to **Clients → Create client → Web application** and set:
   - **Authorized JavaScript origins:** `https://boblasticart.github.io`
   - **Authorized redirect URIs:** the Callback URL from step 1
4. Copy the **Client ID** and **Client secret** into Supabase's Google provider page, switch it on and save.
5. In `supabase-config.js` (step 5), change `googleSignIn` to `true`.

### 4. Make the marking server

**Get a Gemini key:** go to [aistudio.google.com](https://aistudio.google.com) and choose **Get API key → Create API key**.

- Google's [Gemini API terms](https://ai.google.dev/gemini-api/terms) require the account holder to be **18 or over**. If you're under 18, a parent should create the key on their own Google account.
- On the free tier, Google may use what's sent to the API to improve its products, so don't type personal information into answers.

**Create the Worker:**

1. Sign up at [dash.cloudflare.com](https://dash.cloudflare.com), go to **Workers & Pages → Create → Create Worker**, name it `gcse-marking` and click **Deploy**.
2. Click **Edit code**, replace the starter code with all of `worker/worker.js`, then click **Deploy**.
3. Go to **Settings → Variables and Secrets** and add:

   | Name | Type | Value |
   | --- | --- | --- |
   | `GEMINI_API_KEY` | **Secret** | your Gemini key |
   | `SUPABASE_URL` | Text | your Supabase project URL (step 5 shows where to find it) |
   | `SUPABASE_KEY` | Text | your Supabase **publishable** key |
   | `ALLOWED_ORIGINS` | Text | `https://boblasticart.github.io` |
   | `ALLOWED_EMAILS` | Text | the email address you sign in with |

   `ALLOWED_EMAILS` keeps your Gemini quota for you. To let friends use marking, add their emails, separated by commas.
4. Copy the Worker's address, which looks like `https://gcse-marking.<your-name>.workers.dev`.

### 5. Fill in `supabase-config.js`

In Supabase, open **Project Settings → API Keys** (or click **Connect** at the top of the dashboard). You need two things:

- the **Project URL**, like `https://abcdefghijklmnop.supabase.co`
- the **Publishable key**, which starts with `sb_publishable_`

Edit `supabase-config.js` in this repo (on GitHub, use the pencil icon) and paste them in, along with the Worker address as `markingUrl`. Commit the change.

**Never** paste a key that starts with `sb_secret_` (or the old `service_role` key) into this repo. That key ignores row-level security and would let anyone read and change everything.

### 6. Switch on GitHub Pages

In the repo, go to **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save. After a minute or two the tracker is live at:

**https://boblasticart.github.io/gcse-spec-tracker/**

### 7. Sign in and bring your progress across

1. Open the site, sign in, click **Import**, and choose the `tracker-progress-export.json` file Claude gave you.
2. In Supabase, open **Table Editor → tracker_docs**. You should now see your rows.

---

## Managing your database

- **See your data:** open **Table Editor → tracker_docs**. Each row is one saved item:
  - `progress/phy`: your spec statuses for Physics
  - `a/...`: your answers and marks
  - `daily/2026-11-07-phy`: one day's question set
  - `q/...`: questions saved to your account
- **Change something by hand:** click a cell in the `data` column to edit it. Saving is instant, so make a backup first.
- **See who has signed up:** **Authentication → Users**. Deleting a user there also deletes all their tracker rows.
- **Back up:** click **Back up** in the tracker to download everything as one file. You can restore that file later with **Import**.
- **Keep it awake:** free Supabase projects are paused after about a week with no activity. If that happens, open the dashboard and click **Restore project**. Your data is kept. Using the tracker regularly stops it from pausing.
- **Limits:** the free plan gives you 500 MB of database. Your current data uses well under 1 MB, so space won't be a problem.

## How it differs from the claude.ai version

- **Daily questions:** there's no afternoon alert here. Open *Today's 7* for a subject and tap **Write today's set**, and Gemini writes them.
- **Marking, notes and quizzes** use Gemini instead of Claude. The prompts are the same.
- **Practice-paper ticks** save on the device you used, the same as before.

## Keeping it in sync with the claude.ai copy

- **New features:** these get built and tested on claude.ai first. To bring them across, Claude copies the tracker code into `index.html` and keeps the two `<script src=...>` lines above the main script.
- **After we finish a topic:** Claude adds the new questions to `data/questions.json` and an entry like this to `data/updates.json`:

  ```json
  [{ "id": "2026-11-02-phy-forces", "sid": "phy", "needsWork": ["phy.4.0", "phy.4.1"] }]
  ```

  Each signed-in account applies each entry once, the next time the page opens. It only changes points that are still *Not done*.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Setup needed" banner | `supabase-config.js` still has `PASTE_...` values |
| "Could not load your saved data … setup.sql" | Run `supabase/setup.sql` in the SQL Editor (step 2) |
| Sign-in link opens the wrong page or says "redirect not allowed" | Check the Site URL and Redirect URLs (step 3) |
| Google says `redirect_uri_mismatch` | The Google client's redirect URI must be exactly Supabase's Callback URL (step 3) |
| "Marking server: Please sign in again" | `SUPABASE_URL` or `SUPABASE_KEY` in the Worker is wrong, or you need to sign in again |
| "Marking server: … not allowed" | Check `ALLOWED_ORIGINS` and `ALLOWED_EMAILS` in the Worker |
| Site stopped saving after a break | The Supabase project was paused. Click **Restore project** in the dashboard. |
