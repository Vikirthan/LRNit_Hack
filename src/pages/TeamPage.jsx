import { useState, useEffect } from 'react'
import { getTeams } from '../services/teamService'
import OnlineIndicator from '../components/OnlineIndicator'
import { useAuth } from '../context/AuthContext'

export default function TeamPage() {
  const { logout } = useAuth()
  const [teamId, setTeamId] = useState('')
  const [teamData, setTeamData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const onSearch = async (e) => {
    e.preventDefault()
    if (!teamId.trim()) return
    setLoading(true)
    setError('')
    try {
      const teams = await getTeams()
      const found = teams.find(t => t.team_id.toLowerCase() === teamId.trim().toLowerCase())
      if (found) {
        setTeamData(found)
      } else {
        setError('Team not found. Please check your Team ID.')
      }
    } catch (err) {
      setError('Error fetching data')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg-orb login-bg-orb-1" />
      <div className="login-bg-orb login-bg-orb-2" />
      <div className="login-bg-grid" />

      <main className="login-container" style={{ gridTemplateColumns: '1fr', maxWidth: '600px' }}>
        <section className="login-auth-panel" style={{ borderRight: 'none' }}>
           <header className="login-form-header" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '1.8rem' }}>Team Portal</h2>
              <p>Check your hackathon status and scores</p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <OnlineIndicator />
              <button onClick={logout} className="login-tab" style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 12px' }}>Sign Out</button>
            </div>
          </header>

          {!teamData ? (
            <form onSubmit={onSearch} className="login-form">
              <div className="login-field">
                <label>Enter your Team ID</label>
                <div className="login-input-wrap">
                  <span className="login-input-icon">🆔</span>
                  <input
                    placeholder="e.g. T-01"
                    value={teamId}
                    onChange={(e) => setTeamId(e.target.value)}
                    required
                  />
                </div>
              </div>
              <button type="submit" className="login-submit" disabled={loading}>
                {loading ? 'Checking...' : 'View My Status'}
              </button>
              {error && <div className="login-error">{error}</div>}
            </form>
          ) : (
            <div className="stack" style={{ gap: '20px' }}>
              <div className="login-feature-card" style={{ background: 'rgba(59, 130, 246, 0.1)', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
                <div className="login-feature-icon">✨</div>
                <div>
                  <strong>{teamData.team_name}</strong>
                  <p>ID: {teamData.team_id} · Room: {teamData.room_number}</p>
                </div>
              </div>

              <div className="grid two-col" style={{ gap: '14px' }}>
                <div className="login-feature-card">
                  <div>
                    <span className="summary-label">Negative Points</span>
                    <h3 style={{ margin: '4px 0', fontSize: '1.8rem', color: '#fca5a5' }}>{teamData.penalty_points || 0}</h3>
                    <p className="muted" style={{ fontSize: '0.8rem' }}>Lower is better</p>
                  </div>
                </div>

                <div className="login-feature-card">
                  <div>
                    <span className="summary-label">Status</span>
                    <h3 style={{ margin: '4px 0', fontSize: '1.4rem', color: teamData.active_out ? '#fbbf24' : '#34d399' }}>
                      {teamData.active_out ? 'Currently OUT' : 'In Venue'}
                    </h3>
                    <p className="muted" style={{ fontSize: '0.8rem' }}>
                      {teamData.active_out ? `Since ${new Date(teamData.active_out.out_at).toLocaleTimeString()}` : 'Checked IN'}
                    </p>
                  </div>
                </div>
              </div>

              <button onClick={() => setTeamData(null)} className="secondary" style={{ width: '100%', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '10px' }}>
                Check another team
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
