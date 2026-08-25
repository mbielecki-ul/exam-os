#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';

const eventPath = process.argv[2] || process.env.GITHUB_EVENT_PATH;
if (!eventPath || !fs.existsSync(eventPath)) {
  console.error('Missing GITHUB_EVENT_PATH or event file not provided');
  process.exit(1);
}

const event = await fs.readJson(eventPath);
const payload = event.client_payload || {};
const attemptId = payload.attemptId;
const answers = payload.answers || [];

if (!attemptId) {
  console.error('No attemptId provided');
  process.exit(1);
}

const attemptsDir = path.join(process.cwd(), 'data', 'attempts');
const attemptPath = path.join(attemptsDir, `${attemptId}.json`);
if (!fs.existsSync(attemptPath)) {
  console.error('Attempt file not found:', attemptPath);
  process.exit(1);
}

const attempt = await fs.readJson(attemptPath);
if (attempt.finishedAt) {
  console.error('Attempt already finished');
  process.exit(1);
}

const questionsFile = path.join(process.cwd(), 'data', 'questions', `${attempt.examSlug}.json`);
const examData = await fs.readJson(questionsFile);
const questionsById = {}; for (const q of examData.questions) questionsById[q.id] = q;

let correctCount = 0;
const detailed = [];
for (const ans of answers) {
  const q = questionsById[ans.questionId]; if (!q) continue;
  const selected = q.options.find(o=>o.id === ans.selectedOptionId);
  const correctOption = q.options.find(o=>o.isCorrect);
  const correct = selected && selected.id === (correctOption && correctOption.id);
  if (correct) correctCount++;
  detailed.push({ questionId: q.id, selectedOptionId: (selected? selected.id : null), correct, timeTaken: ans.timeTaken || null });
}
attempt.answers = detailed;
attempt.score = Math.round((correctCount / attempt.questionIds.length) * 100);
attempt.finishedAt = new Date().toISOString();
if (attempt.startedAt) { const started = new Date(attempt.startedAt); const finished = new Date(attempt.finishedAt); attempt.durationSeconds = Math.round((finished - started) / 1000); }
await fs.writeJson(attemptPath, attempt, { spaces: 2 });
console.log('Graded attempt', attemptId, 'score=', attempt.score);