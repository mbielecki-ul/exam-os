import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function NavBar() {
  const { user, isAdmin, signOut } = useAuth()
  if (!user) return null

  return (
    <header className="navbar">
      <Link to="/" className="navbar-brand">exam-os</Link>
      <nav className="navbar-links">
        <Link to="/">Exams</Link>
        {isAdmin && <Link to="/admin">Admin</Link>}
      </nav>
      <div className="navbar-user">
        <span>{user.email}</span>
        <button className="link-btn" onClick={signOut}>Sign out</button>
      </div>
    </header>
  )
}
