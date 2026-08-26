import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

export default function NavBar() {
  const { user, isAdmin, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  if (!user) return null

  return (
    <header className="navbar">
      <Link to="/" className="navbar-brand">exam-os</Link>
      <nav className="navbar-links">
        <Link to="/">Exams</Link>
        {isAdmin && <Link to="/admin">Admin</Link>}
      </nav>
      <div className="navbar-user">
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <span>{user.email}</span>
        <button className="link-btn" onClick={signOut}>Sign out</button>
      </div>
    </header>
  )
}
