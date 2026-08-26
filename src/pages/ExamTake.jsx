import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { listAllExams, listQuestions, pickRandomQuestions } from '../lib/exams'
import { submitResult } from '../lib/results'
import { useAuth } from '../context/AuthContext'

const QUESTIONS_PER_EXAM = 50
const LOW_TIME_WARNING_SECONDS = 60

export default function ExamTake() {
  const { examId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [exam, setExam] = useState(null)
  const [questions, setQuestions] = useState(null)
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState({}) // questionId -> selectedIndex
  const [startedAtMs] = useState(() => Date.now())
  const [remainingSeconds, setRemainingSeconds] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Guards so the timer running out and a manual click can never both submit.
  const hasSubmittedRef = useRef(false)
  // Always points at the latest handleSubmit closure, so the timer's
  // interval (set up once) still sees up-to-date answers/questions.
  const handleSubmitRef = useRef(() => {})

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

  async function handleSubmit({ auto = false } = {}) {
    if (hasSubmittedRef.current) return
    hasSubmittedRef.current = true
    setSubmitting(true)
    setError('')
    try {
      let correctCount = 0
      const answerLog = questions.map((q) => {
        // Unanswered questions (including ones never reached before time ran
        // out) resolve to -1, which never matches a real option index — they
        // count as incorrect, same as a wrong answer.
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
        autoSubmitted: auto,
      })

      navigate(`/exam/${examId}/done`, {
        state: { correctCount, total: questions.length, autoSubmitted: auto },
      })
    } catch (err) {
      hasSubmittedRef.current = false
      setError(err.message)
      setSubmitting(false)
    }
  }

  // Keep the ref current on every render so the timer always calls the
  // freshest version (with the latest answers) instead of a stale one.
  useEffect(() => {
    handleSubmitRef.current = handleSubmit
  })

  // Countdown timer: starts once the exam (and its time limit) is loaded.
  useEffect(() => {
    if (!exam || !exam.timeLimitMinutes || !questions) return

    const deadlineMs = startedAtMs + exam.timeLimitMinutes * 60 * 1000

    function tick() {
      const remaining = Math.max(0, Math.round((deadlineMs - Date.now()) / 1000))
      setRemainingSeconds(remaining)
      if (remaining <= 0) {
        handleSubmitRef.current({ auto: true })
      }
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [exam, questions, startedAtMs])

  if (error) return <div className="page"><p className="error-text">{error}</p></div>
  if (!exam || !questions) return <div className="page"><p>Loading …</p></div>

  return (
    <div className="page exam-take">
      <div className="exam-take-header">
        <h1>{exam.name}</h1>
        <div className="exam-take-header-right">
          {remainingSeconds !== null && (
            <span
              className={
                'exam-timer' +
                (remainingSeconds <= LOW_TIME_WARNING_SECONDS ? ' exam-timer-low' : '')
              }
            >
              {formatTime(remainingSeconds)}
            </span>
          )}
          <span className="muted">
            Question {current + 1} / {questions.length} · {answeredCount} answered
          </span>
        </div>
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
            onClick={() => handleSubmit()}
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

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
