import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listActiveExams } from '../lib/exams'
import { listOwnResults } from '../lib/results'
import { examAllowsEmail } from '../lib/emailDomain'
import { useAuth } from '../context/AuthContext'

export default function ExamList() {
  const { user } = useAuth()
  const [exams, setExams] = useState(null)
  const [ownResults, setOwnResults] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([listActiveExams(), listOwnResults(user.email)])
      .then(([e, r]) => {
        // Only show exams this person's email domain is actually allowed
        // to take (an exam with no allowedDomains is open to everyone).
        setExams(e.filter((exam) => examAllowsEmail(exam, user.email)))
        setOwnResults(r)
      })
      .catch((err) => setError(err.message))
  }, [user.email])

  if (error) return <div className="page"><p className="error-text">{error}</p></div>
  if (exams === null) return <div className="page"><p>Loading …</p></div>

  return (
    <div className="page">
      <h1>Available exams</h1>
      <p className="muted">Each exam can only be taken once.</p>
      {exams.length === 0 && <p>No exam is available right now.</p>}
      <div className="exam-grid">
        {exams.map((exam) => {
          // Each exam can only be attended once, so there's at most one
          // result per exam here.
          const completedResult = ownResults.find((r) => r.examId === exam.id)
          const pct = completedResult
            ? Math.round((completedResult.correctCount / completedResult.totalQuestions) * 100)
            : null

          return (
            <div key={exam.id} className="card exam-card">
              <h2>{exam.name}</h2>
              {exam.description && <p>{exam.description}</p>}
              {exam.timeLimitMinutes && (
                <p className="muted">Time limit: {exam.timeLimitMinutes} minutes</p>
              )}
              {completedResult ? (
                <>
                  <p className="muted">
                    Completed · {completedResult.correctCount} / {completedResult.totalQuestions} correct ({pct}%)
                  </p>
                  <span className="badge-done">Already completed</span>
                </>
              ) : (
                <Link className="button" to={`/exam/${exam.id}`}>Start exam</Link>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
