import { HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'

// Server-side exam attempts. The browser never sees correctIndex: it gets
// its drawn questions from startAttempt and its score from submitAttempt,
// which grades against the question pool here and writes the result.
//
// attempts/{examId}_{uid} (same ID scheme as results/) holds the drawn
// question IDs with their option order, the start time and deadline, and
// the answers saved so far. firestore.rules let the owner update only
// `answers`, and only until the deadline (+ grace), so answers given in
// time still count if the browser never manages to submit.

// Keep in sync with DEFAULT_QUESTION_COUNT in src/lib/exams.js.
const DEFAULT_QUESTION_COUNT = 50
// Allowance for network latency / a cold start at the deadline. The same
// 30 s appear in the attempts rule in firestore.rules.
const GRACE_MS = 30 * 1000

const db = () => getFirestore()
const docId = (examId, uid) => `${examId}_${uid}`

export async function startAttempt(request) {
  const { uid, email } = caller(request)
  const examId = requireExamId(request.data)

  const examSnap = await db().doc(`exams/${examId}`).get()
  if (!examSnap.exists) throw new HttpsError('not-found', 'Exam not found.')
  const exam = examSnap.data()
  if (exam.archived) {
    throw new HttpsError('failed-precondition', 'This exam has been archived and can no longer be taken.')
  }

  const attemptRef = db().doc(`attempts/${docId(examId, uid)}`)
  const resultRef = db().doc(`results/${docId(examId, uid)}`)
  const [attemptSnap, resultSnap] = await db().getAll(attemptRef, resultRef)
  if (resultSnap.exists) {
    throw new HttpsError('already-exists', 'You have already completed this exam. Each exam can only be taken once.')
  }

  // Resume an attempt in progress (same questions, same deadline), or
  // grade one whose time ran out while the browser was gone.
  if (attemptSnap.exists) {
    const attempt = attemptSnap.data()
    if (isExpired(attempt, Date.now())) {
      return { status: 'finished', result: await gradeAttempt(uid, examId, { auto: true }) }
    }
    return inProgressPayload(examId, exam, attempt)
  }

  // Only a new attempt has to pass these: someone who already started keeps
  // going even if the exam is switched off or its window closes meanwhile.
  if (exam.active !== true) {
    throw new HttpsError('failed-precondition', 'This exam is not available right now.')
  }
  if (!examAllowsEmail(exam, email)) {
    throw new HttpsError('permission-denied', 'This exam is not available for your email address.')
  }
  const now = Date.now()
  if (exam.availableFrom && now < exam.availableFrom.toMillis()) {
    throw new HttpsError('failed-precondition', 'This exam is not open yet.')
  }
  if (exam.availableUntil && now >= exam.availableUntil.toMillis()) {
    throw new HttpsError('failed-precondition', 'This exam is closed.')
  }

  const pool = await db().collection('questions').where('examId', '==', examId).get()
  if (pool.empty) {
    throw new HttpsError('failed-precondition', 'No questions have been set up for this exam yet.')
  }
  const drawn = shuffle(pool.docs)
    .slice(0, exam.questionCount || DEFAULT_QUESTION_COUNT)
    .map((d) => ({ id: d.id, order: shuffle(d.data().options.map((_, i) => i)) }))

  const attempt = {
    uid,
    userEmail: email,
    examId,
    examName: exam.name || '',
    questions: drawn, // [{ id, order }] — order: display position -> original option index
    answers: {}, // questionId -> original option index
    startedAt: Timestamp.fromMillis(now),
    deadline: exam.timeLimitMinutes
      ? Timestamp.fromMillis(now + exam.timeLimitMinutes * 60 * 1000)
      : null,
  }

  // Two tabs starting at once: the second create fails and resumes the first.
  try {
    await attemptRef.create(attempt)
  } catch (err) {
    if (err.code !== 6 /* ALREADY_EXISTS */) throw err
    return inProgressPayload(examId, exam, (await attemptRef.get()).data())
  }
  return inProgressPayload(examId, exam, attempt, pool.docs)
}

export async function submitAttempt(request) {
  const { uid } = caller(request)
  const examId = requireExamId(request.data)
  const answers = request.data?.answers
  const result = await gradeAttempt(uid, examId, {
    answers: answers && typeof answers === 'object' ? answers : {},
    auto: request.data?.auto === true,
  })
  return { status: 'finished', result }
}

// Grades the attempt, writes results/{examId}_{uid} (which triggers the
// result emails) and deletes the attempt, all in one transaction. Answers
// sent with the submit count while the deadline + grace hasn't passed;
// after that only the ones saved in time do. Calling it again after
// success just returns the stored result, so a retried submit is harmless.
async function gradeAttempt(uid, examId, { answers = {}, auto }) {
  const attemptRef = db().doc(`attempts/${docId(examId, uid)}`)
  const resultRef = db().doc(`results/${docId(examId, uid)}`)
  const examRef = db().doc(`exams/${examId}`)

  return db().runTransaction(async (tx) => {
    const [attemptSnap, resultSnap, examSnap] = await tx.getAll(attemptRef, resultRef, examRef)
    if (resultSnap.exists) return summary(resultSnap.data())
    if (!attemptSnap.exists) {
      throw new HttpsError('failed-precondition', 'There is no exam in progress to submit.')
    }
    if (examSnap.exists && examSnap.data().archived) {
      throw new HttpsError('failed-precondition', 'This exam has been archived and can no longer be taken.')
    }

    const attempt = attemptSnap.data()
    const now = Date.now()
    const late = isExpired(attempt, now)
    const given = late ? attempt.answers || {} : { ...(attempt.answers || {}), ...answers }

    const questionSnaps = attempt.questions.length
      ? await tx.getAll(...attempt.questions.map((q) => db().doc(`questions/${q.id}`)))
      : []
    const correctById = Object.fromEntries(
      questionSnaps.filter((s) => s.exists).map((s) => [s.id, s.data().correctIndex])
    )

    let correctCount = 0
    const answerLog = attempt.questions.map((q) => {
      // Unanswered (or garbage) resolves to -1, which never matches.
      const raw = given[q.id]
      const selectedIndex = Number.isInteger(raw) && raw >= 0 && raw < q.order.length ? raw : -1
      // A question deleted mid-attempt can't be graded; it counts as wrong.
      const correct = selectedIndex !== -1 && selectedIndex === correctById[q.id]
      if (correct) correctCount += 1
      return { questionId: q.id, selectedIndex, correct }
    })

    const startedAtMs = attempt.startedAt.toMillis()
    const endMs = late && attempt.deadline ? attempt.deadline.toMillis() : now
    const result = {
      userEmail: attempt.userEmail,
      examId,
      examName: attempt.examName,
      startedAt: startedAtMs,
      submittedAt: FieldValue.serverTimestamp(),
      durationSeconds: Math.max(0, Math.round((endMs - startedAtMs) / 1000)),
      totalQuestions: attempt.questions.length,
      correctCount,
      answers: answerLog, // [{ questionId, selectedIndex, correct }]
      autoSubmitted: auto || late,
    }
    tx.create(resultRef, result)
    tx.delete(attemptRef)
    return summary(result)
  })
}

// What the exam page needs: question text and options in their drawn order,
// never the correct answer.
async function inProgressPayload(examId, exam, attempt, docs = null) {
  const snaps = docs ?? (attempt.questions.length
    ? await db().getAll(...attempt.questions.map((q) => db().doc(`questions/${q.id}`)))
    : [])
  const byId = Object.fromEntries(snaps.filter((s) => s.exists).map((s) => [s.id, s.data()]))
  return {
    status: 'in-progress',
    exam: { id: examId, name: exam.name || '', timeLimitMinutes: exam.timeLimitMinutes || null },
    questions: attempt.questions.map((q) => {
      const data = byId[q.id]
      return {
        id: q.id,
        text: data ? data.text : '(This question was removed from the exam.)',
        options: data ? data.options : q.order.map(() => '—'),
        optionOrder: q.order,
      }
    }),
    answers: attempt.answers || {},
    startedAtMs: attempt.startedAt.toMillis(),
    deadlineMs: attempt.deadline ? attempt.deadline.toMillis() : null,
    serverNowMs: Date.now(),
  }
}

function summary(result) {
  return {
    correctCount: result.correctCount,
    totalQuestions: result.totalQuestions,
    autoSubmitted: !!result.autoSubmitted,
  }
}

function isExpired(attempt, nowMs) {
  return !!attempt.deadline && nowMs > attempt.deadline.toMillis() + GRACE_MS
}

export function caller(request) {
  const uid = request.auth?.uid
  const email = request.auth?.token?.email
  if (!uid || !email) throw new HttpsError('unauthenticated', 'Please sign in again.')
  return { uid, email }
}

function requireExamId(data) {
  const examId = data?.examId
  if (typeof examId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(examId)) {
    throw new HttpsError('invalid-argument', 'Invalid exam.')
  }
  return examId
}

// Same rule as examAllowsEmail() in src/lib/emailDomain.js: no domains =
// open to everyone, otherwise the email's domain (compared lowercase) must
// be listed. Keep the two equivalent.
function examAllowsEmail(exam, email) {
  const domains = exam.allowedDomains
  if (!Array.isArray(domains) || domains.length === 0) return true
  const domain = (email.split('@')[1] || '').toLowerCase().trim()
  return domains.map((d) => String(d).toLowerCase()).includes(domain)
}

// Unbiased (Fisher–Yates) shuffle; returns a new array.
function shuffle(items) {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
