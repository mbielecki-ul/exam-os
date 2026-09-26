import { HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldPath, Timestamp } from 'firebase-admin/firestore'
import { buildReminderEmail } from './email.js'
import { caller } from './attempts.js'

// Reminder emails for an exam's assigned participants
// (assignments/{examId}.emails, edited on the exam's Overview page).
// Admin-only. Queues one mail document per person who has no result yet —
// the Trigger Email extension sends them — and records when each was
// reminded in assignments/{examId}.reminders.

// One Firestore batch: 500 writes, minus the assignment update.
const MAX_RECIPIENTS = 450

export async function sendReminders(request, { timeZone }) {
  const { email } = caller(request)
  const db = getFirestore()

  const admins = (await db.doc('config/admins').get()).get('emails') || []
  if (!admins.map((a) => String(a).toLowerCase()).includes(email.toLowerCase())) {
    throw new HttpsError('permission-denied', 'Only admins can send reminders.')
  }

  const examId = request.data?.examId
  if (typeof examId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(examId)) {
    throw new HttpsError('invalid-argument', 'Invalid exam.')
  }
  const examSnap = await db.doc(`exams/${examId}`).get()
  if (!examSnap.exists) throw new HttpsError('not-found', 'Exam not found.')
  const exam = examSnap.data()
  if (exam.archived || exam.active !== true) {
    throw new HttpsError('failed-precondition', 'Activate the exam before sending reminders.')
  }
  if (exam.availableUntil && Date.now() >= exam.availableUntil.toMillis()) {
    throw new HttpsError('failed-precondition', 'The exam is closed; extend its availability first.')
  }

  const assignmentRef = db.doc(`assignments/${examId}`)
  const assigned = new Set(
    ((await assignmentRef.get()).get('emails') || []).map((a) => String(a).toLowerCase())
  )
  const results = await db.collection('results').where('examId', '==', examId).select('userEmail').get()
  const completed = new Set(results.docs.map((d) => String(d.get('userEmail') || '').toLowerCase()))

  // Only assigned people without a result, whatever the browser asked for.
  const requested = Array.isArray(request.data?.emails)
    ? request.data.emails.map((a) => String(a).toLowerCase())
    : [...assigned]
  const recipients = [...new Set(requested)].filter((a) => assigned.has(a) && !completed.has(a))
  if (recipients.length > MAX_RECIPIENTS) {
    throw new HttpsError('invalid-argument', `At most ${MAX_RECIPIENTS} reminders at once.`)
  }
  if (recipients.length === 0) return { sent: 0 }

  const message = buildReminderEmail(exam, { timeZone })
  const now = Timestamp.now()
  const batch = db.batch()
  const reminded = []
  for (const to of recipients) {
    batch.create(db.collection('mail').doc(), { to: [to], message })
    // FieldPath, because the email's dots would otherwise split the path.
    reminded.push(new FieldPath('reminders', to), now)
  }
  batch.update(assignmentRef, ...reminded)
  await batch.commit()
  return { sent: recipients.length }
}
