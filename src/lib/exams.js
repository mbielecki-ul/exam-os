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
} from 'firebase/firestore'
import { db } from './firebase'

const EXAMS = 'exams'
const QUESTIONS = 'questions'

// Number of questions drawn for an attempt when an exam doesn't have its
// own questionCount set yet (exams created before this field existed).
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

// Unbiased (Fisher–Yates) shuffle; returns a new array.
function shuffle(items) {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Picks up to `count` random questions from the exam's pool, each with its
// own random `optionOrder`: display position -> original option index.
// `options` and `correctIndex` stay in original order, so answers are
// recorded (and graded, and shown to admins) against the original indices.
export function pickRandomQuestions(pool, count = 50) {
  return shuffle(pool)
    .slice(0, Math.min(count, pool.length))
    .map((q) => ({ ...q, optionOrder: shuffle(q.options.map((_, i) => i)) }))
}

// Display order for a drawn question. Attempts saved before options were
// shuffled have no optionOrder and keep the original order.
export function optionOrderOf(question) {
  return question.optionOrder ?? question.options.map((_, i) => i)
}
