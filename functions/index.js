import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { defineString } from 'firebase-functions/params'
import { logger } from 'firebase-functions'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { buildResultEmail } from './email.js'

// Values come from functions/.env, which the deploy workflow writes from
// GitHub secrets/variables (see .github/workflows/deploy-functions.yml).
const RESULT_EMAIL_TO = defineString('RESULT_EMAIL_TO', { default: '' })
const MAIL_TIMEZONE = defineString('MAIL_TIMEZONE', { default: 'UTC' })
// Must match the Firestore database location (e.g. us-central1 for nam5,
// europe-west1 for eur3).
const FUNCTIONS_REGION = defineString('FUNCTIONS_REGION', { default: 'us-central1' })

initializeApp()

// Every new exam result queues one email in `mail/`, which the "Trigger
// Email from Firestore" extension picks up and sends over SMTP. Building
// the email here (not in the browser) means participants can't fake its
// content and company web filters can't block it.
export const emailResultOnCreate = onDocumentCreated(
  { document: 'results/{resultId}', region: FUNCTIONS_REGION },
  async (event) => {
    const snap = event.data
    if (!snap) return

    const to = RESULT_EMAIL_TO.value()
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (to.length === 0) {
      logger.warn('RESULT_EMAIL_TO is not set; no result email queued.')
      return
    }

    const result = snap.data()
    const submittedAtMs = result.submittedAt?.toMillis?.() ?? Date.parse(event.time)
    const message = buildResultEmail(
      { ...result, submittedAtMs },
      { timeZone: MAIL_TIMEZONE.value() }
    )

    // Doc ID = event ID, written with create(): a repeat delivery of the same
    // event can't queue (or overwrite and re-send) a second email. A retaken
    // exam reuses the result ID but is a new event, so it gets its own email.
    try {
      await getFirestore()
        .collection('mail')
        .doc(event.id)
        .create({ to, replyTo: result.userEmail, message })
    } catch (err) {
      if (err.code === 6 /* ALREADY_EXISTS */) return
      throw err
    }
  }
)
