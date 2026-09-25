import { PASS_THRESHOLD } from './results'

const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send'

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY

const resultEmailEnabled = Boolean(SERVICE_ID && TEMPLATE_ID && PUBLIC_KEY)

// Best-effort notification sent from the browser after a result is saved.
// Never throws: the Firestore result is the source of truth, and a failed
// email must not turn a successful submission into an error for the
// participant. Silently a no-op when the EmailJS env vars aren't set.
export async function sendResultEmail({
  participantEmail,
  examName,
  correctCount,
  totalQuestions,
  durationSeconds,
  autoSubmitted,
}) {
  if (!resultEmailEnabled) return

  const ratio = totalQuestions > 0 ? correctCount / totalQuestions : 0
  const passed = ratio >= PASS_THRESHOLD
  const templateParams = {
    participant_email: participantEmail,
    exam_name: examName,
    correct_count: correctCount,
    total_questions: totalQuestions,
    score_percent: Math.round(ratio * 100),
    result: passed ? 'Passed' : 'Failed',
    // Inline-style colours for the result badge in the email template.
    result_color: passed ? '#166534' : '#991b1b',
    result_bg: passed ? '#dcfce7' : '#fee2e2',
    duration: formatDuration(durationSeconds),
    submission_type: autoSubmitted ? 'Auto-submitted (time ran out or left the exam)' : 'Submitted manually',
    submitted_at: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
  }

  try {
    const res = await fetch(EMAILJS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // keepalive lets the request finish even if the tab closes right after submit.
      keepalive: true,
      body: JSON.stringify({
        service_id: SERVICE_ID,
        template_id: TEMPLATE_ID,
        user_id: PUBLIC_KEY,
        template_params: templateParams,
      }),
    })
    if (!res.ok) {
      console.warn('Result email failed:', res.status, await res.text())
    }
  } catch (err) {
    console.warn('Result email failed:', err)
  }
}

function formatDuration(totalSeconds) {
  if (totalSeconds == null) return 'unknown'
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m} min ${s} s`
}
