import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listAllResults } from '../lib/results'

export default function AdminDashboard() {
  const [results, setResults] = useState(null)
  const [examFilter, setExamFilter] = useState('all')
  const [error, setError] = useState('')

  useEffect(() => {
    listAllResults().then(setResults).catch((err) => setError(err.message))
  }, [])

  const examNames = useMemo(() => {
    if (!results) return []
    return [...new Set(results.map((r) => r.examName))]
  }, [results])

  const filtered = useMemo(() => {
    if (!results) return []
    if (examFilter === 'all') return results
    return results.filter((r) => r.examName === examFilter)
  }, [results, examFilter])

  if (error) return <div className="page"><p className="error-text">{error}</p></div>
  if (!results) return <div className="page"><p>Lädt …</p></div>

  return (
    <div className="page">
      <div className="admin-header">
        <h1>Ergebnisse</h1>
        <Link className="button" to="/admin/questions">Prüfungen &amp; Fragen verwalten</Link>
      </div>

      <div className="filter-row">
        <label>
          Prüfung:{' '}
          <select value={examFilter} onChange={(e) => setExamFilter(e.target.value)}>
            <option value="all">Alle</option>
            {examNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <span className="muted">{filtered.length} Ergebnis(se)</span>
      </div>

      <table className="results-table">
        <thead>
          <tr>
            <th>Mitarbeiter</th>
            <th>Prüfung</th>
            <th>Ergebnis</th>
            <th>Dauer</th>
            <th>Eingereicht</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id}>
              <td>{r.userEmail}</td>
              <td>{r.examName}</td>
              <td>
                {r.correctCount} / {r.totalQuestions} (
                {Math.round((r.correctCount / r.totalQuestions) * 100)}%)
              </td>
              <td>{formatDuration(r.durationSeconds)}</td>
              <td>{formatTimestamp(r.submittedAt)}</td>
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
  return date.toLocaleString('de-DE')
}
