import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
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

// Hardcoded admin email — kept in one place, also mirrored in firestore.rules.
export const ADMIN_EMAILS = ['maximilian.bielecki@ul.com', 'max@bielecki.at', 'thomas.reznicke@ul.com']
