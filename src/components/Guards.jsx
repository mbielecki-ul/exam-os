import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="page-center"><p>Lädt …</p></div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

export function RequireAdmin({ children }) {
  const { user, loading, isAdmin } = useAuth()
  if (loading) return <div className="page-center"><p>Lädt …</p></div>
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return children
}
