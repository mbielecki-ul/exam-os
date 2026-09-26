import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'

const EXAMS = 'exams'
const QUESTIONS = 'questions'

// Number of questions drawn for an attempt when an exam doesn't have its
// own questionCount set yet (exams created before this field existed).
// Keep in sync with DEFAULT_QUESTION_COUNT in functions/attempts.js, which
// does the actual drawing.
export const DEFAULT_QUESTION_COUNT = 50

export async function listActiveExams() {
  const snap = await getDocs(query(collection(db, EXAMS), where('active', '==', true)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function listAllExams() {
  const snap = await getDocs(collection(db, EXAMS))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function createExam({ name, description, timeLimitMinutes, allowedDomains, questionCount }) {
  const ref = await addDoc(collection(db, EXAMS), {
    name,
    description: description || '',
    timeLimitMinutes: Number(timeLimitMinutes),
    allowedDomains: allowedDomains || [], // empty = open to everyone
    questionCount: Number(questionCount) || DEFAULT_QUESTION_COUNT,
    active: true,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateExamTimeLimit(examId, timeLimitMinutes) {
  await updateDoc(doc(db, EXAMS, examId), { timeLimitMinutes: Number(timeLimitMinutes) })
}

export async function updateExamDomains(examId, allowedDomains) {
  await updateDoc(doc(db, EXAMS, examId), { allowedDomains })
}

export async function updateExamQuestionCount(examId, questionCount) {
  await updateDoc(doc(db, EXAMS, examId), { questionCount: Number(questionCount) })
}

// Optional window in which the exam can be started. `from` / `until` are
// Dates, or null for no limit on that side.
export async function updateExamAvailability(examId, from, until) {
  await updateDoc(doc(db, EXAMS, examId), {
    availableFrom: from ? Timestamp.fromDate(from) : null,
    availableUntil: until ? Timestamp.fromDate(until) : null,
  })
}

// 'upcoming' (availableFrom still ahead), 'closed' (availableUntil passed)
// or 'open'. Missing fields mean no limit. startAttempt in functions/ applies
// the same check server-side; this is only for display.
export function availabilityState(exam, nowMs = Date.now()) {
  const from = toMillis(exam.availableFrom)
  const until = toMillis(exam.availableUntil)
  if (from != null && nowMs < from) return 'upcoming'
  if (until != null && nowMs >= until) return 'closed'
  return 'open'
}

export function toMillis(ts) {
  if (ts == null) return null
  if (typeof ts.toMillis === 'function') return ts.toMillis()
  const ms = new Date(ts).getTime()
  return Number.isNaN(ms) ? null : ms
}

export function formatDateTime(ts) {
  const ms = toMillis(ts)
  return ms == null
    ? ''
    : new Date(ms).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

export async function setExamActive(examId, active) {
  await updateDoc(doc(db, EXAMS, examId), { active })
}

// Archiving also deactivates, so the exam disappears from the employee
// list. Unarchiving leaves it inactive; the admin re-activates explicitly.
// Results are untouched either way; the admin views just filter them.
export async function archiveExam(examId) {
  await updateDoc(doc(db, EXAMS, examId), {
    archived: true,
    active: false,
    archivedAt: serverTimestamp(),
  })
}

export async function unarchiveExam(examId) {
  await updateDoc(doc(db, EXAMS, examId), { archived: false })
}

export async function deleteExam(examId) {
  await deleteDoc(doc(db, EXAMS, examId))
}

export async function countQuestions(examId) {
  const snap = await getDocs(query(collection(db, QUESTIONS), where('examId', '==', examId)))
  return snap.size
}

export async function listQuestions(examId) {
  const snap = await getDocs(query(collection(db, QUESTIONS), where('examId', '==', examId)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

// questions: [{ text, options: [4 strings], correctIndex: 0-3, category: string }]
export async function addQuestions(examId, questions) {
  // Firestore batches are capped at 500 writes.
  const chunks = []
  for (let i = 0; i < questions.length; i += 400) chunks.push(questions.slice(i, i + 400))

  for (const chunk of chunks) {
    const batch = writeBatch(db)
    for (const q of chunk) {
      const ref = doc(collection(db, QUESTIONS))
      batch.set(ref, {
        examId,
        text: q.text,
        options: q.options,
        correctIndex: q.correctIndex,
        category: q.category || 'Uncategorized',
        createdAt: serverTimestamp(),
      })
    }
    await batch.commit()
  }
}

// Adds a single question, e.g. from the manual "add question" form.
export async function addQuestion(examId, question) {
  await addQuestions(examId, [question])
}

// question: { text, options: [4 strings], correctIndex: 0-3, category: string }
export async function updateQuestion(questionId, question) {
  await updateDoc(doc(db, QUESTIONS, questionId), {
    text: question.text,
    options: question.options,
    correctIndex: question.correctIndex,
    category: question.category || 'Uncategorized',
  })
}

export async function deleteQuestion(questionId) {
  await deleteDoc(doc(db, QUESTIONS, questionId))
}
