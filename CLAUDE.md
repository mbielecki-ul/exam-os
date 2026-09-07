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

Deployment is automatic via `.github/workflows/deploy.yml` on every push
to `main` (`npm ci`, `npm run build`, publish `dist/` to GitHub Pages). It
pulls the `VITE_FIREBASE_*` values from GitHub Actions secrets, not from a
committed `.env`. There is no test suite.

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
| `/admin/exams/:examId` | `src/pages/AdminExamStats.jsx` — per-exam "Overview" | `RequireAdmin` |

`RequireAuth` / `RequireAdmin` live in `src/components/Guards.jsx`.
Contexts: `AuthContext` (Firebase user + `isAdmin`), `ThemeContext`
(light/dark via `data-theme`), `ExamGuardContext` (leave-mid-exam guard).

## Architecture

### Auth
Firebase email-link sign-in (`src/pages/Login.jsx`, `src/lib/firebase.js`,
`src/context/AuthContext.jsx`). No passwords, no Cloud Functions for OTP
delivery — Firebase sends the email itself. Link expiry (~1h) is
Firebase-controlled, not configurable. Admin status is just an email
allowlist: `ADMIN_EMAILS` in `src/lib/firebase.js`, mirrored in
`isAdmin()` in `firestore.rules`. **Keep these two lists in sync
manually** — there's no single source of truth, and they have drifted
before. Whenever you touch either, diff them against each other.

### Data model (Firestore collections)
- `exams/{examId}` — `name`, `description`, `active`, `timeLimitMinutes`,
  `allowedDomains` (array of lowercase domains; empty/missing = open to
  everyone), `createdAt`.
- `questions/{questionId}` — `examId`, `text`, `options` (array of exactly
  4), `correctIndex` (0-3), `category` (defaults to `"Uncategorized"`),
  `createdAt`.
- `results/{resultId}` — **the ID is deterministic**: `{examId}_{authUid}`
  (see `resultDocId()` in `src/lib/results.js`). This is the entire
  mechanism behind "one attempt per exam per person" — a second attempt
  writes to the same document ID, which Firestore's security rules see as
  an `update` rather than a `create`, and only admins can update results.
  **Do not change this ID scheme without also updating `firestore.rules`
  and re-reading the comments there** — the two are tightly coupled.
  Fields: `userEmail`, `examId`, `examName`, `startedAt`, `submittedAt`
  (serverTimestamp), `durationSeconds`, `totalQuestions`, `correctCount`,
  `answers` (`[{ questionId, selectedIndex, correct }]`), `autoSubmitted`.

`PASS_THRESHOLD` (0.66) lives in `src/lib/results.js`;
`summarizeExamResults()` there is the shared stats aggregator used by both
admin stats pages.

### Firestore rules are the real security boundary
Every restriction implemented in the UI (hiding a "Start exam" button,
filtering an exam list, blocking a route) is also enforced in
`firestore.rules`, because client-side checks are trivially bypassable by
anyone who opens devtools. When adding a new restriction, always ask "if
someone crafted a raw Firestore write, would this actually stop them?" and
update the rules file, not just a component. Known limitation:
domain-restriction comparisons in `firestore.rules` are **case-sensitive**
on the signer's email domain (the admin-entered domain list is lowercased
on save, the email side in CEL is not) — CEL doesn't reliably expose a
`.lower()` here. The client-side mirror in `src/lib/emailDomain.js`
(`getEmailDomain()`) *does* lowercase both sides, so the UI and the rules
can disagree at the edges — keep that asymmetry in mind.

### Domain restriction has two implementations, keep them equivalent
- `src/lib/emailDomain.js` — `examAllowsEmail(exam, email)` used by the UI
  (`ExamList`, and `ExamTake` as a direct-link backstop), plus
  `parseDomainList()` which turns the admin's comma-separated input into a
  deduped lowercase array.
- `examAllowsEmail(examId, email)` in `firestore.rules` — the CEL version,
  enforced on `results` create.
Changing the rule for who may take a restricted exam means editing both.

### Exam-taking flow (`src/pages/ExamTake.jsx`)
- `QUESTIONS_PER_EXAM = 50`. Draws `min(50, pool size)` random questions
  via `pickRandomQuestions()` from `src/lib/exams.js`.
- Grading happens **client-side** — the correct answers are visible in
  devtools during an attempt. Acceptable for a low-stakes internal quiz;
  flagged as a known limitation. Don't "fix" this without discussing it
  first, since it requires Cloud Functions (paid Blaze plan).
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
The pattern used for `timeLimitMinutes` and `allowedDomains` in
`src/pages/AdminQuestions.jsx` is: a `useState` draft map keyed by
`examId` (`timeLimitDrafts`, `domainDrafts`), an inline `<input>` bound to
`draft[examId] ?? exam.currentValue`, a "Save" button that only appears
while a draft entry exists, and a dedicated `updateExamX()` function in
`src/lib/exams.js`. Follow this pattern rather than inventing a new one —
it's used twice already.

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
