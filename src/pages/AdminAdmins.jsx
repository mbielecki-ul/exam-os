import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAdminEmails, saveAdminEmails } from '../lib/admins'
import { parseEmailList } from '../lib/emailDomain'
import { useAuth } from '../context/AuthContext'

export default function AdminAdmins() {
  const { user } = useAuth()
  const [emails, setEmails] = useState(null)
  const [newEmail, setNewEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    getAdminEmails()
      .then((list) => setEmails(list || []))
      .catch((err) => setError(err.message))
  }, [])

  const self = (user.email || '').toLowerCase()

  async function save(next, doneMessage) {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await saveAdminEmails(next, user.email)
      setEmails(next)
      setMessage(doneMessage)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleAdd(e) {
    e.preventDefault()
    const added = parseEmailList(newEmail).filter((a) => !emails.includes(a))
    if (added.length === 0) {
      setError(newEmail.trim() ? 'No new email address found.' : '')
      return
    }
    await save([...emails, ...added], `Added ${added.join(', ')}.`)
    setNewEmail('')
  }

  async function handleRemove(email) {
    if (!window.confirm(`Remove ${email} as admin?`)) return
    await save(
      emails.filter((a) => a !== email),
      `Removed ${email}.`
    )
  }

  if (!emails && !error) return <div className="page"><p>Loading …</p></div>

  return (
    <div className="page">
      <div className="admin-header">
        <h1>Admins</h1>
        <Link className="button" to="/admin">Back to results</Link>
      </div>

      <div className="card">
        <p className="muted">
          Admins can manage exams and questions, see all results, and edit this list.
          Changes apply at the admin&apos;s next sign-in. You can&apos;t remove yourself,
          so the list never ends up empty.
        </p>

        {emails && (
          <table className="results-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {emails.map((email) => (
                <tr key={email}>
                  <td>
                    {email}
                    {email === self && <span className="muted"> (you)</span>}
                  </td>
                  <td>
                    {email !== self && (
                      <button
                        className="link-btn-danger"
                        disabled={saving}
                        onClick={() => handleRemove(email)}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form onSubmit={handleAdd} className="new-exam-form" style={{ marginTop: '1rem' }}>
          <input
            type="text"
            placeholder="name@company.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <button type="submit" className="button" disabled={saving || !emails}>
            Add admin
          </button>
        </form>
        {message && <p className="muted">{message}</p>}
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  )
}
