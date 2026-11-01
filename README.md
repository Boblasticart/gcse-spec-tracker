# GCSE Spec Tracker

The GitHub version of the GCSE Spec Tracker, hosted on GitHub Pages. It uses:

- **Firebase** for Google sign-in and to save each person's progress separately
- **Gemini** (through a small Cloudflare Worker) to write questions and mark typed answers

The original tracker on claude.ai stays as the working copy where new features get tried first.

## What's in this repo

| Path | What it is |
| --- | --- |
| `index.html` | The tracker itself (same code as the claude.ai version, plus two lines that load the adapter) |
| `adapter.js` | Connects the tracker to Firebase and the marking server |
| `firebase-config.js` | **Your settings go here** (step 4) |
| `data/notes/` | 500 prepared revision notes, one file per spec point |
| `data/questions.json` | Question bank with mark schemes |
| `data/updates.json` | Spec points to set to *Needs work* after we finish a topic together |
| `papers/` | The 56 practice papers (PDF) |
| `worker/worker.js` | The marking server, which holds the Gemini key |
| `firestore.rules` | Database rules: each person can only read and write their own data |

The repo is public, so notes, questions and papers are visible to anyone. Your progress and answers are **not** in the repo. They live in your Firebase database.

---

## One-time setup (about 20 minutes)

### 1. Create the Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and click **Create a project**. Name it something like `gcse-spec-tracker`. You can turn Google Analytics off.
2. **Sign-in:** go to *Build → Authentication → Get started*, choose **Google**, switch it on and save.
   Then open *Authentication → Settings → Authorized domains*, click **Add domain** and enter `boblasticart.github.io`.
3. **Database:** go to *Build → Firestore Database → Create database*. Pick **production mode** and the location `europe-west2 (London)`.
4. **Rules:** in Firestore, open the **Rules** tab. Replace everything with the contents of `firestore.rules` from this repo, then click **Publish**.
5. **Web settings:** go to *Project settings* (the gear icon) → *General* → *Your apps*, click the **`</>`** (Web) icon and register an app (no hosting needed). Firebase then shows a `firebaseConfig` block. Keep that page open for step 4.

### 2. Get a Gemini API key

Go to [aistudio.google.com](https://aistudio.google.com) and choose **Get API key → Create API key**.

- Google's [Gemini API terms](https://ai.google.dev/gemini-api/terms) require the account holder to be **18 or over**. If you're under 18, a parent should create the key on their own Google account.
- On the free tier, Google may use what's sent to the API to improve its products, so don't type personal information into answers.
- Never put this key in the website or in GitHub. It only goes into the Worker (step 3).

### 3. Create the marking server (Cloudflare Worker, free)

1. Sign up at [dash.cloudflare.com](https://dash.cloudflare.com), go to **Workers & Pages → Create → Create Worker**, name it `gcse-marking` and click **Deploy**.
2. Click **Edit code**, delete the starter code, paste in all of `worker/worker.js`, then click **Deploy**.
3. Go to the Worker's **Settings → Variables and Secrets** and add:

   | Name | Type | Value |
   | --- | --- | --- |
   | `GEMINI_API_KEY` | **Secret** | the key from step 2 |
   | `FIREBASE_PROJECT_ID` | Text | your Firebase project ID (it's in the config from step 1.5) |
   | `ALLOWED_ORIGINS` | Text | `https://boblasticart.github.io` |
   | `ALLOWED_EMAILS` | Text | the Gmail address you sign in with |

   `ALLOWED_EMAILS` keeps your Gemini quota for you. To let friends use marking, add their emails, separated by commas. Leave it empty to allow anyone who signs in.
4. Copy the Worker's address, which looks like `https://gcse-marking.<your-name>.workers.dev`. If you open it in a browser, it should show `{"ok":true,...}`.

### 4. Fill in `firebase-config.js`

In this repo, edit `firebase-config.js` (GitHub lets you edit it in the browser with the pencil icon). Fill in:

- `apiKey`, `authDomain`, `projectId` and `appId` from the Firebase config in step 1.5
- `markingUrl`: the Worker address from step 3.4

Then commit the change. These Firebase values are designed to be public. Your data is protected by the rules you published in step 1.4.

### 5. Switch on GitHub Pages

In the repo, go to **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save. After a minute or two your tracker is live at:

**https://boblasticart.github.io/gcse-spec-tracker/**

### 6. Sign in and bring your progress across

1. Open the site and click **Sign in with Google**.
2. Click **Import** and choose the `tracker-progress-export.json` file Claude gave you. This copies over your spec statuses, answers, streaks and daily question history.

Use **Back up** at any time to download all your data as one file. That same file can be imported again later.

---

## How it differs from the claude.ai version

- **Daily questions:** there's no afternoon alert here. Open *Today's 7* for a subject and tap **Write today's set**, and Gemini writes them.
- **Marking, notes and quizzes** use Gemini instead of Claude. The prompts are the same.
- **Practice-paper ticks** save on the device you used, the same as before.

## Keeping it in sync with the claude.ai copy

- **New features:** these get built and tested on claude.ai first. To bring them across, Claude copies the tracker code into `index.html` and keeps the two `<script src=...>` lines above the main script. `adapter.js` doesn't change.
- **After we finish a topic:** Claude adds the new questions to `data/questions.json` and an entry like this to `data/updates.json`:

  ```json
  [{ "id": "2026-11-02-phy-forces", "sid": "phy", "needsWork": ["phy.4.0", "phy.4.1"] }]
  ```

  Each signed-in account applies each entry once, the next time the page opens. It only changes points that are still *Not done*.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Setup needed" banner | `firebase-config.js` still has `PASTE_...` values |
| Sign-in popup closes with an error | Add `boblasticart.github.io` to Firebase's authorised domains (step 1.2) |
| "Saved on this device only" after signing in | The Firestore rules haven't been published (step 1.4) |
| "Marking server: …" message | Read the message. *Please sign in again* means the project ID is wrong. *not allowed* means check `ALLOWED_ORIGINS` and `ALLOWED_EMAILS`. *rate limit* means wait a minute. |
