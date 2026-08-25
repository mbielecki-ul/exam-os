#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

const eventPath = process.argv[2] || process.env.GITHUB_EVENT_PATH;
if (!eventPath || !fs.existsSync(eventPath)) {
  console.error('Missing GITHUB_EVENT_PATH or event file not provided');
  process.exit(1);
}

const event = await fs.readJson(eventPath);
const payload = event.client_payload || {};
const email = (payload.email || '').toLowerCase();
const code = (payload.code || '').toString();
const examSlug = payload.exam_slug || 'sample-exam';

if (!email || !code) {
  console.error('Missing email or code in client_payload');
  process.exit(1);
}

const otpsDir = path.join(process.cwd(), 'data', 'otps');
const safeFileName = email.replace(/[^a-z0-9@.\-]/gi, '_');
const filePath = path.join(otpsDir, `${safeFileName}.json`);
if (!fs.existsSync(filePath)) {
  console.error('No OTP found for', email);
  process.exit(1);
}

const otpRecord = await fs.readJson(filePath);
if (new Date(otpRecord.expiresAt) < new Date()) {
  console.error('OTP expired');
  process.exit(1);
}

const hash = crypto.createHmac('sha256', otpRecord.salt).update(code).digest('hex');
if (hash !== otpRecord.hash) {
  console.error('Invalid OTP code');
  process.exit(1);
}

const questionsDir = path.join(process.cwd(), 'data', 'questions');
const examFile = path.join(questionsDir, `${examSlug}.json`);
if (!fs.existsSync(examFile)) {
  console.error('Exam not found:', examSlug);
  process.exit(1);
}

const examData = await fs.readJson(examFile);
const pool = examData.questions || [];
if (pool.length === 0) {
  console.error('No questions in exam');
  process.exit(1);
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } }

const poolCopy = [...pool];
shuffle(poolCopy);
const selected = poolCopy.slice(0, Math.min(50, poolCopy.length));

const attemptId = crypto.randomUUID();
const attempt = { id: attemptId, email, examSlug, questionIds: selected.map(q=>q.id), startedAt: new Date().toISOString(), finishedAt: null, answers: [], score: null };

const attemptsDir = path.join(process.cwd(), 'data', 'attempts');
await fs.ensureDir(attemptsDir);
const attemptPath = path.join(attemptsDir, `${attemptId}.json`);
await fs.writeJson(attemptPath, attempt, { spaces: 2 });
otpRecord.used = true;
await fs.writeJson(filePath, otpRecord, { spaces: 2 });
console.log('Created attempt', attemptId);
console.log(JSON.stringify({ attemptId }));