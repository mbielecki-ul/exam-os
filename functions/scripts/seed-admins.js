// Creates config/admins (the admin list firestore.rules reads) if it doesn't
// exist yet. Run by .github/workflows/deploy-firestore-rules.yml before the
// rules are deployed, so switching to the Firestore-based list never locks
// every admin out. It never overwrites an existing list: after the first run,
// admins are managed on the Admin → Admins page.
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

// The admins from before the list moved to Firestore.
const INITIAL_ADMINS = ['maximilian.bielecki@ul.com', 'max@bielecki.at', 'thomas.reznicek@ul.com']

initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID })

try {
  await getFirestore()
    .doc('config/admins')
    .create({ emails: INITIAL_ADMINS, updatedAt: FieldValue.serverTimestamp(), updatedBy: 'seed' })
  console.log(`Created config/admins with ${INITIAL_ADMINS.length} admins.`)
} catch (err) {
  if (err.code !== 6 /* ALREADY_EXISTS */) throw err
  console.log('config/admins already exists; left unchanged.')
}
