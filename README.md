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

`firestore.rules` and `firebase.json` are already in the repo. Once the
secrets in the next step are set, the
`.github/workflows/deploy-firestore-rules.yml` workflow deploys the rules
automatically on every push to `main` that changes `firestore.rules` (and
can be re-run by hand from the **Actions** tab).

For the very first deploy — or to push rules without a commit — you can
also do it locally:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules --project <your-project-id>
```

This applies `firestore.rules`, which hardcodes `maximilian.bielecki@ul.com`,
`max@bielecki.at`, and `thomas.reznicek@ul.com` as the only admin
identities able to write exams/questions and read all results. If you ever
need another admin, add another entry to the list in the `isAdmin()`
function in that file **and** to `ADMIN_EMAILS` in `src/lib/firebase.js` —
the two lists must match.

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

For the **Firestore rules deploy** workflow (step 2), add two more — these
*are* sensitive:

- `FIREBASE_PROJECT_ID` — your project ID (same value as
  `VITE_FIREBASE_PROJECT_ID`).
- `FIREBASE_SERVICE_ACCOUNT` — a service-account key with permission to
  deploy rules. In the [Firebase console](https://console.firebase.google.com):
  **Project settings → Service accounts → Generate new private key**, then
  paste the entire downloaded JSON file as the secret value.

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
  the UI, so it can't be bypassed by re-visiting the URL. An admin can lift
  this for one specific person from the admin pages (see below).
- **Admin** (`maximilian.bielecki@ul.com`, `max@bielecki.at`, or `thomas.reznicek@ul.com`): after logging in the same way,
  an **Admin** link appears in the nav. From there:
  - **Results**: every submitted result, filterable by exam — the filter
    also drives two bar charts above the table (Attended/Passed/Failed and
    Correct/Wrong answers), so switching the exam dropdown updates the
    charts to match. Each row has a **Delete & reopen** action — it
    permanently deletes that result and immediately frees up that exact
    person's one attempt at that exam, so they can take it again. This is
    the only way to let someone retake an exam; there's no undo once
    confirmed. The same action is also available per-attendee on each
    exam's **Overview** page.
  - **Manage exams & questions**: create new exams (each needs a time limit
    in minutes — shown to employees as a countdown once they start, and
    enforced: when it reaches zero the exam auto-submits and every
    unanswered question counts as incorrect), optionally restrict an exam
    to specific email domains (e.g. `ul.com`) — leave empty for open to
    everyone; restricted exams are hidden from the list for anyone outside
    the allowed domains and blocked server-side in `firestore.rules` too,
    not just hidden in the UI, activate/deactivate
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
    `src/lib/results.js`), bar charts for attendance/pass-rate and
    correct-vs-wrong answers, and a per-attendee breakdown table.
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

- **Leaving mid-exam**: navigating to another page, signing out, or closing
  the tab while an exam is in progress shows a warning that leaving will
  submit the exam immediately with only what's answered so far (everything
  else counts as incorrect) and that it can't be repeated afterwards. This
  is enforced for in-app navigation (nav bar, sign out) with a proper
  confirmation dialog; browser/tab close and refresh only get the browser's
  own generic "leave site?" prompt (custom text isn't possible there — a
  long-standing browser security restriction), and the browser **back
  button** isn't currently intercepted at all, since blocking it reliably
  needs extra history-manipulation plumbing that felt like overkill for an
  internal tool. Test each of these paths once when adding a new exam if
  this matters to you operationally.
- **Magic link expiry** is fixed by Firebase (~1 hour), not exactly
  configurable to a specific number of hours.
- **Grading happens in the browser**, so a technically curious employee
  could inspect network traffic and see `correctIndex` for the questions
  in their attempt. Fine for a low-stakes internal knowledge check; not
  suitable for a proctored/high-stakes exam without adding a server-side
  grading step later (would require Firebase's paid Blaze plan for Cloud
  Functions, which stays free at this scale but does require a credit card
  on file).
