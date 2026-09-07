import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'

const RESULTS = 'results'
const PASS_THRESHOLD = 0.66

// One result per (exam, person): deterministic ID means a second attempt at
// the same exam by the same person always lands on the same document.
// Combined with firestore.rules (only admins can update/delete a result),
// this makes a second attempt fail server-side, not just in the UI.
export function resultDocId(examId, uid) {
  return `${examId}_${uid}`
}

export async function getOwnResultForExam(examId, uid) {
  const snap = await getDoc(doc(db, RESULTS, resultDocId(examId, uid)))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export async function submitResult({
  userEmail,
  userUid,
  examId,
  examName,
  startedAtMs,
  totalQuestions,
  correctCount,
  answers,
  autoSubmitted = false,
}) {
  const durationSeconds = Math.round((Date.now() - startedAtMs) / 1000)
  await setDoc(doc(db, RESULTS, resultDocId(examId, userUid)), {
    userEmail,
    examId,
    examName,
    startedAt: startedAtMs,
    submittedAt: serverTimestamp(),
    durationSeconds,
    totalQuestions,
    correctCount,
    answers, // [{ questionId, selectedIndex, correct }]
    autoSubmitted, // true when the time limit ran out
  })
}

export async function listAllResults() {
  const snap = await getDocs(query(collection(db, RESULTS), orderBy('submittedAt', 'desc')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function listOwnResults(userEmail) {
  const snap = await getDocs(
    query(collection(db, RESULTS), where('userEmail', '==', userEmail))
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function listResultsForExam(examId) {
  const snap = await getDocs(query(collection(db, RESULTS), where('examId', '==', examId)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

// Aggregate stats for one exam: attendees, right/wrong answer totals, and
// how many cleared the pass threshold (66% correct).
export function summarizeExamResults(results) {
  const attendees = results.length
  let totalCorrect = 0
  let totalWrong = 0
  let passed = 0

  for (const r of results) {
    totalCorrect += r.correctCount
    totalWrong += r.totalQuestions - r.correctCount
    if (r.totalQuestions > 0 && r.correctCount / r.totalQuestions >= PASS_THRESHOLD) {
      passed += 1
    }
  }

  return {
    attendees,
    totalCorrect,
    totalWrong,
    passed,
    failed: attendees - passed,
    passRate: attendees > 0 ? (passed / attendees) * 100 : 0,
  }
}

export { PASS_THRESHOLD }
