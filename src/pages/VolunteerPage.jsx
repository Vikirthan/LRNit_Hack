import { useCallback, useEffect, useMemo, useState } from 'react'
import QrScanner from '../components/QrScanner'
import OnlineIndicator from '../components/OnlineIndicator'
import { useAuth } from '../context/AuthContext'
import { performIn, performOut, performAttendance, syncOfflineQueue } from '../services/scanService'
import { getTeams, searchTeamsByName, verifyScanToken } from '../services/teamService'

export default function VolunteerPage() {
  const { user, logout } = useAuth()
  const [team, setTeam] = useState(null)
  const [message, setMessage] = useState('Scan a QR code to load team details.')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [mode, setMode] = useState('attendance') // 'attendance' | 'movement'
  const [processing, setProcessing] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [teamDetailsVisible, setTeamDetailsVisible] = useState(false)

  useEffect(() => {
    const loadTeams = async () => {
      const items = await getTeams()
      setSearchResults(items)
    }

    loadTeams().catch(() => undefined)
  }, [])

  const handleDecoded = useCallback(async (decodedText) => {
    if (processing) return
    setProcessing(true)
    setMessage('⌛ Verifying token...')
    try {
      const found = await verifyScanToken(decodedText)
      // Provide haptic feedback
      if ('vibrate' in navigator) navigator.vibrate(100)
      
      setTeam(found)
      setTeamDetailsVisible(true)
      setMessage('✅ Team profile loaded successfully.')
    } catch (err) {
      console.error('Scan error:', err)
      setMessage(`❌ Scan Error: ${err.message}`)
    } finally {
      setProcessing(false)
    }
  }, [processing])

  useEffect(() => {
    const listener = async () => {
      const { synced } = await syncOfflineQueue()
      if (synced) setMessage(`Synced ${synced} offline action(s)`)
    }
    window.addEventListener('online', listener)
    return () => window.removeEventListener('online', listener)
  }, [])

  const onOut = async () => {
    if (!team) return
    
    // State machine check
    if (team.active_out) {
      setMessage(`❌ ERROR: Team ${team.team_id} is already OUT. They must scan IN before going out again.`)
      return
    }

    // Dynamic requirement: Max 3 out total.
    // If team of 4 -> 2 max
    // If team of 3 -> 1 max
    // If team of 2 -> 1 max (assumed minimum)
    let maxAllowed = 3
    if (team.members_count === 4) maxAllowed = 2
    else if (team.members_count === 3) maxAllowed = 1
    else if (team.members_count === 2) maxAllowed = 1
    else if (team.members_count < 2) maxAllowed = 0
    
    const raw = window.prompt(`Team of ${team.members_count}. Allowed max ${maxAllowed} members to leave. How many are going out?`, '1')
    if (raw === null) return // Cancelled
    
    const membersOut = Number(raw)
    if (Number.isNaN(membersOut) || membersOut < 1) {
      setMessage('❌ Invalid number of members')
      return
    }

    if (membersOut > maxAllowed) {
      setMessage(`❌ LIMIT EXCEEDED: Only ${maxAllowed} members allowed out for a team of ${team.members_count}.`)
      return
    }

    try {
      const result = await performOut({
        teamId: team.team_id,
        membersOut,
        actorUid: user?.uid,
      })
      // Update local state to reflect the change immediately
      if ('vibrate' in navigator) navigator.vibrate([50, 30, 50])
      setTeam({ ...team, active_out: { out_at: new Date().toISOString(), members_out: membersOut } })
      setMessage(result.queued ? 'OUT queued (offline)' : '✅ OUT marked successfully')
    } catch (err) {
      setMessage(`❌ Error: ${err.message}`)
    }
  }

  const onIn = async () => {
    if (!team) return

    // State machine check
    if (!team.active_out) {
      setMessage(`❌ ERROR: Team ${team.team_id} is already IN. They cannot scan IN without going OUT first.`)
      return
    }

    try {
      const result = await performIn({ teamId: team.team_id, actorUid: user?.uid })
      // Update local state
      if ('vibrate' in navigator) navigator.vibrate([50, 30, 50])
      setTeam({ ...team, active_out: null })
      setMessage(result.queued ? 'IN queued (offline)' : `✅ IN marked. Penalty: ${result.penalty || 0} pts`)
    } catch (err) {
      setMessage(`❌ Error: ${err.message}`)
    }
  }

  const onAttendance = async () => {
    if (!team) return
    setProcessing(true)
    try {
      if ('vibrate' in navigator) navigator.vibrate(200)
      const result = await performAttendance({ teamId: team.team_id, actorUid: user?.uid })
      setTeam({ ...team, is_present: true })
      setMessage(result.queued ? '✓ Attendance queued (offline)' : '✅ SUCCESS: Team marked as PRESENT')
    } catch (err) {
      setMessage(`❌ Status Error: ${err.message}`)
    } finally {
      setProcessing(false)
    }
  }

  const canAct = useMemo(() => Boolean(team), [team])

  const onSearch = async (e) => {
    e.preventDefault()
    setSearching(true)
    try {
      const items = await searchTeamsByName(search)
      setSearchResults(items)
      setMessage(items.length ? `Found ${items.length} team(s)` : 'No teams matched that search')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg-orb login-bg-orb-1" />
      <div className="login-bg-orb login-bg-orb-2" />
      <div className="login-bg-grid" />
      
      <main className="layout" style={{ maxWidth: '600px', margin: '0 auto', position: 'relative', zIndex: 1, padding: '20px' }}>
        <header style={{ marginBottom: '32px', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '8px' }}>
            <div className="login-feature-icon" style={{ width: '40px', height: '40px', fontSize: '1.2rem' }}>⚡</div>
            <h1 style={{ color: '#fff', fontSize: '1.8rem', margin: 0 }}>Volunteer <span>Portal</span></h1>
          </div>
          <OnlineIndicator />
        </header>

        {/* Mode Switcher */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px', background: 'rgba(0,0,0,0.3)', padding: '6px', borderRadius: '18px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <button 
            className={`login-tab ${mode === 'attendance' ? 'active' : ''}`}
            onClick={() => { setMode('attendance'); setTeamDetailsVisible(false); }}
            style={{ padding: '12px', borderRadius: '14px', fontSize: '0.9rem', transition: '0.3s' }}
          >
            📋 Attendance
          </button>
          <button 
            className={`login-tab ${mode === 'movement' ? 'active' : ''}`}
            onClick={() => { setMode('movement'); setTeamDetailsVisible(false); }}
            style={{ padding: '12px', borderRadius: '14px', fontSize: '0.9rem', transition: '0.3s' }}
          >
            🚶 Movement
          </button>
        </div>

        <div className="login-auth-panel" style={{ padding: '32px', borderRadius: '32px', background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(40px)' }}>
          <div style={{ marginBottom: '24px', textAlign: 'center' }}>
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '24px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <QrScanner onDecoded={handleDecoded} />
              {processing && <p style={{ color: '#818cf8', marginTop: '12px', fontWeight: 600 }}>⚙️ Processing Scan...</p>}
            </div>
          </div>

          <div className="status-bar" style={{ 
            background: message.includes('❌') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(99, 102, 241, 0.1)',
            color: message.includes('❌') ? '#f87171' : '#818cf8',
            padding: '16px',
            borderRadius: '16px',
            fontSize: '0.9rem',
            textAlign: 'center',
            marginBottom: '24px',
            border: '1px solid currentColor',
            fontWeight: 500
          }}>
            {message}
          </div>

          {team && teamDetailsVisible && (
            <div style={{ animation: 'fadeIn 0.4s cubic-bezier(0,0,0.2,1)' }}>
              <div className="login-feature-card" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '24px', background: 'rgba(255,255,255,0.03)', border: '2px solid rgba(99, 102, 241, 0.4)', boxShadow: '0 0 20px rgba(99, 102, 241, 0.15)' }}>
                <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ color: '#fff', fontSize: '1.3rem', margin: '0 0 4px 0', fontWeight: 700 }}>{team.team_name}</h3>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', margin: 0, fontFamily: 'monospace' }}>ID: {team.team_id} | ROOM: {team.room_number}</p>
                  </div>
                  <div style={{ 
                    background: team.is_present ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)', 
                    color: team.is_present ? '#34d399' : '#fbbf24', 
                    padding: '6px 14px', 
                    borderRadius: '10px', 
                    fontSize: '0.75rem', 
                    fontWeight: 800,
                    border: `1px solid ${team.is_present ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                  }}>
                    {team.is_present ? '✅ PRESENT' : '⏳ ARRIVAL PENDING'}
                  </div>
                </div>

                <div style={{ width: '100%', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '20px' }}>
                  {mode === 'attendance' ? (
                    <button 
                      className="login-submit" 
                      onClick={onAttendance} 
                      disabled={processing || team.is_present}
                      style={{ 
                        background: team.is_present ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #10b981, #059669)',
                        color: team.is_present ? 'rgba(255,255,255,0.3)' : '#fff',
                        boxShadow: team.is_present ? 'none' : '0 8px 16px rgba(16, 185, 129, 0.2)'
                      }}
                    >
                      {team.is_present ? '✓ Attendance Verified' : 'Confirm Team Presence'}
                    </button>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', width: '100%' }}>
                      <button 
                        className="login-submit" 
                        onClick={onOut} 
                        disabled={team.active_out || !team.is_present}
                        style={{ 
                          background: (team.active_out || !team.is_present) ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #f43f5e, #e11d48)',
                          boxShadow: (team.active_out || !team.is_present) ? 'none' : '0 8px 16px rgba(244, 63, 94, 0.2)'
                        }}
                      >
                         🚩 Scan OUT
                      </button>
                      <button 
                        className="login-submit" 
                        onClick={onIn} 
                        disabled={!team.active_out}
                        style={{ 
                          background: !team.active_out ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                          boxShadow: !team.active_out ? 'none' : '0 8px 16px rgba(59, 130, 246, 0.2)'
                        }}
                      >
                         🔙 Scan IN
                      </button>
                    </div>
                  )}
                  {!team.is_present && mode === 'movement' && (
                    <p style={{ color: '#f87171', fontSize: '0.75rem', marginTop: '12px', textAlign: 'center', fontWeight: 600 }}>
                      ⚠️ Team must mark attendance before managing movements.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: '32px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '32px' }}>
            <form onSubmit={onSearch} className="login-field">
              <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', marginBottom: '12px' }}>Manual Search (Last Resort)</label>
              <div className="login-input-wrap" style={{ background: 'rgba(0,0,0,0.2)' }}>
                <input 
                  type="text" 
                  value={search} 
                  onChange={(e) => setSearch(e.target.value)} 
                  placeholder="Type Team Name or ID..."
                  className="login-input"
                  style={{ border: 'none' }}
                />
                <button type="submit" disabled={searching} className="login-tab active" style={{ padding: '0 20px', borderRadius: '0 14px 14px 0' }}>{searching ? '...' : '🔍'}</button>
              </div>
            </form>
          </div>

          <button onClick={() => logout()} style={{ background: 'none', border: 'none', cursor: 'pointer', marginTop: '40px', width: '100%', color: 'rgba(255,255,255,0.2)', fontSize: '0.85rem' }}>🔐 Terminate Session</button>
        </div>
      </main>
    </div>
  )
}
