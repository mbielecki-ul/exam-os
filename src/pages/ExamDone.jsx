import { useLocation, Link } from 'react-router-dom'

export default function ExamDone() {
  const { state } = useLocation()

  if (!state) {
    return (
      <div className="page-center">
        <div className="card">
          <p>No result data found.</p>
          <Link className="button" to="/">Back to overview</Link>
        </div>
      </div>
    )
  }

  const { correctCount, total, autoSubmitted } = state
  const pct = Math.round((correctCount / total) * 100)

  return (
    <div className="page-center">
      <div className="card login-card">
        <h1>Exam completed</h1>
        {autoSubmitted && (
          <p className="error-text">
            Time ran out — the exam was submitted automatically. Unanswered
            questions were counted as incorrect.
          </p>
        )}
        <p className="score-display">{correctCount} / {total} correct</p>
        <p className="muted">{pct}% correct</p>
        <Link className="button" to="/">Back to overview</Link>
      </div>
    </div>
  )
}
