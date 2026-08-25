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
        'To confirm: please enter your email address again'
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
