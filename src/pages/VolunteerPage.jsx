import { useCallback, useEffect, useMemo, useState } from 'react'
import QrScanner from '../components/QrScanner'
import OnlineIndicator from '../components/OnlineIndicator'
import { useAuth } from '../context/AuthContext'
import { performIn, performOut, syncOfflineQueue } from '../services/scanService'
import { getTeams, searchTeamsByName, verifyScanToken } from '../services/teamService'

export default function VolunteerPage() {
  const { user, logout } = useAuth()
  const [team, setTeam] = useState(null)
  const [message, setMessage] = useState('Scan a QR code to load team details.')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const loadTeams = async () => {
      const items = await getTeams()
      setSearchResults(items)
    }

    loadTeams().catch(() => undefined)
  }, [])

  const handleDecoded = useCallback(async (decodedText) => {
    try {
      const found = await verifyScanToken(decodedText)
      setTeam(found)
      setMessage('Team loaded')
    } catch (err) {
      setMessage(err.message)
    }
  }, [])

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

    const maxAllowed = Math.max(1, (Number(team.members_count) || 2) - 1)
    const raw = window.prompt(`Team of ${team.members_count}. Max ${maxAllowed} members can leave. How many are going out?`, '1')
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
      setTeam({ ...team, active_out: null })
      setMessage(result.queued ? 'IN queued (offline)' : `✅ IN marked. Penalty: ${result.penalty || 0} pts`)
    } catch (err) {
      setMessage(`❌ Error: ${err.message}`)
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

      <main className="layout" style={{ position: 'relative', zIndex: 1 }}>
        <header className="topbar">
          <h1 style={{ color: '#fff' }}>Volunteer Scanner</h1>
          <div className="topbar-actions">
            <OnlineIndicator />
            <button onClick={logout} className="login-tab active" style={{ borderRadius: '10px' }}>Sign Out</button>
          </div>
        </header>

        <section className="grid two-col" style={{ alignItems: 'start' }}>
          <div className="login-auth-panel" style={{ background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '28px', padding: '24px' }}>
            <h2 style={{ color: '#fff', fontSize: '1.4rem', marginBottom: '16px' }}>Scan QR</h2>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <QrScanner onDecoded={handleDecoded} />
            </div>
            <p className="muted" style={{ marginTop: '12px' }}>{message}</p>
          </div>

          <div className="login-auth-panel" style={{ background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '28px', padding: '24px' }}>
            <h2 style={{ color: '#fff', fontSize: '1.4rem', marginBottom: '16px' }}>Team Details</h2>
            
            <div className="login-feature-cards" style={{ marginBottom: '20px' }}>
              <div className="login-feature-card">
                <div className="login-feature-icon">✨</div>
                <div>
                  <strong>{team?.team_name || 'No team selected'}</strong>
                  <p>ID: {team?.team_id || '-'}</p>
                </div>
              </div>
              <div className="grid two-col" style={{ gap: '10px' }}>
                <div className="login-feature-card" style={{ padding: '10px' }}>
                   <div>
                    <span className="summary-label" style={{ fontSize: '0.7rem' }}>Members</span>
                    <strong>{team?.members_count ?? '-'}</strong>
                   </div>
                </div>
                <div className="login-feature-card" style={{ padding: '10px' }}>
                   <div>
                    <span className="summary-label" style={{ fontSize: '0.7rem' }}>Room</span>
                    <strong>{team?.room_number || '-'}</strong>
                   </div>
                </div>
              </div>
            </div>

            <div className="row" style={{ gap: '12px', marginBottom: '24px' }}>
              <button 
                disabled={!canAct || !!team.active_out} 
                onClick={onOut} 
                className="login-submit" 
                style={{ flex: 1, padding: '12px', opacity: team.active_out ? 0.3 : 1, transition: 'all 0.3s' }}
              >
                OUT
              </button>
              <button 
                disabled={!canAct || !team.active_out} 
                className="login-submit request" 
                onClick={onIn} 
                style={{ flex: 1, padding: '12px', opacity: !team.active_out ? 0.3 : 1, transition: 'all 0.3s' }}
              >
                IN
              </button>
            </div>

            <h3 style={{ color: '#fff', fontSize: '1.1rem', marginBottom: '12px' }}>Manual Team Search</h3>
            <form className="login-input-wrap" onSubmit={onSearch} style={{ marginBottom: '16px' }}>
              <span className="login-input-icon">🔍</span>
              <input placeholder="Type team name or ID" value={search} onChange={(e) => setSearch(e.target.value)} />
              <button type="submit" disabled={searching} className="login-tab active" style={{ padding: '4px 12px', fontSize: '0.8rem' }}>
                {searching ? '...' : 'Search'}
              </button>
            </form>

            <div className="sheet-wrap" style={{ maxHeight: '220px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <table className="sheet-table" style={{ fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)' }}>#</th>
                    <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)' }}>Team ID</th>
                    <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)' }}>Name</th>
                    <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)' }}>Room</th>
                    <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)' }}>-</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="muted" style={{ textAlign: 'center', padding: '20px' }}>No teams found</td>
                    </tr>
                  ) : (
                    searchResults.map((item, index) => (
                      <tr key={item.team_id} 
                        className={team?.team_id === item.team_id ? 'sheet-row active' : 'sheet-row'}
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                        onClick={() => setTeam(item)}
                      >
                        <td style={{ color: 'rgba(255,255,255,0.4)' }}>{index + 1}</td>
                        <td style={{ color: '#fff' }}><strong>{item.team_id}</strong></td>
                        <td style={{ color: 'rgba(255,255,255,0.8)' }}>{item.team_name}</td>
                        <td style={{ color: 'rgba(255,255,255,0.6)' }}>{item.room_number || '-'}</td>
                        <td>
                          <span style={{ color: '#60a5fa', fontSize: '1.2rem' }}>→</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
