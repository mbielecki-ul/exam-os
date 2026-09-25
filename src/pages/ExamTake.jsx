import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { listAllExams, listQuestions, pickRandomQuestions, DEFAULT_QUESTION_COUNT } from '../lib/exams'
import { submitResult, getOwnResultForExam } from '../lib/results'
import { examAllowsEmail } from '../lib/emailDomain'
import { loadExamProgress, saveExamProgress, clearExamProgress } from '../lib/examProgress'
import { useAuth } from '../context/AuthContext'
import { useExamGuard } from '../context/ExamGuardContext'

const LOW_TIME_WARNING_SECONDS = 60

export default function ExamTake() {
  const { examId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { registerExam, unregisterExam } = useExamGuard()

  const [exam, setExam] = useState(null)
  const [questions, setQuestions] = useState(null)
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState({}) // questionId -> selectedIndex
  // Set once the attempt actually starts (fresh, or resumed from a saved
  // in-progress attempt) — see the load() effect below.
  const [startedAtMs, setStartedAtMs] = useState(null)
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
        if (found.archived) throw new Error('This exam has been archived and can no longer be taken.')

        // Domain-restricted exams: the list page already hides these from
        // people outside the allowed domains, but a direct link would
        // otherwise bypass that.
        if (!examAllowsEmail(found, user.email)) {
          throw new Error('This exam is not available for your email address.')
        }

        // Each exam can only be attended once per person. This also guards
        // against navigating straight to the URL after already completing
        // it — the "Start exam" button on the list page already hides in
        // that case, but a direct link would otherwise bypass that.
        const existing = await getOwnResultForExam(examId, user.uid)
        if (existing) {
          clearExamProgress(examId, user.uid)
          throw new Error('You have already completed this exam. Each exam can only be taken once.')
        }

        setExam(found)

        // Resume a saved in-progress attempt (same drawn questions, answers,
        // position, and original start time) rather than drawing a fresh
        // set and resetting the timer — a dropped connection or a tab killed
        // in the background shouldn't cost the whole attempt.
        const saved = loadExamProgress(examId, user.uid)
        if (saved) {
          setQuestions(saved.questions)
          setAnswers(saved.answers || {})
          setCurrent(saved.current || 0)
          setStartedAtMs(saved.startedAtMs)
          return
        }

        const pool = await listQuestions(examId)
        if (pool.length === 0) throw new Error('No questions have been set up for this exam yet.')
        const picked = pickRandomQuestions(pool, found.questionCount || DEFAULT_QUESTION_COUNT)
        const now = Date.now()
        setQuestions(picked)
        setStartedAtMs(now)
        saveExamProgress(examId, user.uid, {
          questions: picked,
          answers: {},
          current: 0,
          startedAtMs: now,
        })
      } catch (err) {
        setError(err.message)
      }
    }
    load()
  }, [examId, user.uid])

  // Keep the saved attempt in sync as the person answers/navigates, so a
  // resume picks up exactly where they left off.
  useEffect(() => {
    if (!questions || !startedAtMs) return
    saveExamProgress(examId, user.uid, { questions, answers, current, startedAtMs })
  }, [examId, user.uid, questions, answers, current, startedAtMs])

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
        userUid: user.uid,
        examId,
        examName: exam.name,
        startedAtMs,
        totalQuestions: questions.length,
        correctCount,
        answers: answerLog,
        autoSubmitted: auto,
      })

      clearExamProgress(examId, user.uid)

      // Clear the guard right away — the result is already in, so the
      // navigate() below to the "done" screen shouldn't also trigger the
      // leave-exam warning.
      unregisterExam()

      navigate(`/exam/${examId}/done`, {
        state: { correctCount, total: questions.length, autoSubmitted: auto },
      })
    } catch (err) {
      hasSubmittedRef.current = false

      // A "permission-denied" here almost always means the first attempt's
      // write actually reached Firestore and only the confirmation was lost
      // (e.g. a dropped connection right at submit) — a second write to the
      // same result document is a Firestore "update", which only admins may
      // do. Rather than show that confusing raw error, check whether the
      // result is in fact already there and, if so, treat this as success.
      if (err.code === 'permission-denied') {
        try {
          const existing = await getOwnResultForExam(examId, user.uid)
          if (existing) {
            clearExamProgress(examId, user.uid)
            unregisterExam()
            navigate(`/exam/${examId}/done`, {
              state: {
                correctCount: existing.correctCount,
                total: existing.totalQuestions,
                autoSubmitted: existing.autoSubmitted,
              },
            })
            return
          }
        } catch {
          // fall through to the generic message below
        }
        setError('Could not submit your exam — please check your connection and try again.')
        setSubmitting(false)
        return
      }

      setError(err.message)
      setSubmitting(false)
    }
  }

  // Keep the ref current on every render so the timer always calls the
  // freshest version (with the latest answers) instead of a stale one.
  useEffect(() => {
    handleSubmitRef.current = handleSubmit
  })

  // Tell the exam guard an exam is running as soon as there are actual
  // questions on screen — this is what makes NavBar/sign-out show the
  // "leave & submit now" warning, and forces a submit if the user confirms.
  useEffect(() => {
    if (!questions) return
    registerExam(() => handleSubmitRef.current({ auto: true }))
    return () => unregisterExam()
  }, [questions, registerExam, unregisterExam])

  // Countdown timer: starts once the exam (and its time limit) is loaded.
  useEffect(() => {
    if (!exam || !exam.timeLimitMinutes || !questions || !startedAtMs) return

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

  if (error) {
    return (
      <div className="page-center">
        <div className="card login-card">
          <p className="error-text">{error}</p>
          <Link className="button" to="/">Back to overview</Link>
        </div>
      </div>
    )
  }
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
