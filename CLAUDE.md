# CLAUDE.md

Guidance for Claude Code (or any AI assistant) working in this repo.

## What this is

`exam-os` is an internal employee knowledge-exam tool. Employees log in
with just their email (Firebase email-link sign-in, no password), pick
from a list of exams they're allowed to take, and answer up to 50
randomly drawn multiple-choice questions within a time limit. Admins
manage exams, question pools, and see results/stats.

It runs entirely on free tiers by design: **React 19 + Vite** frontend on
**GitHub Pages**, **Firebase Authentication** (email link) + **Firestore**
(Spark/free plan) as the only backend. There is no server and no Cloud
Functions — every feature here has to work as a static site talking
directly to Firestore, governed by `firestore.rules`. Keep it that way
unless the person explicitly asks to add a paid tier (Blaze).
**Exception:** the project is on Blaze for a small, explicitly requested
set of Cloud Functions (`functions/`): server-side exam attempts/grading
(`startAttempt`, `submitAttempt`), result emails (`emailResultOnCreate`)
and reminder emails (`sendReminders`), with the "Trigger Email from
Firestore" extension sending mail (the browser-side mail API, EmailJS,
was blocked by company web filters). Don't grow this into a general
backend without asking. Everything else stays browser → Firestore.

## Commands

```bash
npm install
npm run dev      # local dev server (Vite)
npm run lint     # oxlint — react-hooks + only-export-components rules
npm run build    # production build — ALWAYS run this before calling a change done
npm run preview  # preview the production build locally
```

`npm run build` needs the `VITE_FIREBASE_*` env vars set (see
`.env.example`) — for a quick compile-check without a real Firebase
project, dummy values work fine since Vite only needs them to resolve at
build time, not to actually connect.

Two deploy workflows run on push to `main`, both from GitHub Actions
secrets (no committed `.env`):
- `.github/workflows/deploy.yml` — `npm ci`, `npm run build`, publish
  `dist/` to GitHub Pages. Uses the `VITE_FIREBASE_*` secrets.
- `.github/workflows/deploy-firestore-rules.yml` — seeds `config/admins`
  if missing (`functions/scripts/seed-admins.js`), then runs
  `firebase deploy --only firestore:rules` (config in `firebase.json`)
  **only when `firestore.rules` / `firebase.json` / the seed script /
  that workflow file changes**. Auth is the `FIREBASE_SERVICE_ACCOUNT` + `FIREBASE_PROJECT_ID`
  secrets; the service account needs the `roles/firebase.admin` IAM role.
  Also runnable by hand from the Actions tab (`workflow_dispatch`).
- `.github/workflows/deploy-functions.yml` — `firebase deploy --only
  functions` when `functions/**`, `firebase.json` or that workflow
  changes. It writes `functions/.env` from the `RESULT_EMAIL_TO` secret
  and the `FUNCTIONS_REGION` / `MAIL_TIMEZONE` repo variables, since the
  repo is public and must not commit them. The Pages build gets the same
  `FUNCTIONS_REGION` variable as `VITE_FUNCTIONS_REGION`, so the app calls
  the callables in the right region.

The three workflows run independently on a merge, so a change that needs
new rules and new functions together (like the move to server-side
attempts) has a few minutes where the live pieces don't match. Merge those
when nobody is mid-exam.

There is no test suite. For rules/functions changes, the Firestore, Auth
and Functions emulators (`firebase emulators:exec --only
auth,firestore,functions --project demo-…`) run the real `firestore.rules`
and callables locally.

## Routes and files

`src/App.jsx` wires everything. Router `basename` is `/exam-os` and Vite
`base` is `/exam-os/` — both must change together if the deploy path ever
changes, along with `public/404.html` (the GitHub Pages SPA redirect hack;
`index.html` has the matching decoder script).

| Route | Component / file | Guard |
| --- | --- | --- |
| `/login` | `src/pages/Login.jsx` | none |
| `/` | `src/pages/ExamList.jsx` | `RequireAuth` |
| `/exam/:examId` | `src/pages/ExamTake.jsx` | `RequireAuth` |
| `/exam/:examId/done` | `src/pages/ExamDone.jsx` | `RequireAuth` |
| `/admin` | `src/pages/AdminDashboard.jsx` — "Results" | `RequireAdmin` |
| `/admin/questions` | `src/pages/AdminQuestions.jsx` — "Exams & Questions" | `RequireAdmin` |
| `/admin/questions/:examId` | `src/pages/AdminQuestionEditor.jsx` — per-exam question CRUD | `RequireAdmin` |
| `/admin/exams/:examId` | `src/pages/AdminExamStats.jsx` — per-exam "Overview" (+ `ExamParticipants`) | `RequireAdmin` |
| `/admin/admins` | `src/pages/AdminAdmins.jsx` — admin list | `RequireAdmin` |

`RequireAuth` / `RequireAdmin` live in `src/components/Guards.jsx`.
Contexts: `AuthContext` (Firebase user + `isAdmin`), `ThemeContext`
(light/dark via `data-theme`), `ExamGuardContext` (leave-mid-exam guard).

## Architecture

### Auth
Firebase email-link sign-in (`src/pages/Login.jsx`, `src/lib/firebase.js`,
`src/context/AuthContext.jsx`). No passwords, no Cloud Functions for OTP
delivery — Firebase sends the email itself. Link expiry (~1h) is
Firebase-controlled, not configurable. Admin status is an email list in
one place: the Firestore document `config/admins` (`emails`). `isAdmin()`
in `firestore.rules` reads it, `sendReminders` reads it, and the app
(`AuthContext` via `getAdminEmails()` in `src/lib/admins.js`) treats a
successful read of it as "is admin", since only admins may read it. Admins
edit it on `/admin/admins`; the rules forbid removing yourself, so it
can't become empty. It's created once by the rules deploy workflow
(`functions/scripts/seed-admins.js`); the Firebase console is the
break-glass. Don't reintroduce a hard-coded admin list.

### Data model (Firestore collections)
- `exams/{examId}` — `name`, `description`, `active`, `timeLimitMinutes`,
  `allowedDomains` (array of lowercase domains; empty/missing = open to
  everyone), `questionCount` (how many random questions an attempt draws;
  missing on exams created before this field existed — treat as
  `DEFAULT_QUESTION_COUNT` from `src/lib/exams.js`, currently 50),
  `archived` / `archivedAt` (missing = not archived; `archiveExam()` also
  sets `active: false`), `availableFrom` / `availableUntil` (optional
  Timestamps; missing/null = no limit; `availabilityState()` in
  `src/lib/exams.js` for display, enforced in `startAttempt`),
  `createdAt`. Archiving never touches results: `AdminDashboard` hides
  results whose exam is archived unless "Show archived exams" is ticked,
  and `startAttempt` / `submitAttempt` refuse archived exams.
- `questions/{questionId}` — `examId`, `text`, `options` (array of exactly
  4), `correctIndex` (0-3), `category` (defaults to `"Uncategorized"`),
  `createdAt`.
- `results/{resultId}` — **the ID is deterministic**: `{examId}_{authUid}`
  (see `resultDocId()` in `src/lib/results.js`, and `docId()` in
  `functions/attempts.js`). Only `submitAttempt` creates results (rules
  deny client creates); it refuses when the document already exists,
  which is the "one attempt per exam per person" mechanism. Admins may
  update/delete (delete = let that person retake). **Do not change this
  ID scheme without updating `functions/attempts.js`, `firestore.rules`
  and the client together.** Fields: `userEmail`, `examId`, `examName`, `startedAt`, `submittedAt`
  (serverTimestamp), `durationSeconds`, `totalQuestions`, `correctCount`,
  `answers` (`[{ questionId, selectedIndex, correct }]`), `autoSubmitted`.
- `attempts/{examId}_{authUid}` — an attempt in progress, created by
  `startAttempt`, deleted by `submitAttempt` in the same transaction that
  writes the result. `uid`, `userEmail`, `examId`, `examName`, `questions`
  (`[{ id, order }]`, order = display position → original option index),
  `answers` (map questionId → original option index), `startedAt`,
  `deadline` (null without a time limit). Rules: owner may update only
  `answers`, only before `deadline` + 30 s; admins read/delete.
- `assignments/{examId}` — `emails` (lowercase, who should take the exam),
  `reminders` (map email → Timestamp of the last reminder, written by
  `sendReminders`), `updatedAt`. Admin-only.
- `config/admins` — `emails`, `updatedAt`, `updatedBy`. See Auth.

`PASS_THRESHOLD` (0.66) lives in `src/lib/results.js`;
`summarizeExamResults()` there is the shared stats aggregator used by both
admin stats pages.

### Firestore rules are the real security boundary
Every restriction implemented in the UI (hiding a "Start exam" button,
filtering an exam list, blocking a route) is also enforced server-side,
in `firestore.rules` or in the callables in `functions/` (exam
availability, active/archived, domain, one attempt), because client-side
checks are trivially bypassable by anyone who opens devtools. When adding a new restriction, always ask "if
someone crafted a raw Firestore write, would this actually stop them?" and
update the rules file, not just a component. Editing `firestore.rules` on
a branch changes nothing live until it lands on `main` — the
`deploy-firestore-rules.yml` workflow is what pushes it to Firebase (see
Commands). For a quick local check without deploying,
`firebase deploy --only firestore:rules --project <id> --dry-run`.

### Domain restriction has two implementations, keep them equivalent
- `src/lib/emailDomain.js` — `examAllowsEmail(exam, email)` used by the UI
  (`ExamList`, and `ExamTake` as a direct-link backstop), plus
  `parseDomainList()` which turns the admin's comma-separated input into a
  deduped lowercase array.
- `examAllowsEmail(exam, email)` in `functions/attempts.js` — the
  enforced version, checked by `startAttempt`. Both lowercase both sides.
Changing the rule for who may take a restricted exam means editing both.

### Exam-taking flow (`src/pages/ExamTake.jsx`, `functions/attempts.js`)
- Attempts run server-side. On load, ExamTake calls the `startAttempt`
  callable (`src/lib/attempts.js`, via `callFunction()` in
  `src/lib/callable.js`). It checks exam exists / not archived / not
  already completed and, for a new attempt only, active / domain /
  availability window. Then it draws `min(exam.questionCount ||
  DEFAULT_QUESTION_COUNT, pool size)` questions, each with a shuffled
  option order, stores the attempt and returns text + options +
  `optionOrder` — **never `correctIndex`** (questions are admin-only in
  the rules). A second call returns the same attempt (resume), or grades
  it if its deadline + grace has passed (`status: 'finished'`).
  `DEFAULT_QUESTION_COUNT` exists in both `src/lib/exams.js` (admin UI)
  and `functions/attempts.js` (drawing); keep them equal.
- Answers are stored against the **original** option index. They're kept
  in localStorage (`src/lib/examProgress.js`, tied to the attempt's
  `startedAtMs`) and saved to the attempt doc ~0.8 s after each change.
- Grading happens in `submitAttempt` (transaction: grade, create result,
  delete attempt). Answers sent with the submit count until deadline +
  30 s (`GRACE_MS`, mirrored in the attempts rule); after that only the
  answers saved in time count. Repeating a successful submit returns the
  stored result.
- The countdown uses the server's `deadlineMs` corrected by the server
  clock offset.
- Submission is guarded by `hasSubmittedRef` so the timer and a manual
  click can't both submit. A `handleSubmitRef` always points at the latest
  `handleSubmit` closure so the once-created timer interval sees fresh
  answers.
- The countdown timer and the "leave mid-exam" guard
  (`src/context/ExamGuardContext.jsx`) both funnel through the *same*
  `handleSubmit({ auto: true })` path — timeout, forced-leave-via-navbar,
  and manual finish are three ways into one submit function. If you touch
  `handleSubmit`, check all three call sites still make sense. Unanswered
  questions resolve to `selectedIndex = -1` and count as incorrect.
- Copy deterrent: while questions are on screen, an effect blocks
  `copy`/`cut`/`contextmenu`/`dragstart` and Ctrl/Cmd+C/X/A/P/S on
  `document` (with a short `.copy-notice`). `.exam-no-copy` disables text
  selection, and `@media print` hides the exam in favour of
  `.print-block-notice`. It's deliberately only a deterrent (screenshots
  and devtools can't be stopped); don't sell it as more.
- The browser sends no email. The `emailResultOnCreate` Cloud Function
  reacts to the new result document (see "Result emails").
- `ExamGuardContext` intercepts in-app navigation (nav bar, sign out) with
  a custom modal (`LeaveExamModal`), but **cannot** intercept the browser
  back button, and can only show a generic (non-custom) message on
  tab-close/refresh via `beforeunload` — both are real browser
  limitations, not bugs to fix.

### Question upload / parsing (`src/lib/parseQuestions.js`)
`parseQuestionFile(file)` dispatches on extension: `.json`, `.xlsx`/`.xls`
(via the `xlsx` package), else CSV (via `papaparse`). Returns
`{ questions, errors }` — bad rows are collected as `errors` strings, not
thrown.
- **CSV and Excel** share columns
  `question,option1,option2,option3,option4,correctOption,category` and use
  a **1-based** `correctOption` (1–4), converted to 0-based internally.
- **JSON** is an array of `{ text, options: [4], correctIndex: 0-3, category }`
  and uses the **0-based** `correctIndex` directly.
- `normalize()` requires non-empty text and exactly 4 non-empty options.
- Writes go through `addQuestions()` in `src/lib/exams.js`, which chunks
  at 400 per `writeBatch` (Firestore's hard cap is 500).

### Adding a new admin-configurable exam property
The pattern used for `timeLimitMinutes`, `allowedDomains`, and
`questionCount` in `src/pages/AdminQuestions.jsx` is: a `useState` draft
map keyed by `examId` (`timeLimitDrafts`, `domainDrafts`,
`questionCountDrafts`, `availabilityDrafts`), an inline `<input>` bound to
`draft[examId] ?? exam.currentValue`, a "Save" button that only appears
while a draft entry exists, and a dedicated `updateExamX()` function in
`src/lib/exams.js`. Follow this pattern rather than inventing a new one —
it's used four times already.

### Emails (`functions/`)
`emailResultOnCreate` (`functions/index.js`, Node 22, 2nd gen, ESM) fires
on `results/{resultId}` create (i.e. whenever `submitAttempt` records one). It renders the email with
`buildResultEmail()` (`functions/email.js`). It creates two mail
documents, and the Trigger Email extension sends them:
- `mail/{event.id}`: the admin notification to `RESULT_EMAIL_TO`, with
  `replyTo` set to the participant.
- `mail/{event.id}-participant`: the participant's own copy
  (`audience: 'participant'`, no admin link). It's safe to send to
  `userEmail` because the rules only accept a result whose `userEmail`
  is the signer's own verified address.

Details:
- `create()` with the event ID as doc ID keeps a repeated event delivery
  from queueing a second email. A retake (same result ID, new event)
  does get its own.
- `mail` is locked in `firestore.rules` (`allow read, write: if false`).
  Only the Admin SDK writes there.
- Reminders: `sendReminders` (`functions/reminders.js`, admin-only
  callable, checks `config/admins`) queues one `mail` doc per assigned
  participant without a result, using `buildReminderEmail()`, and records
  `reminders.<email>` via `FieldPath` (emails contain dots). The UI is
  `src/components/ExamParticipants.jsx` on the exam Overview page.
- `functions/email.js` duplicates `PASS_THRESHOLD` (keep it in sync with
  `src/lib/results.js`) and HTML-escapes exam names and emails.
- `functions` has its own `package.json`/lockfile. The Vite app never
  imports from it.

### Charts
`src/components/ExamBarChart.jsx` is a shared component used by both
`AdminDashboard.jsx` (Results) and `AdminExamStats.jsx` (per-exam
Overview). It expects each data point to include `{ name, value, percent,
fill }` — the custom tooltip (`payload[0].payload`, not the `formatter`
prop) reads `percent` directly. Colors are passed in per-point as `fill`
and set explicitly via `var(--...)` in the tooltip rather than inherited —
recharts' default per-series coloring reads badly in dark mode.

## Conventions

- All user-facing text is English (there was an earlier German pass that
  got fully translated — don't reintroduce German strings).
- Styling is plain CSS in `src/index.css` using CSS custom properties for
  theming (`--bg`, `--text`, `--accent`, `--muted`, `--border`, etc.,
  overridden under `:root[data-theme='light']`). No CSS-in-JS, no
  Tailwind.
- Sample question files: `sample-questions.csv` and `sample-questions.json`
  exist and must stay in sync with each other and with the format docs in
  `src/pages/AdminQuestions.jsx` and the README. Note: the app and README
  both tell users to download `sample-questions.xlsx`, which is **not in
  the repo** — either add it or fix those references.
- Every change that touches `src/` should be followed by `npm run build`
  before considering the task done — this repo has repeatedly broken CI
  from things that looked fine in isolation (missing exports, stale
  `package-lock.json`, an experimental bundler version). Don't skip it.
- Keep `README.md` in sync with actual behavior — it's the operator's only
  documentation, since there's no in-app help.
