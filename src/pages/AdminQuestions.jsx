import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  listAllExams,
  createExam,
  setExamActive,
  deleteExam,
  countQuestions,
  addQuestions,
} from '../lib/exams'
import { parseQuestionFile } from '../lib/parseQuestions'

export default function AdminQuestions() {
  const [exams, setExams] = useState(null)
  const [counts, setCounts] = useState({})
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
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
    await createExam({ name: newName.trim(), description: newDesc.trim() })
    setNewName('')
    setNewDesc('')
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
    const text = await file.text()
    const { questions, errors } = parseQuestionFile(file.name, text)

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
          <button type="submit" className="button">Create</button>
        </form>
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
              </div>
              <div className="exam-admin-actions">
                <button onClick={() => handleToggleActive(exam)}>
                  {exam.active ? 'Deactivate' : 'Activate'}
                </button>
                <button onClick={() => handleDelete(exam)}>Delete</button>
              </div>
            </div>

            <div className="upload-row">
              <label className="upload-label">
                Upload questions (CSV or JSON)
                <input
                  type="file"
                  accept=".csv,.json"
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
          CSV columns: <code>question,option1,option2,option3,option4,correctOption</code>{' '}
          (correctOption = 1–4). JSON: array of{' '}
          <code>{'{ "text", "options": [4], "correctIndex": 0-3 }'}</code>.
        </p>
      </div>
    </div>
  )
}
