import { useEffect, useMemo, useState } from 'react'
import OnlineIndicator from '../components/OnlineIndicator'
import { useAuth } from '../context/AuthContext'
import { TEACHER_CRITERIA, TEACHER_CRITERIA_TOTAL } from '../constants/teacherCriteria'
import { getTeams, saveTeacherScore, subscribeToTeams, verifyScanToken, getRules } from '../services/teamService'
import QrScanner from '../components/QrScanner'

const STORAGE_KEY = 'ticketscan-teacher-scores'

function clampScore(value, max) {
  const numeric = Number(value)
  if (Number.isNaN(numeric)) return 0
  return Math.max(0, Math.min(max, numeric))
}

function buildEmptyScores() {
  return TEACHER_CRITERIA.reduce((acc, item) => {
    acc[item.key] = 0
    return acc
  }, {})
}

function loadSavedScores() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveScores(payload) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore storage failures.
  }
}

export default function TeacherPage() {
  const { profile, logout } = useAuth()
  const [teams, setTeams] = useState([])
  const [team, setTeam] = useState({ team_id: '-', team_name: 'No team selected', room_number: '-' })
  const [scoreByCriterion, setScoreByCriterion] = useState(buildEmptyScores())
  const [remarks, setRemarks] = useState('')
  const [status, setStatus] = useState('Ready to score')
  const [savedScores, setSavedScores] = useState(() => loadSavedScores())
  const [loading, setLoading] = useState(true)
  const [rules, setRules] = useState({ jury_mode: 'manual' })
  const [processing, setProcessing] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [pendingTeam, setPendingTeam] = useState(null)
  const [isConfirmed, setIsConfirmed] = useState(false)

  const refreshTeams = async () => {
    try {
      const [items, sets] = await Promise.all([getTeams(), getRules()])
      if (items && items.length > 0) {
        setTeams(items)
        setTeam((prev) => items.find((item) => item.team_id === prev.team_id) || items[0])
      }
      if (sets) setRules(sets)
      setStatus('Ready to score')
    } catch (err) {
      setStatus(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDecoded = async (token) => {
    setProcessing(true)
    setStatus('⌛ Scanning team...')
    try {
      const found = await verifyScanToken(token)
      if ('vibrate' in navigator) navigator.vibrate(100)
      
      // Open confirmation modal instead of loading directly
      setPendingTeam(found)
      setIsConfirmed(false)
      setStatus(`✅ Team ${found.team_id} found. Confirm to evaluate.`)
      setScanOpen(false)
    } catch (err) {
      setStatus(`❌ Scan Error: ${err.message}`)
    } finally {
      setProcessing(false)
    }
  }

  const handleManualSelect = (t) => {
    if ('vibrate' in navigator) navigator.vibrate(50)
    setPendingTeam(t)
    setIsConfirmed(false)
  }

  const confirmEvaluation = () => {
    if (!pendingTeam || !isConfirmed) return
    if ('vibrate' in navigator) navigator.vibrate([50, 50])
    setTeam(pendingTeam)
    setPendingTeam(null)
    setIsConfirmed(false)
    setStatus(`Ready to evalutate ${pendingTeam.team_name}`)
  }

  useEffect(() => {
    refreshTeams()
    const unsubscribe = subscribeToTeams((updatedTeams) => {
      setTeams(updatedTeams)
      setTeam((prev) => updatedTeams.find((item) => item.team_id === prev.team_id) || updatedTeams[0])
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const current = savedScores[team.team_id]
    if (current) {
      setScoreByCriterion(current.scoreByCriterion)
      setRemarks(current.remarks || '')
      return
    }
    setScoreByCriterion(buildEmptyScores())
    setRemarks('')
  }, [team.team_id, savedScores])

  const total = useMemo(
    () =>
      TEACHER_CRITERIA.reduce((sum, item) => sum + clampScore(scoreByCriterion[item.key], item.max), 0),
    [scoreByCriterion],
  )

  const completion = Math.round((total / TEACHER_CRITERIA_TOTAL) * 100)

  const updateScore = (key, max, value) => {
    setScoreByCriterion((prev) => ({ ...prev, [key]: clampScore(value, max) }))
  }

  const saveScore = async () => {
    try {
      const teacherName = profile?.full_name || profile?.email || 'Teacher'
      await saveTeacherScore(team.team_id, scoreByCriterion, remarks, teacherName, profile?.id)

      const payload = {
        team,
        scoreByCriterion,
        remarks,
        total,
        updatedAt: new Date().toISOString(),
        teacher: teacherName,
      }

      const next = { ...savedScores, [team.team_id]: payload }
      setSavedScores(next)
      saveScores(next)
      if ('vibrate' in navigator) navigator.vibrate([100, 50, 100])
      setStatus(`✓ Successfully saved evaluation for ${team.team_name}`)
    } catch (err) {
      setStatus(`Error: ${err.message}`)
    }
  }

  const scoredCount = Object.keys(savedScores).length
  const currentSaved = savedScores[team.team_id]

  return (
    <div className="login-page">
      <div className="login-bg-orb login-bg-orb-1" />
      <div className="login-bg-orb login-bg-orb-2" />
      <div className="login-bg-grid" />

      <main className="layout teacher-layout" style={{ position: 'relative', zIndex: 1, maxWidth: '1300px' }}>
        <header className="teacher-hero" style={{ background: profile?.role === 'jury' ? 'rgba(251, 191, 36, 0.15)' : 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(32px)', border: `1px solid ${profile?.role === 'jury' ? 'rgba(251, 191, 36, 0.3)' : 'rgba(255,255,255,0.08)'}`, borderRadius: '32px', overflow: 'hidden', padding: '32px' }}>
          <div className="teacher-hero-copy">
            <p className="login-hero-badge" style={{ background: profile?.role === 'jury' ? 'rgba(251, 191, 36, 0.2)' : 'rgba(139, 92, 246, 0.2)', color: profile?.role === 'jury' ? '#fbbf24' : '#a78bfa' }}>
              {profile?.role === 'jury' ? 'VIP JURY ACCESS' : 'EXPERT PANEL ACCESS'}
            </p>
            <h1 className="login-hero-title" style={{ fontSize: '3rem' }}> 
              {profile?.role === 'jury' ? 'Grand ' : ''}Judging <span>Portal</span>
            </h1>
            <p className="hero-text" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem', marginTop: '12px' }}>
              {profile?.role === 'jury' ? 'Perform high-level evaluation as a Grand Jury member.' : 'Complete evaluations for each team. Changes reflect on global scoreboard.'}
            </p>
            <div className="hero-chips" style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
              <span className="login-tab active" style={{ padding: '8px 16px', borderRadius: '12px', fontSize: '0.9rem' }}>{scoredCount} Scored</span>
              <span className="login-tab active" style={{ padding: '8px 16px', borderRadius: '12px', fontSize: '0.9rem', background: 'rgba(52, 211, 153, 0.12)', color: '#34d399' }}>Live Session</span>
            </div>
          </div>

          <div className="teacher-hero-side" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
            <div className="score-ring" style={{ '--score': completion, background: 'rgba(255,255,255,0.05)', boxShadow: '0 0 40px rgba(59,130,246,0.15)' }}>
              <div style={{ background: 'rgba(30, 41, 59, 0.4)', backdropFilter: 'blur(10px)' }}>
                <strong style={{ color: '#fff', fontSize: '2.8rem', fontWeight: 700 }}>{total}</strong>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '1rem', fontWeight: 500 }}>/ {TEACHER_CRITERIA_TOTAL}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <OnlineIndicator />
              <button onClick={logout} className="login-tab" style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', padding: '8px 20px', borderRadius: '10px' }}>Sign Out</button>
            </div>
          </div>
        </header>

        <section className="teacher-summary-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginTop: '24px' }}>
          <article className="login-feature-card" style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(99, 102, 241, 0.25))', border: '1px solid rgba(59, 130, 246, 0.4)', minHeight: '120px', padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '8px' }}>CURRENT TEAM</span>
              <strong style={{ color: '#fff', fontSize: '1.4rem', display: 'block', textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>{team.team_name}</strong>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', marginTop: '4px' }}>{team.team_id} · Room {team.room_number || '-'}</span>
            </div>
          </article>
          
          <article className="login-feature-card" style={{ minHeight: '120px', padding: '20px', background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '8px' }}>SAVED DRAFT</span>
              <strong style={{ color: '#fff', fontSize: '1.2rem', display: 'block' }}>{currentSaved ? `${currentSaved.total} / ${TEACHER_CRITERIA_TOTAL}` : 'No Record'}</strong>
              <span style={{ color: '#60a5fa', fontSize: '0.85rem', marginTop: '4px', fontWeight: 600 }}>{currentSaved ? `Updated: ${new Date(currentSaved.updatedAt).toLocaleTimeString()}` : 'Not yet saved'}</span>
            </div>
          </article>

          <article className="login-feature-card" style={{ minHeight: '120px', padding: '20px', background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '8px' }}>SYSTEM STATUS</span>
              <strong style={{ color: '#60a5fa', fontSize: '1.2rem', display: 'block' }}>{status}</strong>
              <span style={{ color: 'rgba(52, 211, 153, 0.7)', fontSize: '0.85rem', marginTop: '4px', fontWeight: 600 }}>Live Sync Active</span>
            </div>
          </article>
        </section>

        <section className="teacher-workspace" style={{ gridTemplateColumns: '0.9fr 1.6fr', gap: '32px', marginTop: '32px' }}>
          <aside className="login-auth-panel" style={{ background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: '28px' }}>
            <div className="panel-header" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <h2 style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 700 }}>Team Explorer</h2>
               <div style={{ display: 'flex', gap: '8px' }}>
                 <button 
                   onClick={() => setScanOpen(!scanOpen)} 
                   className="login-tab active" 
                   style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '10px', background: scanOpen ? '#f87171' : '#6366f1' }}
                 >
                   {scanOpen ? 'Close Scan' : '📷 QR Scan'}
                 </button>
                 <button onClick={refreshTeams} disabled={loading} className="login-tab active" style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '10px' }}>
                   {loading ? '...' : 'Refresh'}
                 </button>
               </div>
            </div>

            {scanOpen && (
              <div style={{ marginBottom: '24px', background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
                 <QrScanner onDecoded={handleDecoded} />
                 {processing && <p style={{ color: '#818cf8', fontSize: '0.8rem', textAlign: 'center', marginTop: '10px' }}>Analyzing scan...</p>}
              </div>
            )}

            {rules.jury_mode === 'manual' ? (
              <div className="sheet-wrap" style={{ maxHeight: '600px', borderRadius: '20px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', overflowY: 'auto' }}>
                <table className="sheet-table">
                  <thead>
                    <tr>
                      <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', width: '70px', padding: '15px' }}>ID</th>
                      <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', padding: '15px' }}>Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map((t) => {
                      const active = t.team_id === team.team_id
                      const isPending = t.team_id === pendingTeam?.team_id
                      return (
                        <tr 
                          key={t.team_id} 
                          className={`sheet-row ${active ? 'active' : ''} ${isPending ? 'pending' : ''}`} 
                          onClick={() => handleManualSelect(t)} 
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}
                        >
                          <td style={{ padding: '15px', color: active ? '#fff' : 'rgba(255,255,255,0.5)', fontWeight: (active || isPending) ? 700 : 400 }}>{t.team_id}</td>
                          <td style={{ padding: '15px', color: active ? '#60a5fa' : isPending ? '#fbbf24' : 'rgba(255,255,255,0.9)', fontWeight: (active || isPending) ? 700 : 400 }}>{t.team_name}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '16px' }}>
                  <QrScanner onDecoded={handleDecoded} />
                  {processing && <p style={{ color: '#818cf8', marginTop: '10px' }}>Analyzing Scan...</p>}
                </div>
                <div className="login-feature-card" style={{ padding: '16px', background: 'rgba(99, 102, 241, 0.1)' }}>
                   <div style={{ textAlign: 'center', width: '100%' }}>
                     <p className="muted" style={{ margin: '0 0 4px 0', fontSize: '0.8rem' }}>Current Team Selection</p>
                     <strong style={{ color: '#fff', fontSize: '1.1rem' }}>{team.team_name}</strong>
                   </div>
                </div>
              </div>
            )}
            
            <div style={{ marginTop: '32px', textAlign: 'center' }}>
               <div className="score-meter-track" style={{ background: 'rgba(255,255,255,0.06)', height: '12px', width: '100%' }}>
                 <div className="score-meter-fill" style={{ width: `${completion}%`, background: 'linear-gradient(90deg, #60a5fa, #a78bfa)', boxShadow: '0 0 15px rgba(96, 165, 250, 0.4)' }} />
               </div>
               <p style={{ marginTop: '16px', color: '#fff', fontSize: '1.2rem', fontWeight: 800 }}>{total} <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '1rem', fontWeight: 500 }}>/ {TEACHER_CRITERIA_TOTAL}</span></p>
            </div>
          </aside>

          <section className="login-auth-panel" style={{ background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: '36px' }}>
            <div style={{ marginBottom: '32px' }}>
              <h2 style={{ color: '#fff', fontSize: '1.6rem', fontWeight: 700 }}>Scoring Rubric</h2>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', marginTop: '6px' }}>Evaluate the team based on the criteria below. Use the sliders or type in the scores manually.</p>
            </div>
            
            <div className="criteria-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              {TEACHER_CRITERIA.map((crit) => {
                const val = scoreByCriterion[crit.key]
                const fillPercent = Math.round((val / crit.max) * 100)

                return (
                  <article key={crit.key} className="criterion-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '20px', transition: 'all 0.3s ease' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                      <div style={{ maxWidth: '70%' }}>
                        <h3 style={{ color: '#fff', fontSize: '1rem', fontWeight: 600, margin: 0 }}>{crit.label}</h3>
                        <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>Maximum possible: {crit.max}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                         <input 
                           type="number" 
                           value={val}
                           min="0"
                           max={crit.max}
                           onChange={(e) => updateScore(crit.key, crit.max, e.target.value)}
                           style={{ background: 'rgba(96, 165, 250, 0.1)', border: '1px solid rgba(96, 165, 250, 0.3)', color: '#60a5fa', width: '55px', padding: '6px 8px', borderRadius: '10px', fontSize: '1rem', fontWeight: 700, textAlign: 'center', outline: 'none' }}
                         />
                         <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem' }}>/ {crit.max}</span>
                      </div>
                    </div>

                    <div className="score-meter-track slim" style={{ background: 'rgba(255,255,255,0.05)', marginBottom: '18px', height: '6px' }}>
                      <div className="score-meter-fill" style={{ width: `${fillPercent}%`, background: 'linear-gradient(90deg, #60a5fa, #a78bfa)' }} />
                    </div>

                    <input 
                      type="range"
                      min="0"
                      max={crit.max}
                      value={val}
                      onChange={(e) => updateScore(crit.key, crit.max, e.target.value)}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                  </article>
                )
              })}
            </div>

            <div style={{ marginTop: '40px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '32px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ color: '#fff', fontSize: '1rem', fontWeight: 600, display: 'block' }}>Teacher Feedback / Remarks</label>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', marginTop: '4px' }}>Provide constructive criticism or highlight key strengths.</p>
              </div>
              <textarea 
                rows="4"
                placeholder="Technical execution, UI/UX quality, or innovative features..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '16px', padding: '16px', color: '#fff', fontSize: '1rem', outline: 'none', transition: 'all 0.3s ease' }}
              />
              <div style={{ display: 'flex', gap: '20px', marginTop: '32px' }}>
                <button onClick={saveScore} className="login-submit" style={{ flex: 2, padding: '16px' }}>Submit Evaluation</button>
                <button onClick={() => { setScoreByCriterion(buildEmptyScores()); setRemarks('') }} className="login-tab" style={{ flex: 1, background: 'rgba(255, 255, 255, 0.04)', color: '#fff' }}>Clear Draft</button>
              </div>
            </div>
          </section>
        </section>

        {/* Confirmation Modal */}
        {pendingTeam && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.8)', padding: '20px' }}>
            <div className="login-auth-panel" style={{ width: 'min(500px, 100%)', padding: '32px', background: 'rgba(20, 24, 40, 0.95)', border: '1px solid rgba(251, 191, 36, 0.5)', boxShadow: '0 0 60px rgba(0,0,0,0.5)' }}>
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div style={{ margin: '0 auto 16px', width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24', display: 'grid', placeItems: 'center', fontSize: '1.8rem' }}>👤</div>
                <h2 style={{ color: '#fff', fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>Confirm Team Evaluation</h2>
                <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: '8px' }}>Please verify that you are evaluating the correct team.</p>
              </div>

              <div style={{ background: 'rgba(251, 191, 36, 0.05)', border: '1px solid rgba(251, 191, 36, 0.2)', padding: '20px', borderRadius: '20px', marginBottom: '24px' }}>
                <p style={{ fontSize: '0.8rem', color: '#fbbf24', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em', marginBottom: '8px' }}>Target Team</p>
                <h3 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700, margin: '0 0 4px 0' }}>{pendingTeam.team_name}</h3>
                <p style={{ color: 'rgba(255,255,255,0.4)', margin: 0 }}>Team ID: {pendingTeam.team_id} | Room: {pendingTeam.room_number || '-'}</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: `1px solid ${isConfirmed ? '#34d399' : 'rgba(255,255,255,0.1)'}`, cursor: 'pointer', transition: '0.3s' }} onClick={() => setIsConfirmed(!isConfirmed)}>
                <div style={{ width: '24px', height: '24px', borderRadius: '6px', border: '2px solid #fbbf24', background: isConfirmed ? '#fbbf24' : 'transparent', display: 'grid', placeItems: 'center', color: '#13111c', fontWeight: 900 }}>
                  {isConfirmed && '✓'}
                </div>
                <span style={{ color: isConfirmed ? '#fff' : 'rgba(255,255,255,0.7)', fontWeight: 600, fontSize: '1rem' }}>I confirm I am scoring Team {pendingTeam.team_name}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '32px' }}>
                <button onClick={() => setPendingTeam(null)} className="login-tab" style={{ background: 'rgba(255,255,255,0.05)', color: '#fff' }}>Cancel</button>
                <button 
                  disabled={!isConfirmed} 
                  onClick={confirmEvaluation} 
                  className="login-submit" 
                  style={{ opacity: isConfirmed ? 1 : 0.5, background: isConfirmed ? 'linear-gradient(135deg, #fbbf24, #d97706)' : 'rgba(59,130,246,0.1)' }}
                >
                  Confirm & Evaluate
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}