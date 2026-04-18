import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { useAuth } from '../context/AuthContext'
import { verifyScanToken } from '../services/teamService'

export default function PublicTicketPage() {
  const { profile, logout } = useAuth()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [team, setTeam] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [qrUrl, setQrUrl] = useState('')
  const canvasRef = useRef(null)

  useEffect(() => {
    async function loadTeam() {
      if (!token) {
        setError('No access token provided')
        setLoading(false)
        return
      }

      try {
        const data = await verifyScanToken(token)
        setTeam(data)
        
        // Generate QR code
        const url = await QRCode.toDataURL(token, {
          width: 300,
          margin: 2,
          color: {
            dark: '#6366f1',
            light: '#ffffff'
          }
        })
        setQrUrl(url)
      } catch (err) {
        console.error('Ticket error:', err)
        setError(err.message || 'Invalid or expired ticket')
      } finally {
        setLoading(false)
      }
    }
    loadTeam()
  }, [token])

  const onDownload = () => {
    if (!qrUrl) return
    const link = document.createElement('a')
    link.href = qrUrl
    link.download = `Ticket_${team?.team_id || 'QR'}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-feature-card">
            <h2 style={{ color: '#fff' }}>Verifying Ticket...</h2>
            <p className="muted">Please wait while we secure your access</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-feature-card" style={{ border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            <h2 style={{ color: '#f87171' }}>⚠️ Invalid Ticket</h2>
            <p className="muted">{error}</p>
            <p style={{ marginTop: '20px', fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)' }}>
              Please check the original link sent to your email or contact the event organizers.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-bg-orb login-bg-orb-1" style={{ width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)' }} />
      <div className="login-bg-orb login-bg-orb-2" style={{ top: '60%', left: '70%', background: 'radial-gradient(circle, rgba(168, 85, 247, 0.1) 0%, transparent 70%)' }} />
      <div className="login-bg-grid" />

      <main className="login-container" style={{ gridTemplateColumns: '1fr', maxWidth: '480px', position: 'relative' }}>
        <section className="login-auth-panel" style={{ 
          textAlign: 'center', 
          borderRight: 'none', 
          padding: '40px 32px',
          background: 'rgba(15, 18, 32, 0.8)',
          backdropFilter: 'blur(40px)',
          borderRadius: '32px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <header className="login-form-header" style={{ marginBottom: '40px' }}>
             <div style={{ display: 'inline-block', padding: '8px 16px', borderRadius: '100px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)', marginBottom: '16px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '600', letterSpacing: '0.1em', color: '#818cf8', textTransform: 'uppercase' }}>Official Event Entry</span>
             </div>
            <h1 style={{ fontSize: '2.5rem', fontWeight: '800', margin: '0 0 8px 0', background: 'linear-gradient(to bottom, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Digital Ticket</h1>
            <p className="muted" style={{ fontSize: '0.95rem' }}>Scan at the registration desk for entry</p>
            {profile && (
              <div style={{ marginTop: '16px' }}>
                <button onClick={logout} className="login-tab" style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 16px', fontSize: '0.8rem' }}>Sign Out ({profile.role})</button>
              </div>
            )}
          </header>

          <div style={{ 
            background: 'white', 
            padding: '24px', 
            borderRadius: '32px', 
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 20px rgba(99, 102, 241, 0.2)',
            marginBottom: '24px',
            marginLeft: 'auto',
            marginRight: 'auto',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: 'linear-gradient(90deg, #6366f1, #a855f7)' }} />
            <img src={qrUrl} alt="QR Code" style={{ width: '100%', maxWidth: '240px', height: 'auto', display: 'block', margin: '0 auto' }} />
          </div>
          
          <button 
            onClick={onDownload} 
            className="login-submit" 
            style={{ 
              marginBottom: '40px', 
              background: 'rgba(255, 255, 255, 0.05)', 
              color: '#fff', 
              border: '1px solid rgba(255, 255, 255, 0.1)',
              padding: '12px 24px',
              fontSize: '0.9rem',
              borderRadius: '16px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              width: '100%',
              cursor: 'pointer'
            }}
          >
            <span style={{ fontSize: '1.2rem' }}>📥</span> Save Ticket to Phone
          </button>

          <div className="login-feature-card" style={{ 
            textAlign: 'left', 
            background: 'rgba(255, 255, 255, 0.03)', 
            borderColor: 'rgba(255, 255, 255, 0.06)',
            padding: '24px',
            borderRadius: '24px'
          }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1.4rem', color: '#fff' }}>{team.team_name}</h3>
                  <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>ID: {team.team_id}</span>
                </div>
                <div style={{ 
                  padding: '6px 12px', 
                  borderRadius: '10px', 
                  background: team.is_present ? 'rgba(34, 197, 94, 0.1)' : 'rgba(96, 165, 250, 0.1)',
                  border: `1px solid ${team.is_present ? 'rgba(34, 197, 94, 0.2)' : 'rgba(96, 165, 250, 0.2)'}`,
                  color: team.is_present ? '#4ade80' : '#60a5fa',
                  fontSize: '0.75rem',
                  fontWeight: '800'
                }}>
                  {team.is_present ? 'ADMITTED' : 'NOT ARRIVED'}
                </div>
             </div>

             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                   <p style={{ margin: '0 0 4px 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Members</p>
                   <p style={{ margin: 0, color: '#fff', fontWeight: '600' }}>{team.members_count || 0} Participants</p>
                </div>
                <div>
                   <p style={{ margin: '0 0 4px 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Location</p>
                   <p style={{ margin: 0, color: '#fff', fontWeight: '600' }}>{team.room_number || 'TBA'}</p>
                </div>
                <div>
                   <p style={{ margin: '0 0 4px 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Entry Status</p>
                   {team.active_out ? (
                      <p style={{ margin: 0, color: '#f472b6', fontWeight: '600' }}>🎟️ ON BREAK</p>
                   ) : team.is_present ? (
                      <p style={{ margin: 0, color: '#4ade80', fontWeight: '600' }}>✅ ADMITTED</p>
                   ) : (
                      <p style={{ margin: 0, color: '#94a3b8', fontWeight: '600' }}>NOT ARRIVED</p>
                   )}
                </div>
             </div>
          </div>

          <p style={{ marginTop: '32px', fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)' }}>
            This ticket is unique to your team. Do not share the link.
          </p>
        </section>
      </main>
    </div>
  )
}
