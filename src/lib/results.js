import {
  collection,
  doc,
  getDocs,
  getCountFromServer,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
} from 'firebase/firestore'
import { db } from './firebase'

const RESULTS = 'results'
const PASS_THRESHOLD = 0.66
const RESULTS_PAGE_SIZE = 200

// One result per (exam, person): deterministic ID means a second attempt at
// the same exam by the same person always lands on the same document.
// Results are written only by the submitAttempt Cloud Function
// (functions/attempts.js), which uses the same "{examId}_{uid}" scheme and
// never creates a second one.
export function resultDocId(examId, uid) {
  return `${examId}_${uid}`
}

// Total number of results across all exams, via Firestore's server-side
// count aggregation — one request regardless of how many documents match,
// so the Results dashboard can show "N of M loaded" without pulling every
// result down just to count them.
export async function countAllResults() {
  const snap = await getCountFromServer(collection(db, RESULTS))
  return snap.data().count
}

// One page of results across all exams, newest first. Pass a previous
// call's `cursor` to fetch the next page. Used instead of a single
// unbounded fetch so opening the Results dashboard doesn't re-read every
// result ever recorded — that only gets more expensive as history grows,
// and this runs on Firestore's free (Spark) plan by design.
export async function listResultsPage(cursor = null) {
  const constraints = [orderBy('submittedAt', 'desc')]
  if (cursor) constraints.push(startAfter(cursor))
  constraints.push(limit(RESULTS_PAGE_SIZE))

  const snap = await getDocs(query(collection(db, RESULTS), ...constraints))
  return {
    results: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    cursor: snap.docs[snap.docs.length - 1] || null,
    hasMore: snap.docs.length === RESULTS_PAGE_SIZE,
  }
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

// Deletes a result document. Because the ID is deterministic
// ("{examId}_{uid}"), removing it frees that exact slot back up — the
// person can immediately take the exam again. Firestore rules restrict
// this to admins only; there's no employee-facing path to it.
export async function deleteResult(resultId) {
  await deleteDoc(doc(db, RESULTS, resultId))
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
