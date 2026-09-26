import { initializeApp } from 'firebase/app'
import { getAuth, setPersistence, browserSessionPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// These values are the public Firebase "web app" identifiers — they are not
// secrets (security is enforced by Firestore rules), but we still inject
// them at build time via GitHub Actions so nothing is hardcoded in source.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)

// Session-only persistence: sign-in doesn't survive closing the tab/browser.
// Several core-ops exams are taken from shared shift/control-room terminals,
// where Firebase's default (persists indefinitely via IndexedDB) would let
// the next person on the same machine silently inherit the previous
// employee's signed-in session.
setPersistence(auth, browserSessionPersistence)
