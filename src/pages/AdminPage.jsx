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
  sendQrEmails,
  sendAbsentAlert,
  getActivityLog,
  generateTeamQrToken,
  deleteTeamsBySource,
  verifyScanToken,
  subscribeToRules
} from '../services/teamService'
import { parseTeamFile, parseRecipientFile } from '../services/csvService'
import { sendCustomEmail } from '../services/supabaseFunctions'
import { supabase } from '../config/supabase'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { getPendingAccounts, getAllAccounts, approveAccount, rejectAccount, deleteAccount } from '../services/accountService'
import TeamTimer from '../components/TeamTimer'
import QrScanner from '../components/QrScanner'

export default function AdminPage() {
  const { profile, logout } = useAuth()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [teams, setTeams] = useState([])
  const [teacherScores, setTeacherScores] = useState([])
  const [rules, setRules] = useState({ 
    max_break_time: 15, 
    grace_time: 5, 
    penalty_per_unit: 10,
    is_active: true,
    jury_mode: 'manual'
  })
  const [logs, setLogs] = useState([])
  const [accounts, setAccounts] = useState([])
  const [status, setStatus] = useState(null)
  const [importing, setImporting] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  
  // Mailing Center States
  const [recipients, setRecipients] = useState([])
  const [mailSubject, setMailSubject] = useState('')
  const [mailContent, setMailContent] = useState('')
  const [mailSignature, setMailSignature] = useState('Aethera X Organizing Team')
  const [mailFromEmail, setMailFromEmail] = useState('')
  const [mailFromName, setMailFromName] = useState('')
  const [sendingCustom, setSendingCustom] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [scheduledMails, setScheduledMails] = useState([])
  const [teamFilter, setTeamFilter] = useState('')
  
  // Advanced Mailing States
  const [selectedRecipients, setSelectedRecipients] = useState([])
  const [previewIndex, setPreviewIndex] = useState(0)
  const [deliveryStatus, setDeliveryStatus] = useState({}) // { email: { status, error, name } }
  const [showFailedOnly, setShowFailedOnly] = useState(false)

  const refresh = async () => {
    try {
      const [t, s, r, a, l, sch] = await Promise.all([
        getTeams(),
        getTeacherScores(),
        getRules(),
        getAllAccounts(),
        getActivityLog(),
        supabase.from('scheduled_emails').select('*').order('scheduled_at', { ascending: true })
      ])
      setTeams(t)
      setTeacherScores(s)
      if (r) setRules(r)
      setAccounts(a)
      setLogs(l)
      if (sch.data) setScheduledMails(sch.data)
    } catch (err) {
      console.error('Refresh error:', err)
    }
  }

  useEffect(() => {
    refresh()
    const unsub = subscribeToTeams(refresh)
    const unsubRules = subscribeToRules((newRules) => {
      if (newRules) setRules(newRules)
    })

    // Load Draft
    const saved = localStorage.getItem('mail_draft')
    if (saved) {
      const d = JSON.parse(saved)
      setMailSubject(d.subject || '')
      setMailContent(d.content || '')
      setMailSignature(d.signature || 'Aethera X Organizing Team')
      setMailFromName(d.fromName || '')
      setMailFromEmail(d.fromEmail || '')
    }

    return () => {
      unsub()
      unsubRules()
    }
  }, [])

  // Auto-save Draft
  useEffect(() => {
    localStorage.setItem('mail_draft', JSON.stringify({
      subject: mailSubject,
      content: mailContent,
      signature: mailSignature,
      fromName: mailFromName,
      fromEmail: mailFromEmail
    }))
  }, [mailSubject, mailContent, mailSignature, mailFromName, mailFromEmail])

  // Helpers for dynamic mailing
  const getDynamicContent = (text, recipient) => {
    if (!text) return ''
    if (!recipient) return text
    return text
      .replace(/\[Participant Name\]/gi, recipient.name || 'Participant')
      .replace(/\{\{name\}\}/gi, recipient.name || 'Participant')
      .replace(/\[Team Name\]/gi, recipient.team_name || 'Team')
      .replace(/\{\{team\}\}/gi, recipient.team_name || 'Team')
  }

  const onImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setStatus('Parsing file...')
    try {
      const parsed = await parseTeamFile(file)
      // Attach filename as source_file
      const teamsWithSource = parsed.map(t => ({ ...t, source_file: file.name }))
      
      setStatus(`Importing ${parsed.length} teams from ${file.name}...`)
      await upsertTeams(teamsWithSource)
      setStatus(`✓ Successfully imported ${parsed.length} teams from ${file.name}`)
      refresh()
    } catch (err) {
      setStatus(`Import failed: ${err.message}`)
    } finally {
      setImporting(false)
    }
  }

  const onBulkMail = async () => {
    if (!window.confirm(`Send QR emails to all ${teams.length} teams now?`)) return
    
    let success = 0
    let fail = 0
    setStatus(`🚀 Starting bulk mailing for ${teams.length} teams...`)

    for (const t of teams) {
      try {
        if (!t.email_count || t.email_count === 0) {
           throw new Error("No emails linked to this team.")
        }

        if (!t.qr_token) {
          setStatus(`🛠️ Generating missing token for ${t.team_id}...`)
          const res = await generateTeamQrToken(t.team_id)
          t.qr_token = res.token
        }
        
        setStatus(`📧 Sending QR to ${t.team_id} (${t.team_name})...`)
        // Pass origin to fix 404 issues
        const res = await sendQrEmails(t.team_id, window.location.origin)
        
        if (res?.success === false) {
           throw new Error(res.error || 'Server rejected request')
        }

        success++
        setStatus(`✅ Sent ${success}/${teams.length}... (${t.team_id})`)
      } catch (err) {
        console.error(`BulkMail error for ${t.team_id}:`, err)
        fail++
        setStatus(`⚠️ FAILED ${t.team_id}: ${err.message}`)
        await new Promise(r => setTimeout(r, 1000))
      }
    }
    
    setStatus(`🏁 Mailing Finished. Success: ${success}, Failed: ${fail}.`)
    refresh()
  }

  const onAlertAwayTeams = async () => {
    const absent = teams.filter(t => !t.is_present)
    if (absent.length === 0) {
      alert("All teams are already marked as present!")
      return
    }

    const alertable = absent.filter(t => (t.team_emails?.length || 0) > 0)
    const noEmails = absent.length - alertable.length

    if (!window.confirm(`Send "Report to Arena" alert to ${alertable.length} absent teams?${noEmails > 0 ? `\n\nNote: ${noEmails} teams have no emails and will be skipped.` : ''}`)) return
    
    setStatus(`📢 Alerting ${alertable.length} absent teams...`)
    let success = 0
    let fail = 0

    for (const t of alertable) {
      try {
        setStatus(`📬 Alerting ${t.team_name}...`)
        const res = await sendAbsentAlert(t.team_id, window.location.origin)
        if (res?.success) {
          success++
          setStatus(`✅ Sent ${success}/${alertable.length}... (${t.team_id})`)
        } else {
          console.error(`Alert failed for ${t.team_id}:`, res?.error)
          fail++
          setStatus(`⚠️ FAILED ${t.team_id}: ${res?.error || 'Unknown error'}`)
          await new Promise(r => setTimeout(r, 1000))
        }
      } catch (err) {
        console.error(`Alert error for ${t.team_id}:`, err)
        fail++
        setStatus(`❌ ERROR ${t.team_id}: ${err.message}`)
        await new Promise(r => setTimeout(r, 1000))
      }
    }
    setStatus(`✅ Alert Campaign Finished! Sent: ${success}, Failed: ${fail}`)
    if (noEmails > 0) {
      setStatus(prev => prev + ` (${noEmails} skipped - no emails)`)
    }
  }

  const onGenerateAllTokens = async () => {
    if (!window.confirm(`Generate/Repair tokens for all ${teams.length} teams?`)) return
    setStatus(`Generating tokens for ${teams.length} teams...`)
    let success = 0
    let fail = 0
    
    for (const t of teams) {
      try {
        const res = await generateTeamQrToken(t.team_id)
        if (res.token) {
          success++
          setStatus(`Generated: ${success} teams...`)
        }
      } catch (err) {
        fail++
      }
    }
    setStatus(`✅ Token generation complete: ${success} successful, ${fail} failed.`)
    refresh()
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

  const onDeleteBySource = async (sourceFile) => {
    if (!window.confirm(`Delete ALL teams imported from "${sourceFile}"? This cannot be undone.`)) return
    try {
      setStatus(`Deleting teams from source: ${sourceFile}...`)
      await deleteTeamsBySource(sourceFile)
      setStatus(`✓ Deleted all teams from ${sourceFile}`)
      refresh()
    } catch (err) {
      setStatus(`Delete failed: ${err.message}`)
    }
  }

  const onScanFailsafe = async (token) => {
    setProcessing(true)
    setStatus('⌛ Scanning team QR...')
    try {
      const found = await verifyScanToken(token)
      if ('vibrate' in navigator) navigator.vibrate(100)
      setStatus(`✅ Team Found: ${found.team_name} (ID: ${found.team_id}). Search completed.`)
      
      // Auto-filter or highlight logic could go here, but for now just show team info
      window.alert(`Team Found!\nName: ${found.team_name}\nID: ${found.team_id}\nRoom: ${found.room_number}`)
      setScanOpen(false)
    } catch (err) {
      setStatus(`❌ Scan Error: ${err.message}`)
    } finally {
      setProcessing(false)
    }
  }

  const handleRecipientImport = async (e, mode = 'replace') => {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus('Parsing recipient list...')
    try {
      const data = await parseRecipientFile(file)
      if (mode === 'append') {
        const uniqueNewData = data.filter(newItem => !recipients.some(oldItem => oldItem.email === newItem.email))
        setRecipients(prev => [...prev, ...uniqueNewData])
        setStatus(`✓ Appended ${uniqueNewData.length} new recipients.`)
      } else {
        setRecipients(data)
        setStatus(`✓ Loaded ${data.length} recipients.`)
      }
      setSelectedRecipients([]) // Reset selection on major changes
    } catch (err) {
      setStatus(`Import failed: ${err.message}`)
    }
  }

  const handleSendCustomBatch = async (retryFailed = false) => {
    const targetList = retryFailed 
      ? recipients.filter(r => deliveryStatus[r.email]?.status === 'failed')
      : (selectedRecipients.length > 0 
          ? recipients.filter(r => selectedRecipients.includes(r.email)) 
          : recipients)

    if (targetList.length === 0) {
      alert("No recipients to send to.")
      return
    }

    if (!mailSubject.trim() || !mailContent.trim()) {
      alert("Please provide both subject and content.")
      return
    }

    if (scheduledAt) {
      const schDate = new Date(scheduledAt)
      if (schDate < new Date()) {
        alert("Scheduled time must be in the future.")
        return
      }

      if (!window.confirm(`Schedule this email blast for ${targetList.length} recipients at ${schDate.toLocaleString()}?`)) return
      
      setSendingCustom(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase.from('scheduled_emails').insert({
          scheduled_at: scheduledAt,
          subject: mailSubject,
          content: mailContent,
          signature: mailSignature,
          recipients: targetList,
          from_name: mailFromName,
          from_email: mailFromEmail,
          event_logo_url: rules.event_logo_url,
          user_id: user?.id,
          status: 'pending'
        })
        if (error) throw error
        alert("✅ Email blast scheduled successfully!")
        setScheduledAt('')
        refresh()
      } catch (err) {
        alert("Scheduling failed: " + err.message)
      } finally {
        setSendingCustom(false)
      }
      return
    }

    if (!window.confirm(`Send custom email to ${targetList.length} recipients now?`)) return

    setSendingCustom(true)
    let success = 0
    let fail = 0
    const newStatus = { ...deliveryStatus }
    setStatus(`📨 Starting custom batch mailing...`)

    for (let i = 0; i < targetList.length; i++) {
        const r = targetList[i]
        try {
            setStatus(`📫 Sending to ${r.name || r.email} (${i+1}/${targetList.length})...`)
            const res = await sendCustomEmail({
                email: r.email,
                name: r.name,
                subject: getDynamicContent(mailSubject, r),
                content: getDynamicContent(mailContent, r),
                signature: mailSignature,
                fromEmail: mailFromEmail,
                fromName: mailFromName,
                eventLogoUrl: rules.event_logo_url
            })
            
            if (res?.success) {
              success++
              newStatus[r.email] = { status: 'success', name: r.name }
            } else {
              throw new Error(res?.error || "Unknown error")
            }
        } catch (err) {
            fail++
            console.error(`Mailing error for ${r.email}:`, err)
            newStatus[r.email] = { status: 'failed', name: r.name, error: err.message }
        }
        setDeliveryStatus({ ...newStatus }) // Update live
    }

    alert(`Mailing Complete!\n✓ Success: ${success}\n✖ Failed: ${fail}`)
    setSendingCustom(false)
    refresh()
  }

  const deleteScheduledEmail = async (id) => {
    if (!window.confirm("Cancel this scheduled mailing?")) return
    try {
      const { error } = await supabase.from('scheduled_emails').delete().eq('id', id)
      if (error) throw error
      refresh()
    } catch (err) {
      alert(err.message)
    }
  }

  const insertEmoji = (emoji) => {
    setMailContent(prev => prev + emoji)
  }

  const downloadMailingTemplate = () => {
    const template = [
      { name: 'John Doe', email: 'john@gmail.com' },
      { name: 'Jane Smith', email: 'jane@example.com' }
    ]
    const ws = XLSX.utils.json_to_sheet(template)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Template")
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    saveAs(new Blob([wbout], { type: "application/octet-stream" }), "Mailing_Template.xlsx")
  }

  const exportToExcel = () => {
    const data = teams.map(t => ({
      'Team ID': t.team_id,
      'Team Name': t.team_name,
      'Room': t.room_number || 'N/A',
      'Penalty Points': t.penalty_points || 0,
      'Status': t.active_out ? 'ON BREAK' : 'IN VENUE',
      'QR Link': `${window.location.origin}/scan?token=${t.qr_token || 'TOKEN_PENDING'}`
    }))

    const worksheet = XLSX.utils.json_to_sheet(data)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Master Teams')
    
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    const fileData = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' })
    saveAs(fileData, `TicketScan_MasterTeams_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const exportScoresToExcel = () => {
    // Pivot data for export
    const teamMap = new Map()
    teams.forEach(t => teamMap.set(t.team_id, { 
      name: t.team_name, 
      id: t.team_id, 
      penalty: t.penalty_points || 0,
      scores: {} 
    }))

    const juryNames = [...new Set(teacherScores.map(s => s.teacher_name))].sort()
    
    teacherScores.forEach(s => {
      const entry = teamMap.get(s.team_id)
      if (entry) {
        entry.scores[s.teacher_name] = s.total
      }
    })

    const exportData = Array.from(teamMap.values()).map(entry => {
      const row = {
        'Team ID': entry.id,
        'Team Name': entry.name
      }
      
      let sum = 0
      let count = 0
      
      juryNames.forEach(name => {
        const s = entry.scores[name] ?? '-'
        row[`Jury: ${name}`] = s
        if (typeof s === 'number') {
          sum += s
          count++
        }
      })

      row['Avg Score'] = count > 0 ? (sum / count).toFixed(2) : 0
      row['Penalty'] = entry.penalty
      row['Final Score'] = (count > 0 ? (sum / count) : 0) - entry.penalty
      
      return row
    })

    const worksheet = XLSX.utils.json_to_sheet(exportData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Detailed Scores')
    
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    const fileData = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' })
    saveAs(fileData, `TicketScan_DetailedScores_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const activeOut = teams.filter(t => t.active_out)
  const filteredTeams = teams.filter(t => 
    t.team_name.toLowerCase().includes(teamFilter.toLowerCase()) || 
    t.team_id.toLowerCase().includes(teamFilter.toLowerCase())
  )

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
          {['dashboard', 'teams', 'judge', 'settings', 'accounts', 'mailing'].map(tab => (
            <button 
              key={tab}
              className={activeTab === tab ? 'login-tab active' : 'login-tab'} 
              style={{ flex: 1, textTransform: 'capitalize', padding: '12px 20px', fontSize: '0.95rem' }}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'mailing' ? '📧 Mailing' : tab}
            </button>
          ))}
        </nav>

        {status && activeTab !== 'teams' && (
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
             <section className="dashboard-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
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

             <div className="grid two-col" style={{ gap: '32px', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))' }}>
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
          <div className="grid two-col" style={{ gap: '32px', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))' }}>
            <div className="login-auth-panel" style={{ background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: '32px' }}>
              <h2 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 700, marginBottom: '24px' }}>Import Teams</h2>
              <div className="login-field">
                <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginBottom: '12px' }}>Bulk Team Upload</label>
                <div className="login-input-wrap" style={{ padding: '8px 16px' }}>
                  <input type="file" onChange={onImport} accept=".csv,.xlsx,.xls" disabled={importing} style={{ cursor: 'pointer' }} />
                </div>
              </div>
              <div style={{ marginTop: '24px' }}>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>Required Columns (in order):</p>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '12px', marginTop: '8px', fontFamily: 'monospace', color: '#93c5fd', fontSize: '0.8rem' }}>
                  team_id, team_name, members_count, room_number, emails
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button 
                    className="login-tab" 
                    style={{ flex: 1, fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)' }}
                    onClick={() => {
                      const csv = "team_id,team_name,members_count,room_number,emails\nH-101,Example Team,4,Room 101,lead@example.com;member@example.com"
                      const blob = new Blob([csv], { type: 'text/csv' })
                      saveAs(blob, "TicketScan_Template.csv")
                    }}
                  >
                    CSV Template
                  </button>
                  <button 
                    className="login-tab" 
                    style={{ flex: 1, fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)' }}
                    onClick={() => {
                      const data = [{ team_id: 'H-101', team_name: 'Example Team', members_count: 4, room_number: 'Room 101', emails: 'lead@example.com;member@example.com' }]
                      const ws = XLSX.utils.json_to_sheet(data)
                      const wb = XLSX.utils.book_new()
                      XLSX.utils.book_append_sheet(wb, ws, "Teams")
                      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
                      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
                      saveAs(blob, "TicketScan_Template.xlsx")
                    }}
                  >
                    XLSX Template
                  </button>
                </div>
                <button className="login-submit" style={{ marginTop: '16px', background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa', width: '100%' }} onClick={onGenerateAllTokens}>🛠️ Generate/Repair ALL Tokens</button>
                <button className="login-submit" style={{ marginTop: '12px', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', width: '100%' }} onClick={onBulkMail}>📧 Send QRs to ALL Teams</button>
                <button className="login-submit" style={{ marginTop: '12px', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', width: '100%' }} onClick={onAlertAwayTeams}>📢 Alert Absent Teams to Arena</button>
                <button className="login-submit" style={{ marginTop: '16px', width: '100%', background: 'rgba(16, 185, 129, 0.1)' }} onClick={exportToExcel}>📥 Export Master Excel (with QRs)</button>
                <button className="login-submit" style={{ marginTop: '12px', width: '100%' }} onClick={() => refresh()}>Force Sync Display</button>
              </div>
            </div>
            
            <div className="login-auth-panel" style={{ background: 'rgba(15, 18, 30, 0.8)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: '32px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Activity Terminal</h2>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: status ? '#60a5fa' : '#34d399', boxShadow: `0 0 10px ${status ? '#60a5fa' : '#34d399'}` }} />
              </div>
              <div style={{ flex: 1, background: 'rgba(0,0,0,0.4)', borderRadius: '20px', padding: '24px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                {status ? (
                  <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '16px' }}>⚙️</div>
                    <p style={{ color: '#60a5fa', fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.5, maxWidth: '300px' }}>{status}</p>
                    <button className="login-tab" style={{ marginTop: '20px', fontSize: '0.75rem' }} onClick={() => setStatus('')}>Clear Log</button>
                  </div>
                ) : (
                  <div style={{ opacity: 0.3 }}>
                    <div style={{ fontSize: '2rem', marginBottom: '16px' }}>📡</div>
                    <p style={{ color: '#fff', fontSize: '0.9rem' }}>Waiting for system events...</p>
                  </div>
                )}
              </div>
              <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '16px' }}>
                 <div className="login-feature-card" style={{ padding: '16px', flexDirection: 'column', alignItems: 'flex-start' }}>
                   <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Memory usage</span>
                   <strong style={{ color: '#fff' }}>Optimal</strong>
                 </div>
                 <div className="login-feature-card" style={{ padding: '16px', flexDirection: 'column', alignItems: 'flex-start' }}>
                   <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Sync Status</span>
                   <strong style={{ color: '#34d399' }}>Live</strong>
                 </div>
              </div>
            </div>

            <div className="login-auth-panel" style={{ background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: '32px', gridColumn: 'span 2' }}>
               <h2 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 700, marginBottom: '24px' }}>Data Sources Management</h2>
               <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', marginBottom: '20px' }}>List of imported files and their teams</p>
               
               <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                 {[...new Set(teams.map(t => t.source_file || 'Manually Added / Legacy'))].map(source => {
                   const teamCount = teams.filter(t => (t.source_file === source || (!t.source_file && source === 'Manually Added / Legacy'))).length
                   return (
                     <div key={source} className="login-feature-card" style={{ padding: '20px', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)' }}>
                       <div>
                         <strong style={{ display: 'block', color: '#fff' }}>{source}</strong>
                         <span style={{ color: '#60a5fa', fontSize: '0.85rem' }}>{teamCount} Teams</span>
                       </div>
                       {source !== 'Manually Added / Legacy' && (
                         <button 
                           onClick={() => onDeleteBySource(source)}
                           style={{ 
                             background: 'rgba(239, 68, 68, 0.1)', 
                             color: '#f87171', 
                             border: 'none', 
                             padding: '8px 12px', 
                             borderRadius: '8px',
                             cursor: 'pointer',
                             fontSize: '0.8rem',
                             fontWeight: 600
                           }}
                         >
                           🗑️ Erase
                         </button>
                       )}
                     </div>
                   )
                 })}
               </div>
            </div>

            <div className="login-auth-panel" style={{ background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: '32px', gridColumn: 'span 2' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Master Team List ({teams.length})</h2>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <div className="login-input-wrap" style={{ width: '250px', background: 'rgba(0,0,0,0.2)' }}>
                    <span className="login-input-icon">🔍</span>
                    <input 
                      placeholder="Search ID or Name..." 
                      value={teamFilter}
                      onChange={(e) => setTeamFilter(e.target.value)}
                      style={{ background: 'transparent', border: 'none', color: '#fff', padding: '8px' }}
                    />
                  </div>
                  <button 
                    onClick={() => setScanOpen(!scanOpen)} 
                    style={{ background: scanOpen ? 'rgba(239, 68, 68, 0.1)' : 'rgba(99, 102, 241, 0.1)', color: scanOpen ? '#f87171' : '#818cf8', border: 'none', padding: '10px 20px', borderRadius: '12px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    {scanOpen ? 'Close Scanner' : '📷 Scan Failsafe'}
                  </button>
                </div>
              </div>

              {scanOpen && (
                <div style={{ marginBottom: '32px', maxWidth: '400px', margin: '0 auto 32px auto', background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)' }}>
                   <QrScanner onDecoded={onScanFailsafe} />
                   {processing && <p style={{ color: '#818cf8', textAlign: 'center', marginTop: '15px' }}>Processing Scan...</p>}
                </div>
              )}
              <div className="sheet-wrap" style={{ maxHeight: '650px', borderRadius: '20px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <table className="sheet-table">
                  <thead>
                    <tr>
                      <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', padding: '16px' }}>ID</th>
                      <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', padding: '16px' }}>Team Entity</th>
                      <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', padding: '16px' }}>Security</th>
                      <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', padding: '16px' }}>Emails</th>
                      <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', padding: '16px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTeams.map((t) => (
                      <tr key={t.team_id} className="sheet-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '16px', color: '#60a5fa', fontWeight: 800 }}>{t.team_id}</td>
                        <td style={{ padding: '16px', color: '#fff' }}><strong>{t.team_name}</strong></td>
                        <td style={{ padding: '16px' }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {t.qr_token ? (
                              <span title="Token Generated" style={{ color: '#34d399', fontSize: '0.9rem', background: 'rgba(52, 211, 153, 0.1)', padding: '4px 8px', borderRadius: '6px' }}>🔑 SECURE</span>
                            ) : (
                              <span title="No Token" style={{ color: '#f87171', fontSize: '0.9rem', background: 'rgba(248, 113, 113, 0.1)', padding: '4px 8px', borderRadius: '6px' }}>🚫 NO TOKEN</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                             <span style={{ 
                               color: (t.email_count || 0) > 0 ? '#60a5fa' : '#f87171', 
                               fontSize: '0.85rem', 
                               fontWeight: 700,
                               display: 'flex', 
                               alignItems: 'center', 
                               gap: '6px',
                               background: (t.email_count || 0) > 0 ? 'rgba(96, 165, 250, 0.1)' : 'rgba(248, 113, 113, 0.1)',
                               padding: '4px 10px',
                               borderRadius: '8px'
                             }}>
                               📧 {t.email_count || 0} Emails
                             </span>
                          </div>
                        </td>
                        <td style={{ padding: '16px' }}>
                           <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                             <span style={{ 
                               padding: '4px 10px', 
                               borderRadius: '8px', 
                               fontSize: '0.75rem', 
                               background: t.is_present ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                               color: t.is_present ? '#4ade80' : 'rgba(255,255,255,0.4)',
                               fontWeight: 700
                             }}>
                               {t.is_present ? 'PRESENT' : 'ABSENT'}
                             </span>
                           </div>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '32px', alignItems: 'center' }}>
              <div>
                <h2 style={{ color: '#fff', fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Scoring Mastery Matrix</h2>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button 
                    onClick={() => { 
                      const next = { ...rules, jury_mode: 'manual' }
                      setRules(next)
                      updateRules(next).then(() => { setStatus('Switched to Manual List mode'); refresh() })
                    }}
                    style={{ 
                      padding: '4px 12px', 
                      fontSize: '0.75rem', 
                      borderRadius: '8px', 
                      background: rules.jury_mode === 'manual' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.05)',
                      color: rules.jury_mode === 'manual' ? '#818cf8' : 'rgba(255,255,255,0.3)',
                      border: '1px solid ' + (rules.jury_mode === 'manual' ? 'rgba(99, 102, 241, 0.3)' : 'transparent'),
                      cursor: 'pointer'
                    }}
                  >
                    Manual Mode
                  </button>
                  <button 
                    onClick={() => {
                      const next = { ...rules, jury_mode: 'scan' }
                      setRules(next)
                      updateRules(next).then(() => { setStatus('Switched to QR Scan mode'); refresh() })
                    }}
                    style={{ 
                      padding: '4px 12px', 
                      fontSize: '0.75rem', 
                      borderRadius: '8px', 
                      background: rules.jury_mode === 'scan' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.05)',
                      color: rules.jury_mode === 'scan' ? '#818cf8' : 'rgba(255,255,255,0.3)',
                      border: '1px solid ' + (rules.jury_mode === 'scan' ? 'rgba(99, 102, 241, 0.3)' : 'transparent'),
                      cursor: 'pointer'
                    }}
                  >
                    QR Scan Only
                  </button>
                </div>
              </div>
              <button onClick={exportScoresToExcel} className="login-tab active" style={{ background: 'rgba(96, 165, 240, 0.2)', color: '#60a5fa' }}>📥 Download Detailed Sheet</button>
            </div>
            
            <div className="sheet-wrap" style={{ borderRadius: '20px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto' }}>
              <table className="sheet-table" style={{ minWidth: '1000px' }}>
                <thead>
                  <tr>
                    <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', padding: '18px' }}>Team</th>
                    {[...new Set(teacherScores.map(s => s.teacher_name))].length > 0 ? (
                      [...new Set(teacherScores.map(s => s.teacher_name))].map(name => (
                        <th key={name} style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>{name}</th>
                      ))
                    ) : (
                      <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>Jury Scores</th>
                    )}
                    <th style={{ background: 'rgba(255,255,255,0.08)', color: '#60a5fa', textAlign: 'right', padding: '18px' }}>Avg Score</th>
                    <th style={{ background: 'rgba(255,255,255,0.05)', color: '#ef4444', textAlign: 'right', padding: '18px' }}>Penalty</th>
                    <th style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#fff', textAlign: 'right', padding: '18px' }}>FINAL</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((t) => {
                    const teamScores = teacherScores.filter(s => s.team_id === t.team_id)
                    const juryNames = [...new Set(teacherScores.map(s => s.teacher_name))]
                    
                    let sum = 0
                    let count = 0
                    
                    return (
                      <tr key={t.team_id} className="sheet-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '18px', color: '#fff' }}>
                          <strong>{t.team_name}</strong>
                          <span style={{ display: 'block', color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem' }}>{t.team_id}</span>
                        </td>
                        
                        {juryNames.map(name => {
                          const s = teamScores.find(sc => sc.teacher_name === name)
                          if (s) {
                            sum += s.total
                            count++
                          }
                          return (
                            <td key={name} style={{ textAlign: 'center', color: s ? '#fff' : 'rgba(255,255,255,0.1)' }}>
                              {s ? s.total : '-'}
                            </td>
                          )
                        })}
                        
                        <td style={{ padding: '18px', color: '#60a5fa', textAlign: 'right', fontWeight: 800 }}>
                          {count > 0 ? (sum / count).toFixed(1) : '0.0'}
                        </td>
                        <td style={{ padding: '18px', color: '#ef4444', textAlign: 'right', fontWeight: 600 }}>
                          -{t.penalty_points || 0}
                        </td>
                        <td style={{ padding: '18px', color: '#34d399', textAlign: 'right', fontWeight: 900, fontSize: '1.2rem' }}>
                          {((count > 0 ? (sum / count) : 0) - (t.penalty_points || 0)).toFixed(1)}
                        </td>
                      </tr>
                    )
                  })}
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
                          background: (acc.is_approved || acc.approved) ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                          color: (acc.is_approved || acc.approved) ? '#10b981' : '#f87171',
                          fontWeight: 700
                        }}>
                          {(acc.is_approved || acc.approved) ? 'ACTIVE' : 'PENDING'}
                        </span>
                      </td>
                      <td style={{ padding: '18px', textAlign: 'right' }}>
                        {!(acc.is_approved || acc.approved) && (
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
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

                <div className="login-field" style={{ gridColumn: 'span 2' }}>
                  <label style={{ color: '#fff', marginBottom: '16px', display: 'block' }}>Jury Scoring Mode</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <button 
                      onClick={() => {
                        const next = { ...rules, jury_mode: 'manual' }
                        setRules(next)
                        updateRules(next).then(() => { setStatus('Switched to Manual List mode'); refresh() })
                      }}
                      className={`login-submit ${rules.jury_mode === 'manual' ? '' : 'secondary'}`}
                      style={{ padding: '12px', fontSize: '0.9rem', background: rules.jury_mode === 'manual' ? '#6366f1' : 'rgba(255,255,255,0.05)', color: rules.jury_mode === 'manual' ? '#fff' : 'rgba(255,255,255,0.4)', opacity: 1 }}
                    >
                      {rules.jury_mode === 'manual' && '● '} Manual List
                    </button>
                    <button 
                      onClick={() => {
                        const next = { ...rules, jury_mode: 'scan' }
                        setRules(next)
                        updateRules(next).then(() => { setStatus('Switched to QR Scan mode'); refresh() })
                      }}
                      className={`login-submit ${rules.jury_mode === 'scan' ? '' : 'secondary'}`}
                      style={{ padding: '12px', fontSize: '0.9rem', background: rules.jury_mode === 'scan' ? '#6366f1' : 'rgba(255,255,255,0.05)', color: rules.jury_mode === 'scan' ? '#fff' : 'rgba(255,255,255,0.4)', opacity: 1 }}
                    >
                      {rules.jury_mode === 'scan' && '● '} QR Scan Only
                    </button>
                  </div>
                  <p className="muted" style={{ marginTop: '12px', fontSize: '0.8rem' }}>
                    {rules.jury_mode === 'scan' 
                      ? '🔒 Mandatory: Jury must scan team QR code to grade.' 
                      : '🔓 Flexible: Jury can pick teams from a searchable list.'}
                  </p>
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

        {activeTab === 'mailing' && (
          <div className="mailing-center" style={{ 
            display: 'grid', 
            gridTemplateColumns: 'minmax(280px, 0.6fr) minmax(400px, 1fr) minmax(400px, 0.9fr)', 
            gap: '24px',
            animation: 'fadeIn 0.5s ease-out',
            alignItems: 'start'
          }}>
            {/* Left: List Management & Preview */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', flex: '1 1 300px' }}>
              <div className="login-auth-panel" style={{ padding: '24px', background: 'rgba(255,255,255,0.02)' }}>
                <h2 style={{ fontSize: '1.4rem', color: '#fff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span>📋</span> Recipient List
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <label className="login-tab active" style={{ display: 'block', textAlign: 'center', cursor: 'pointer', padding: '10px', background: '#6366f1', fontSize: '0.75rem' }}>
                      📁 New List
                      <input type="file" hidden accept=".csv,.xlsx,.xls" onChange={(e) => handleRecipientImport(e, 'replace')} />
                    </label>
                    <label className="login-tab active" style={{ display: 'block', textAlign: 'center', cursor: 'pointer', padding: '10px', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.3)', fontSize: '0.75rem' }}>
                      ➕ Append
                      <input type="file" hidden accept=".csv,.xlsx,.xls" onChange={(e) => handleRecipientImport(e, 'append')} />
                    </label>
                  </div>
                  <button onClick={downloadMailingTemplate} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', padding: '10px', borderRadius: '12px', fontSize: '0.75rem', cursor: 'pointer', marginTop: '4px' }}>
                    📥 Download Sample Template
                  </button>
                </div>

                {recipients.length > 0 && (
                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ color: '#4ade80', fontSize: '0.8rem', fontWeight: 600 }}>{recipients.length} Contacts</span>
                      <button onClick={() => {
                        setRecipients([]);
                        setSelectedRecipients([]);
                        setDeliveryStatus({});
                        setPreviewIndex(0);
                      }} style={{ color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', fontSize: '0.7rem', cursor: 'pointer', textDecoration: 'underline' }}>Clear All</button>
                    </div>

                    <div className="custom-scroll" style={{ maxHeight: '350px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead style={{ position: 'sticky', top: 0, background: '#1e293b', zIndex: 1 }}>
                          <tr>
                            <th style={{ padding: '10px', textAlign: 'left', width: '30px' }}>
                              <input 
                                type="checkbox" 
                                checked={selectedRecipients.length === recipients.length} 
                                onChange={(e) => setSelectedRecipients(e.target.checked ? recipients.map(r => r.email) : [])} 
                              />
                            </th>
                            <th style={{ padding: '10px', textAlign: 'left', color: 'rgba(255,255,255,0.4)' }}>Participant</th>
                            <th style={{ padding: '10px', textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recipients.map((r, idx) => {
                            const status = deliveryStatus[r.email]
                            return (
                              <tr key={r.email} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: status?.status === 'failed' ? 'rgba(248, 113, 113, 0.05)' : 'transparent' }}>
                                <td style={{ padding: '8px 10px' }}>
                                  <input 
                                    type="checkbox" 
                                    checked={selectedRecipients.includes(r.email)} 
                                    onChange={(e) => {
                                      if (e.target.checked) setSelectedRecipients([...selectedRecipients, r.email])
                                      else setSelectedRecipients(selectedRecipients.filter(id => id !== r.email))
                                    }} 
                                  />
                                </td>
                                <td style={{ padding: '8px 10px' }}>
                                  <div style={{ color: '#fff', fontWeight: 600 }}>{r.name || 'No Name'}</div>
                                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>{r.email}</div>
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                  {status?.status === 'success' && <span title="Sent Successfully">✅</span>}
                                  {status?.status === 'failed' && <span title={status.error} style={{ cursor: 'help' }}>❌</span>}
                                  {!status && <span style={{ opacity: 0.2 }}>-</span>}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
              </div>

              {/* Scheduled Mails List */}
              <div className="login-auth-panel" style={{ padding: '24px', background: 'rgba(255,255,255,0.02)' }}>
                <h2 style={{ fontSize: '1.2rem', color: '#fff', marginBottom: '16px' }}>🕒 Scheduled Blasts ({scheduledMails.length})</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto' }}>
                  {scheduledMails.map(m => (
                    <div key={m.id} style={{ padding: '12px', borderRadius: '12px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 600 }}>{m.subject}</span>
                        <button onClick={() => deleteScheduledEmail(m.id)} style={{ color: '#f87171', background: 'none', border: 'none', fontSize: '0.75rem', cursor: 'pointer' }}>Cancel</button>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                        <span style={{ color: '#60a5fa' }}>📅 {new Date(m.scheduled_at).toLocaleString()}</span>
                        <span className="muted">👥 {m.recipients?.length || 0} users</span>
                      </div>
                    </div>
                  ))}
                  {scheduledMails.length === 0 && <p className="muted" style={{ textAlign: 'center', fontSize: '0.85rem', padding: '20px' }}>No active schedules</p>}
                </div>
              </div>
            </div>

            {/* Middle: Composer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="login-auth-panel" style={{ padding: '28px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h2 style={{ fontSize: '1.2rem', color: '#fff', margin: 0 }}>✍️ Creator Studio</h2>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>Draft Auto-saved locally</span>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '6px' }}>From Name</label>
                      <input className="login-input" style={{ fontSize: '0.85rem', padding: '10px' }} placeholder="e.g. LRNit Team" value={mailFromName} onChange={e => setMailFromName(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '6px' }}>Reply-to Email</label>
                      <input className="login-input" style={{ fontSize: '0.85rem', padding: '10px' }} placeholder="e.g. admin@lrnit.in" value={mailFromEmail} onChange={e => setMailFromEmail(e.target.value)} />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '6px' }}>Mail Subject</label>
                    <input className="login-input" style={{ fontSize: '0.9rem', padding: '12px' }} placeholder="Enter email subject..." value={mailSubject} onChange={e => setMailSubject(e.target.value)} />
                  </div>

                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '16px', padding: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    {/* Toolbar inspired by Unstop */}
                    <div style={{ display: 'flex', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '12px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {['B', 'I', 'U'].map(btn => (
                           <button key={btn} style={{ width: '28px', height: '28px', background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '0.8rem', fontWeight: btn === 'B' ? 800 : 400, fontStyle: btn === 'I' ? 'italic' : 'normal', textDecoration: btn === 'U' ? 'underline' : 'none', cursor: 'pointer' }}>{btn}</button>
                        ))}
                      </div>
                      <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {['🎉', '🚀', '⭐', '📍'].map(emoji => (
                          <button key={emoji} onClick={() => insertEmoji(emoji)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>{emoji}</button>
                        ))}
                      </div>
                      <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
                      <select style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: 'none', fontSize: '0.75rem', borderRadius: '4px', padding: '0 4px' }}>
                        <option>12pt</option>
                        <option>14pt</option>
                        <option>16pt</option>
                      </select>
                    </div>

                    <textarea 
                      className="login-input" 
                      placeholder="Write your main content here... Use {{name}} to personalize." 
                      value={mailContent}
                      onChange={e => setMailContent(e.target.value)}
                      style={{ width: '100%', minHeight: '300px', resize: 'vertical', padding: '12px', lineHeight: '1.6', background: 'transparent', border: 'none', color: '#fff', outline: 'none' }}
                    />
                  </div>

                  {/* Regards / Signature Editor */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>Regards & Professional Signature</label>
                      <button onClick={() => setMailSignature(`Best Regards,\nLRNit Team`)} style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '0.7rem', cursor: 'pointer' }}>Reset to Default</button>
                    </div>
                    <textarea 
                      className="login-input" 
                      placeholder="Enter your professional signature..."
                      value={mailSignature}
                      onChange={e => setMailSignature(e.target.value)}
                      rows={3}
                      style={{ width: '100%', fontSize: '0.85rem', padding: '12px', background: 'rgba(255,255,255,0.02)', color: '#fff' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) auto', gap: '12px', alignItems: 'end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>Event Branding</label>
                      <label className="login-tab active" style={{ display: 'block', textAlign: 'center', cursor: 'pointer', padding: '10px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        🖼️ Change Logo
                        <input type="file" hidden accept="image/*" onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          setStatus('Uploading logo...')
                          try {
                            const { data, error } = await supabase.storage.from('branding').upload(`logo_${Date.now()}_${file.name}`, file)
                            if (error) throw error
                            const { data: { publicUrl } } = supabase.storage.from('branding').getPublicUrl(data.path)
                            await updateRules({ ...rules, event_logo_url: publicUrl })
                            setStatus('✓ Logo updated successfully!')
                            refresh()
                          } catch (err) {
                            setStatus(`Upload failed: ${err.message}`)
                          }
                        }} />
                      </label>
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '6px' }}>Schedule (Optional)</label>
                      <div className="login-input-wrap" style={{ background: 'rgba(0,0,0,0.4)', padding: '2px' }}>
                        <input 
                          type="datetime-local" 
                          className="login-input" 
                          value={scheduledAt} 
                          onChange={e => setScheduledAt(e.target.value)} 
                          style={{ 
                            width: '100%', 
                            colorScheme: 'dark', 
                            padding: '10px', 
                            fontSize: '0.85rem', 
                            background: 'transparent', 
                            border: 'none',
                            color: '#fff',
                            fontWeight: 600
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  {/* Failure Status Banner */}
                  {Object.values(deliveryStatus).some(s => s.status === 'failed') && (
                    <div style={{ 
                      padding: '16px', 
                      background: 'rgba(248, 113, 113, 0.1)', 
                      border: '1px solid rgba(248, 113, 113, 0.2)', 
                      borderRadius: '16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div style={{ color: '#f87171', fontSize: '0.85rem' }}>
                        ⚠️ <strong>{Object.values(deliveryStatus).filter(s => s.status === 'failed').length} Emails Failed</strong>
                        <p style={{ margin: '4px 0 0 0', opacity: 0.7, fontSize: '0.75rem' }}>IDs: {Object.entries(deliveryStatus).filter(([_, s]) => s.status === 'failed').map(([email, _]) => email.split('@')[0]).slice(0, 3).join(', ')}...</p>
                      </div>
                      <button 
                        onClick={() => handleSendCustomBatch(true)} 
                        className="login-tab active" 
                        style={{ background: '#f87171', color: '#fff', fontSize: '0.75rem', padding: '6px 12px' }}
                      >
                        🔄 Resend to Failed
                      </button>
                    </div>
                  )}

                  <button 
                    onClick={() => handleSendCustomBatch()}
                    disabled={sendingCustom || (recipients.length === 0 && selectedRecipients.length === 0)}
                    className="login-submit"
                    style={{ height: '46px', background: scheduledAt ? '#10b981' : '#6366f1', color: '#fff', padding: '0 24px', fontSize: '0.9rem', marginTop: '12px' }}
                  >
                    {sendingCustom ? '⏳ Sending...' : scheduledAt ? `Schedule Campaign` : selectedRecipients.length > 0 ? `🚀 Blast to ${selectedRecipients.length} Selected` : `🚀 Blast to All (${recipients.length})`}
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Unstop-style Live Preview */}
            <div style={{ position: 'sticky', top: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
               <div style={{ background: '#f8fafc', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', animation: 'fadeIn 0.5s ease-out' }}>
                  {/* Browser-like navigation bar */}
                  <div style={{ background: '#fff', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                       {[1, 2, 3].map(i => <div key={i} style={{ width: '10px', height: '10px', borderRadius: '50%', background: i===1 ? '#f87171' : i===2 ? '#fbbf24' : '#4ade80' }} />)}
                    </div>
                    <div style={{ flex: 1, background: '#f1f5f9', borderRadius: '6px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', color: '#64748b', fontSize: '0.7rem' }}>
                      <span>preview.lrnit.in/mail-view</span>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                         <button 
                           onClick={() => setPreviewIndex(prev => Math.max(0, prev - 1))}
                           style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
                         >⬅️</button>
                         <span style={{ fontWeight: 700, color: '#334155' }}>
                           {recipients.length > 0 ? `${previewIndex + 1} / ${recipients.length}` : 'Empty'}
                         </span>
                         <button 
                           onClick={() => setPreviewIndex(prev => Math.min(recipients.length - 1, prev + 1))}
                           style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
                         >➡️</button>
                      </div>
                    </div>
                  </div>

                  {/* The Email Wrapper */}
                  <div style={{ padding: '24px', background: '#e2e8f0', minHeight: '500px', display: 'flex', justifyContent: 'center' }}>
                     <div style={{ background: '#fff', width: '100%', maxWidth: '500px', borderRadius: '4px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                        {/* Email Banner Header */}
                        <div style={{ background: '#1e293b', padding: '32px 24px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                             {/* Fixed LRNit Branding */}
                             <h2 style={{ color: '#fff', margin: 0, fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                               LRN<span style={{ color: '#60a5fa' }}>it</span>
                             </h2>
                             <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 800 }}>Learn · Build · Lead</div>
                             
                             {/* Optional Event Logo Below */}
                             {rules.event_logo_url && (
                               <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', width: '100%', display: 'flex', justifyContent: 'center' }}>
                                 <img src={rules.event_logo_url} alt="Event Logo" style={{ height: '40px', maxWidth: '180px', objectFit: 'contain' }} />
                               </div>
                             )}
                          </div>
                        </div>

                        {/* Email Body */}
                        <div style={{ padding: '32px 24px', fontFamily: 'Inter, Segoe UI, sans-serif' }}>
                           <h1 style={{ color: '#111827', fontSize: '1.25rem', fontWeight: 700, marginBottom: '20px' }}>
                             {getDynamicContent(mailSubject, recipients[previewIndex]) || '(No Subject)'}
                           </h1>
                           <p style={{ color: '#374151', fontSize: '0.95rem', lineHeight: '1.5', margin: '0 0 20px 0' }}>
                             Hi <strong>{recipients[previewIndex]?.name || '[Participant Name]'}</strong>,
                           </p>
                           <div style={{ color: '#4b5563', fontSize: '0.9rem', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                             {getDynamicContent(mailContent, recipients[previewIndex]) || 'Start writing your message in the composer to see the live preview here...'}
                           </div>
                            <div style={{ marginTop: '32px', borderTop: '1px solid #f3f4f6', paddingTop: '24px' }}>
                               <div style={{ color: '#4b5563', fontSize: '0.9rem', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                                 {mailSignature || `Best Regards,\n${mailFromName || 'LRNit Team'}`}
                               </div>
                               {rules.event_logo_url && (
                                 <img 
                                   src={rules.event_logo_url} 
                                   alt="Signature Logo" 
                                   style={{ height: '32px', marginTop: '12px', opacity: 0.8, filter: 'grayscale(0.2)' }} 
                                 />
                               )}
                            </div>
                        </div>

                        {/* Email Footer Banner */}
                        <div style={{ background: '#f8fafc', padding: '32px 24px', borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                             <div style={{ marginBottom: '12px' }}>
                                <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
                                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#3b82f6', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 900, fontSize: '1.1rem' }}>L</div>
                                </div>
                                <strong style={{ color: '#1e293b', fontSize: '0.9rem', display: 'block' }}>LRNit Mailing Platform</strong>
                                <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px', lineHeight: '1.4' }}>Join our community of builders.</div>
                             </div>
                          </div>
                          <div style={{ color: '#94a3b8', fontSize: '0.65rem', marginTop: '24px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>© 2026 LRNit . All rights reserved</div>
                        </div>
                     </div>
                  </div>
               </div>
               <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', marginTop: '16px' }}>
                 This is how the email will look in your participants' inbox.
               </p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
