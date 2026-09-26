import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  getAssignment,
  saveAssignedEmails,
  listAttemptsForExam,
  sendReminders,
} from '../lib/assignments'
import { parseEmailList } from '../lib/emailDomain'
import { formatDateTime } from '../lib/exams'
import { PASS_THRESHOLD } from '../lib/results'

// "Who should take this exam, and who has?" for one exam: the assigned
// participant list, each person's status (completed / in progress / not
// started), and reminder emails for the ones who haven't finished.
export default function ExamParticipants({ exam, results }) {
  const examId = exam.id
  const [assignment, setAssignment] = useState(null)
  const [inProgress, setInProgress] = useState(new Set())
  const [draft, setDraft] = useState(null) // text being edited, null = not editing
  const [openOnly, setOpenOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function load() {
    const [a, attempts] = await Promise.all([getAssignment(examId), listAttemptsForExam(examId)])
    setAssignment(a)
    setInProgress(new Set(attempts.map((t) => (t.userEmail || '').toLowerCase())))
  }

  useEffect(() => {
    setAssignment(null)
    setDraft(null)
    setMessage('')
    load().catch((err) => setError(err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId])

  if (!assignment) {
    return (
      <div className="card">
        <h2>Participants</h2>
        {error ? <p className="error-text">{error}</p> : <p className="muted">Loading …</p>}
      </div>
    )
  }

  const resultByEmail = new Map(results.map((r) => [(r.userEmail || '').toLowerCase(), r]))
  const rows = assignment.emails.map((email) => {
    const result = resultByEmail.get(email)
    const status = result ? 'completed' : inProgress.has(email) ? 'in-progress' : 'not-started'
    return { email, result, status, remindedAt: assignment.reminders[email] }
  })
  const done = rows.filter((r) => r.status === 'completed').length
  const running = rows.filter((r) => r.status === 'in-progress').length
  const open = rows.length - done
  const assignedSet = new Set(assignment.emails)
  const unlisted = results.filter((r) => !assignedSet.has((r.userEmail || '').toLowerCase())).length
  const visibleRows = openOnly ? rows.filter((r) => r.status !== 'completed') : rows
  const draftEmails = draft === null ? [] : parseEmailList(draft)
  const canRemind = exam.active && !exam.archived

  async function run(action) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await action()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function handleSave() {
    run(async () => {
      await saveAssignedEmails(examId, draftEmails)
      await load()
      setDraft(null)
      setMessage(`Participant list saved (${draftEmails.length}).`)
    })
  }

  async function handleImport(file) {
    try {
      const text = /\.xlsx?$/i.test(file.name)
        ? workbookText(XLSX.read(await file.arrayBuffer()))
        : await file.text()
      const found = parseEmailList(text)
      setDraft((d) => [d || '', ...found].filter(Boolean).join('\n'))
      setMessage(`${found.length} address(es) found in ${file.name}. Review and save.`)
    } catch (err) {
      setError(`Could not read ${file.name}: ${err.message}`)
    }
  }

  function handleRemind(emails) {
    const count = emails ? emails.length : open
    const who = emails ? emails[0] : `${count} participant(s) who haven't completed it`
    if (!window.confirm(`Send a reminder email for "${exam.name}" to ${who}?`)) return
    run(async () => {
      const { sent } = await sendReminders(examId, emails)
      await load()
      setMessage(sent === 1 ? 'Reminder sent to 1 person.' : `Reminder sent to ${sent} people.`)
    })
  }

  return (
    <div className="card">
      <div className="admin-header">
        <h2>Participants</h2>
        {draft === null && (
          <button
            className="link-btn"
            onClick={() => {
              setDraft(assignment.emails.join('\n'))
              setMessage('')
            }}
          >
            {assignment.emails.length ? 'Edit list' : 'Add participants'}
          </button>
        )}
      </div>

      {draft !== null ? (
        <div className="participants-edit">
          <p className="muted">
            One email per line (or comma-separated, or pasted from Outlook). Or import a
            CSV, text or Excel file: every email address in it is picked up.
          </p>
          <textarea
            className="participants-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={'anna.muster@ul.com\nmax.beispiel@ul.com'}
          />
          <div className="time-limit-row">
            <label className="upload-label">
              Import file
              <input
                type="file"
                accept=".csv,.txt,.xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files[0]
                  if (file) handleImport(file)
                  e.target.value = ''
                }}
              />
            </label>
            <span className="muted">{draftEmails.length} address(es) recognised</span>
            <button className="button" disabled={busy} onClick={handleSave}>Save list</button>
            <button disabled={busy} onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>
      ) : assignment.emails.length === 0 ? (
        <p className="muted">
          No participant list yet. Add the people who should take this exam to see who
          has completed it and to send them reminders.
        </p>
      ) : (
        <>
          <p>
            <strong>{done} of {rows.length}</strong> completed · {running} in progress ·{' '}
            {open - running} not started
            {unlisted > 0 && (
              <span className="muted"> · {unlisted} more completed who aren&apos;t on the list</span>
            )}
          </p>
          <div className="filter-row">
            <label className="muted">
              <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />{' '}
              Only show who hasn&apos;t completed
            </label>
            {open > 0 && (
              <button
                className="button"
                disabled={busy || !canRemind}
                title={canRemind ? undefined : 'Activate the exam to send reminders'}
                onClick={() => handleRemind(null)}
              >
                Send reminder to {open} not completed
              </button>
            )}
          </div>
          {!canRemind && open > 0 && (
            <p className="muted">Reminders can be sent while the exam is active.</p>
          )}
          <table className="results-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Status</th>
                <th>Last reminder</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.email}>
                  <td>{r.email}</td>
                  <td>
                    <StatusCell row={r} />
                  </td>
                  <td className="muted">{r.remindedAt ? formatDateTime(r.remindedAt) : '—'}</td>
                  <td>
                    {r.status !== 'completed' && canRemind && (
                      <button className="link-btn" disabled={busy} onClick={() => handleRemind([r.email])}>
                        Remind
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {message && <p className="muted">{message}</p>}
      {error && <p className="error-text">{error}</p>}
    </div>
  )
}

function StatusCell({ row }) {
  if (row.status === 'in-progress') return <span>In progress</span>
  if (row.status === 'not-started') return <span className="muted">Not started</span>
  const { correctCount, totalQuestions } = row.result
  const passed = totalQuestions > 0 && correctCount / totalQuestions >= PASS_THRESHOLD
  const pct = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0
  return (
    <span className={passed ? 'pass-text' : 'fail-text'}>
      Completed · {pct}% ({passed ? 'passed' : 'failed'})
    </span>
  )
}

// All cells of every sheet as text, for pulling email addresses out.
function workbookText(workbook) {
  return workbook.SheetNames.map((name) => XLSX.utils.sheet_to_csv(workbook.Sheets[name])).join('\n')
}
