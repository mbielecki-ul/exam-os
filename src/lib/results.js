import { collection, addDoc, getDocs, query, where, orderBy, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'

const RESULTS = 'results'

export async function submitResult({
  userEmail,
  examId,
  examName,
  startedAtMs,
  totalQuestions,
  correctCount,
  answers,
  autoSubmitted = false,
}) {
  const durationSeconds = Math.round((Date.now() - startedAtMs) / 1000)
  await addDoc(collection(db, RESULTS), {
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
