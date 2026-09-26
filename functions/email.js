// Keep in sync with PASS_THRESHOLD in src/lib/results.js (not imported: that
// module pulls in the browser Firebase SDK).
export const PASS_THRESHOLD = 0.66

const APP_ROOT = 'https://mbielecki-ul.github.io/exam-os/'
const APP_URL = `${APP_ROOT}admin`

// Builds { subject, text, html } for one result document.
// `result.submittedAtMs` is the submission time in ms (the Firestore
// Timestamp converted by the caller). `audience` is 'admin' (notification
// with a link to the admin pages) or 'participant' (their own copy).
export function buildResultEmail(result, { timeZone = 'UTC', audience = 'admin' } = {}) {
  const forParticipant = audience === 'participant'
  const total = result.totalQuestions || 0
  const correct = result.correctCount || 0
  const ratio = total > 0 ? correct / total : 0
  const percent = Math.round(ratio * 100)
  const passed = ratio >= PASS_THRESHOLD
  const resultLabel = passed ? 'Passed' : 'Failed'
  const color = passed ? '#166534' : '#991b1b'
  const bg = passed ? '#dcfce7' : '#fee2e2'

  const submittedAt = result.submittedAtMs
    ? new Date(result.submittedAtMs).toLocaleString('en-GB', { timeZone, timeZoneName: 'short' })
    : 'unknown'
  const submission = result.autoSubmitted
    ? 'Auto-submitted (time ran out or left the exam)'
    : 'Submitted manually'

  const e = escapeHtml
  const rows = [
    ['Participant', `<strong>${e(result.userEmail)}</strong>`],
    ['Exam', e(result.examName)],
    [
      'Result',
      `<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-weight:bold;background:${bg};color:${color};">${resultLabel}</span>`,
    ],
    ['Score', `${correct} of ${total} correct (${percent}%)`],
    ['Duration', formatDuration(result.durationSeconds)],
    ['Submission', submission],
    ['Submitted at', e(submittedAt)],
  ]
  const border = (i) => (i < rows.length - 1 ? 'border-bottom:1px solid #e5e7eb;' : '')

  const heading = forParticipant ? 'Your exam result' : 'Exam finished'
  const intro = forParticipant
    ? `Thank you for taking “${e(result.examName)}”. Here is your result.`
    : 'A participant has completed an exam in exam-os.'
  const footer = forParticipant
    ? `Pass threshold: ${Math.round(PASS_THRESHOLD * 100)}% correct. This is an automatic message; please don't reply.`
    : `Pass threshold: ${Math.round(PASS_THRESHOLD * 100)}% correct. Full answer details are on the admin Results page:
    <a href="${APP_URL}" style="color:#2563eb;">open exam-os</a>`

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;max-width:560px;margin:0 auto;">
  <h2 style="margin:0 0 4px;font-size:20px;">${heading}</h2>
  <p style="margin:0 0 16px;color:#6b7280;">${intro}</p>
  <div style="margin:0 0 20px;padding:14px 16px;border-radius:6px;background:${bg};color:${color};">
    <span style="font-size:18px;font-weight:bold;">${resultLabel}</span>
    <span style="font-size:14px;">&nbsp;·&nbsp;${correct} of ${total} correct (${percent}%)</span>
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
${rows
  .map(
    ([label, value], i) => `    <tr>
      <td style="padding:10px 14px;background:#f9fafb;${border(i)}width:40%;color:#6b7280;">${label}</td>
      <td style="padding:10px 14px;${border(i)}">${value}</td>
    </tr>`
  )
  .join('\n')}
  </table>
  <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">
    ${footer}
  </p>
</div>`

  const text = [
    `${heading}: ${resultLabel}`,
    '',
    `Participant: ${result.userEmail}`,
    `Exam: ${result.examName}`,
    `Score: ${correct} of ${total} correct (${percent}%)`,
    `Duration: ${formatDuration(result.durationSeconds)}`,
    `Submission: ${submission}`,
    `Submitted at: ${submittedAt}`,
    '',
    forParticipant ? 'This is an automatic message; please do not reply.' : `Details: ${APP_URL}`,
  ].join('\n')

  return {
    subject: forParticipant
      ? `Your exam result: ${result.examName} – ${resultLabel} (${percent}%)`
      : `Exam result: ${result.examName} – ${result.userEmail} – ${resultLabel} (${percent}%)`,
    text,
    html,
  }
}

// Reminder for an assigned participant who hasn't completed the exam yet.
// `exam` is the exam document; availableUntil is a Firestore Timestamp.
export function buildReminderEmail(exam, { timeZone = 'UTC' } = {}) {
  const e = escapeHtml
  const name = exam.name || 'an exam'
  const until = exam.availableUntil
    ? exam.availableUntil
        .toDate()
        .toLocaleString('en-GB', { timeZone, dateStyle: 'full', timeStyle: 'short' })
    : null
  const details = [
    until && `Please complete it by <strong>${e(until)}</strong>.`,
    exam.timeLimitMinutes &&
      `Once started, you have ${e(exam.timeLimitMinutes)} minutes, and each exam can only be taken once.`,
  ].filter(Boolean)

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;max-width:560px;margin:0 auto;">
  <h2 style="margin:0 0 4px;font-size:20px;">Reminder: ${e(name)}</h2>
  <p style="margin:0 0 16px;color:#6b7280;">You have been asked to take the exam “${e(name)}”, and it isn't completed yet.</p>
${details.map((d) => `  <p style="margin:0 0 12px;">${d}</p>`).join('\n')}
  <p style="margin:20px 0;">
    <a href="${APP_ROOT}" style="display:inline-block;padding:10px 18px;border-radius:6px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:bold;">Open exam-os</a>
  </p>
  <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">
    Sign in with this email address. If you have already finished the exam, please ignore this message. This is an automatic message; please don't reply.
  </p>
</div>`

  const text = [
    `Reminder: ${name}`,
    '',
    `You have been asked to take the exam "${name}", and it isn't completed yet.`,
    until && `Please complete it by ${until}.`,
    exam.timeLimitMinutes &&
      `Once started, you have ${exam.timeLimitMinutes} minutes, and each exam can only be taken once.`,
    '',
    `Open exam-os: ${APP_ROOT}`,
    'Sign in with this email address. If you have already finished the exam, please ignore this message.',
  ]
    .filter((line) => line !== false && line != null)
    .join('\n')

  return { subject: `Reminder: please complete “${name}”`, text, html }
}

function formatDuration(totalSeconds) {
  if (totalSeconds == null) return 'unknown'
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m} min ${s} s`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
