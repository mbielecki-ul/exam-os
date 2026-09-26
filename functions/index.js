import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { onCall } from 'firebase-functions/v2/https'
import { defineString } from 'firebase-functions/params'
import { logger } from 'firebase-functions'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { buildResultEmail } from './email.js'
import { startAttempt as startAttemptHandler, submitAttempt as submitAttemptHandler } from './attempts.js'
import { sendReminders as sendRemindersHandler } from './reminders.js'

// Values come from functions/.env, which the deploy workflow writes from
// GitHub secrets/variables (see .github/workflows/deploy-functions.yml).
const RESULT_EMAIL_TO = defineString('RESULT_EMAIL_TO', { default: '' })
const MAIL_TIMEZONE = defineString('MAIL_TIMEZONE', { default: 'UTC' })
// Must match the Firestore database location (e.g. us-central1 for nam5,
// europe-west1 for eur3).
const FUNCTIONS_REGION = defineString('FUNCTIONS_REGION', { default: 'us-central1' })

initializeApp()

// Server-side exam attempts (see attempts.js): the browser gets questions
// without correct answers and its score only after submitting.
const callableOptions = { region: FUNCTIONS_REGION, maxInstances: 10 }
export const startAttempt = onCall(callableOptions, startAttemptHandler)
export const submitAttempt = onCall(callableOptions, submitAttemptHandler)
// Admin-only: reminder emails to assigned participants who haven't finished.
export const sendReminders = onCall(callableOptions, (request) =>
  sendRemindersHandler(request, { timeZone: MAIL_TIMEZONE.value() })
)

// Every new exam result queues two emails in `mail/`, which the "Trigger
// Email from Firestore" extension picks up and sends over SMTP: a
// notification to RESULT_EMAIL_TO and a copy to the participant. Building
// them here (not in the browser) means participants can't fake the content
// and company web filters can't block them. The participant address is
// safe to mail: firestore.rules only accept a result whose userEmail is
// the signed-in user's own (verified) address.
export const emailResultOnCreate = onDocumentCreated(
  { document: 'results/{resultId}', region: FUNCTIONS_REGION },
  async (event) => {
    const snap = event.data
    if (!snap) return

    const result = snap.data()
    const data = { ...result, submittedAtMs: result.submittedAt?.toMillis?.() ?? Date.parse(event.time) }
    const timeZone = MAIL_TIMEZONE.value()

    const adminTo = RESULT_EMAIL_TO.value()
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (adminTo.length > 0) {
      await queueMail(event.id, {
        to: adminTo,
        replyTo: result.userEmail,
        message: buildResultEmail(data, { timeZone, audience: 'admin' }),
      })
    } else {
      logger.warn('RESULT_EMAIL_TO is not set; no admin notification queued.')
    }

    if (result.userEmail) {
      await queueMail(`${event.id}-participant`, {
        to: [result.userEmail],
        message: buildResultEmail(data, { timeZone, audience: 'participant' }),
      })
    }
  }
)

// Doc IDs derive from the event ID and are written with create(): a repeat
// delivery of the same event can't queue (or overwrite and re-send) an
// email twice. A retaken exam reuses the result ID but is a new event, so
// it gets its own emails.
async function queueMail(id, doc) {
  try {
    await getFirestore().collection('mail').doc(id).create(doc)
  } catch (err) {
    if (err.code === 6 /* ALREADY_EXISTS */) return
    throw err
  }
}
