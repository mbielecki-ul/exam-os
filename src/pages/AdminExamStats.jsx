import { Fragment, useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { listAllExams, listQuestions } from '../lib/exams'
import { listResultsForExam, summarizeExamResults, deleteResult, PASS_THRESHOLD } from '../lib/results'
import ExamBarChart from '../components/ExamBarChart'

const PASS_COLOR = '#5fd0a3'
const FAIL_COLOR = '#e5786d'
const CORRECT_COLOR = '#5fd0a3'
const WRONG_COLOR = '#e5786d'

export default function AdminExamStats() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const [exams, setExams] = useState(null)
  const [exam, setExam] = useState(null)
  const [results, setResults] = useState(null)
  const [questionsById, setQuestionsById] = useState({})
  const [expandedResultId, setExpandedResultId] = useState(null)
  const [showWrongOnly, setShowWrongOnly] = useState(false)
  const [error, setError] = useState('')

  // Load the full exam list once, so the selector below can switch between
  // them without a round trip back to "Manage exams & questions".
  useEffect(() => {
    listAllExams().then(setExams).catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    refresh()
  }, [examId])

  async function refresh() {
    try {
      setResults(null)
      setExpandedResultId(null)
      const exams = await listAllExams()
      setExam(exams.find((e) => e.id === examId) || null)
      const [examResults, questions] = await Promise.all([
        listResultsForExam(examId),
        listQuestions(examId),
      ])
      setResults(examResults)
      setQuestionsById(Object.fromEntries(questions.map((q) => [q.id, q])))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(result) {
    const confirmed = window.confirm(
      `Delete this result?\n\n${result.userEmail}\n\n` +
        `This can't be undone, and ${result.userEmail} will immediately be able ` +
        `to take this exam again.`
    )
    if (!confirmed) return
    await deleteResult(result.id)
    await refresh()
  }

  if (error) return <div className="page"><p className="error-text">{error}</p></div>
  if (!results) return <div className="page"><p>Loading …</p></div>

  const stats = summarizeExamResults(results)
  const totalAnswers = stats.totalCorrect + stats.totalWrong

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
        <h1>{exam ? exam.name : 'Exam'} — Overview</h1>
        <Link className="button" to="/admin/questions">Back to exams</Link>
      </div>

      <div className="filter-row">
        <label>
          Exam:{' '}
          <select
            value={examId}
            onChange={(e) => navigate(`/admin/exams/${e.target.value}`)}
          >
            {(exams || []).map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="stats-grid">
        <StatCard label="Attendees" value={stats.attendees} />
        <StatCard
          label="Passed"
          value={stats.passed}
          sub={`${Math.round(stats.passRate)}% pass rate (≥ ${Math.round(PASS_THRESHOLD * 100)}%)`}
          accent
        />
        <StatCard label="Failed" value={stats.failed} />
        <StatCard
          label="Correct answers"
          value={stats.totalCorrect}
          sub={totalAnswers > 0 ? `${Math.round((stats.totalCorrect / totalAnswers) * 100)}% of all answers` : undefined}
        />
        <StatCard
          label="Wrong answers"
          value={stats.totalWrong}
          sub={totalAnswers > 0 ? `${Math.round((stats.totalWrong / totalAnswers) * 100)}% of all answers` : undefined}
        />
      </div>

      {stats.attendees === 0 && (
        <p className="muted">No one has attended this exam yet.</p>
      )}

      {stats.attendees > 0 && (
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

      {stats.attendees > 0 && (
        <div className="card">
          <div className="admin-header">
            <h2>Attendees</h2>
            <button className="link-btn" onClick={() => setShowWrongOnly((v) => !v)}>
              {showWrongOnly ? 'Show all answers' : 'Show wrong answers only'}
            </button>
          </div>
          <table className="results-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Score</th>
                <th>Result</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const pct = Math.round((r.correctCount / r.totalQuestions) * 100)
                const passed = r.correctCount / r.totalQuestions >= PASS_THRESHOLD
                const expanded = expandedResultId === r.id
                return (
                  <Fragment key={r.id}>
                    <tr>
                      <td>{r.userEmail}</td>
                      <td>{r.correctCount} / {r.totalQuestions} ({pct}%)</td>
                      <td className={passed ? 'pass-text' : 'fail-text'}>
                        {passed ? 'Passed' : 'Failed'}
                      </td>
                      <td>{r.autoSubmitted ? 'Timed out' : 'Submitted'}</td>
                      <td>
                        <button
                          className="link-btn"
                          onClick={() => setExpandedResultId(expanded ? null : r.id)}
                        >
                          {expanded ? 'Hide answers' : 'View answers'}
                        </button>{' '}
                        <button className="link-btn-danger" onClick={() => handleDelete(r)}>
                          Delete &amp; reopen
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={5}>
                          <AnswerBreakdown
                            answers={r.answers || []}
                            questionsById={questionsById}
                            wrongOnly={showWrongOnly}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="card stat-card">
      <p className="muted">{label}</p>
      <p className={'stat-value' + (accent ? ' stat-value-accent' : '')}>{value}</p>
      {sub && <p className="muted stat-sub">{sub}</p>}
    </div>
  )
}

// Per-question detail for one attendee's attempt: their answer log
// (`{ questionId, selectedIndex, correct }`) joined against the exam's
// current question pool. A question can have been edited or deleted since
// the attempt, so it's looked up by ID rather than assumed still present.
function AnswerBreakdown({ answers, questionsById, wrongOnly }) {
  if (answers.length === 0) return <p className="muted">No answers recorded.</p>

  const visible = wrongOnly
    ? answers.map((a, i) => ({ a, i })).filter(({ a }) => !a.correct)
    : answers.map((a, i) => ({ a, i }))

  if (visible.length === 0) return <p className="muted">No wrong answers — all correct.</p>

  return (
    <div className="answer-breakdown">
      {visible.map(({ a, i }) => {
        const question = questionsById[a.questionId]
        if (!question) {
          return (
            <div key={a.questionId + i} className="answer-breakdown-item">
              <p className="question-text">
                Question {i + 1}{' '}
                <span className="muted">(no longer exists in the question pool)</span>
              </p>
              <p className={a.correct ? 'pass-text' : 'fail-text'}>
                {a.selectedIndex === -1 ? 'Not answered' : a.correct ? 'Correct' : 'Incorrect'}
              </p>
            </div>
          )
        }
        return (
          <div key={a.questionId + i} className="answer-breakdown-item">
            <p className="question-text">
              Question {i + 1}: {question.text}
            </p>
            <div className="option-list">
              {question.options.map((opt, idx) => {
                const isSelected = idx === a.selectedIndex
                const isCorrectOption = idx === question.correctIndex
                return (
                  <div
                    key={idx}
                    className={
                      'option-btn' +
                      (isCorrectOption ? ' answer-option-correct' : '') +
                      (isSelected && !isCorrectOption ? ' answer-option-wrong' : '')
                    }
                  >
                    {opt}
                    {isSelected && ' — selected'}
                    {isCorrectOption && ' ✓'}
                  </div>
                )
              })}
            </div>
            {a.selectedIndex === -1 && <p className="fail-text">Not answered</p>}
          </div>
        )
      })}
    </div>
  )
}
