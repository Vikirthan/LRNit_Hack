import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, ClipboardList, LoaderCircle, Route, Search, ShieldCheck, UserRound } from 'lucide-react'
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
  const [teams, setTeams] = useState([])
  const [searching, setSearching] = useState(false)
  const [mode, setMode] = useState('attendance') // 'attendance' | 'movement'
  const [processing, setProcessing] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [teamDetailsVisible, setTeamDetailsVisible] = useState(false)
  const [pendingTeam, setPendingTeam] = useState(null)
  const [isConfirmed, setIsConfirmed] = useState(false)

  useEffect(() => {
    const loadTeams = async () => {
      const items = await getTeams()
      setTeams(items)
    }

    loadTeams().catch(() => undefined)
  }, [])

  const handleDecoded = useCallback(async (decodedText) => {
    if (processing) return
    setProcessing(true)
    setMessage('Verifying token...')
    try {
      const found = await verifyScanToken(decodedText)
      
      setPendingTeam(found)
      setIsConfirmed(false)
      setMessage(`Team ${found.team_id} found. Please confirm.`)
    } catch (err) {
      console.error('Scan error:', err)
      setMessage(`Scan error: ${err.message}`)
    } finally {
      setProcessing(false)
    }
  }, [processing])

  const confirmTeamLoad = () => {
    if (!pendingTeam || !isConfirmed) return
    if ('vibrate' in navigator) navigator.vibrate(40)
    setTeam(pendingTeam)
    setPendingTeam(null)
    setTeamDetailsVisible(true)
    setMessage('Team profile loaded successfully.')
  }

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
      setMessage(`Error: Team ${team.team_id} is already out. They must scan in before going out again.`)
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
      setMessage('Invalid number of members')
      return
    }

    if (membersOut > maxAllowed) {
      setMessage(`Limit exceeded: only ${maxAllowed} members allowed out for a team of ${team.members_count}.`)
      return
    }

    try {
      const result = await performOut({
        teamId: team.team_id,
        membersOut,
        actorUid: user?.uid,
      })
      // Update local state to reflect the change immediately
      if ('vibrate' in navigator) navigator.vibrate([30, 20, 30])
      setTeam({ ...team, active_out: { out_at: new Date().toISOString(), members_out: membersOut } })
      setMessage(result.queued ? 'Out action queued (offline)' : 'Out marked successfully')
    } catch (err) {
      setMessage(`Error: ${err.message}`)
    }
  }

  const onIn = async () => {
    if (!team) return

    // State machine check
    if (!team.active_out) {
      setMessage(`Error: Team ${team.team_id} is already in. They cannot scan in without going out first.`)
      return
    }

    try {
      const result = await performIn({ teamId: team.team_id, actorUid: user?.uid })
      // Update local state
      if ('vibrate' in navigator) navigator.vibrate([30, 20, 30])
      setTeam({ ...team, active_out: null })
      setMessage(result.queued ? 'In action queued (offline)' : `In marked. Penalty: ${result.penalty || 0} pts`)
    } catch (err) {
      setMessage(`Error: ${err.message}`)
    }
  }

  const onAttendance = async () => {
    if (!team) return
    setProcessing(true)
    try {
      if ('vibrate' in navigator) navigator.vibrate(60)
      const result = await performAttendance({ teamId: team.team_id, actorUid: user?.uid })
      setTeam({ ...team, is_present: true })
      setMessage(result.queued ? 'Attendance queued (offline)' : 'Team marked as present')
    } catch (err) {
      setMessage(`Status error: ${err.message}`)
    } finally {
      setProcessing(false)
    }
  }

  const canAct = useMemo(() => Boolean(team), [team])

  const onSearch = (e) => {
    e.preventDefault()
    // Manual search button fallback
  }

  const filteredResults = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase().trim()
    return teams.filter(t => t.team_name.toLowerCase().includes(q) || t.team_id.toLowerCase().includes(q)).slice(0, 10)
  }, [teams, search])

  const statusTone = useMemo(() => {
    const text = message.toLowerCase()
    if (text.includes('error') || text.includes('invalid') || text.includes('failed') || text.includes('limit exceeded')) return 'error'
    if (text.includes('queued') || text.includes('pending')) return 'warn'
    return 'info'
  }, [message])

  return (
    <div className="login-page volunteer-page">
      <div className="login-bg-orb login-bg-orb-1" />
      <div className="login-bg-orb login-bg-orb-2" />
      <div className="login-bg-grid" />
      
      <main className="layout volunteer-workspace" style={{ maxWidth: '600px', width: '100%', margin: '0 auto', position: 'relative', zIndex: 1, padding: '20px' }}>
        <header style={{ marginBottom: '32px', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '16px' }}>
            <div className="login-feature-icon" style={{ width: '40px', height: '40px', fontSize: '1.2rem', background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}><ShieldCheck size={18} /></div>
            <h1 style={{ color: '#fff', fontSize: '1.8rem', margin: 0 }}>Volunteer <span>Portal</span></h1>
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <OnlineIndicator />
            <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
            <button onClick={logout} className="login-tab active" style={{ padding: '8px 16px', fontSize: '0.85rem', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.2)' }}>Sign Out</button>
          </div>
        </header>

        {/* Mode Switcher */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px', background: 'rgba(0,0,0,0.3)', padding: '6px', borderRadius: '18px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <button 
            className={`login-tab ${mode === 'attendance' ? 'active' : ''}`}
            onClick={() => { setMode('attendance'); setTeamDetailsVisible(false); }}
            style={{ padding: '12px', borderRadius: '14px', fontSize: '0.9rem', transition: '0.3s' }}
          >
            <span className="icon-label"><ClipboardList size={16} /> Attendance</span>
          </button>
          <button 
            className={`login-tab ${mode === 'movement' ? 'active' : ''}`}
            onClick={() => { setMode('movement'); setTeamDetailsVisible(false); }}
            style={{ padding: '12px', borderRadius: '14px', fontSize: '0.9rem', transition: '0.3s' }}
          >
            <span className="icon-label"><Route size={16} /> Movement</span>
          </button>
        </div>

        <div className="login-auth-panel" style={{ padding: '32px', borderRadius: '32px', background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(40px)' }}>
          <div style={{ marginBottom: '24px', textAlign: 'center' }}>
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '24px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <QrScanner onDecoded={handleDecoded} />
              {processing && <p style={{ color: '#818cf8', marginTop: '12px', fontWeight: 600 }}><span className="icon-label" style={{ justifyContent: 'center' }}><LoaderCircle size={16} /> Processing scan...</span></p>}
            </div>
          </div>

          <div className="status-bar" style={{ 
            background: statusTone === 'error' ? 'rgba(239, 68, 68, 0.1)' : statusTone === 'warn' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(99, 102, 241, 0.1)',
            color: statusTone === 'error' ? '#f87171' : statusTone === 'warn' ? '#fbbf24' : '#818cf8',
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
                    {team.is_present ? 'PRESENT' : 'ARRIVAL PENDING'}
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '14px', width: '100%' }}>
                      <button 
                        className="login-submit" 
                        onClick={onOut} 
                        disabled={team.active_out || !team.is_present}
                        style={{ 
                          background: (team.active_out || !team.is_present) ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #f43f5e, #e11d48)',
                          boxShadow: (team.active_out || !team.is_present) ? 'none' : '0 8px 16px rgba(244, 63, 94, 0.2)'
                        }}
                      >
                        <span className="icon-label" style={{ justifyContent: 'center' }}><ArrowUpRight size={16} /> Mark Out</span>
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
                        <span className="icon-label" style={{ justifyContent: 'center' }}><ArrowDownLeft size={16} /> Mark In</span>
                      </button>
                    </div>
                  )}
                  {!team.is_present && mode === 'movement' && (
                    <p style={{ color: '#f87171', fontSize: '0.75rem', marginTop: '12px', textAlign: 'center', fontWeight: 600 }}>
                      <span className="icon-label" style={{ justifyContent: 'center' }}><AlertTriangle size={14} /> Team must mark attendance before managing movements.</span>
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
                <button type="submit" disabled={searching} className="login-tab active" style={{ padding: '0 20px', borderRadius: '0 14px 14px 0' }}>
                  {searching ? '...' : <Search size={16} />}
                </button>
              </div>
            </form>

            {filteredResults.length > 0 && (
              <div style={{ marginTop: '16px', background: 'rgba(0,0,0,0.3)', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', animation: 'fadeIn 0.3s ease-out' }}>
                {filteredResults.map((t) => (
                  <div 
                    key={t.team_id} 
                    onClick={() => {
                       // Load into scanner confirmation flow
                       setPendingTeam(t);
                       setIsConfirmed(false);
                       setSearch('');
                    }}
                    style={{ 
                      padding: '16px', 
                      borderBottom: '1px solid rgba(255,255,255,0.05)', 
                      cursor: 'pointer', 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <div>
                      <strong style={{ color: '#fff', fontSize: '1rem', display: 'block' }}>{t.team_name}</strong>
                      <span style={{ color: '#818cf8', fontSize: '0.8rem', fontFamily: 'monospace' }}>ID: {t.team_id}</span>
                    </div>
                    <div style={{ background: 'rgba(129, 140, 248, 0.1)', color: '#818cf8', padding: '6px 12px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 700 }}>
                      SELECT
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>

        </div>

        {/* Confirmation Modal */}
        {pendingTeam && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.8)', padding: '20px' }}>
            <div className="login-auth-panel" style={{ width: 'min(500px, 100%)', padding: '32px', background: 'rgba(20, 24, 40, 0.95)', border: '1px solid rgba(129, 140, 248, 0.5)', boxShadow: '0 0 60px rgba(0,0,0,0.5)' }}>
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div style={{ margin: '0 auto 16px', width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(129, 140, 248, 0.2)', color: '#818cf8', display: 'grid', placeItems: 'center', fontSize: '1.8rem' }}><UserRound size={28} /></div>
                <h2 style={{ color: '#fff', fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>Confirm Team</h2>
                <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: '8px' }}>Verify the team's identity before proceeding.</p>
              </div>

              <div style={{ background: 'rgba(129, 140, 248, 0.05)', border: '1px solid rgba(129, 140, 248, 0.2)', padding: '20px', borderRadius: '20px', marginBottom: '24px' }}>
                <p style={{ fontSize: '0.8rem', color: '#818cf8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em', marginBottom: '8px' }}>Detected Team</p>
                <h3 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700, margin: '0 0 4px 0' }}>{pendingTeam.team_name}</h3>
                <p style={{ color: 'rgba(255,255,255,0.4)', margin: 0 }}>Team ID: {pendingTeam.team_id} | Room: {pendingTeam.room_number || '-'}</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: `1px solid ${isConfirmed ? '#34d399' : 'rgba(255,255,255,0.1)'}`, cursor: 'pointer', transition: '0.3s' }} onClick={() => setIsConfirmed(!isConfirmed)}>
                <div style={{ width: '24px', height: '24px', borderRadius: '6px', border: '2px solid #818cf8', background: isConfirmed ? '#818cf8' : 'transparent', display: 'grid', placeItems: 'center', color: '#13111c', fontWeight: 900 }}>
                  {isConfirmed && '✓'}
                </div>
                <span style={{ color: isConfirmed ? '#fff' : 'rgba(255,255,255,0.7)', fontWeight: 600, fontSize: '1rem' }}>Confirm this is {pendingTeam.team_name}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '32px' }}>
                <button onClick={() => setPendingTeam(null)} className="login-tab" style={{ background: 'rgba(255,255,255,0.05)', color: '#fff' }}>Cancel</button>
                <button 
                  disabled={!isConfirmed} 
                  onClick={confirmTeamLoad} 
                  className="login-submit" 
                  style={{ opacity: isConfirmed ? 1 : 0.5, background: isConfirmed ? 'linear-gradient(135deg, #818cf8, #6366f1)' : 'rgba(59,130,246,0.1)' }}
                >
                  <span className="icon-label" style={{ justifyContent: 'center' }}><CheckCircle2 size={16} /> Confirm and Load</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
