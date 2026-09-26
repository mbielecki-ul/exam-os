// Keeps the in-progress attempt's answers and current position in
// localStorage, so a reload, dropped connection or OS-killed background tab
// picks up exactly where the person was. The questions themselves (and the
// start time / deadline) come back from the server on resume; answers are
// also saved to the server attempt, this is just the fastest copy. Keyed
// per (exam, person) and tied to the attempt's start time, so it can't leak
// across employees on a shared device or into a later attempt, and cleared
// once the attempt is submitted.
//
// Best-effort only: storage failures (private browsing, quota, disabled
// storage) are swallowed — losing autosave should never block taking the
// exam.

const KEY_PREFIX = 'examos-progress-'

function storageKey(examId, uid) {
  return `${KEY_PREFIX}${examId}_${uid}`
}

// Returns { answers, current } saved for the attempt started at startedAtMs.
export function loadExamProgress(examId, uid, startedAtMs) {
  try {
    const raw = window.localStorage.getItem(storageKey(examId, uid))
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || data.startedAtMs !== startedAtMs || typeof data.answers !== 'object') return null
    return data
  } catch {
    return null
  }
}

export function saveExamProgress(examId, uid, { answers, current, startedAtMs }) {
  try {
    window.localStorage.setItem(
      storageKey(examId, uid),
      JSON.stringify({ answers, current, startedAtMs })
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
