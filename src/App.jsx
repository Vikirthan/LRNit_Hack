import { useEffect, useState } from 'react'
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
  const [deferredPrompt, setDeferredPrompt] = useState(null)

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const onInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setDeferredPrompt(null)
  }

  return (
    <>
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

      {deferredPrompt && (
        <button 
          onClick={onInstall}
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 1000,
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            color: '#fff',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '16px',
            fontWeight: 700,
            boxShadow: '0 8px 32px rgba(99, 102, 241, 0.4)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}
        >
          <span>📲 Install App</span>
        </button>
      )}
    </>
  )
}
