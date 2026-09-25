import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { countAllResults, listResultsPage, summarizeExamResults, deleteResult } from '../lib/results'
import { listAllExams } from '../lib/exams'
import ExamBarChart from '../components/ExamBarChart'

const PASS_COLOR = '#5fd0a3'
const FAIL_COLOR = '#e5786d'
const CORRECT_COLOR = '#5fd0a3'
const WRONG_COLOR = '#e5786d'

export default function AdminDashboard() {
  const [results, setResults] = useState(null)
  const [totalCount, setTotalCount] = useState(0)
  const [cursor, setCursor] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [examFilter, setExamFilter] = useState('all')
  const [archivedExamIds, setArchivedExamIds] = useState(new Set())
  const [showArchived, setShowArchived] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    refresh()
  }, [])

  // Reloads from the newest result — used on mount and after a delete.
  // Charts/totals below only cover whatever pages have been loaded so far,
  // not the whole history, to avoid re-reading every result on every visit
  // (see listResultsPage() in src/lib/results.js).
  async function refresh() {
    try {
      const [count, page, exams] = await Promise.all([
        countAllResults(),
        listResultsPage(),
        listAllExams(),
      ])
      setArchivedExamIds(new Set(exams.filter((e) => e.archived).map((e) => e.id)))
      setTotalCount(count)
      setResults(page.results)
      setCursor(page.cursor)
      setHasMore(page.hasMore)
    } catch (err) {
      setError(err.message)
    }
  }

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await listResultsPage(cursor)
      setResults((prev) => [...prev, ...page.results])
      setCursor(page.cursor)
      setHasMore(page.hasMore)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingMore(false)
    }
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

  // Results of archived exams stay in Firestore; they're just left out here
  // unless the admin explicitly asks to see them.
  const visibleResults = useMemo(() => {
    if (!results) return []
    if (showArchived) return results
    return results.filter((r) => !archivedExamIds.has(r.examId))
  }, [results, showArchived, archivedExamIds])

  const examNames = useMemo(
    () => [...new Set(visibleResults.map((r) => r.examName))],
    [visibleResults]
  )

  const filtered = useMemo(() => {
    if (examFilter === 'all') return visibleResults
    return visibleResults.filter((r) => r.examName === examFilter)
  }, [visibleResults, examFilter])

  const hiddenArchivedCount = results ? results.length - visibleResults.length : 0

  function toggleShowArchived(checked) {
    setShowArchived(checked)
    // The selected exam may be archived and about to disappear from the list.
    if (!checked) setExamFilter('all')
  }

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
        <label className="muted">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => toggleShowArchived(e.target.checked)}
          />{' '}
          Show archived exams
          {!showArchived && hiddenArchivedCount > 0 && ` (${hiddenArchivedCount} hidden)`}
        </label>
        <span className="muted">{filtered.length} result(s)</span>
      </div>

      {hasMore && (
        <p className="muted">
          Showing the {results.length} most recently submitted results of{' '}
          {totalCount} total — the charts and totals below only cover what's
          loaded here.{' '}
          <button className="link-btn" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading …' : 'Load older results'}
          </button>
        </p>
      )}

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
              <td>
                <Link to={`/admin/exams/${r.examId}`}>{r.examName}</Link>
                {archivedExamIds.has(r.examId) && <span className="badge-archived">Archived</span>}
              </td>
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
  // Explicit zone name: this renders in the viewing admin's local time, which
  // reads as ambiguous for a 24/7 team submitting across timezones without it
  // (was an admin looking at "22:14" seeing their own evening, or a night
  // shift on the other side of the world?).
  return date.toLocaleString('en-GB', { timeZoneName: 'short' })
}
