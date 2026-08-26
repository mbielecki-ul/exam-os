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

export async function listActiveExams() {
  const snap = await getDocs(query(collection(db, EXAMS), where('active', '==', true)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function listAllExams() {
  const snap = await getDocs(collection(db, EXAMS))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function createExam({ name, description }) {
  const ref = await addDoc(collection(db, EXAMS), {
    name,
    description: description || '',
    active: true,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function setExamActive(examId, active) {
  await updateDoc(doc(db, EXAMS, examId), { active })
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

// Picks up to `count` random questions from the exam's pool.
export function pickRandomQuestions(pool, count = 50) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, shuffled.length))
}
