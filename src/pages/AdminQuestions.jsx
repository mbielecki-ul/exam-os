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
    if (!window.confirm(`Prüfung "${exam.name}" wirklich löschen? Fragen bleiben erhalten.`)) return
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
          `${questions.length} Frage(n) hinzugefügt.` +
          (errors.length > 0 ? ` ${errors.length} Zeile(n) übersprungen.` : ''),
      },
    }))
    await refresh()
  }

  if (error) return <div className="page"><p className="error-text">{error}</p></div>
  if (!exams) return <div className="page"><p>Lädt …</p></div>

  return (
    <div className="page">
      <div className="admin-header">
        <h1>Prüfungen &amp; Fragen</h1>
        <Link className="button" to="/admin">Zu den Ergebnissen</Link>
      </div>

      <div className="card">
        <h2>Neue Prüfung anlegen</h2>
        <form onSubmit={handleCreateExam} className="new-exam-form">
          <input
            placeholder="Name der Prüfung"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
          <input
            placeholder="Beschreibung (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <button type="submit" className="button">Anlegen</button>
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
                  {counts[exam.id] ?? '…'} Frage(n) im Pool ·{' '}
                  {exam.active ? 'aktiv' : 'inaktiv'}
                </p>
              </div>
              <div className="exam-admin-actions">
                <button onClick={() => handleToggleActive(exam)}>
                  {exam.active ? 'Deaktivieren' : 'Aktivieren'}
                </button>
                <button onClick={() => handleDelete(exam)}>Löschen</button>
              </div>
            </div>

            <div className="upload-row">
              <label className="upload-label">
                Fragen hochladen (CSV oder JSON)
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
        <h2>Dateiformat</h2>
        <p className="muted">
          CSV-Spalten: <code>question,option1,option2,option3,option4,correctOption</code>{' '}
          (correctOption = 1–4). JSON: Array von{' '}
          <code>{'{ "text", "options": [4], "correctIndex": 0-3 }'}</code>.
        </p>
      </div>
    </div>
  )
}
