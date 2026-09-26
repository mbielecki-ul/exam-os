import { collection, doc, getDoc, getDocs, query, setDoc, where, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import { callFunction } from './callable'

// assignments/{examId}: { emails: [lowercase], reminders: { email: Timestamp } }
// — who should take an exam, for completion tracking and reminders.
// Admin-only in firestore.rules.

export async function getAssignment(examId) {
  const snap = await getDoc(doc(db, 'assignments', examId))
  const data = snap.exists() ? snap.data() : {}
  return { emails: data.emails || [], reminders: data.reminders || {} }
}

export async function saveAssignedEmails(examId, emails) {
  await setDoc(
    doc(db, 'assignments', examId),
    { emails, updatedAt: serverTimestamp() },
    { merge: true }
  )
}

// Attempts currently running for an exam (admins may read them).
export async function listAttemptsForExam(examId) {
  const snap = await getDocs(query(collection(db, 'attempts'), where('examId', '==', examId)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

// Emails a reminder to the given assigned people (default: everyone
// assigned) who haven't completed the exam. Returns { sent }.
export async function sendReminders(examId, emails) {
  return callFunction('sendReminders', emails ? { examId, emails } : { examId })
}
