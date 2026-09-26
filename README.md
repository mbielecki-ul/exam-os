# exam-os

Internal employee knowledge-exam tool. Employees log in with just their
email (magic link, no password), pick an exam, and answer 50 randomly
drawn multiple-choice questions. Admins see every result — score, time
taken, timestamp — manage exams and question pools through the UI
(CSV/Excel/JSON upload, no git required), track who has completed an exam
and send reminders.

React + Vite frontend on **GitHub Pages**, **Firebase Authentication**
(email link) + **Firestore** as the backend, and a few **Cloud Functions**
that draw and grade exam attempts (so the correct answers never reach the
browser) and queue emails. Cloud Functions need the Firebase **Blaze**
plan; at this volume it stays inside the free allowance.

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

**Admins** are the email addresses in the Firestore document
`config/admins` (field `emails`). The rules workflow creates it once, with
the three original admins, before deploying the rules
(`functions/scripts/seed-admins.js`, which never overwrites an existing
list). After that, admins manage the list in the app under **Admin →
Admins**. Nobody can remove themselves there, so the list can't end up
empty. Break-glass: edit `config/admins` in the Firebase console
(Firestore → `config` → `admins`). If you deploy the rules by hand as
above, create that document first, or nobody will be an admin.

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

### 6. Cloud Functions (exam attempts, emails)

`functions/` holds four functions, deployed by
`.github/workflows/deploy-functions.yml` whenever `functions/` changes on
`main` (or by hand from the Actions tab):

- `startAttempt` / `submitAttempt`: draw an attempt's questions and grade
  it server-side. **Required**: without them no exam can be taken.
- `emailResultOnCreate`: result emails (see step 7).
- `sendReminders`: reminder emails to assigned participants (step 7).

This needs the Firebase **Blaze** plan. At this volume it stays within the
free allowance; set a budget alert anyway (Google Cloud Console → Billing →
Budgets & alerts, e.g. €1).

One-time setup:

1. **GitHub repository variables** (Settings → Secrets and variables →
   Actions → *Variables* tab):
   - `FUNCTIONS_REGION`: the region matching your Firestore database
     (`us-central1` for `nam5`, `europe-west1` for `eur3`, or the
     database's own region if single-region). Default `us-central1`. The
     Pages build uses the same variable, so the app calls the functions
     where they run.
   - `MAIL_TIMEZONE` (optional): e.g. `Europe/Vienna` for times in emails.
     Default UTC.
2. **Deploy permissions**: the service account in `FIREBASE_SERVICE_ACCOUNT`
   needs these extra roles (Google Cloud Console → IAM → edit that service
   account): *Cloud Functions Admin*, *Cloud Run Admin*, *Artifact
   Registry Administrator*, *Eventarc Admin*, and *Service Account User*
   (on the project, or at least on the Compute Engine default service
   account `<project-number>-compute@developer.gserviceaccount.com`).
3. **Service agents** (Firestore-triggered functions, first deploy only),
   in the project that matches `FIREBASE_PROJECT_ID` (check the project
   number on the Firebase project settings page):
   - `service-<project-number>@gcp-sa-pubsub.iam.gserviceaccount.com` →
     *Service Account Token Creator*
   - `<project-number>-compute@developer.gserviceaccount.com` → *Cloud Run
     Invoker* and *Eventarc Event Receiver*
4. **Cloud Billing API** enabled for the project (APIs & Services →
   Library → "Cloud Billing API"). The deploy checks the Blaze plan
   through it.
5. Run **Deploy Cloud Functions** once from the Actions tab.

The deploy workflow also sets a cleanup policy for old function container
images, since a non-interactive deploy fails without one.

Company networks: the app calls the functions at
`https://<region>-<project-id>.cloudfunctions.net/…`. If a web filter
blocks that host, exams can't be started or submitted.

### 7. (Optional) Emails: results and reminders

Every finished exam (manual finish, timeout, or leaving mid-exam) sends two
emails: a notification with the participant's address and their result to
the admin address(es) in `RESULT_EMAIL_TO`, and a copy of the result to
the participant themselves (Passed in green, Failed in red). Admins can
also send reminder emails from an exam's **Overview** page. All mail is
sent server-side, not from a browser, so company web filters can't block
it and participants can't fake it:

1. `submitAttempt` writes the result, or an admin clicks "Send reminder".
2. `emailResultOnCreate` (on every new result) or `sendReminders` writes
   the emails into the `mail` collection.
3. Firebase's **Trigger Email from Firestore** extension sends them over
   SMTP and records the delivery status on each `mail` document.

One-time setup:

1. **SMTP login** for the sending mailbox. For Gmail: turn on 2-Step
   Verification and create an **app password** at
   <https://myaccount.google.com/apppasswords>.
2. **Install the extension**: Firebase console → Extensions → *Trigger
   Email from Firestore*. *Firestore Instance Location* must be the
   database's location exactly as shown under Firestore (e.g. `eur3`, not
   a region inside it), and the functions location the same region as
   `FUNCTIONS_REGION`. Auth type *Username & Password*, SMTP URI
   `smtps://you@gmail.com@smtp.gmail.com:465`, the app password, email
   documents collection **`mail`**, and a default FROM address such as
   `exam-os <you@gmail.com>`.
3. **GitHub secret** `RESULT_EMAIL_TO`: who receives the result
   notifications (comma-separated for several).

Troubleshooting: every queued email is a document in the `mail`
collection (Firebase console → Firestore). Its `delivery.state` shows
`SUCCESS` or `ERROR`, with the SMTP error in `delivery.error`. If there's
no `mail` document at all for a result, check the function's logs
(Firebase console → Functions → emailResultOnCreate → Logs).

## Using it

- **Employees**: open the URL, enter their email, click the link Firebase
  emails them (valid roughly 1 hour — this is a Firebase-controlled limit,
  not configurable), then pick an exam. **Each exam can only be taken once
  per person**. The server enforces this, not just the UI, so it can't be
  bypassed by re-visiting the URL. An admin can lift it for one specific
  person from the admin pages (see below). The timer runs on server time;
  a reload or dropped connection resumes the same attempt, and answers
  are saved as they're given, so an attempt whose time runs out while the
  page is closed is graded on what was answered in time.
- **Admins** (everyone on the list in **Admin → Admins**): after logging
  in the same way, an **Admin** link appears in the nav. From there:
  - **Admins**: add or remove admins (changes apply at their next
    sign-in). You can't remove yourself.
  - **Results**: every submitted result, filterable by exam — the filter
    also drives two bar charts above the table (Attended/Passed/Failed and
    Correct/Wrong answers), so switching the exam dropdown updates the
    charts to match. Each row has a **Delete & reopen** action — it
    permanently deletes that result and immediately frees up that exact
    person's one attempt at that exam, so they can take it again. This is
    the only way to let someone retake an exam; there's no undo once
    confirmed. The same action is also available per-attendee on each
    exam's **Overview** page. Results of archived exams (see below) are
    hidden here by default; tick **Show archived exams** to include them.
  - **Manage exams & questions**: each exam is shown as a collapsed row
    (name, questions in the pool, active/inactive, time limit with the
    questions drawn per attempt in brackets, plus **View
    overview** / **Manage questions**). Click the name to expand its
    settings, activate/archive/delete buttons and upload field, or use
    **Expand all** / **Collapse all**. A newly created exam opens
    automatically. From there: create new exams (each needs a time limit
    in minutes — shown to employees as a countdown once they start, and
    enforced: when it reaches zero the exam auto-submits and every
    unanswered question counts as incorrect), optionally restrict an exam
    to specific email domains (e.g. `ul.com`) — leave empty for open to
    everyone; restricted exams are hidden from the list for anyone outside
    the allowed domains and refused server-side too, not just hidden in
    the UI, optionally set an **availability window** (available from /
    until, either side optional): outside it employees see when the exam
    opens or that it's closed, and the server refuses to start it (an
    attempt already running may still finish), activate/deactivate
    them, and upload question pools as CSV, Excel (`.xlsx`), or JSON —
    sample files in each format are downloadable from the "File format"
    card on the same page (also in the repo as `public/sample-questions.csv`
    / `.xlsx` / `.json`, each question can carry an optional `category`).
    Upload as many batches
    as you like — questions accumulate in the pool, so re-uploading a file
    adds to the existing questions rather than replacing them; delete
    individual questions from **Manage questions** if you need to remove
    old ones. Each exam attempt draws a configurable number of random
    questions (default 50, editable per exam — including exams created
    before this setting existed, which fall back to 50 until changed) from
    whatever's currently in that exam's pool, capped at the pool size if
    it has fewer questions than that. Both the questions and the order of
    each question's four answer options are shuffled per attempt (a resumed
    attempt keeps its order); results are always recorded against the
    original option numbers, so stats and answer breakdowns are unaffected.
  - **Archive** (per exam, from the exams list): for exams that are
    finished but whose history you want to keep. Archiving deactivates the
    exam, hides it from employees, and moves it into a collapsed
    **Show archived exams** section at the bottom of the list. Its results
    stay in the database but are hidden from the Results page by default.
    Nothing is deleted: its **View overview** page still works, and
    **Unarchive** brings it back (inactive; activate it again if it should
    be open for new attempts). The server also rejects attempts at archived
    exams, so a stale open tab can't submit to one.
  - **View overview** (per exam, from the exams list): attendee count,
    total correct/wrong answers across everyone, how many passed vs.
    failed (pass threshold is 66% correct, see `PASS_THRESHOLD` in
    `src/lib/results.js`), bar charts for attendance/pass-rate and
    correct-vs-wrong answers, and a per-attendee breakdown table.
    **Participants** on the same page: paste (or import from a CSV, text
    or Excel file) the email addresses of everyone who should take the
    exam, then see per person whether they've completed it (with score),
    are in progress, or haven't started. **Send reminder** emails everyone
    who hasn't completed it (or one person via **Remind**); the email
    links to exam-os and mentions the "available until" date if set. The
    time of each person's last reminder is shown. Reminders need the exam
    to be active, and never go to someone who already has a result or
    isn't on the list.
  - **Manage questions** (per exam, from the exams list): view every
    question one by one, filter by category, edit a question's text,
    options, correct answer, or category in place, add a single question
    manually, or delete one — no re-upload needed for small fixes. The
    category field suggests the exam's existing categories as you type
    (arrow keys + Enter or a click to pick). A different case or stray
    spaces ("safety ") are saved as the existing category ("Safety"), and a
    hint says when a name would create a new category. An
    "Export to Excel" button downloads every question in that exam's pool
    as a single `.xlsx` file, using the same columns as upload
    (`question,option1,option2,option3,option4,correctOption,category`),
    so it can be edited and re-uploaded as-is.

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
- **Copy protection during an exam is a deterrent, not a guarantee.** On
  the exam screen, text can't be selected, and copy/cut, right-click,
  dragging text and Ctrl/Cmd+C/X/A/P/S are blocked (a short notice says
  so). Printing shows only "Printing is disabled during the exam." A web
  page can't stop screenshots, a phone camera, or someone reading the
  questions in the browser's developer tools.
- **Magic link expiry** is fixed by Firebase (~1 hour), not exactly
  configurable to a specific number of hours.
- **Grading is server-side**: the browser only ever receives the question
  text and options, never the correct answers, and the score comes from
  `submitAttempt`. Participants still see the questions, so they can
  write them down (see the copy deterrent above).
