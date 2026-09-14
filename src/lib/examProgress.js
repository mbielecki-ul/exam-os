// Persists an in-progress exam attempt (the drawn question set, answers so
// far, current position, and the original start time) to localStorage, so a
// dropped connection, closed tab, or OS-killed background tab doesn't force
// a shift worker to restart with a freshly (and differently) drawn question
// set and a reset timer. Keyed per (exam, person) so it can't leak across
// employees on a shared device, and cleared as soon as the attempt is
// actually submitted.
//
// Best-effort only: storage failures (private browsing, quota, disabled
// storage) are swallowed — losing autosave should never block taking the
// exam.

const KEY_PREFIX = 'examos-progress-'

function storageKey(examId, uid) {
  return `${KEY_PREFIX}${examId}_${uid}`
}

export function loadExamProgress(examId, uid) {
  try {
    const raw = window.localStorage.getItem(storageKey(examId, uid))
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || !Array.isArray(data.questions) || !data.questions.length || !data.startedAtMs) {
      return null
    }
    return data
  } catch {
    return null
  }
}

export function saveExamProgress(examId, uid, { questions, answers, current, startedAtMs }) {
  try {
    window.localStorage.setItem(
      storageKey(examId, uid),
      JSON.stringify({ questions, answers, current, startedAtMs })
    )
  } catch {
    // ignore — see module note above
  }
}

export function clearExamProgress(examId, uid) {
  try {
    window.localStorage.removeItem(storageKey(examId, uid))
  } catch {
    // ignore
  }
}
