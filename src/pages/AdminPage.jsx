import { useEffect, useState } from 'react'
import OnlineIndicator from '../components/OnlineIndicator'
import { useAuth } from '../context/AuthContext'
import { 
  getTeams, 
  subscribeToTeams, 
  upsertTeams, 
  getTeacherScores, 
  getRules, 
  saveRules as updateRules,
  verifyTeamsInBackend,
  sendQrEmails,
  getActivityLog
} from '../services/teamService'
import { parseTeamFile } from '../services/csvService'
import { getPendingAccounts, getAllAccounts, approveAccount, rejectAccount, deleteAccount } from '../services/accountService'
import TeamTimer from '../components/TeamTimer'

export default function AdminPage() {
  const { profile, logout } = useAuth()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [teams, setTeams] = useState([])
  const [teacherScores, setTeacherScores] = useState([])
  const [rules, setRules] = useState({ 
    max_break_time: 15, 
    grace_time: 5, 
    penalty_per_unit: 10,
    is_active: true 
  })
  const [logs, setLogs] = useState([])
  const [accounts, setAccounts] = useState([])
  const [status, setStatus] = useState(null)
  const [importing, setImporting] = useState(false)

  const refresh = async () => {
    try {
      const [t, s, r, a, l] = await Promise.all([
        getTeams(),
        getTeacherScores(),
        getRules(),
        getAllAccounts(),
        getActivityLog()
      ])
      setTeams(t)
      setTeacherScores(s)
      if (r) setRules(r)
      setAccounts(a)
      setLogs(l)
    } catch (err) {
      console.error('Refresh error:', err)
    }
  }

  useEffect(() => {
    refresh()
    const unsub = subscribeToTeams(refresh)
    return () => unsub()
  }, [])

  const onImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setStatus('Parsing file...')
    try {
      const parsed = await parseTeamFile(file)
      setStatus(`Importing ${parsed.length} teams...`)
      await upsertTeams(parsed)
      setStatus(`✓ Successfully imported ${parsed.length} teams`)
      refresh()
    } catch (err) {
      setStatus(`Import failed: ${err.message}`)
    } finally {
      setImporting(false)
    }
  }

  const handleApprove = async (id) => {
    try {
      await approveAccount(id)
      setStatus('Account approved')
      refresh()
    } catch (err) {
      setStatus(`Error: ${err.message}`)
    }
  }

  const handleReject = async (id) => {
    try {
      await rejectAccount(id)
      setStatus('Account rejected')
      refresh()
    } catch (err) {
      setStatus(`Error: ${err.message}`)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this user permanently?')) return
    try {
      await deleteAccount(id)
      setStatus('Account deleted')
      refresh()
    } catch (err) {
      setStatus(`Error: ${err.message}`)
    }
  }

  const activeOut = teams.filter(t => t.active_out)

  return (
    <div className="login-page">
      <div className="login-bg-orb login-bg-orb-1" />
      <div className="login-bg-orb login-bg-orb-2" />
      <div className="login-bg-grid" />

      <main className="layout admin-layout" style={{ position: 'relative', zIndex: 1, maxWidth: '1400px' }}>
        <header className="topbar" style={{ padding: '24px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div className="login-feature-icon" style={{ width: '48px', height: '48px', fontSize: '1.4rem', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>⚡</div>
            <h1 style={{ color: '#fff', fontSize: '1.8rem', margin: 0 }}>Command <span>Center</span></h1>
          </div>
          <div className="topbar-actions" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <OnlineIndicator />
            <button onClick={logout} className="login-tab active" style={{ borderRadius: '12px', padding: '10px 24px', fontSize: '0.9rem' }}>Sign Out</button>
          </div>
        </header>

        <nav className="tab-nav" style={{ 
          background: 'rgba(255,255,255,0.04)', 
          padding: '8px', 
          borderRadius: '20px', 
          border: '1px solid rgba(255,255,255,0.08)', 
          marginBottom: '40px', 
          display: 'flex', 
          gap: '8px',
          overflowX: 'auto' 
        }}>
          {['dashboard', 'teams', 'judge', 'settings', 'accounts'].map(tab => (
            <button 
              key={tab}
              className={activeTab === tab ? 'login-tab active' : 'login-tab'} 
              style={{ flex: 1, textTransform: 'capitalize', padding: '12px 20px', fontSize: '0.95rem' }}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>

        {status && (
          <div className="login-feature-card" style={{ 
            marginBottom: '32px', 
            padding: '16px 24px', 
            background: 'rgba(59, 130, 246, 0.12)', 
            borderColor: 'rgba(59, 130, 246, 0.25)', 
            color: '#60a5fa',
            borderRadius: '16px',
            fontWeight: 600
          }}>
            {status}
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="stack" style={{ gap: '32px' }}>
             <section className="dashboard-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
              <div className="login-feature-card" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '24px' }}>
                <span className="summary-label" style={{ color: 'rgba(255,255,255,0.6)' }}>Total Teams</span>
                <h2 style={{ fontSize: '2.4rem', color: '#fff', margin: '8px 0', fontWeight: 800 }}>{teams.length}</h2>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>Active in database</p>
              </div>
              <div className="login-feature-card" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '24px' }}>
                <span className="summary-label" style={{ color: 'rgba(255,255,255,0.6)' }}>Teams Out</span>
                <h2 style={{ fontSize: '2.4rem', color: '#fbbf24', margin: '8px 0', fontWeight: 800 }}>{activeOut.length}</h2>
                <p style={{ color: 'rgba(251, 191, 36, 0.5)', fontSize: '0.85rem' }}>Currently outside venue</p>
              </div>
              <div className="login-feature-card" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '24px' }}>
                <span className="summary-label" style={{ color: 'rgba(255,255,255,0.6)' }}>EVALUATIONS</span>
                <h2 style={{ fontSize: '2.4rem', color: '#34d399', margin: '8px 0', fontWeight: 800 }}>{teacherScores.length}</h2>
                <p style={{ color: 'rgba(52, 211, 153, 0.5)', fontSize: '0.85rem' }}>Completed by panel</p>
              </div>
            </section>

             <div className="grid two-col" style={{ gap: '32px', gridTemplateColumns: '1.2fr 0.8fr' }}>
              <div className="login-auth-panel" style={{ background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: '32px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', alignItems: 'center' }}>
                  <h2 style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 700 }}>Penalty Leaderboard</h2>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>Top 15 Teams</p>
                </div>
                <div className="sheet-wrap" style={{ maxHeight: '450px', borderRadius: '18px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <table className="sheet-table">
                    <thead>
                      <tr>
                        <th style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', padding: '16px' }}>Team Name</th>
                        <th style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', textAlign: 'right', padding: '16px' }}>Penalty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teams.sort((a, b) => (b.penalty_points || 0) - (a.penalty_points || 0)).slice(0, 15).map((s) => (
                        <tr key={s.team_id} className="sheet-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '16px', color: '#fff' }}>
                            <strong style={{ display: 'block', fontSize: '1rem' }}>{s.team_name}</strong> 
                            <span style={{ color: '#60a5fa', fontSize: '0.8rem' }}>{s.team_id}</span>
                          </td>
                          <td style={{ padding: '16px', color: '#ef4444', textAlign: 'right', fontWeight: 800, fontSize: '1.1rem' }}>{s.penalty_points || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="login-auth-panel" style={{ background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: '32px' }}>
                <h2 style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 700, marginBottom: '24px' }}>Current Breaks</h2>
                <div className="sheet-wrap" style={{ maxHeight: '450px', borderRadius: '18px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <table className="sheet-table">
                    <thead>
                      <tr>
                        <th style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', padding: '16px' }}>Team</th>
                        <th style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', padding: '16px' }}>Timer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeOut.map((t) => (
                        <tr key={t.team_id} className="sheet-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '16px', color: '#fff' }}><strong>{t.team_name}</strong></td>
                          <td style={{ padding: '16px' }}><TeamTimer outAt={t.active_out?.out_at} maxBreak={rules.max_break_time} grace={rules.grace_time} /></td>
                        </tr>
                      ))}
                      {activeOut.length === 0 && <tr><td colSpan="2" style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.2)' }}>Everyone is in venue</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'teams' && (
          <div className="grid two-col" style={{ gap: '32px', gridTemplateColumns: '1fr 1.5fr' }}>
            <div className="login-auth-panel" style={{ background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: '32px' }}>
              <h2 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 700, marginBottom: '24px' }}>Import Teams</h2>
              <div className="login-field">
                <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginBottom: '12px' }}>Bulk Team Upload</label>
                <div className="login-input-wrap" style={{ padding: '8px 16px' }}>
                  <input type="file" onChange={onImport} accept=".csv,.xlsx,.xls" disabled={importing} style={{ cursor: 'pointer' }} />
                </div>
              </div>
              <div style={{ marginTop: '24px' }}>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>Required Columns:</p>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '12px', marginTop: '8px', fontFamily: 'monospace', color: '#93c5fd', fontSize: '0.8rem' }}>
                  team_id, team_name, room_number, emails
                </div>
                <button className="login-submit" style={{ marginTop: '32px', width: '100%' }} onClick={() => refresh()}>Force Sync Display</button>
              </div>
            </div>

            <div className="login-auth-panel" style={{ background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: '32px' }}>
              <h2 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 700, marginBottom: '24px' }}>Master Team List ({teams.length})</h2>
              <div className="sheet-wrap" style={{ maxHeight: '650px', borderRadius: '20px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <table className="sheet-table">
                  <thead>
                    <tr>
                      <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', padding: '16px' }}>ID</th>
                      <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', padding: '16px' }}>Team Entity</th>
                      <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', padding: '16px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map((t) => (
                      <tr key={t.team_id} className="sheet-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '16px', color: '#60a5fa', fontWeight: 800 }}>{t.team_id}</td>
                        <td style={{ padding: '16px', color: '#fff' }}><strong>{t.team_name}</strong></td>
                        <td style={{ padding: '16px' }}>
                           <span style={{ 
                             padding: '4px 10px', 
                             borderRadius: '8px', 
                             fontSize: '0.75rem', 
                             background: t.active_out ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                             color: t.active_out ? '#ef4444' : '#10b981',
                             fontWeight: 700
                           }}>
                             {t.active_out ? 'ON BREAK' : 'IN VENUE'}
                           </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'judge' && (
          <div className="login-auth-panel" style={{ background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: '36px' }}>
            <h2 style={{ color: '#fff', fontSize: '1.6rem', fontWeight: 700, marginBottom: '32px' }}>Panel Evaluations ({teacherScores.length})</h2>
            <div className="sheet-wrap" style={{ borderRadius: '20px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', padding: '18px' }}>Team</th>
                    <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', padding: '18px' }}>Evaluator</th>
                    <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', textAlign: 'right', padding: '18px' }}>Total Score</th>
                    <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', padding: '18px' }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {teacherScores.map((s) => (
                    <tr key={s.id} className="sheet-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '18px', color: '#fff' }}><strong>{s.team?.team_name}</strong> <span style={{ color: '#60a5fa', fontSize: '0.8rem' }}>{s.team_id}</span></td>
                      <td style={{ padding: '18px', color: 'rgba(255,255,255,0.8)' }}>{s.teacher_name}</td>
                      <td style={{ padding: '18px', color: '#34d399', textAlign: 'right', fontWeight: 800, fontSize: '1.10rem' }}>{s.total_score}</td>
                      <td style={{ padding: '18px', color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>{s.remarks || '-'}</td>
                    </tr>
                  ))}
                  {teacherScores.length === 0 && (
                    <tr><td colSpan="4" style={{ textAlign: 'center', padding: '60px', color: 'rgba(255,255,255,0.2)' }}>No evaluations submitted yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'accounts' && (
          <div className="login-auth-panel" style={{ background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: '36px' }}>
            <h2 style={{ color: '#fff', fontSize: '1.6rem', fontWeight: 700, marginBottom: '32px' }}>User Ecosystem ({accounts.length})</h2>
            <div className="sheet-wrap" style={{ borderRadius: '20px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', padding: '18px' }}>User / Designation</th>
                    <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', padding: '18px' }}>Status</th>
                    <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', textAlign: 'right', padding: '18px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((acc) => (
                    <tr key={acc.id} className="sheet-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '18px' }}>
                        <strong style={{ color: '#fff', display: 'block' }}>{acc.full_name}</strong>
                        <span style={{ color: '#60a5fa', fontSize: '0.8rem', fontWeight: 700 }}>{acc.role}</span>
                      </td>
                      <td style={{ padding: '18px' }}>
                        <span style={{ 
                          padding: '4px 10px', 
                          borderRadius: '8px', 
                          fontSize: '0.75rem', 
                          background: acc.is_approved ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                          color: acc.is_approved ? '#10b981' : '#f87171',
                          fontWeight: 700
                        }}>
                          {acc.is_approved ? 'ACTIVE' : 'PENDING'}
                        </span>
                      </td>
                      <td style={{ padding: '18px', textAlign: 'right' }}>
                        {!acc.is_approved && (
                          <button onClick={() => handleApprove(acc.id)} className="login-tab active" style={{ padding: '6px 14px', fontSize: '0.8rem', marginRight: '8px' }}>Approve</button>
                        )}
                        <button onClick={() => handleDelete(acc.id)} className="login-tab" style={{ padding: '6px 14px', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171' }}>Revoke</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '32px' }}>
            <div className="login-auth-panel" style={{ background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: '36px' }}>
              <h2 style={{ color: '#fff', fontSize: '1.6rem', fontWeight: 700, marginBottom: '32px' }}>Event Protocols</h2>
              <div className="stack" style={{ gap: '28px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div className="login-field">
                    <label style={{ color: '#fff', marginBottom: '8px' }}>Max Break Time (Minutes)</label>
                    <div className="login-input-wrap">
                      <input type="number" value={rules.max_break_time} onChange={(e) => setRules({...rules, max_break_time: Number(e.target.value)})} />
                    </div>
                  </div>
                  <div className="login-field">
                    <label style={{ color: '#fff', marginBottom: '8px' }}>Grace Period (Minutes)</label>
                    <div className="login-input-wrap">
                      <input type="number" value={rules.grace_time} onChange={(e) => setRules({...rules, grace_time: Number(e.target.value)})} />
                    </div>
                  </div>
                </div>

                <div className="login-field">
                  <label style={{ color: '#fff', marginBottom: '8px' }}>Penalty per 5 mins (Marks)</label>
                  <div className="login-input-wrap">
                     <span className="login-input-icon">⚠️</span>
                     <input type="number" value={rules.penalty_per_unit || 0} onChange={(e) => setRules({...rules, penalty_per_unit: Number(e.target.value)})} />
                  </div>
                </div>

                <div style={{ padding: '20px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.1)' }}>
                   <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
                     <strong>Logic:</strong> Teams will be penalized {rules.penalty_per_unit} marks for every 5-minute block they exceed beyond the {rules.max_break_time} min limit.
                   </p>
                </div>

                <button 
                  onClick={() => updateRules({...rules, is_active: true}).then(() => { setStatus('Protocol updated and activated'); refresh() })}
                  className="login-submit" 
                  style={{ width: '100%', marginTop: '16px' }}
                >
                  Save & Deploy Protocol
                </button>
              </div>
            </div>

            <div className="login-auth-panel" style={{ background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: '36px' }}>
              <h2 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 700, marginBottom: '24px' }}>Managed Protocols</h2>
              <div className="sheet-wrap" style={{ borderRadius: '20px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <table className="sheet-table">
                  <thead>
                    <tr>
                      <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', padding: '16px' }}>Configuration</th>
                      <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', padding: '16px' }}>Status</th>
                      <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', textAlign: 'right', padding: '16px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="sheet-row">
                      <td style={{ padding: '16px' }}>
                        <strong style={{ color: '#fff', display: 'block' }}>Hackathon Standard</strong>
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>{rules.max_break_time}m limit · {rules.penalty_per_unit}pts / 5m</span>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span style={{ 
                          padding: '4px 10px', 
                          borderRadius: '8px', 
                          fontSize: '0.75rem', 
                          background: rules.is_active ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255,255,255,0.05)',
                          color: rules.is_active ? '#10b981' : 'rgba(255,255,255,0.4)',
                          fontWeight: 700 
                        }}>
                          {rules.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right' }}>
                        <button 
                          onClick={() => updateRules({...rules, is_active: !rules.is_active}).then(() => { setStatus(rules.is_active ? 'Protocol Deactivated' : 'Protocol Activated'); refresh() })}
                          className="login-tab" 
                          style={{ padding: '6px 14px', fontSize: '0.8rem', background: rules.is_active ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)', color: rules.is_active ? '#f87171' : '#60a5fa' }}
                        >
                          {rules.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="login-auth-panel" style={{ background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: '36px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', alignItems: 'center' }}>
                <h2 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 700 }}>Activity Streams (Logs)</h2>
                <button onClick={() => refresh()} className="login-tab active" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>Refresh Logs</button>
              </div>
              <div className="sheet-wrap" style={{ maxHeight: '400px', borderRadius: '20px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <table className="sheet-table" style={{ fontSize: '0.9rem' }}>
                  <thead>
                    <tr>
                      <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', padding: '14px' }}>Event</th>
                      <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', padding: '14px' }}>Details</th>
                      <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', textAlign: 'right', padding: '14px' }}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log, i) => (
                      <tr key={i} className="sheet-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '14px' }}>
                          <span style={{ 
                            textTransform: 'uppercase', 
                            fontSize: '0.65rem', 
                            color: '#60a5fa', 
                            fontWeight: 800, 
                            padding: '2px 6px', 
                            border: '1px solid rgba(96, 165, 250, 0.3)', 
                            borderRadius: '4px' 
                          }}>{log.type}</span>
                        </td>
                        <td style={{ padding: '14px', color: 'rgba(255,255,255,0.8)' }}>
                           {log.type === 'scan' && `Scan ${log.action} for Team ${log.team_id}`}
                           {log.type === 'penalty' && `Manual adjustment for Team ${log.team_id}: ${log.delta}pts`}
                           {log.type === 'score' && `Evaluation score submitted: ${log.total}pts`}
                           {log.type === 'break' && `Break duration: ${log.duration_min}m`}
                        </td>
                        <td style={{ padding: '14px', color: 'rgba(255,255,255,0.4)', textAlign: 'right', fontSize: '0.8rem' }}>
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                    {logs.length === 0 && (
                      <tr><td colSpan="3" style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.2)' }}>No activity recorded yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
