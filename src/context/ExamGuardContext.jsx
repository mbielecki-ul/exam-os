import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

const ExamGuardContext = createContext(null)

export function ExamGuardProvider({ children }) {
  const [examInProgress, setExamInProgress] = useState(false)
  const [pendingAction, setPendingAction] = useState(null)
  // Holds the exam page's own "finish now, whatever's answered counts" —
  // set by ExamTake while it's mounted, cleared when it isn't.
  const forceSubmitRef = useRef(null)

  // Browser/tab close, refresh, or typing a new URL: the browser's own
  // native dialog is the only thing that can run at this point (custom UI
  // isn't possible here), so this is a best-effort backstop for those
  // cases — everything else (nav bar, sign out) uses the real modal below.
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (!examInProgress) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [examInProgress])

  const registerExam = useCallback((forceSubmitFn) => {
    forceSubmitRef.current = forceSubmitFn
    setExamInProgress(true)
  }, [])

  const unregisterExam = useCallback(() => {
    forceSubmitRef.current = null
    setExamInProgress(false)
  }, [])

  // Wrap any in-app navigation (nav links, sign out) with this. If no exam
  // is running, `action` just runs immediately.
  const guardedAction = useCallback(
    (action) => {
      if (examInProgress) {
        setPendingAction(() => action)
      } else {
        action()
      }
    },
    [examInProgress]
  )

  async function confirmLeave() {
    // Finish the exam right now with whatever was answered so far — same
    // path as the timer running out — so leaving genuinely forfeits the
    // one attempt rather than just hiding it until later. Awaited so a
    // "Sign out" confirmation can't race ahead of the Firestore write.
    const doForceSubmit = forceSubmitRef.current
    forceSubmitRef.current = null
    setExamInProgress(false)
    const action = pendingAction
    setPendingAction(null)
    if (doForceSubmit) await doForceSubmit()
    action?.()
  }

  function cancelLeave() {
    setPendingAction(null)
  }

  return (
    <ExamGuardContext.Provider value={{ examInProgress, registerExam, unregisterExam, guardedAction }}>
      {children}
      {pendingAction && <LeaveExamModal onConfirm={confirmLeave} onCancel={cancelLeave} />}
    </ExamGuardContext.Provider>
  )
}

export function useExamGuard() {
  const ctx = useContext(ExamGuardContext)
  if (!ctx) throw new Error('useExamGuard must be used inside ExamGuardProvider')
  return ctx
}

function LeaveExamModal({ onConfirm, onCancel }) {
  return (
    <div className="modal-overlay">
      <div className="card modal-card">
        <h2>Exam in progress</h2>
        <p>
          Your exam is still in progress. Leaving now will submit it
          immediately with only the questions you've answered so far —
          everything else will count as incorrect.
        </p>
        <p className="error-text">
          Since each exam can only be taken once, you will not be able to
          repeat or continue it afterwards.
        </p>
        <div className="modal-actions">
          <button onClick={onCancel}>Stay on exam</button>
          <button className="button button-danger" onClick={onConfirm}>
            Leave &amp; submit now
          </button>
        </div>
      </div>
    </div>
  )
}
