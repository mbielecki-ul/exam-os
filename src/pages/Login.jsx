import { useEffect, useState } from 'react'
import {
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
} from 'firebase/auth'
import { auth } from '../lib/firebase'

const STORAGE_KEY = 'examos-email-for-signin'

export default function Login() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | completing | error
  const [error, setError] = useState('')

  // If the user arrived by clicking the emailed link, finish sign-in.
  useEffect(() => {
    if (!isSignInWithEmailLink(auth, window.location.href)) return

    let storedEmail = window.localStorage.getItem(STORAGE_KEY)
    if (!storedEmail) {
      storedEmail = window.prompt(
        'Zur Bestätigung: Bitte gib deine E-Mail-Adresse erneut ein'
      )
    }
    if (!storedEmail) return

    setStatus('completing')
    signInWithEmailLink(auth, storedEmail, window.location.href)
      .then(() => {
        window.localStorage.removeItem(STORAGE_KEY)
        // Clean the sign-in params out of the URL.
        window.history.replaceState({}, document.title, window.location.pathname)
      })
      .catch((err) => {
        setStatus('error')
        setError(mapError(err))
      })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setStatus('sending')
    try {
      const actionCodeSettings = {
        url: window.location.origin + window.location.pathname,
        handleCodeInApp: true,
      }
      await sendSignInLinkToEmail(auth, email, actionCodeSettings)
      window.localStorage.setItem(STORAGE_KEY, email)
      setStatus('sent')
    } catch (err) {
      setStatus('error')
      setError(mapError(err))
    }
  }

  if (status === 'completing') {
    return <Shell><p>Anmeldung wird abgeschlossen …</p></Shell>
  }

  if (status === 'sent') {
    return (
      <Shell>
        <h1>Link verschickt</h1>
        <p>
          Öffne dein Postfach für <strong>{email}</strong> und klicke auf den
          Anmelde-Link. Der Link ist etwa eine Stunde gültig.
        </p>
        <button className="link-btn" onClick={() => setStatus('idle')}>
          Andere E-Mail-Adresse verwenden
        </button>
      </Shell>
    )
  }

  return (
    <Shell>
      <h1>exam-os</h1>
      <p className="subtitle">Melde dich mit deiner E-Mail-Adresse an.</p>
      <form onSubmit={handleSubmit} className="login-form">
        <input
          type="email"
          required
          placeholder="name@firma.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" disabled={status === 'sending'}>
          {status === 'sending' ? 'Wird gesendet …' : 'Anmelde-Link senden'}
        </button>
      </form>
      {error && <p className="error-text">{error}</p>}
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div className="page-center">
      <div className="card login-card">{children}</div>
    </div>
  )
}

function mapError(err) {
  if (err.code === 'auth/invalid-email') return 'Ungültige E-Mail-Adresse.'
  if (err.code === 'auth/invalid-action-code')
    return 'Dieser Link ist abgelaufen oder wurde bereits verwendet. Bitte fordere einen neuen an.'
  return 'Etwas ist schiefgelaufen: ' + (err.message || 'Unbekannter Fehler')
}
