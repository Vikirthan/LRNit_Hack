import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuth } from './context/AuthContext'
import { ROLES } from './constants/roles'
import AdminPage from './pages/AdminPage'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'
import TeacherPage from './pages/TeacherPage'
import VolunteerPage from './pages/VolunteerPage'
import TeamPage from './pages/TeamPage'
import PublicTicketPage from './pages/PublicTicketPage'

function HomeRedirect() {
  const { profile } = useAuth()
  if (profile?.role === ROLES.ADMIN) return <Navigate to="/admin" replace />
  if (profile?.role === ROLES.TEACHER) return <Navigate to="/teacher" replace />
  if (profile?.role === ROLES.VOLUNTEER) return <Navigate to="/volunteer" replace />
  if (profile?.role === ROLES.TEAM) return <Navigate to="/team" replace />
  return <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/scan" element={<PublicTicketPage />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowRoles={[ROLES.ADMIN]}>
            <AdminPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher"
        element={
          <ProtectedRoute allowRoles={[ROLES.TEACHER]}>
            <TeacherPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/volunteer"
        element={
          <ProtectedRoute allowRoles={[ROLES.VOLUNTEER, ROLES.ADMIN]}>
            <VolunteerPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/team"
        element={
          <ProtectedRoute allowRoles={[ROLES.TEAM, ROLES.ADMIN]}>
            <TeamPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
