import { doc, updateDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './firebase'
import { resultDocId } from './results'

// Exam attempts run server-side (functions/attempts.js): the browser never
// receives the correct answers, only its drawn questions and, after
// submitting, its score.

// Returns either
//   { status: 'in-progress', exam, questions, answers, startedAtMs, deadlineMs, serverNowMs }
// (a new attempt, or the one already running) or
//   { status: 'finished', result: { correctCount, totalQuestions, autoSubmitted } }
// when an unfinished attempt's time ran out and it was graded now.
// Throws with a readable message when the exam can't be taken.
export async function startAttempt(examId) {
  return call('startAttempt', { examId })
}

// Grades and records the attempt; returns { correctCount, totalQuestions, autoSubmitted }.
export async function submitAttempt(examId, answers, auto) {
  const res = await call('submitAttempt', { examId, answers, auto })
  return res.result
}

// Saves answers to the attempt as they're given (firestore.rules only
// allow this until the deadline), so they count even if the final submit
// never arrives. Same {examId}_{uid} ID as the result.
export async function saveAttemptAnswers(examId, uid, answers) {
  await updateDoc(doc(db, 'attempts', resultDocId(examId, uid)), { answers })
}

async function call(name, data) {
  try {
    const res = await httpsCallable(functions, name)(data)
    return res.data
  } catch (err) {
    // HttpsErrors thrown on purpose carry a readable message; anything else
    // (network, cold-start timeout, "internal") gets a generic one.
    const code = (err.code || '').replace('functions/', '')
    const readable = ['not-found', 'already-exists', 'failed-precondition', 'permission-denied', 'invalid-argument', 'unauthenticated']
    const e = new Error(
      readable.includes(code)
        ? err.message
        : 'Could not reach the exam server — please check your connection and try again.'
    )
    e.code = code
    throw e
  }
}
