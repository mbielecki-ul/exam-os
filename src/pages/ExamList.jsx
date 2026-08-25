import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listActiveExams } from '../lib/exams'
import { listOwnResults } from '../lib/results'
import { useAuth } from '../context/AuthContext'

export default function ExamList() {
  const { user } = useAuth()
  const [exams, setExams] = useState(null)
  const [ownResults, setOwnResults] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([listActiveExams(), listOwnResults(user.email)])
      .then(([e, r]) => {
        setExams(e)
        setOwnResults(r)
      })
      .catch((err) => setError(err.message))
  }, [user.email])

  if (error) return <div className="page"><p className="error-text">{error}</p></div>
  if (exams === null) return <div className="page"><p>Loading …</p></div>

  return (
    <div className="page">
      <h1>Available exams</h1>
      {exams.length === 0 && <p>No exam is available right now.</p>}
      <div className="exam-grid">
        {exams.map((exam) => {
          const attempts = ownResults.filter((r) => r.examId === exam.id)
          const best = attempts.reduce(
            (max, r) => Math.max(max, r.correctCount / r.totalQuestions),
            0
          )
          return (
            <div key={exam.id} className="card exam-card">
              <h2>{exam.name}</h2>
              {exam.description && <p>{exam.description}</p>}
              {attempts.length > 0 && (
                <p className="muted">
                  Taken {attempts.length}× · best score {Math.round(best * 100)}%
                </p>
              )}
              <Link className="button" to={`/exam/${exam.id}`}>Start exam</Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}
