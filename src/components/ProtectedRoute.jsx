import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, allowRoles }) {
  const { loading, user, profile } = useAuth()

  if (loading) return <div className="center">Loading...</div>
  if (!user) return <Navigate to="/login" replace />

  const role = profile?.role
  if (allowRoles && !allowRoles.includes(role)) {
    return <Navigate to="/" replace />
  }

  return children
}
