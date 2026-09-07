import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  listAllExams,
  createExam,
  setExamActive,
  updateExamTimeLimit,
  updateExamDomains,
  deleteExam,
  countQuestions,
  addQuestions,
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
  const [timeLimitDrafts, setTimeLimitDrafts] = useState({}) // examId -> string being edited
  const [domainDrafts, setDomainDrafts] = useState({}) // examId -> string being edited
  const [uploadTarget, setUploadTarget] = useState({}) // examId -> {status, message}
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
    await createExam({
      name: newName.trim(),
      description: newDesc.trim(),
      timeLimitMinutes: newTimeLimit,
      allowedDomains: parseDomainList(newDomains),
    })
    setNewName('')
    setNewDesc('')
    setNewTimeLimit('60')
    setNewDomains('')
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
            placeholder="Allowed domains (optional, e.g. ul.com)"
            value={newDomains}
            onChange={(e) => setNewDomains(e.target.value)}
          />
          <button type="submit" className="button">Create</button>
        </form>
        <p className="muted" style={{ marginTop: '0.5rem' }}>
          Allowed domains: comma-separated (e.g. <code>ul.com, partner.com</code>).
          Leave empty for an exam open to every employee.
        </p>
      </div>

      <div className="exam-admin-list">
        {exams.map((exam) => (
          <div key={exam.id} className="card">
            <div className="exam-admin-row">
              <div>
                <h2>{exam.name}</h2>
                {exam.description && <p className="muted">{exam.description}</p>}
                <p className="muted">
                  {counts[exam.id] ?? '…'} question(s) in pool ·{' '}
                  {exam.active ? 'active' : 'inactive'}
                </p>
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
                <Link className="button" to={`/admin/exams/${exam.id}`}>View overview</Link>
                <Link className="button" to={`/admin/questions/${exam.id}`}>Manage questions</Link>
                <button onClick={() => handleToggleActive(exam)}>
                  {exam.active ? 'Deactivate' : 'Activate'}
                </button>
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
        ))}
      </div>

      <div className="card">
        <h2>File format</h2>
        <p className="muted">
          CSV/Excel columns: <code>question,option1,option2,option3,option4,correctOption,category</code>{' '}
          (correctOption = 1–4, category is optional text). JSON: array of{' '}
          <code>{'{ "text", "options": [4], "correctIndex": 0-3, "category": "..." }'}</code>.
          Download <code>sample-questions.xlsx</code> in the repo for a working example.
        </p>
      </div>
    </div>
  )
}
