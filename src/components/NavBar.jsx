import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useExamGuard } from '../context/ExamGuardContext'

export default function NavBar() {
  const { user, isAdmin, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { examInProgress, guardedAction } = useExamGuard()
  const navigate = useNavigate()
  if (!user) return null

  // Nav links normally navigate on their own via <NavLink>. Only intercept
  // the click when an exam is actually running, so normal behavior (incl.
  // ctrl/middle-click to open in a new tab) is untouched the rest of the time.
  function handleNavClick(e, path) {
    if (!examInProgress) return
    e.preventDefault()
    guardedAction(() => navigate(path))
  }

  function handleSignOut() {
    guardedAction(() => signOut())
  }

  return (
    <header className="navbar">
      <NavLink to="/" end className="navbar-brand" onClick={(e) => handleNavClick(e, '/')}>
        <Logo />
        <span>exam-os</span>
      </NavLink>
      <nav className="navbar-links">
        <NavLink
          to="/"
          end
          className={({ isActive }) => 'nav-link' + (isActive ? ' nav-link-active' : '')}
          onClick={(e) => handleNavClick(e, '/')}
        >
          Exams
        </NavLink>
        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) => 'nav-link' + (isActive ? ' nav-link-active' : '')}
            onClick={(e) => handleNavClick(e, '/admin')}
          >
            Admin
          </NavLink>
        )}
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
        <button className="link-btn" onClick={handleSignOut}>Sign out</button>
      </div>
    </header>
  )
}

function Logo() {
  return (
    <svg className="navbar-logo" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path
        d="M9 16.5L14 21L23 11"
        stroke="var(--bg)"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
