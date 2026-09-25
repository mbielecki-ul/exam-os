import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  listAllExams,
  createExam,
  setExamActive,
  updateExamTimeLimit,
  updateExamDomains,
  updateExamQuestionCount,
  archiveExam,
  unarchiveExam,
  deleteExam,
  countQuestions,
  addQuestions,
  DEFAULT_QUESTION_COUNT,
} from '../lib/exams'
import { parseQuestionFile } from '../lib/parseQuestions'
import { parseDomainList } from '../lib/emailDomain'

export default function AdminQuestions() {
  const [exams, setExams] = useState(null)
  const [counts, setCounts] = useState({})
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newTimeLimit, setNewTimeLimit] = useState('60')
  const [newDomains, setNewDomains] = useState('')
  const [newQuestionCount, setNewQuestionCount] = useState(String(DEFAULT_QUESTION_COUNT))
  const [timeLimitDrafts, setTimeLimitDrafts] = useState({}) // examId -> string being edited
  const [domainDrafts, setDomainDrafts] = useState({}) // examId -> string being edited
  const [questionCountDrafts, setQuestionCountDrafts] = useState({}) // examId -> string being edited
  const [uploadTarget, setUploadTarget] = useState({}) // examId -> {status, message}
  const [showArchived, setShowArchived] = useState(false)
  // Exam cards start collapsed to keep the page short; ids here are expanded.
  const [expanded, setExpanded] = useState(() => new Set())

  function toggleExpanded(examId) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(examId)) next.delete(examId)
      else next.add(examId)
      return next
    })
  }
  const [error, setError] = useState('')

  async function refresh() {
    const list = await listAllExams()
    setExams(list)
    const entries = await Promise.all(list.map(async (e) => [e.id, await countQuestions(e.id)]))
    setCounts(Object.fromEntries(entries))
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message))
  }, [])

  async function handleCreateExam(e) {
    e.preventDefault()
    if (!newName.trim()) return
    const newExamId = await createExam({
      name: newName.trim(),
      description: newDesc.trim(),
      timeLimitMinutes: newTimeLimit,
      allowedDomains: parseDomainList(newDomains),
      questionCount: newQuestionCount,
    })
    setNewName('')
    setNewDesc('')
    setNewTimeLimit('60')
    setNewDomains('')
    setNewQuestionCount(String(DEFAULT_QUESTION_COUNT))
    // Open the new exam so its upload field is right there.
    setExpanded((prev) => new Set(prev).add(newExamId))
    await refresh()
  }

  async function handleSaveTimeLimit(examId) {
    const value = timeLimitDrafts[examId]
    if (!value || Number(value) <= 0) return
    await updateExamTimeLimit(examId, value)
    setTimeLimitDrafts((prev) => {
      const next = { ...prev }
      delete next[examId]
      return next
    })
    await refresh()
  }

  async function handleSaveQuestionCount(examId) {
    const value = questionCountDrafts[examId]
    if (!value || Number(value) <= 0) return
    await updateExamQuestionCount(examId, value)
    setQuestionCountDrafts((prev) => {
      const next = { ...prev }
      delete next[examId]
      return next
    })
    await refresh()
  }

  async function handleSaveDomains(examId) {
    const value = domainDrafts[examId]
    if (value === undefined) return
    await updateExamDomains(examId, parseDomainList(value))
    setDomainDrafts((prev) => {
      const next = { ...prev }
      delete next[examId]
      return next
    })
    await refresh()
  }

  async function handleToggleActive(exam) {
    await setExamActive(exam.id, !exam.active)
    await refresh()
  }

  async function handleArchive(exam) {
    const confirmed = window.confirm(
      `Archive "${exam.name}"?\n\n` +
        `It will be deactivated and hidden from employees, and its results will be ` +
        `hidden from the Results page (still viewable via "Show archived exams"). ` +
        `Nothing is deleted, and you can unarchive it any time.`
    )
    if (!confirmed) return
    await archiveExam(exam.id)
    await refresh()
  }

  async function handleUnarchive(exam) {
    await unarchiveExam(exam.id)
    await refresh()
  }

  async function handleDelete(exam) {
    if (!window.confirm(`Really delete exam "${exam.name}"? Its questions will be kept.`)) return
    await deleteExam(exam.id)
    await refresh()
  }

  async function handleFileUpload(examId, file) {
    const { questions, errors } = await parseQuestionFile(file)

    if (questions.length > 0) {
      await addQuestions(examId, questions)
    }

    setUploadTarget((prev) => ({
      ...prev,
      [examId]: {
        status: errors.length > 0 ? 'partial' : 'ok',
        message:
          `${questions.length} question(s) added.` +
          (errors.length > 0 ? ` ${errors.length} row(s) skipped.` : ''),
      },
    }))
    await refresh()
  }

  if (error) return <div className="page"><p className="error-text">{error}</p></div>
  if (!exams) return <div className="page"><p>Loading …</p></div>

  const currentExams = exams.filter((e) => !e.archived)
  const archivedExams = exams.filter((e) => e.archived)

  return (
    <div className="page">
      <div className="admin-header">
        <h1>Exams &amp; Questions</h1>
        <Link className="button" to="/admin">Back to results</Link>
      </div>

      <div className="card">
        <h2>Create a new exam</h2>
        <form onSubmit={handleCreateExam} className="new-exam-form">
          <input
            placeholder="Exam name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
          <input
            placeholder="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <input
            type="number"
            min="1"
            placeholder="Time limit (minutes)"
            value={newTimeLimit}
            onChange={(e) => setNewTimeLimit(e.target.value)}
            required
            style={{ maxWidth: '11rem' }}
          />
          <input
            type="number"
            min="1"
            placeholder="Questions per attempt"
            value={newQuestionCount}
            onChange={(e) => setNewQuestionCount(e.target.value)}
            required
            style={{ maxWidth: '11rem' }}
          />
          <input
            placeholder="Allowed domains (optional, e.g. ul.com)"
            value={newDomains}
            onChange={(e) => setNewDomains(e.target.value)}
          />
          <button type="submit" className="button">Create</button>
        </form>
        <p className="muted" style={{ marginTop: '0.5rem' }}>
          Allowed domains: comma-separated (e.g. <code>ul.com, partner.com</code>).
          Leave empty for an exam open to every employee. Questions per attempt is
          capped at however many questions are actually in the pool.
        </p>
      </div>

      {currentExams.length > 1 && (
        <div className="exam-collapse-controls">
          <button
            type="button"
            className="link-btn"
            onClick={() => setExpanded(new Set(currentExams.map((e) => e.id)))}
          >
            Expand all
          </button>
          <button type="button" className="link-btn" onClick={() => setExpanded(new Set())}>
            Collapse all
          </button>
        </div>
      )}

      <div className="exam-admin-list">
        {currentExams.map((exam) => {
          const isOpen = expanded.has(exam.id)
          const hasUnsaved =
            timeLimitDrafts[exam.id] !== undefined ||
            questionCountDrafts[exam.id] !== undefined ||
            domainDrafts[exam.id] !== undefined
          return (
          <div key={exam.id} className="card exam-admin-card">
            <div className="exam-admin-summary">
              <button
                type="button"
                className="exam-collapse-toggle"
                aria-expanded={isOpen}
                onClick={() => toggleExpanded(exam.id)}
              >
                <span className="exam-collapse-chevron" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                <span className="exam-collapse-title">{exam.name}</span>
                <span className="muted exam-collapse-meta">
                  {counts[exam.id] ?? '…'} question(s) · {exam.active ? 'active' : 'inactive'}
                  {exam.timeLimitMinutes ? ` · ${exam.timeLimitMinutes} min` : ''}
                  {!isOpen && hasUnsaved && <span className="error-text"> · unsaved changes</span>}
                </span>
              </button>
              <div className="exam-admin-actions">
                <Link className="button" to={`/admin/exams/${exam.id}`}>View overview</Link>
                <Link className="button" to={`/admin/questions/${exam.id}`}>Manage questions</Link>
              </div>
            </div>

            {isOpen && (
            <div className="exam-admin-details">
            <div className="exam-admin-row">
              <div>
                {exam.description && <p className="muted">{exam.description}</p>}
                <div className="time-limit-row">
                  <label className="muted">
                    Time limit (minutes):{' '}
                    <input
                      type="number"
                      min="1"
                      className="time-limit-input"
                      value={timeLimitDrafts[exam.id] ?? exam.timeLimitMinutes ?? ''}
                      placeholder="none set"
                      onChange={(e) =>
                        setTimeLimitDrafts((prev) => ({ ...prev, [exam.id]: e.target.value }))
                      }
                    />
                  </label>
                  {timeLimitDrafts[exam.id] !== undefined && (
                    <button onClick={() => handleSaveTimeLimit(exam.id)}>Save</button>
                  )}
                  {!exam.timeLimitMinutes && timeLimitDrafts[exam.id] === undefined && (
                    <span className="error-text">No time limit set yet — exam will run unlimited.</span>
                  )}
                </div>
                <div className="time-limit-row">
                  <label className="muted">
                    Questions per attempt:{' '}
                    <input
                      type="number"
                      min="1"
                      className="time-limit-input"
                      value={questionCountDrafts[exam.id] ?? exam.questionCount ?? DEFAULT_QUESTION_COUNT}
                      onChange={(e) =>
                        setQuestionCountDrafts((prev) => ({ ...prev, [exam.id]: e.target.value }))
                      }
                    />
                  </label>
                  {questionCountDrafts[exam.id] !== undefined && (
                    <button onClick={() => handleSaveQuestionCount(exam.id)}>Save</button>
                  )}
                  <span className="muted">
                    (capped at {counts[exam.id] ?? '…'} available in the pool)
                  </span>
                </div>
                <div className="time-limit-row">
                  <label className="muted">
                    Allowed domains:{' '}
                    <input
                      className="domain-input"
                      value={
                        domainDrafts[exam.id] ??
                        (exam.allowedDomains || []).join(', ')
                      }
                      placeholder="open to everyone"
                      onChange={(e) =>
                        setDomainDrafts((prev) => ({ ...prev, [exam.id]: e.target.value }))
                      }
                    />
                  </label>
                  {domainDrafts[exam.id] !== undefined && (
                    <button onClick={() => handleSaveDomains(exam.id)}>Save</button>
                  )}
                  {(!exam.allowedDomains || exam.allowedDomains.length === 0) &&
                    domainDrafts[exam.id] === undefined && (
                      <span className="muted">Open to everyone</span>
                    )}
                </div>
              </div>
              <div className="exam-admin-actions">
                <button onClick={() => handleToggleActive(exam)}>
                  {exam.active ? 'Deactivate' : 'Activate'}
                </button>
                <button onClick={() => handleArchive(exam)}>Archive</button>
                <button onClick={() => handleDelete(exam)}>Delete</button>
              </div>
            </div>

            <div className="upload-row">
              <label className="upload-label">
                Upload questions (CSV, Excel, or JSON)
                <input
                  type="file"
                  accept=".csv,.json,.xlsx,.xls"
                  onChange={(e) => {
                    const file = e.target.files[0]
                    if (file) handleFileUpload(exam.id, file)
                    e.target.value = ''
                  }}
                />
              </label>
              {uploadTarget[exam.id] && (
                <p className={uploadTarget[exam.id].status === 'partial' ? 'error-text' : 'muted'}>
                  {uploadTarget[exam.id].message}
                </p>
              )}
            </div>
            </div>
            )}
          </div>
          )
        })}
      </div>

      {archivedExams.length > 0 && (
        <div className="archived-section">
          <button className="link-btn" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Hide' : 'Show'} archived exams ({archivedExams.length})
          </button>
          {showArchived && (
            <div className="exam-admin-list">
              {archivedExams.map((exam) => (
                <div key={exam.id} className="card card-archived">
                  <div className="exam-admin-row">
                    <div>
                      <h2>{exam.name} <span className="badge-archived">Archived</span></h2>
                      {exam.description && <p className="muted">{exam.description}</p>}
                      <p className="muted">
                        {counts[exam.id] ?? '…'} question(s) in pool
                        {exam.archivedAt && <> · archived {formatDate(exam.archivedAt)}</>}
                      </p>
                    </div>
                    <div className="exam-admin-actions">
                      <Link className="button" to={`/admin/exams/${exam.id}`}>View overview</Link>
                      <button onClick={() => handleUnarchive(exam)}>Unarchive</button>
                      <button onClick={() => handleDelete(exam)}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h2>File format</h2>
        <p className="muted">
          CSV/Excel columns: <code>question,option1,option2,option3,option4,correctOption,category</code>{' '}
          (correctOption = 1–4, category is optional text). JSON: array of{' '}
          <code>{'{ "text", "options": [4], "correctIndex": 0-3, "category": "..." }'}</code>.
        </p>
        <p className="muted">
          Sample files with a working example:{' '}
          <a href={`${import.meta.env.BASE_URL}sample-questions.csv`} download>
            sample-questions.csv
          </a>
          ,{' '}
          <a href={`${import.meta.env.BASE_URL}sample-questions.xlsx`} download>
            sample-questions.xlsx
          </a>
          , or{' '}
          <a href={`${import.meta.env.BASE_URL}sample-questions.json`} download>
            sample-questions.json
          </a>
          .
        </p>
      </div>
    </div>
  )
}

function formatDate(ts) {
  const date = ts.toDate ? ts.toDate() : new Date(ts)
  return date.toLocaleDateString('en-GB')
}
