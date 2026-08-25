# exam-os

Exam tool — MVP scaffold for GitHub‑hosted exam system (OTP email login + GitHub Actions backend).

This repository contains a minimal, free, fully‑GitHub hosted exam system scaffold. It uses GitHub Actions to handle server‑side logic (generate OTPs, verify codes, create attempts, grade attempts) and stores data as JSON files under /data. The frontend (to be added) can be hosted on GitHub Pages and will trigger Actions via repository_dispatch events.

Important: you must add SMTP credentials to the repository Secrets so Actions can send emails. See "Setup" below.

Setup (minimum)

1. Add repository Secrets (Settings → Secrets → Actions):
   - SMTP_HOST (e.g. smtp.example.com)
   - SMTP_PORT (e.g. 587)
   - SMTP_USER
   - SMTP_PASS
   - JWT_SECRET (random secret used for session tokens)
   - ADMIN_EMAIL (e.g. maximilian.bielecki@ul.com)

2. Install dependencies (if running locally):
   - npm ci

3. How the frontend triggers Actions (example repository_dispatch payloads):
   - To request an OTP (send email):
     - event_type: "send-otp"
     - client_payload: { "email": "user@example.com" }

   - To verify OTP and start an exam:
     - event_type: "verify-otp"
     - client_payload: { "email": "user@example.com", "code": "123456", "exam_slug": "sample-exam" }

   - To submit an attempt:
     - event_type: "submit-attempt"
     - client_payload: { "attemptId": "...", "answers": [{"questionId":"...","selectedOptionId":"...","timeTaken":12}, ...] }

You can trigger repository_dispatch events using the GitHub REST API:

  POST /repos/:owner/:repo/dispatches
  {
    "event_type": "send-otp",
    "client_payload": {"email":"user@example.com"}
  }

Note: To call this from the browser you'll need a short‑lived token or GitHub App. See the project README for recommended secure setup.

Files created
- .github/workflows/send-otp.yml — handles send-otp dispatch and sends email
- .github/workflows/verify-otp.yml — verifies the OTP and creates an attempt file
- .github/workflows/submit-attempt.yml — grades an attempt and writes results
- package.json — node dependencies
- scripts/send-otp.js — generates OTP, sends email, writes OTP file
- scripts/verify-otp.js — verifies OTP, creates attempt with sampled questions
- scripts/submit-attempt.js — grades attempt and writes results
- data/questions/sample-exam.json — sample exam question pool
- .gitignore

Next steps
- After adding files and committing to the default branch, I can create a feature branch and add frontend + admin UI and open a PR.
