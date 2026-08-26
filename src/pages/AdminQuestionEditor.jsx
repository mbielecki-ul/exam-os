import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  listAllExams,
  listQuestions,
  addQuestion,
  updateQuestion,
  deleteQuestion,
} from '../lib/exams'

const EMPTY_FORM = { text: '', options: ['', '', '', ''], correctIndex: 0, category: '' }

export default function AdminQuestionEditor() {
  const { examId } = useParams()
  const [exam, setExam] = useState(null)
  const [questions, setQuestions] = useState(null)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [editingId, setEditingId] = useState(null) // null | 'new' | questionId
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function refresh() {
    const exams = await listAllExams()
    setExam(exams.find((e) => e.id === examId) || null)
    setQuestions(await listQuestions(examId))
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message))
  }, [examId])

  const categories = useMemo(() => {
    if (!questions) return []
    return [...new Set(questions.map((q) => q.category || 'Uncategorized'))].sort()
  }, [questions])

  const filtered = useMemo(() => {
    if (!questions) return []
    if (categoryFilter === 'all') return questions
    return questions.filter((q) => (q.category || 'Uncategorized') === categoryFilter)
  }, [questions, categoryFilter])

  function startEdit(q) {
    setEditingId(q.id)
    setForm({
      text: q.text,
      options: [...q.options],
      correctIndex: q.correctIndex,
      category: q.category || '',
    })
    setError('')
  }

  function startNew() {
    setEditingId('new')
    setForm(EMPTY_FORM)
    setError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  function validateForm() {
    if (!form.text.trim()) return 'Question text is required.'
    if (form.options.some((o) => !o.trim())) return 'All 4 answer options are required.'
    return null
  }

  async function handleSave() {
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }
    setSaving(true)
    setError('')
    const payload = {
      text: form.text.trim(),
      options: form.options.map((o) => o.trim()),
      correctIndex: Number(form.correctIndex),
      category: form.category.trim() || 'Uncategorized',
    }
    try {
      if (editingId === 'new') {
        await addQuestion(examId, payload)
      } else {
        await updateQuestion(editingId, payload)
      }
      cancelEdit()
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(questionId) {
    if (!window.confirm('Delete this question permanently?')) return
    await deleteQuestion(questionId)
    if (editingId === questionId) cancelEdit()
    await refresh()
  }

  if (error && !questions) return <div className="page"><p className="error-text">{error}</p></div>
  if (!questions) return <div className="page"><p>Loading …</p></div>

  return (
    <div className="page">
      <div className="admin-header">
        <h1>{exam ? exam.name : 'Exam'} — Questions</h1>
        <Link className="button" to="/admin/questions">Back to exams</Link>
      </div>

      <div className="filter-row">
        <label>
          Category:{' '}
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">All</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <span className="muted">{filtered.length} of {questions.length} question(s)</span>
        {editingId === null && (
          <button className="button" onClick={startNew}>Add question</button>
        )}
      </div>

      {editingId === 'new' && (
        <QuestionForm
          form={form}
          setForm={setForm}
          error={error}
          saving={saving}
          onSave={handleSave}
          onCancel={cancelEdit}
          saveLabel="Add question"
        />
      )}

      <div className="question-list">
        {filtered.map((q) =>
          editingId === q.id ? (
            <QuestionForm
              key={q.id}
              form={form}
              setForm={setForm}
              error={error}
              saving={saving}
              onSave={handleSave}
              onCancel={cancelEdit}
              saveLabel="Save changes"
            />
          ) : (
            <div key={q.id} className="card question-row">
              <div className="question-row-header">
                <span className="category-tag">{q.category || 'Uncategorized'}</span>
                <div className="exam-admin-actions">
                  <button onClick={() => startEdit(q)}>Edit</button>
                  <button onClick={() => handleDelete(q.id)}>Delete</button>
                </div>
              </div>
              <p className="question-text">{q.text}</p>
              <ul className="option-preview-list">
                {q.options.map((opt, idx) => (
                  <li key={idx} className={idx === q.correctIndex ? 'option-correct' : ''}>
                    {opt}
                  </li>
                ))}
              </ul>
            </div>
          )
        )}
        {filtered.length === 0 && editingId !== 'new' && (
          <p className="muted">No questions in this category yet.</p>
        )}
      </div>
    </div>
  )
}

function QuestionForm({ form, setForm, error, saving, onSave, onCancel, saveLabel }) {
  function setOption(idx, value) {
    const options = [...form.options]
    options[idx] = value
    setForm({ ...form, options })
  }

  return (
    <div className="card question-form">
      <label className="field-label">
        Question text
        <textarea
          value={form.text}
          onChange={(e) => setForm({ ...form, text: e.target.value })}
          rows={2}
        />
      </label>

      <label className="field-label">
        Category
        <input
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          placeholder="e.g. Networking"
        />
      </label>

      <div className="options-edit-grid">
        {form.options.map((opt, idx) => (
          <label key={idx} className="option-edit-row">
            <input
              type="radio"
              name="correctIndex"
              checked={Number(form.correctIndex) === idx}
              onChange={() => setForm({ ...form, correctIndex: idx })}
            />
            <input
              className="option-edit-input"
              value={opt}
              onChange={(e) => setOption(idx, e.target.value)}
              placeholder={`Option ${idx + 1}`}
            />
          </label>
        ))}
      </div>
      <p className="muted">Select the radio button next to the correct answer.</p>

      {error && <p className="error-text">{error}</p>}

      <div className="exam-admin-actions">
        <button className="button" disabled={saving} onClick={onSave}>
          {saving ? 'Saving …' : saveLabel}
        </button>
        <button onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </div>
  )
}
