import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'

// The one admin list: config/admins { emails: [...] }. firestore.rules
// (isAdmin()) and the Cloud Functions read the same document, and only
// admins may read it, so a successful read is itself the admin check.
const ADMIN_LIST = doc(db, 'config', 'admins')

// Returns the admin emails, or null when the signed-in user isn't an admin
// (the read is denied) or the list doesn't exist yet.
export async function getAdminEmails() {
  try {
    const snap = await getDoc(ADMIN_LIST)
    return snap.exists() ? snap.data().emails || [] : null
  } catch (err) {
    if (err.code === 'permission-denied') return null
    throw err
  }
}

// The rules reject a list without the saving admin in it, so nobody can
// remove themselves (and the list can never end up empty).
export async function saveAdminEmails(emails, updatedBy) {
  await updateDoc(ADMIN_LIST, { emails, updatedAt: serverTimestamp(), updatedBy })
}
