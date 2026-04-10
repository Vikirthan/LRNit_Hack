import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { requestAccount } from '../services/accountService'
import PWAInstallPrompt from '../components/PWAInstallPrompt'

export default function LoginPage() {
  const { user, profile, login } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login') // 'login' | 'request'
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Redirect if already logged in
  useEffect(() => {
    if (user && profile) {
      navigate('/', { replace: true })
    }
  }, [user, profile, navigate])

  // Request account form
  const [reqForm, setReqForm] = useState({
    username: '',
    fullName: '',
    email: '',
    password: '',
    role: 'volunteer',
  })
  const [reqStatus, setReqStatus] = useState('')

  const onLogin = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      await login(identifier, password)
      navigate('/')
    } catch (err) {
      setError(err.message || 'Unable to login')
    } finally {
      setIsLoading(false)
    }
  }

  const onRequestAccount = async (e) => {
    e.preventDefault()
    setReqStatus('')
    try {
      await requestAccount(reqForm)
      setReqStatus('✓ Account request submitted! Wait for admin approval.')
      setReqForm({ username: '', fullName: '', email: '', password: '', role: 'volunteer' })
    } catch (err) {
      setReqStatus(err.message || 'Unable to submit request')
    }
  }

  return (
    <div className="login-page">
      {/* Animated background elements */}
      <div className="login-bg-orb login-bg-orb-1" />
      <div className="login-bg-orb login-bg-orb-2" />
      <div className="login-bg-orb login-bg-orb-3" />
      <div className="login-bg-grid" />

      <div className="login-container">
        {/* Left: Branding hero */}
        <section className="login-hero">
          <div className="login-hero-badge">⚡ Hackathon Ops</div>
          <h1 className="login-hero-title">
            Ticket<span>Scan</span>
          </h1>
          <p className="login-hero-subtitle">
            Real-time attendance, break tracking, teacher scoring, and admin reporting — all in one live system built for hackathon workflows.
          </p>

          <div className="login-feature-cards">
            <div className="login-feature-card">
              <div className="login-feature-icon">📱</div>
              <div>
                <strong>QR Check-ins</strong>
                <p>Scan teams in and out instantly</p>
              </div>
            </div>
            <div className="login-feature-card">
              <div className="login-feature-icon">📊</div>
              <div>
                <strong>Live Scoring</strong>
                <p>100-point rubric with real-time totals</p>
              </div>
            </div>
            <div className="login-feature-card">
              <div className="login-feature-icon">🛡️</div>
              <div>
                <strong>Admin Control</strong>
                <p>Import teams, track penalties, audit logs</p>
              </div>
            </div>
          </div>
        </section>

        {/* Right: Auth panel */}
        <section className="login-auth-panel">
          {/* Tab switcher */}
          <div className="login-tab-bar">
            <button
              className={mode === 'login' ? 'login-tab active' : 'login-tab'}
              onClick={() => { setMode('login'); setError(''); setReqStatus('') }}
            >
              Sign In
            </button>
            <button
              className={mode === 'request' ? 'login-tab active' : 'login-tab'}
              onClick={() => { setMode('request'); setError(''); setReqStatus('') }}
            >
              Request Access
            </button>
          </div>

          {mode === 'login' ? (
            <form className="login-form" onSubmit={onLogin}>
              <div className="login-form-header">
                <h2>Welcome back</h2>
                <p>Enter your credentials to access your portal</p>
              </div>

              <div className="login-field">
                <label htmlFor="login-id">Username or Email</label>
                <div className="login-input-wrap">
                  <span className="login-input-icon">👤</span>
                  <input
                    id="login-id"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                    placeholder="Enter username or email"
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="login-pw">Password</label>
                <div className="login-input-wrap">
                  <span className="login-input-icon">🔒</span>
                  <input
                    id="login-pw"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="Enter password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="login-toggle-pw"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <button type="submit" className="login-submit" disabled={isLoading}>
                {isLoading ? (
                  <span className="login-spinner" />
                ) : null}
                {isLoading ? 'Signing in...' : 'Sign In'}
              </button>

              {error && <div className="login-error">{error}</div>}

              <div className="login-divider">
                <span>Admin access</span>
              </div>

            </form>
          ) : (
            <form className="login-form" onSubmit={onRequestAccount}>
              <div className="login-form-header">
                <h2>Request access</h2>
                <p>Create an account request. An admin will approve it.</p>
              </div>

              <div className="login-field">
                <label htmlFor="req-user">Username</label>
                <div className="login-input-wrap">
                  <span className="login-input-icon">👤</span>
                  <input
                    id="req-user"
                    value={reqForm.username}
                    onChange={(e) => setReqForm((p) => ({ ...p, username: e.target.value }))}
                    required
                    placeholder="Choose a username"
                  />
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="req-name">Full Name</label>
                <div className="login-input-wrap">
                  <span className="login-input-icon">📝</span>
                  <input
                    id="req-name"
                    value={reqForm.fullName}
                    onChange={(e) => setReqForm((p) => ({ ...p, fullName: e.target.value }))}
                    required
                    placeholder="Your full name"
                  />
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="req-email">Email <span className="optional">(optional)</span></label>
                <div className="login-input-wrap">
                  <span className="login-input-icon">✉️</span>
                  <input
                    id="req-email"
                    type="email"
                    value={reqForm.email}
                    onChange={(e) => setReqForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="email@school.edu"
                  />
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="req-pw">Password</label>
                <div className="login-input-wrap">
                  <span className="login-input-icon">🔒</span>
                  <input
                    id="req-pw"
                    type="password"
                    value={reqForm.password}
                    onChange={(e) => setReqForm((p) => ({ ...p, password: e.target.value }))}
                    required
                    placeholder="Choose a password"
                  />
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="req-role">Role</label>
                <div className="login-input-wrap">
                  <span className="login-input-icon">🎭</span>
                  <select
                    id="req-role"
                    value={reqForm.role}
                    onChange={(e) => setReqForm((p) => ({ ...p, role: e.target.value }))}
                  >
                    <option value="volunteer">Volunteer</option>
                    <option value="teacher">Teacher</option>
                    <option value="team">Team Member</option>
                  </select>
                </div>
              </div>

              <button type="submit" className="login-submit request">
                Request Approval
              </button>

              {reqStatus && (
                <div className={reqStatus.startsWith('✓') ? 'login-success' : 'login-error'}>
                  {reqStatus}
                </div>
              )}
            </form>
          )}

          <PWAInstallPrompt />
        </section>
      </div>
    </div>
  )
}
