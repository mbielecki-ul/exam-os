# CLAUDE.md

Guidance for Claude Code (or any AI assistant) working in this repo.

## What this is

`exam-os` is an internal employee knowledge-exam tool. Employees log in
with just their email (Firebase magic link, no password), pick from a list
of exams they're allowed to take, and answer 50 randomly drawn
multiple-choice questions within a time limit. Admins manage exams,
question pools, and see results/stats.

It runs entirely on free tiers by design: **React + Vite** frontend on
**GitHub Pages**, **Firebase Authentication** (email link) + **Firestore**
(Spark/free plan) as the only backend. There is no server and no Cloud
Functions — every feature here has to work as a static site talking
directly to Firestore, governed by `firestore.rules`. Keep it that way
unless the person explicitly asks to add a paid tier (Blaze).

## Commands

```bash
npm install
npm run dev      # local dev server
npm run build    # production build — ALWAYS run this before calling a change done
npm run preview  # preview the production build locally
```

`npm run build` needs the `VITE_FIREBASE_*` env vars set (see
`.env.example`) — for a quick compile-check without a real Firebase
project, dummy values work fine since Vite only needs them to resolve at
build time, not to actually connect.

Deployment is automatic via `.github/workflows/deploy.yml` on every push
to `main` (builds, then publishes to GitHub Pages). It pulls the
`VITE_FIREBASE_*` values from GitHub Actions secrets, not from a committed
`.env`.

## Architecture

### Auth
Firebase email-link sign-in (`src/pages/Login.jsx`, `src/lib/firebase.js`).
No passwords, no Cloud Functions for OTP delivery — Firebase sends the
email itself. Link expiry (~1h) is Firebase-controlled, not configurable.
Admin status is just an email allowlist: `ADMIN_EMAILS` in
`src/lib/firebase.js`, mirrored in `isAdmin()` in `firestore.rules`. **Keep
these two in sync manually** — there's no single source of truth for it.

### Data model (Firestore collections)
- `exams/{examId}` — `name`, `description`, `active`, `timeLimitMinutes`,
  `allowedDomains` (array of lowercase domains; empty = open to everyone).
- `questions/{questionId}` — `examId`, `text`, `options` (array of 4),
  `correctIndex` (0-3), `category`.
- `results/{resultId}` — **the ID is deterministic**: `{examId}_{authUid}`
  (see `resultDocId()` in `src/lib/results.js`). This is the entire
  mechanism behind "one attempt per exam per person" — a second attempt
  writes to the same document ID, which Firestore's security rules see as
  an `update` rather than a `create`, and only admins can update results.
  **Do not change this ID scheme without also updating `firestore.rules`
  and re-reading the comments there** — the two are tightly coupled.

### Firestore rules are the real security boundary
Every restriction implemented in the UI (hiding a "Start exam" button,
filtering an exam list, blocking a route) is also enforced in
`firestore.rules`, because client-side checks are trivially bypassable by
anyone who opens devtools. When adding a new restriction, always ask "if
someone crafted a raw Firestore write, would this actually stop them?" and
update the rules file, not just a component. Known bug/limitation:
domain-restriction comparisons in `firestore.rules` are case-sensitive on
the signer's email domain (the admin-entered domain list is lowercased,
the email side isn't) — CEL doesn't reliably expose a `.lower()` here.

### Exam-taking flow (`src/pages/ExamTake.jsx`)
- Draws `min(50, pool size)` random questions via `pickRandomQuestions()`.
- Grading happens **client-side** — the correct answers are visible in
  devtools during an attempt. Acceptable for a low-stakes internal quiz;
  flagged as a known limitation. Don't "fix" this without discussing it
  first, since it requires Cloud Functions (paid Blaze plan).
- The countdown timer and the "leave mid-exam" guard
  (`src/context/ExamGuardContext.jsx`) both funnel through the *same*
  `handleSubmit({ auto: true })` path — timeout, forced-leave-via-navbar,
  and manual finish are three ways into one submit function. If you touch
  `handleSubmit`, check all three call sites still make sense.
- `ExamGuardContext` intercepts in-app navigation (nav bar, sign out) with
  a custom modal, but **cannot** intercept the browser back button, and can
  only show a generic (non-custom) message on tab-close/refresh — both are
  real browser limitations, not bugs to fix.

### Adding a new admin-configurable exam property
The pattern used for `timeLimitMinutes` and `allowedDomains` in
`src/pages/AdminQuestions.jsx` is: a `useState` draft map keyed by
`examId`, an inline `<input>` bound to `draft ?? exam.currentValue`, a
"Save" button that only appears while a draft exists, and a dedicated
`updateExamX()` function in `src/lib/exams.js`. Follow this pattern rather
than inventing a new one — it's used three times already.

### Charts
`src/components/ExamBarChart.jsx` is a shared component used by both the
Results page and the per-exam Overview page. It expects each data point to
include `{ name, value, percent, fill }` — the custom tooltip
(`payload[0].payload`, not the `formatter` prop) reads `percent` directly.
If tooltip text ever looks wrong in one theme, check that colors are set
explicitly via `var(--text)` rather than inherited — recharts' default
per-series coloring reads badly in dark mode.

## Conventions

- All user-facing text is English (there was an earlier German pass that
  got fully translated — don't reintroduce German strings).
- Styling is plain CSS in `src/index.css` using CSS custom properties for
  theming (`--bg`, `--text`, `--accent`, etc., overridden under
  `:root[data-theme='light']`). No CSS-in-JS, no Tailwind.
- Sample question files (`sample-questions.csv/json/xlsx`) must stay in
  sync with each other and with the column/field docs in
  `src/pages/AdminQuestions.jsx` and the README — they're the canonical
  example for anyone uploading a new question pool.
- Every change that touches `src/` should be followed by `npm run build`
  before considering the task done — this repo has repeatedly broken CI
  from things that looked fine in isolation (missing exports, stale
  `package-lock.json`, an experimental bundler version). Don't skip it.
- Keep `README.md` in sync with actual behavior — it's the operator's only
  documentation, since there's no in-app help.
