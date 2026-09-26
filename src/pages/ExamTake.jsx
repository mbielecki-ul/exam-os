import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { startAttempt, submitAttempt, saveAttemptAnswers } from '../lib/attempts'
import { loadExamProgress, saveExamProgress, clearExamProgress } from '../lib/examProgress'
import { useAuth } from '../context/AuthContext'
import { useExamGuard } from '../context/ExamGuardContext'

const LOW_TIME_WARNING_SECONDS = 60
// Answers are saved to the server attempt this long after the last change.
const ANSWER_SAVE_DELAY_MS = 800

export default function ExamTake() {
  const { examId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { registerExam, unregisterExam } = useExamGuard()

  const [exam, setExam] = useState(null)
  const [questions, setQuestions] = useState(null)
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState({}) // questionId -> selectedIndex (original option index)
  // Server-side start time and deadline of the attempt (see startAttempt in
  // functions/attempts.js). The deadline is null for an exam without a
  // time limit.
  const [startedAtMs, setStartedAtMs] = useState(null)
  const [deadlineMs, setDeadlineMs] = useState(null)
  // Server clock minus this browser's clock, so a wrong PC clock can't
  // shorten or stretch the countdown.
  const clockOffsetRef = useRef(0)
  const [remainingSeconds, setRemainingSeconds] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('') // can't take the exam: replaces the page
  const [submitError, setSubmitError] = useState('') // submit failed: shown next to the button

  // Guards so the timer running out and a manual click can never both submit.
  const hasSubmittedRef = useRef(false)
  // Always points at the latest handleSubmit closure, so the timer's
  // interval (set up once) still sees up-to-date answers/questions.
  const handleSubmitRef = useRef(() => {})

  function finish(result) {
    clearExamProgress(examId, user.uid)
    // Clear the guard right away — the result is already in, so the
    // navigate() below to the "done" screen shouldn't also trigger the
    // leave-exam warning.
    unregisterExam()
    navigate(`/exam/${examId}/done`, {
      state: {
        correctCount: result.correctCount,
        total: result.totalQuestions,
        autoSubmitted: result.autoSubmitted,
      },
    })
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // The server checks everything (exam active, not archived, time
        // window, allowed domain, not already completed) and either starts a
        // new attempt or returns the one in progress — same questions, same
        // deadline — so a reload or a dropped connection doesn't cost the
        // attempt.
        const res = await startAttempt(examId)
        if (cancelled) return
        if (res.status === 'finished') {
          // Time ran out while the page was closed; the server graded it.
          finish(res.result)
          return
        }
        clockOffsetRef.current = res.serverNowMs - Date.now()
        const saved = loadExamProgress(examId, user.uid, res.startedAtMs)
        setExam(res.exam)
        setQuestions(res.questions)
        setAnswers({ ...res.answers, ...(saved?.answers || {}) })
        setCurrent(Math.min(saved?.current || 0, res.questions.length - 1))
        setStartedAtMs(res.startedAtMs)
        setDeadlineMs(res.deadlineMs)
      } catch (err) {
        if (cancelled) return
        if (err.code === 'already-exists') clearExamProgress(examId, user.uid)
        setError(err.message)
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // finish() only uses stable values; re-running on its identity would
    // start the attempt twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, user.uid])

  // Keep the saved progress in sync as the person answers/navigates.
  useEffect(() => {
    if (!questions || !startedAtMs) return
    saveExamProgress(examId, user.uid, { answers, current, startedAtMs })
  }, [examId, user.uid, questions, answers, current, startedAtMs])

  // ...and save answers to the server attempt shortly after each change.
  // Failures (offline, deadline passed) are fine: the submit sends them too.
  useEffect(() => {
    if (!questions || hasSubmittedRef.current || Object.keys(answers).length === 0) return
    const timer = setTimeout(() => {
      saveAttemptAnswers(examId, user.uid, answers).catch(() => {})
    }, ANSWER_SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [examId, user.uid, questions, answers])

  const question = questions ? questions[current] : null
  const answeredCount = Object.keys(answers).length

  // `idx` is the option's original index (not its shuffled display position).
  function selectOption(idx) {
    setAnswers((a) => ({ ...a, [question.id]: idx }))
  }

  async function handleSubmit({ auto = false } = {}) {
    if (hasSubmittedRef.current) return
    hasSubmittedRef.current = true
    setSubmitting(true)
    setSubmitError('')
    try {
      // Graded server-side. Unanswered questions (including ones never
      // reached before time ran out) count as incorrect. Submitting again
      // after a lost response just returns the stored result.
      const result = await submitAttempt(examId, answers, auto)
      finish(result)
    } catch (err) {
      hasSubmittedRef.current = false
      setSubmitError(err.message)
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

  // Countdown timer against the server's deadline.
  useEffect(() => {
    if (!questions || !deadlineMs) return

    function tick() {
      const nowMs = Date.now() + clockOffsetRef.current
      const remaining = Math.max(0, Math.round((deadlineMs - nowMs) / 1000))
      setRemainingSeconds(remaining)
      if (remaining <= 0) {
        handleSubmitRef.current({ auto: true })
      }
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [questions, deadlineMs])

  // Discourage copying questions out while an exam is running: no copy/cut,
  // context menu, dragging text, or the matching shortcuts (plus print/save).
  // Text selection is disabled in CSS (.exam-no-copy) and printing hides the
  // exam (@media print). A deterrent only — screenshots, a phone camera or
  // devtools can't be prevented by a web page.
  const [copyNotice, setCopyNotice] = useState(false)
  useEffect(() => {
    if (!questions) return
    let noticeTimer
    function block(e) {
      e.preventDefault()
      setCopyNotice(true)
      clearTimeout(noticeTimer)
      noticeTimer = setTimeout(() => setCopyNotice(false), 2500)
    }
    function onKeyDown(e) {
      if (!(e.ctrlKey || e.metaKey)) return
      if (['c', 'x', 'a', 'p', 's'].includes(e.key.toLowerCase())) block(e)
    }
    const events = ['copy', 'cut', 'contextmenu', 'dragstart']
    events.forEach((type) => document.addEventListener(type, block))
    document.addEventListener('keydown', onKeyDown)
    return () => {
      events.forEach((type) => document.removeEventListener(type, block))
      document.removeEventListener('keydown', onKeyDown)
      clearTimeout(noticeTimer)
    }
  }, [questions])

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
  if (!exam || !questions) return <div className="page"><p>Preparing your exam …</p></div>

  return (
    <>
    <p className="print-block-notice">Printing is disabled during the exam.</p>
    <div className="page exam-take exam-no-copy">
      {copyNotice && (
        <div className="copy-notice" role="status">
          Copying and printing are disabled during the exam.
        </div>
      )}
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
          {question.optionOrder.map((originalIdx) => (
            <button
              key={originalIdx}
              className={
                'option-btn' + (answers[question.id] === originalIdx ? ' option-selected' : '')
              }
              onClick={() => selectOption(originalIdx)}
            >
              {question.options[originalIdx]}
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

      {submitError && <p className="error-text">{submitError}</p>}

      {answeredCount < questions.length && current === questions.length - 1 && (
        <p className="muted">
          Note: {questions.length - answeredCount} question(s) still unanswered.
        </p>
      )}
    </div>
    </>
  )
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
