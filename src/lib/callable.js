import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

// Calls one of the callable Cloud Functions in functions/index.js and
// returns its data. Errors the functions throw on purpose (HttpsError) keep
// their readable message; anything else (network, a company web filter,
// "internal") gets a generic one.
export async function callFunction(name, data) {
  try {
    const res = await httpsCallable(functions, name)(data)
    return res.data
  } catch (err) {
    const code = (err.code || '').replace('functions/', '')
    const readable = [
      'not-found',
      'already-exists',
      'failed-precondition',
      'permission-denied',
      'invalid-argument',
      'unauthenticated',
    ]
    const e = new Error(
      readable.includes(code)
        ? err.message
        : 'Could not reach the exam server — please check your connection and try again.'
    )
    e.code = code
    throw e
  }
}
