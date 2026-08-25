import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { listAllExams, listQuestions, pickRandomQuestions } from '../lib/exams'
import { submitResult } from '../lib/results'
import { useAuth } from '../context/AuthContext'

const QUESTIONS_PER_EXAM = 50

export default function ExamTake() {
  const { examId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [exam, setExam] = useState(null)
  const [questions, setQuestions] = useState(null)
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState({}) // questionId -> selectedIndex
  const [startedAtMs] = useState(() => Date.now())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const exams = await listAllExams()
        const found = exams.find((e) => e.id === examId)
        if (!found) throw new Error('Exam not found.')
        setExam(found)

        const pool = await listQuestions(examId)
        if (pool.length === 0) throw new Error('No questions have been set up for this exam yet.')
        setQuestions(pickRandomQuestions(pool, QUESTIONS_PER_EXAM))
      } catch (err) {
        setError(err.message)
      }
    }
    load()
  }, [examId])

  const question = questions ? questions[current] : null
  const answeredCount = Object.keys(answers).length

  function selectOption(idx) {
    setAnswers((a) => ({ ...a, [question.id]: idx }))
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      let correctCount = 0
      const answerLog = questions.map((q) => {
        const selectedIndex = answers[q.id] ?? -1
        const correct = selectedIndex === q.correctIndex
        if (correct) correctCount += 1
        return { questionId: q.id, selectedIndex, correct }
      })

      await submitResult({
        userEmail: user.email,
        examId,
        examName: exam.name,
        startedAtMs,
        totalQuestions: questions.length,
        correctCount,
        answers: answerLog,
      })

      navigate(`/exam/${examId}/done`, {
        state: { correctCount, total: questions.length },
      })
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  if (error) return <div className="page"><p className="error-text">{error}</p></div>
  if (!exam || !questions) return <div className="page"><p>Loading …</p></div>

  return (
    <div className="page exam-take">
      <div className="exam-take-header">
        <h1>{exam.name}</h1>
        <span className="muted">
          Question {current + 1} / {questions.length} · {answeredCount} answered
        </span>
      </div>

      <div className="card question-card">
        <p className="question-text">{question.text}</p>
        <div className="option-list">
          {question.options.map((opt, idx) => (
            <button
              key={idx}
              className={
                'option-btn' + (answers[question.id] === idx ? ' option-selected' : '')
              }
              onClick={() => selectOption(idx)}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div className="exam-take-nav">
        <button disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>
          Back
        </button>
        {current < questions.length - 1 ? (
          <button onClick={() => setCurrent((c) => c + 1)}>Next</button>
        ) : (
          <button
            className="button"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'Submitting …' : 'Finish exam'}
          </button>
        )}
      </div>

      {answeredCount < questions.length && current === questions.length - 1 && (
        <p className="muted">
          Note: {questions.length - answeredCount} question(s) still unanswered.
        </p>
      )}
    </div>
  )
}
