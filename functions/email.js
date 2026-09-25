// Keep in sync with PASS_THRESHOLD in src/lib/results.js (not imported: that
// module pulls in the browser Firebase SDK).
export const PASS_THRESHOLD = 0.66

const APP_URL = 'https://mbielecki-ul.github.io/exam-os/admin'

// Builds { subject, text, html } for one result document.
// `result.submittedAtMs` is the submission time in ms (the Firestore
// Timestamp converted by the caller).
export function buildResultEmail(result, { timeZone = 'UTC' } = {}) {
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

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;max-width:560px;margin:0 auto;">
  <h2 style="margin:0 0 4px;font-size:20px;">Exam finished</h2>
  <p style="margin:0 0 16px;color:#6b7280;">A participant has completed an exam in exam-os.</p>
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
    Pass threshold: ${Math.round(PASS_THRESHOLD * 100)}% correct. Full answer details are on the admin Results page:
    <a href="${APP_URL}" style="color:#2563eb;">open exam-os</a>
  </p>
</div>`

  const text = [
    `Exam finished: ${resultLabel}`,
    '',
    `Participant: ${result.userEmail}`,
    `Exam: ${result.examName}`,
    `Score: ${correct} of ${total} correct (${percent}%)`,
    `Duration: ${formatDuration(result.durationSeconds)}`,
    `Submission: ${submission}`,
    `Submitted at: ${submittedAt}`,
    '',
    `Details: ${APP_URL}`,
  ].join('\n')

  return {
    subject: `Exam result: ${result.examName} – ${result.userEmail} – ${resultLabel} (${percent}%)`,
    text,
    html,
  }
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
