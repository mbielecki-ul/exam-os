import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
} from 'firebase/auth'
import { auth } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'

const STORAGE_KEY = 'examos-email-for-signin'

export default function Login() {
  const { user, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | completing | error
  const [error, setError] = useState('')

  // Completing the emailed link must run only once (StrictMode runs
  // effects twice in dev, and a used link can't be redeemed again).
  const completingRef = useRef(false)

  // If the user arrived by clicking the emailed link, finish sign-in. Waits
  // for AuthContext to settle first, and skips it for someone who is
  // already signed in (the redirect below takes them to the exams).
  useEffect(() => {
    if (loading || user || completingRef.current) return
    if (!isSignInWithEmailLink(auth, window.location.href)) return

    let storedEmail = window.localStorage.getItem(STORAGE_KEY)
    if (!storedEmail) {
      storedEmail = window.prompt(
        'To confirm: please enter your email address again'
      )
    }
    if (!storedEmail) return

    completingRef.current = true
    setStatus('completing')
    signInWithEmailLink(auth, storedEmail, window.location.href)
      .then(() => {
        window.localStorage.removeItem(STORAGE_KEY)
        // Clean the sign-in params out of the URL. No navigate() here: the
        // user only counts as signed in once AuthContext has published them
        // (after its admin check), and navigating before that bounced
        // RequireAuth straight back to this page. The <Navigate> below
        // fires as soon as the user is there.
        window.history.replaceState({}, document.title, window.location.pathname)
      })
      .catch((err) => {
        completingRef.current = false
        setStatus('error')
        setError(mapError(err))
      })
  }, [loading, user])

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

  // Signed in (just now, or already): go to the exam list.
  if (user) return <Navigate to="/" replace />

  if (loading) return <Shell><p>Loading …</p></Shell>

  if (status === 'completing') {
    return <Shell><p>Completing sign-in …</p></Shell>
  }

  if (status === 'sent') {
    return (
      <Shell>
        <h1>Link sent</h1>
        <p>
          Check your inbox for <strong>{email}</strong> and click the sign-in
          link. The link is valid for about an hour.
        </p>
        <button className="link-btn" onClick={() => setStatus('idle')}>
          Use a different email address
        </button>
      </Shell>
    )
  }

  return (
    <Shell>
      <h1>exam-os</h1>
      <p className="subtitle">Sign in with your email address.</p>
      <form onSubmit={handleSubmit} className="login-form">
        <input
          type="email"
          required
          placeholder="name@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending …' : 'Send sign-in link'}
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
  if (err.code === 'auth/invalid-email') return 'Invalid email address.'
  if (err.code === 'auth/invalid-action-code')
    return 'This link has expired or was already used. Please request a new one.'
  return 'Something went wrong: ' + (err.message || 'Unknown error')
}
