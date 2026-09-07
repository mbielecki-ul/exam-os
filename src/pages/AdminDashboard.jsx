import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listAllResults, summarizeExamResults, deleteResult } from '../lib/results'
import ExamBarChart from '../components/ExamBarChart'

const PASS_COLOR = '#5fd0a3'
const FAIL_COLOR = '#e5786d'
const CORRECT_COLOR = '#5fd0a3'
const WRONG_COLOR = '#e5786d'

export default function AdminDashboard() {
  const [results, setResults] = useState(null)
  const [examFilter, setExamFilter] = useState('all')
  const [error, setError] = useState('')

  useEffect(() => {
    refresh()
  }, [])

  function refresh() {
    return listAllResults().then(setResults).catch((err) => setError(err.message))
  }

  async function handleDelete(result) {
    const confirmed = window.confirm(
      `Delete this result?\n\n${result.userEmail} — ${result.examName}\n\n` +
        `This can't be undone, and ${result.userEmail} will immediately be able ` +
        `to take "${result.examName}" again.`
    )
    if (!confirmed) return
    await deleteResult(result.id)
    await refresh()
  }

  const examNames = useMemo(() => {
    if (!results) return []
    return [...new Set(results.map((r) => r.examName))]
  }, [results])

  const filtered = useMemo(() => {
    if (!results) return []
    if (examFilter === 'all') return results
    return results.filter((r) => r.examName === examFilter)
  }, [results, examFilter])

  const stats = useMemo(() => summarizeExamResults(filtered), [filtered])
  const totalAnswers = stats.totalCorrect + stats.totalWrong

  if (error) return <div className="page"><p className="error-text">{error}</p></div>
  if (!results) return <div className="page"><p>Loading …</p></div>

  const attendanceData = [
    { name: 'Attended', value: stats.attendees, percent: 100, fill: 'var(--muted)' },
    {
      name: 'Passed',
      value: stats.passed,
      percent: stats.attendees > 0 ? (stats.passed / stats.attendees) * 100 : 0,
      fill: PASS_COLOR,
    },
    {
      name: 'Failed',
      value: stats.failed,
      percent: stats.attendees > 0 ? (stats.failed / stats.attendees) * 100 : 0,
      fill: FAIL_COLOR,
    },
  ]

  const answersData = [
    {
      name: 'Correct',
      value: stats.totalCorrect,
      percent: totalAnswers > 0 ? (stats.totalCorrect / totalAnswers) * 100 : 0,
      fill: CORRECT_COLOR,
    },
    {
      name: 'Wrong',
      value: stats.totalWrong,
      percent: totalAnswers > 0 ? (stats.totalWrong / totalAnswers) * 100 : 0,
      fill: WRONG_COLOR,
    },
  ]

  return (
    <div className="page">
      <div className="admin-header">
        <h1>Results</h1>
        <Link className="button" to="/admin/questions">Manage exams &amp; questions</Link>
      </div>

      <div className="filter-row">
        <label>
          Exam:{' '}
          <select value={examFilter} onChange={(e) => setExamFilter(e.target.value)}>
            <option value="all">All</option>
            {examNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <span className="muted">{filtered.length} result(s)</span>
      </div>

      {filtered.length === 0 ? (
        <p className="muted">No results {examFilter === 'all' ? 'yet' : 'for this exam yet'}.</p>
      ) : (
        <div className="chart-grid">
          <div className="card">
            <h2>Attendance &amp; pass rate</h2>
            <ExamBarChart data={attendanceData} />
          </div>
          <div className="card">
            <h2>Answers given</h2>
            <ExamBarChart data={answersData} />
          </div>
        </div>
      )}

      <table className="results-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Exam</th>
            <th>Score</th>
            <th>Duration</th>
            <th>Status</th>
            <th>Submitted</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id}>
              <td>{r.userEmail}</td>
              <td><Link to={`/admin/exams/${r.examId}`}>{r.examName}</Link></td>
              <td>
                {r.correctCount} / {r.totalQuestions} (
                {Math.round((r.correctCount / r.totalQuestions) * 100)}%)
              </td>
              <td>{formatDuration(r.durationSeconds)}</td>
              <td>{r.autoSubmitted ? 'Timed out' : 'Submitted'}</td>
              <td>{formatTimestamp(r.submittedAt)}</td>
              <td>
                <button className="link-btn-danger" onClick={() => handleDelete(r)}>
                  Delete &amp; reopen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '–'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function formatTimestamp(ts) {
  if (!ts) return '–'
  const date = ts.toDate ? ts.toDate() : new Date(ts)
  return date.toLocaleString('en-GB')
}
