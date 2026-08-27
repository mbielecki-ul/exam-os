# exam-os

Internal employee knowledge-exam tool. Employees log in with just their
email (magic link, no password), pick an exam, and answer 50 randomly
drawn multiple-choice questions. The admin account sees every result —
score, time taken, timestamp — and manages exams and question pools
through the UI (CSV/JSON upload, no git required).

Runs entirely on free tiers: React + Vite frontend on **GitHub Pages**,
**Firebase Authentication** (email link) + **Firestore** (Spark/free plan)
as the backend. No server, no paid plan, no credit card required.

## One-time setup

### 1. Create the Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project** (name it e.g. `exam-os`). Google Analytics is optional, skip it.
2. In the project, click the **`</>`** (web app) icon to register a web app. Copy the `firebaseConfig` values shown — you'll need them in step 4.
3. **Authentication** → **Sign-in method** → enable **Email/Password**, then also enable **Email link (passwordless sign-in)** in the same panel (it's a sub-option).
4. **Firestore Database** → **Create database** → start in **production mode** (the rules file below will lock it down properly) → pick any region close to you.
5. **Authentication** → **Settings** → **Authorized domains** → add `mbielecki-ul.github.io` (and your custom domain later, if you add one).

### 2. Deploy the Firestore security rules

Install the Firebase CLI once (`npm install -g firebase-tools`), then from the repo root:

```bash
firebase login
firebase init firestore   # pick your exam-os project, keep firestore.rules as-is
firebase deploy --only firestore:rules
```

This applies `firestore.rules`, which hardcodes `maximilian.bielecki@ul.com`
and `max@bielecki.at` as the only admin identities able to write
exams/questions and read all results. If you ever need another admin,
add another entry to the list in the `isAdmin()` function in that file
(and to `ADMIN_EMAILS` in `src/lib/firebase.js`).

### 3. Enable GitHub Pages

In the repo → **Settings → Pages → Build and deployment → Source**: select
**GitHub Actions** (not "Deploy from a branch"). The included workflow
(`.github/workflows/deploy.yml`) then builds and publishes on every push
to `main`.

### 4. Add the Firebase config as GitHub secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**.
Add each of these (values from step 1.2):

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

These aren't secret in the security sense (Firebase web config is public
by design — actual security is the Firestore rules), we just keep them
out of source for tidiness.

### 5. Push and deploy

```bash
git add .
git commit -m "Initial exam-os setup"
git push origin main
```

The Actions tab will show the deploy running; once green, the app is live
at `https://mbielecki-ul.github.io/exam-os/`.

## Using it

- **Employees**: open the URL, enter their email, click the link Firebase
  emails them (valid roughly 1 hour — this is a Firebase-controlled limit,
  not configurable), then pick an exam. **Each exam can only be taken once
  per person** — this is enforced in `firestore.rules`, not just hidden in
  the UI, so it can't be bypassed by re-visiting the URL.
- **Admin** (`maximilian.bielecki@ul.com` or `max@bielecki.at`): after logging in the same way,
  an **Admin** link appears in the nav. From there:
  - **Results**: every submitted result, filterable by exam.
  - **Manage exams & questions**: create new exams (each needs a time limit
    in minutes — shown to employees as a countdown once they start, and
    enforced: when it reaches zero the exam auto-submits and every
    unanswered question counts as incorrect), activate/deactivate
    them, and upload question pools as CSV, Excel (`.xlsx`), or JSON (see
    `sample-questions.csv` / `sample-questions.xlsx` / `sample-questions.json`
    for the exact format, each question can carry an optional `category`).
    Upload as many batches
    as you like — questions accumulate in the pool. Each exam attempt draws
    50 random questions from whatever's currently in that exam's pool (or
    fewer, if the pool has less than 50).
  - **View overview** (per exam, from the exams list): attendee count,
    total correct/wrong answers across everyone, how many passed vs.
    failed (pass threshold is 66% correct, see `PASS_THRESHOLD` in
    `src/lib/results.js`), and a per-attendee breakdown table.
  - **Manage questions** (per exam, from the exams list): view every
    question one by one, filter by category, edit a question's text,
    options, correct answer, or category in place, add a single question
    manually, or delete one — no re-upload needed for small fixes.

## Local development

```bash
npm install
cp .env.example .env   # fill in the same Firebase values as the GitHub secrets
npm run dev
```

## Known limitations (worth knowing, not blockers for an internal quiz)

- **Magic link expiry** is fixed by Firebase (~1 hour), not exactly
  configurable to a specific number of hours.
- **Grading happens in the browser**, so a technically curious employee
  could inspect network traffic and see `correctIndex` for the questions
  in their attempt. Fine for a low-stakes internal knowledge check; not
  suitable for a proctored/high-stakes exam without adding a server-side
  grading step later (would require Firebase's paid Blaze plan for Cloud
  Functions, which stays free at this scale but does require a credit card
  on file).
