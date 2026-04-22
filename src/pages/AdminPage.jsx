import { useEffect, useRef, useState } from 'react'
import { Activity, AlertTriangle, Bell, CheckCircle2, Download, LoaderCircle, Lock, Mail, Radar, RotateCcw, Search, ShieldCheck, Trash2, Unlock, UserRoundCheck, Wrench, XCircle } from 'lucide-react'
import OnlineIndicator from '../components/OnlineIndicator'
import { useAuth } from '../context/AuthContext'
import { 
  getTeams, 
  subscribeToTeams, 
  upsertTeams, 
  getTeacherScores, 
  getRules, 
  saveRules as updateRules,
  getProtocols,
  createProtocol,
  activateProtocol,
  deactivateProtocol,
  deleteProtocol,
  subscribeToProtocols,
  sendQrEmails,
  sendAbsentAlert,
  getActivityLog,
  generateTeamQrToken,
  deleteTeamsBySource,
  verifyScanToken,
  setTeamVerificationLocks
} from '../services/teamService'
import { ADMIN_VERIFICATION_CRITERIA, TEACHER_CRITERIA } from '../constants/teacherCriteria'
import { parseTeamFile, parseRecipientFile } from '../services/csvService'
import { sendCustomEmail } from '../services/supabaseFunctions'
import { supabase } from '../config/supabase'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { getPendingAccounts, getAllAccounts, approveAccount, rejectAccount, deleteAccount } from '../services/accountService'
import TeamTimer from '../components/TeamTimer'
import QrScanner from '../components/QrScanner'
import Toast from '../components/Toast'

export default function AdminPage() {
  const { profile, logout } = useAuth()
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)
  const [isTablet, setIsTablet] = useState(() => window.innerWidth > 768 && window.innerWidth <= 1180)
  const [isLandscapeMobile, setIsLandscapeMobile] = useState(() => {
    const width = window.innerWidth
    const height = window.innerHeight
    return width <= 960 && width > height
  })
  const [activeTab, setActiveTab] = useState('dashboard')
  const [teams, setTeams] = useState([])
  const [teacherScores, setTeacherScores] = useState([])
  const [protocols, setProtocols] = useState([])
  const [rules, setRules] = useState({ 
    max_break_time: 15, 
    grace_time: 5, 
    penalty_per_minute: 1,
    is_active: true,
    jury_mode: 'manual'
  })
  const [newProtocol, setNewProtocol] = useState({
    name: '',
    max_break_time: 15,
    grace_time: 5,
    penalty_per_minute: 1,
    overdue_email_enabled: false,
    jury_mode: 'manual',
    is_active: false,
    event_logo_url: '',
  })
  const [logs, setLogs] = useState([])
  const [accounts, setAccounts] = useState([])
  const [status, setStatus] = useState(null)
    const [toast, setToast] = useState({ visible: false, message: '', type: 'info' })
  const [importing, setImporting] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [verifyingTeamId, setVerifyingTeamId] = useState(null)
  
  // Mailing Center States
  const [recipients, setRecipients] = useState([])
  const [mailSubject, setMailSubject] = useState('')
  const [mailContent, setMailContent] = useState('')
  const [mailSignature, setMailSignature] = useState('Aethera X Organizing Team')
  const [mailFromEmail, setMailFromEmail] = useState('')
  const [mailFromName, setMailFromName] = useState('')
  const [mailFontFamily, setMailFontFamily] = useState('Arial')
  const [mailFontSize, setMailFontSize] = useState('14')
  const [mailAttachments, setMailAttachments] = useState([])
  const [sendingCustom, setSendingCustom] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [scheduledMails, setScheduledMails] = useState([])
  const [teamFilter, setTeamFilter] = useState('')
  const mailEditorRef = useRef(null)
  
  // Advanced Mailing States
  const [selectedRecipients, setSelectedRecipients] = useState([])
  const [previewIndex, setPreviewIndex] = useState(0)
  const [deliveryStatus, setDeliveryStatus] = useState({}) // { email: { status, error, name } }
  const [showFailedOnly, setShowFailedOnly] = useState(false)
  
  // Manual Recipient Entry
  const [manualRecipientName, setManualRecipientName] = useState('')
  const [manualRecipientEmail, setManualRecipientEmail] = useState('')

  const resetNewProtocol = () => setNewProtocol({
    name: '',
    max_break_time: 15,
    grace_time: 5,
    penalty_per_minute: 1,
    overdue_email_enabled: false,
    jury_mode: 'manual',
    is_active: false,
    event_logo_url: '',
  })

  const applyProtocolState = (items) => {
    const protocolItems = Array.isArray(items) ? [...items] : []
    protocolItems.sort((a, b) => {
      if (Boolean(b.is_active) !== Boolean(a.is_active)) {
        return Number(Boolean(b.is_active)) - Number(Boolean(a.is_active))
      }
      const aTime = new Date(a.updated_at || 0).getTime()
      const bTime = new Date(b.updated_at || 0).getTime()
      return bTime - aTime
    })

    setProtocols(protocolItems)

    const active = protocolItems.find((item) => item.is_active)
    const selected = active || protocolItems[0]
    if (selected) {
      setRules({
        ...selected,
        is_active: Boolean(active),
        penalty_per_minute: Number(selected.penalty_per_minute ?? selected.penalty_per_unit ?? 1),
      })
    }
  }

  const handleCreateProtocol = async () => {
    try {
      const payload = {
        ...newProtocol,
        max_break_time: Number(newProtocol.max_break_time ?? 15),
        grace_time: Number(newProtocol.grace_time ?? 5),
        penalty_per_minute: Number(newProtocol.penalty_per_minute ?? 1),
        overdue_email_enabled: Boolean(newProtocol.overdue_email_enabled),
        is_active: Boolean(newProtocol.is_active),
        event_logo_url: newProtocol.event_logo_url || null,
      }

      await createProtocol(payload)
      const latestProtocols = await getProtocols()
      applyProtocolState(latestProtocols)
      setStatus(payload.is_active ? 'New protocol added and activated' : 'New protocol added')
      resetNewProtocol()
    } catch (err) {
      setStatus(`Protocol save failed: ${err.message}`)
    }
  }

  const handleProtocolToggle = async (protocol) => {
    try {
      let nextProtocols = []
      if (protocol.is_active) {
        nextProtocols = await deactivateProtocol(protocol.id)
        setStatus(`${protocol.name} deactivated`)
      } else {
        nextProtocols = await activateProtocol(protocol.id)
        setStatus(`${protocol.name} activated`)
      }

      if (Array.isArray(nextProtocols) && nextProtocols.length > 0) {
        applyProtocolState(nextProtocols)
      } else {
        const latestProtocols = await getProtocols()
        applyProtocolState(latestProtocols)
      }
    } catch (err) {
      setStatus(`Protocol update failed: ${err.message}`)
    }
  }

  const handleProtocolDelete = async (protocol) => {
    const protocolName = protocol?.name || 'this protocol'
    const ok = window.confirm(`Delete ${protocolName}? This action cannot be undone.`)
    if (!ok) return

    try {
      await deleteProtocol(protocol.id)
      const latestProtocols = await getProtocols()
      applyProtocolState(latestProtocols)
      setStatus(`${protocolName} deleted`)
    } catch (err) {
      setStatus(`Protocol delete failed: ${err.message}`)
    }
  }

  const processDueScheduledBlast = async (blast) => {
    const recipients = Array.isArray(blast?.recipients) ? blast.recipients : []
    if (!blast?.id || recipients.length === 0) {
      if (blast?.id) {
        await supabase.from('scheduled_emails').update({ status: 'failed' }).eq('id', blast.id)
      }
      return
    }

    let success = 0
    let fail = 0
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i]
      if (!recipient?.email) {
        fail++
        continue
      }

      try {
        await sendCustomEmail({
          email: recipient.email,
          name: recipient.name,
          subject: getDynamicContent(blast.subject, recipient),
          content: htmlToPlainText(getDynamicContent(blast.content, recipient)),
          signature: blast.signature,
          fromEmail: blast.from_email,
          fromName: blast.from_name,
          eventLogoUrl: blast.event_logo_url || rules.event_logo_url,
          htmlContent: buildEmailHtml({
            recipient,
            subject: getDynamicContent(blast.subject, recipient),
            content: getDynamicContent(blast.content, recipient),
            signature: blast.signature,
            fromName: blast.from_name,
            eventLogoUrl: blast.event_logo_url || rules.event_logo_url,
          }),
        })
        success++
      } catch (err) {
        fail++
        console.error(`Scheduled blast send failed for ${recipient.email}:`, err)
      }
    }

    await supabase
      .from('scheduled_emails')
      .update({ status: success > 0 ? 'sent' : 'failed' })
      .eq('id', blast.id)

    setStatus(`Processed scheduled blast \"${blast.subject}\". Success: ${success}, Failed: ${fail}`)
  }

  const refresh = async () => {
    try {
      const [t, s, p, r, a, l, sch] = await Promise.allSettled([
        getTeams(),
        getTeacherScores(),
        getProtocols(),
        getRules(),
        getAllAccounts(),
        getActivityLog(),
        supabase.from('scheduled_emails').select('*').order('scheduled_at', { ascending: true })
      ])

      if (t.status === 'fulfilled') setTeams(t.value)
      if (s.status === 'fulfilled') setTeacherScores(s.value)
      if (p.status === 'fulfilled') applyProtocolState(p.value)
      if (r.status === 'fulfilled' && r.value) {
        setRules({
          ...r.value,
          penalty_per_minute: Number(r.value.penalty_per_minute ?? r.value.penalty_per_unit ?? 1),
        })
      }
      if (a.status === 'fulfilled') setAccounts(a.value)
      if (l.status === 'fulfilled') setLogs(l.value)
      if (sch.status === 'fulfilled' && sch.value?.data) {
        setScheduledMails(sch.value.data)

        const now = new Date()
        const duePending = sch.value.data.filter((item) => item?.status === 'pending' && new Date(item.scheduled_at) <= now)
        if (duePending.length > 0) {
          setStatus(`Processing ${duePending.length} overdue scheduled blast(s)...`)
          for (let i = 0; i < duePending.length; i++) {
            await processDueScheduledBlast(duePending[i])
          }

          const { data: refreshedScheduled } = await supabase
            .from('scheduled_emails')
            .select('*')
            .order('scheduled_at', { ascending: true })
          if (refreshedScheduled) setScheduledMails(refreshedScheduled)
        }
      }
    } catch (err) {
      console.error('Refresh error:', err)
    }
  }

  useEffect(() => {
    refresh()
    const unsub = subscribeToTeams(refresh)
    const unsubProtocols = subscribeToProtocols((items) => {
      applyProtocolState(items)
    })

    // Load Draft
    const saved = localStorage.getItem('mail_draft')
    if (saved) {
      try {
        const d = JSON.parse(saved)
        setMailSubject(d.subject || '')
        setMailContent(d.content || '')
        setMailSignature(d.signature || 'Aethera X Organizing Team')
        setMailFromName(d.fromName || '')
        setMailFromEmail(d.fromEmail || '')
      } catch {
        localStorage.removeItem('mail_draft')
      }
    }

    return () => {
      unsub()
      unsubProtocols()
    }
  }, [])

  useEffect(() => {
    const onResize = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      setIsMobile(width <= 768)
      setIsTablet(width > 768 && width <= 1180)
      setIsLandscapeMobile(width <= 960 && width > height)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
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

  useEffect(() => {
    if (!mailEditorRef.current) return
    if (mailEditorRef.current.innerHTML !== mailContent) {
      mailEditorRef.current.innerHTML = mailContent || ''
    }
  }, [mailContent])

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

  const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  const withBreaks = (value = '') => escapeHtml(value).replace(/\n/g, '<br/>')

  const sanitizeRichHtml = (value = '') => {
    if (!value) return ''
    if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return withBreaks(value)

    const doc = new DOMParser().parseFromString(`<div>${value}</div>`, 'text/html')
    const root = doc.body.firstElementChild
    if (!root) return ''

    const allowedTags = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'P', 'DIV', 'SPAN', 'UL', 'OL', 'LI'])
    const allowedStyles = new Set(['font-family', 'font-size', 'font-style', 'font-weight', 'text-decoration'])
    const safeStyleValue = /^[\w\s,'"\-().%]+$/

    const sanitizeNode = (node) => {
      if (node.nodeType === 1) {
        const el = node
        const tag = el.tagName.toUpperCase()

        if (!allowedTags.has(tag)) {
          const parent = el.parentNode
          if (!parent) return
          while (el.firstChild) parent.insertBefore(el.firstChild, el)
          parent.removeChild(el)
          return
        }

        for (const attr of Array.from(el.attributes)) {
          if (attr.name !== 'style') el.removeAttribute(attr.name)
        }

        if (el.hasAttribute('style')) {
          const inline = []
          for (const prop of allowedStyles) {
            const raw = el.style.getPropertyValue(prop)
            const clean = raw?.trim()
            if (clean && safeStyleValue.test(clean)) inline.push(`${prop}:${clean}`)
          }
          if (inline.length > 0) el.setAttribute('style', inline.join(';'))
          else el.removeAttribute('style')
        }
      }

      for (const child of Array.from(node.childNodes)) sanitizeNode(child)
    }

    for (const child of Array.from(root.childNodes)) sanitizeNode(child)
    return root.innerHTML
  }

  const htmlToPlainText = (value = '') => {
    if (!value) return ''
    if (typeof document === 'undefined') return value.replace(/<[^>]+>/g, ' ')
    const div = document.createElement('div')
    div.innerHTML = value
    return (div.innerText || div.textContent || '').trim()
  }

  const focusMailEditor = () => {
    if (mailEditorRef.current) mailEditorRef.current.focus()
  }

  const applyMailCommand = (command, value = null) => {
    if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return
    focusMailEditor()
    document.execCommand('styleWithCSS', false, true)
    document.execCommand(command, false, value)
    setMailContent(mailEditorRef.current?.innerHTML || '')
  }

  const applyMailFontSize = (sizePx) => {
    if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return
    focusMailEditor()
    document.execCommand('fontSize', false, '7')
    const editor = mailEditorRef.current
    if (editor) {
      editor.querySelectorAll('font[size="7"]').forEach((el) => {
        el.removeAttribute('size')
        el.style.fontSize = `${sizePx}px`
      })
    }
    setMailContent(editor?.innerHTML || '')
  }

  const buildEmailHtml = ({ recipient, subject, content, signature, fromName, eventLogoUrl }) => {
    const safeSubject = escapeHtml(subject || 'Update from Event Team')
    const safeName = escapeHtml(recipient?.name || 'Participant')
    const safeContent = sanitizeRichHtml(content || '')
    const safeSignature = withBreaks(signature || `Best Regards,\n${fromName || 'LRNit Team'}`)
    const hasLogo = eventLogoUrl && eventLogoUrl.trim().length > 0
    const safeLogoUrl = hasLogo ? escapeHtml(eventLogoUrl.trim()) : ''

    return `
<!DOCTYPE html>
<html>
<head>
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    body { margin: 0; padding: 0; background-color: #f1f5f9; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  </style>
</head>
<body>
  <div style="max-width:550px;margin:40px auto;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.05);border:1px solid #e2e8f0;">
    <div style="background-color:#1e293b;padding:40px 24px;text-align:center;">
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;">
        ${hasLogo ? `
        <div style="margin-bottom:20px;text-align:center;">
          <img src="${safeLogoUrl}" alt="Event Logo" style="height:120px;max-width:280px;object-fit:contain;display:inline-block;" />
        </div>
        ` : ''}
        <h2 style="color:#ffffff;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.02em;">LRN<span style="color:#60a5fa;">it</span></h2>
        <div style="margin-top:12px;color:rgba(255,255,255,0.5);font-size:12px;text-transform:uppercase;letter-spacing:0.2em;font-weight:700;">Learn · Build · Lead</div>
      </div>
    </div>
    <div style="padding:32px 24px;">
      <h1 style="color:#111827;font-size:20px;font-weight:700;margin:0 0 20px 0;">${safeSubject}</h1>
      <p style="color:#374151;font-size:15px;margin:0 0 20px 0;">Greetings <strong>${safeName}</strong>,</p>
      <div style="color:#4b5563;font-size:14.5px;line-height:1.6;margin:0 0 32px 0;white-space:normal;">${safeContent || 'Start writing your message in the composer to see the live preview here...'}</div>
      <div style="margin-top:32px;border-top:1px solid #f3f4f6;padding-top:24px;">
        <div style="color:#4b5563;font-size:14.5px;line-height:1.6;white-space:normal;">${safeSignature}</div>
        ${hasLogo ? `<img src="${safeLogoUrl}" alt="Signature Logo" style="height:32px;margin-top:12px;opacity:0.8;display:inline-block;" />` : ''}
      </div>
    </div>
    <div style="background-color:#f8fafc;padding:24px;border-top:1px solid #f1f5f9;text-align:center;">
      <div style="color:#64748b;font-size:13px;">
        <strong style="color:#1e293b;">LRNit Mailing Platform</strong>
        <div style="color:#94a3b8;font-size:11px;margin-top:8px;">© 2026 LRNit. All rights reserved.</div>
      </div>
    </div>
  </div>
</body>
</html>`
  }

  const getPreviewHtml = () => {
    try {
      return buildEmailHtml({
        recipient: recipients[previewIndex],
        subject: getDynamicContent(mailSubject, recipients[previewIndex]),
        content: getDynamicContent(mailContent, recipients[previewIndex]),
        signature: mailSignature,
        fromName: mailFromName,
        eventLogoUrl: rules.event_logo_url,
      })
    } catch (err) {
      console.error('Preview render failed:', err)
      return '<html><body style="font-family:Arial,sans-serif;padding:16px;">Preview unavailable. Please refresh the page.</body></html>'
    }
  }

  const onImport = async (e, mode = 'replace') => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setStatus('Parsing file...')
    try {
      const parsed = await parseTeamFile(file)
      const uniqueById = [...new Map(parsed.filter(t => t.team_id).map(t => [t.team_id, t])).values()]

      if (uniqueById.length === 0) {
        setStatus('Import file did not contain valid team IDs.')
        return
      }

      const existingIds = new Set(teams.map(t => t.team_id))
      const importPayload = mode === 'append'
        ? uniqueById.filter(t => !existingIds.has(t.team_id))
        : uniqueById
      const skippedCount = mode === 'append' ? (uniqueById.length - importPayload.length) : 0

      if (importPayload.length === 0) {
        setStatus(`No new teams to append from ${file.name}. ${skippedCount} already exist.`)
        return
      }

      const teamsWithSource = importPayload.map(t => ({ ...t, source_file: file.name }))

      setStatus(`${mode === 'append' ? 'Appending' : 'Importing'} ${importPayload.length} teams from ${file.name}...`)
      await upsertTeams(teamsWithSource)
      setStatus(
        mode === 'append'
          ? `Appended ${importPayload.length} new teams from ${file.name}${skippedCount > 0 ? ` (${skippedCount} skipped - already existed)` : ''}`
          : `Successfully imported ${importPayload.length} teams from ${file.name}`
      )
      refresh()
    } catch (err) {
      setStatus(`Import failed: ${err.message}`)
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  const onBulkMail = async () => {
    if (!window.confirm(`Send QR emails to all ${teams.length} teams now?`)) return
    
    let success = 0
    let fail = 0
    setStatus(`Starting bulk mailing for ${teams.length} teams...`)

    for (const t of teams) {
      try {
        if (!t.email_count || t.email_count === 0) {
           throw new Error("No emails linked to this team.")
        }

        if (!t.qr_token) {
          setStatus(`Generating missing token for ${t.team_id}...`)
          const res = await generateTeamQrToken(t.team_id)
          t.qr_token = res.token
        }
        
        setStatus(`Sending QR to ${t.team_id} (${t.team_name})...`)
        // Pass origin to fix 404 issues
        const res = await sendQrEmails(t.team_id, window.location.origin)
        
        if (res?.success === false) {
           throw new Error(res.error || 'Server rejected request')
        }

        success++
        setStatus(`Sent ${success}/${teams.length}... (${t.team_id})`)
      } catch (err) {
        console.error(`BulkMail error for ${t.team_id}:`, err)
        fail++
        setStatus(`Failed ${t.team_id}: ${err.message}`)
        await new Promise(r => setTimeout(r, 1000))
      }
    }
    
    setStatus(`Mailing finished. Success: ${success}, Failed: ${fail}.`)
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
    
    setStatus(`Alerting ${alertable.length} absent teams...`)
    let success = 0
    let fail = 0

    for (const t of alertable) {
      try {
        setStatus(`Alerting ${t.team_name}...`)
        const res = await sendAbsentAlert(t.team_id, window.location.origin)
        if (res?.success) {
          success++
          setStatus(`Sent ${success}/${alertable.length}... (${t.team_id})`)
        } else {
          console.error(`Alert failed for ${t.team_id}:`, res?.error)
          fail++
          setStatus(`Failed ${t.team_id}: ${res?.error || 'Unknown error'}`)
          await new Promise(r => setTimeout(r, 1000))
        }
      } catch (err) {
        console.error(`Alert error for ${t.team_id}:`, err)
        fail++
        setStatus(`Error ${t.team_id}: ${err.message}`)
        await new Promise(r => setTimeout(r, 1000))
      }
    }
    setStatus(`Alert campaign finished. Sent: ${success}, Failed: ${fail}`)
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
    setStatus(`Token generation complete: ${success} successful, ${fail} failed.`)
    refresh()
  }

  const handleApprove = async (id) => {
    try {
      await approveAccount(id)
      setStatus('Account approved')
      setToast({ visible: true, message: 'Account approved', type: 'success' })
      refresh()
    } catch (err) {
      setStatus(`Error: ${err.message}`)
      setToast({ visible: true, message: `Approve failed: ${err.message}`, type: 'error' })
    }
  }

  const handleReject = async (id) => {
    try {
      await rejectAccount(id)
      setStatus('Account rejected')
      setToast({ visible: true, message: 'Account rejected', type: 'success' })
      refresh()
    } catch (err) {
      setStatus(`Error: ${err.message}`)
      setToast({ visible: true, message: `Reject failed: ${err.message}`, type: 'error' })
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this user permanently?')) return
    try {
      await deleteAccount(id)
      setStatus('Account deleted')
      setToast({ visible: true, message: 'Account deleted', type: 'success' })
      refresh()
    } catch (err) {
      setStatus(`Error: ${err.message}`)
      setToast({ visible: true, message: `Delete failed: ${err.message}`, type: 'error' })
    }
  }
  const onDeleteBySource = async (sourceFile) => {
    if (!window.confirm(`Delete ALL teams imported from "${sourceFile}"? This cannot be undone.`)) return
    try {
      setStatus(`Deleting teams from source: ${sourceFile}...`)
      await deleteTeamsBySource(sourceFile)
      setStatus(`Deleted all teams from ${sourceFile}`)
      refresh()
    } catch (err) {
      setStatus(`Delete failed: ${err.message}`)
    }
  }

  const onScanFailsafe = async (token) => {
    setProcessing(true)
    setStatus('Scanning team QR...')
    try {
      const found = await verifyScanToken(token)
      if ('vibrate' in navigator) navigator.vibrate(100)
      setStatus(`Team found: ${found.team_name} (ID: ${found.team_id}). Search completed.`)
      
      // Auto-filter or highlight logic could go here, but for now just show team info
      window.alert(`Team Found!\nName: ${found.team_name}\nID: ${found.team_id}\nRoom: ${found.room_number}`)
      setScanOpen(false)
    } catch (err) {
      setStatus(`Scan error: ${err.message}`)
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
        setStatus(`Appended ${uniqueNewData.length} new recipients.`)
      } else {
        setRecipients(data)
        setStatus(`Loaded ${data.length} recipients.`)
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

    if (scheduledAt && mailAttachments.length > 0) {
      alert('Attachments are currently supported for Send Now only. Clear schedule time to continue.')
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
        const utcIsoString = new Date(scheduledAt).toISOString()

        let success = 0
        let fail = 0
        for (let i = 0; i < targetList.length; i++) {
          const r = targetList[i]
          try {
            setStatus(`⏰ Queueing ${r.name || r.email} (${i + 1}/${targetList.length}) for ${schDate.toLocaleString()}...`)
            const res = await sendCustomEmail({
              email: r.email,
              name: r.name,
              subject: getDynamicContent(mailSubject, r),
              content: htmlToPlainText(getDynamicContent(mailContent, r)),
              signature: mailSignature,
              fromEmail: mailFromEmail,
              fromName: mailFromName,
              eventLogoUrl: rules.event_logo_url,
              scheduledAt: utcIsoString,
              htmlContent: buildEmailHtml({
                recipient: r,
                subject: getDynamicContent(mailSubject, r),
                content: getDynamicContent(mailContent, r),
                signature: mailSignature,
                fromName: mailFromName,
                eventLogoUrl: rules.event_logo_url,
              })
            })

            if (res?.success) success++
            else throw new Error(res?.error || 'Unknown error while queueing scheduled email')
          } catch (err) {
            fail++
            console.error(`Scheduled queue error for ${r.email}:`, err)
          }
        }

        const { error } = await supabase.from('scheduled_emails').insert({
          scheduled_at: utcIsoString,
          subject: mailSubject,
          content: mailContent,
          signature: mailSignature,
          recipients: targetList,
          from_name: mailFromName,
          from_email: mailFromEmail,
          event_logo_url: rules.event_logo_url,
          user_id: user?.id,
          status: success > 0 ? 'sent' : 'failed'
        })
        if (error) throw error

        alert(`Scheduled blast queued successfully!\nQueued: ${success}\nFailed: ${fail}`)
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

    try {
      for (let i = 0; i < targetList.length; i++) {
          const r = targetList[i]
          try {
              setStatus(`📫 Sending to ${r.name || r.email} (${i + 1}/${targetList.length})...`)
              const res = await sendCustomEmail({
                  email: r.email,
                  name: r.name,
                  subject: getDynamicContent(mailSubject, r),
                  content: htmlToPlainText(getDynamicContent(mailContent, r)),
                  signature: mailSignature,
                  fromEmail: mailFromEmail,
                  fromName: mailFromName,
                  attachments: mailAttachments,
                  eventLogoUrl: rules.event_logo_url,
                  htmlContent: buildEmailHtml({
                    recipient: r,
                    subject: getDynamicContent(mailSubject, r),
                    content: getDynamicContent(mailContent, r),
                    signature: mailSignature,
                    fromName: mailFromName,
                    eventLogoUrl: rules.event_logo_url,
                  })
              })

              if (res?.success) {
                success++
                newStatus[r.email] = { status: 'success', name: r.name }
              } else {
                throw new Error(res?.error || 'Unknown error')
              }
          } catch (err) {
              fail++
              console.error(`Mailing error for ${r.email}:`, err)
              newStatus[r.email] = { status: 'failed', name: r.name, error: err.message }
          }
          setDeliveryStatus({ ...newStatus }) // Update live
      }

      setStatus(`✅ Mailing complete. Success: ${success}, Failed: ${fail}.`)
      alert(`Mailing Complete!\n✓ Success: ${success}\n✖ Failed: ${fail}`)
      refresh()
    } finally {
      setSendingCustom(false)
    }
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
    if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
      focusMailEditor()
      document.execCommand('insertText', false, emoji)
      setMailContent(mailEditorRef.current?.innerHTML || '')
      return
    }
    setMailContent(prev => `${prev}${emoji}`)
  }

  const mimeTypeFromName = (name) => {
    const lower = name.toLowerCase()
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
    if (lower.endsWith('.png')) return 'image/png'
    if (lower.endsWith('.pdf')) return 'application/pdf'
    if (lower.endsWith('.doc')) return 'application/msword'
    if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    if (lower.endsWith('.xls')) return 'application/vnd.ms-excel'
    if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    return 'application/octet-stream'
  }

  const onAttachmentPick = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const allowed = new Set([
      'image/jpeg',
      'image/png',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ])
    const maxBytes = 10 * 1024 * 1024
    const toBase64 = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = String(reader.result || '')
        const base64 = result.includes(',') ? result.split(',')[1] : result
        resolve(base64)
      }
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`))
      reader.readAsDataURL(file)
    })

    try {
      const nextAttachments = []
      for (const file of files) {
        if (!allowed.has(file.type)) {
          alert(`Unsupported file type: ${file.name}`)
          continue
        }
        if (file.size > maxBytes) {
          alert(`${file.name} is larger than 10MB.`)
          continue
        }
        const content = await toBase64(file)
        nextAttachments.push({ name: file.name, content, contentType: mimeTypeFromName(file.name) })
      }

      if (nextAttachments.length > 0) {
        setMailAttachments(prev => {
          const existing = new Set(prev.map(a => a.name))
          const unique = nextAttachments.filter(a => !existing.has(a.name))
          return [...prev, ...unique]
        })
      }
    } catch (err) {
      alert(`Attachment processing failed: ${err.message}`)
    } finally {
      e.target.value = ''
    }
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

  const addManualRecipient = () => {
    if (!manualRecipientEmail || !manualRecipientName) {
      alert('Please enter both name and email')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manualRecipientEmail)) {
      alert('Invalid email address')
      return
    }
    if (recipients.some(r => r.email === manualRecipientEmail)) {
      alert('This email already exists in the list')
      return
    }
    setRecipients(prev => [...prev, { name: manualRecipientName, email: manualRecipientEmail }])
    setManualRecipientName('')
    setManualRecipientEmail('')
  }

  const exportToExcel = () => {
    const data = teams.map(t => ({
      'Team ID': t.team_id,
      'Team Name': t.team_name,
      'Room': t.room_number || 'N/A',
      'Penalty Points': t.penalty_points || 0,
      'Status': t.active_out ? 'ON BREAK' : 'IN VENUE',
      'Attendance': t.is_present ? 'PRESENT' : 'AB',
      'QR Link': `${window.location.origin}/scan?token=${t.qr_token || 'TOKEN_PENDING'}`
    }))

    const worksheet = XLSX.utils.json_to_sheet(data)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Master Teams')
    
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    const fileData = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' })
    saveAs(fileData, `TicketScan_MasterTeams_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const githubMax = ADMIN_VERIFICATION_CRITERIA.find(c => c.key === 'github')?.max || 10
  const documentationMax = ADMIN_VERIFICATION_CRITERIA.find(c => c.key === 'documentation')?.max || 10

  const getAdminVerificationBonus = (team) => {
    let bonus = 0
    if (team?.github_verified) bonus += githubMax
    if (team?.documentation_verified) bonus += documentationMax
    return bonus
  }

  const getAdjustedTeacherTotal = (score, team) => {
    if (!score) return 0

    const teacherTotal = TEACHER_CRITERIA.reduce((sum, criterion) => {
      const key = criterion.key
      const value = Number(score[key]) || 0
      const bounded = Math.max(0, Math.min(criterion.max, value))
      return sum + bounded
    }, 0)

    return teacherTotal + getAdminVerificationBonus(team)
  }

  const exportScoresToExcel = () => {
    // Pivot data for export
    const teamMap = new Map()
    teams.forEach(t => teamMap.set(t.team_id, { 
      name: t.team_name, 
      id: t.team_id, 
      penalty: t.penalty_points || 0,
      is_present: !!t.is_present,
      github_verified: !!t.github_verified,
      documentation_verified: !!t.documentation_verified,
      scores: {} 
    }))

    const juryNames = [...new Set(teacherScores.map(s => s.teacher_name))].sort()
    
    teacherScores.forEach(s => {
      const entry = teamMap.get(s.team_id)
      if (entry) {
        entry.scores[s.teacher_name] = getAdjustedTeacherTotal(s, entry)
      }
    })

    const exportData = Array.from(teamMap.values()).map(entry => {
      const row = {
        'Team ID': entry.id,
        'Team Name': entry.name,
        'GitHub Verified': entry.github_verified ? 'Yes' : 'No',
        'Documentation Verified': entry.documentation_verified ? 'Yes' : 'No',
        'Attendance': entry.is_present ? 'PRESENT' : 'AB',
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

  const handleVerificationToggle = async (team, field) => {
    const nextValue = !team[field]
    const previousTeams = teams
    const optimisticTeams = teams.map(item =>
      item.team_id === team.team_id ? { ...item, [field]: nextValue } : item
    )
    setTeams(optimisticTeams)
    setVerifyingTeamId(team.team_id)

    try {
      const payload = {
        githubVerified: field === 'github_verified' ? nextValue : !!team.github_verified,
        documentationVerified: field === 'documentation_verified' ? nextValue : !!team.documentation_verified,
      }
      const result = await setTeamVerificationLocks(team.team_id, payload)
      setStatus(result.persisted ? 'Verification saved in backend' : 'Saved locally. Add DB columns for backend persistence.')
    } catch (err) {
      setTeams(previousTeams)
      setStatus(`Failed to update verification: ${err.message}`)
    } finally {
      setVerifyingTeamId(null)
    }
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

      <main className="layout admin-layout" style={{ position: 'relative', zIndex: 1, maxWidth: isMobile ? '100%' : '1400px' }}>
        <header className="topbar" style={{ padding: isMobile ? '12px 0 16px' : '24px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: isMobile ? '20px' : '32px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? '14px' : undefined }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', width: isMobile ? '100%' : 'auto' }}>
            <div className="login-feature-icon" style={{ width: '48px', height: '48px', fontSize: '1.4rem' }}><ShieldCheck size={20} /></div>
            <h1 style={{ color: '#fff', fontSize: isMobile ? '1.35rem' : '1.8rem', margin: 0 }}>Command <span>Center</span></h1>
          </div>
          <div className="topbar-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center', width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
            <OnlineIndicator />
            <button onClick={logout} className="login-tab active" style={{ borderRadius: '12px', padding: isMobile ? '9px 14px' : '10px 24px', fontSize: '0.9rem' }}>Sign Out</button>
          </div>
        </header>

        <nav className="tab-nav" style={{ 
          background: 'rgba(255,255,255,0.04)', 
          padding: isMobile ? '6px' : '8px', 
          borderRadius: '20px', 
          border: '1px solid rgba(255,255,255,0.08)', 
          marginBottom: isMobile ? '24px' : '40px', 
          display: 'flex', 
          flexWrap: (isMobile && !isLandscapeMobile) ? 'wrap' : 'nowrap',
          gap: '8px',
          overflowX: (isTablet || isLandscapeMobile) ? 'auto' : (isMobile ? 'hidden' : 'visible'),
          overflowY: 'hidden',
          WebkitOverflowScrolling: 'touch',
          position: (isMobile && !isLandscapeMobile) ? 'sticky' : 'static',
          top: (isMobile && !isLandscapeMobile) ? '8px' : 'auto',
          zIndex: (isMobile && !isLandscapeMobile) ? 50 : 'auto',
          backdropFilter: (isMobile && !isLandscapeMobile) ? 'blur(8px)' : 'none'
        }}>
          {['dashboard', 'teams', 'judge', 'settings', 'accounts', 'mailing'].map(tab => (
            <button 
              key={tab}
              className={activeTab === tab ? 'login-tab active' : 'login-tab'} 
              style={{
                flex: (isTablet || isLandscapeMobile) ? '0 0 auto' : (isMobile ? '1 1 calc(33.33% - 8px)' : 1),
                minWidth: (isTablet || isLandscapeMobile) ? (isLandscapeMobile ? '136px' : '148px') : (isMobile ? 'unset' : 'auto'),
                textTransform: 'capitalize',
                padding: isMobile ? '10px 12px' : (isTablet ? '11px 14px' : '12px 20px'),
                fontSize: isMobile ? '0.85rem' : (isTablet ? '0.88rem' : '0.95rem'),
                whiteSpace: 'nowrap'
              }}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'mailing' ? <span className="icon-label"><Mail size={15} /> Mailing</span> : tab}
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
          <div className="grid two-col" style={{ gap: isMobile ? '18px' : '32px', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(350px, 1fr))' }}>
            <div className="login-auth-panel" style={{ background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: isMobile ? '18px' : '32px' }}>
              <h2 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 700, marginBottom: '24px' }}>Import Teams</h2>
              <div className="login-field">
                <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginBottom: '12px' }}>Bulk Team Upload</label>
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px' }}>
                  <label className="login-tab" style={{ flex: 1, textAlign: 'center', cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.6 : 1 }}>
                    Replace Existing
                    <input type="file" hidden onChange={(e) => onImport(e, 'replace')} accept=".csv,.xlsx,.xls" disabled={importing} />
                  </label>
                  <label className="login-tab" style={{ flex: 1, textAlign: 'center', cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.6 : 1 }}>
                    Append New
                    <input type="file" hidden onChange={(e) => onImport(e, 'append')} accept=".csv,.xlsx,.xls" disabled={importing} />
                  </label>
                </div>
              </div>
              <div style={{ marginTop: '24px' }}>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>Required Columns (in order):</p>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '12px', marginTop: '8px', fontFamily: 'monospace', color: '#93c5fd', fontSize: '0.8rem', whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                  team_id, team_name, members_count, room_number, emails
                </div>
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '8px', marginTop: '12px' }}>
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
                <button className="login-submit" style={{ marginTop: '16px', background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa', width: '100%', boxShadow: 'none' }} onClick={onGenerateAllTokens}><span className="icon-label" style={{ justifyContent: 'center' }}><Wrench size={16} /> Generate and Repair All Tokens</span></button>
                <button className="login-submit" style={{ marginTop: '12px', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', width: '100%', boxShadow: 'none' }} onClick={onBulkMail}><span className="icon-label" style={{ justifyContent: 'center' }}><Mail size={16} /> Send QRs to All Teams</span></button>
                <button className="login-submit" style={{ marginTop: '12px', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', width: '100%', boxShadow: 'none' }} onClick={onAlertAwayTeams}><span className="icon-label" style={{ justifyContent: 'center' }}><Bell size={16} /> Alert Absent Teams to Arena</span></button>
                <button className="login-submit" style={{ marginTop: '16px', width: '100%', background: 'rgba(16, 185, 129, 0.1)', boxShadow: 'none' }} onClick={exportToExcel}><span className="icon-label" style={{ justifyContent: 'center' }}><Download size={16} /> Export Master Excel (with QRs)</span></button>
                <button className="login-submit" style={{ marginTop: '12px', width: '100%', boxShadow: 'none' }} onClick={() => refresh()}>Force Sync Display</button>
              </div>
            </div>
            
            <div className="login-auth-panel" style={{ background: 'rgba(15, 18, 30, 0.8)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: isMobile ? '18px' : '32px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Activity Terminal</h2>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: status ? '#60a5fa' : '#34d399', boxShadow: `0 0 10px ${status ? '#60a5fa' : '#34d399'}` }} />
              </div>
              <div style={{ flex: 1, background: 'rgba(0,0,0,0.4)', borderRadius: '20px', padding: '24px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                {status ? (
                  <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '16px', display: 'grid', placeItems: 'center', color: '#60a5fa' }}><Activity size={28} /></div>
                    <p style={{ color: '#60a5fa', fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.5, maxWidth: '300px' }}>{status}</p>
                    <button className="login-tab" style={{ marginTop: '20px', fontSize: '0.75rem' }} onClick={() => setStatus('')}>Clear Log</button>
                  </div>
                ) : (
                  <div style={{ opacity: 0.3 }}>
                    <div style={{ fontSize: '2rem', marginBottom: '16px', display: 'grid', placeItems: 'center' }}><Radar size={28} /></div>
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

            <div className="login-auth-panel" style={{ background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: isMobile ? '18px' : '32px', gridColumn: isMobile ? 'span 1' : 'span 2' }}>
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
                           <span className="icon-label"><Trash2 size={14} /> Erase</span>
                         </button>
                       )}
                     </div>
                   )
                 })}
               </div>
            </div>

            <div className="login-auth-panel" style={{ background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: isMobile ? '18px' : '32px', gridColumn: isMobile ? 'span 1' : 'span 2' }}>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? '12px' : 0, marginBottom: '24px' }}>
                <h2 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Master Team List ({teams.length})</h2>
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '12px', alignItems: 'center', width: isMobile ? '100%' : 'auto' }}>
                  <div className="login-input-wrap" style={{ width: isMobile ? '100%' : '250px', background: 'rgba(0,0,0,0.2)' }}>
                    <span className="login-input-icon"><Search size={14} /></span>
                    <input 
                      placeholder="Search ID or Name..." 
                      value={teamFilter}
                      onChange={(e) => setTeamFilter(e.target.value)}
                      style={{ background: 'transparent', border: 'none', color: '#fff', padding: '8px' }}
                    />
                  </div>
                  <button 
                    onClick={() => setScanOpen(!scanOpen)} 
                    style={{ width: isMobile ? '100%' : 'auto', background: scanOpen ? 'rgba(239, 68, 68, 0.1)' : 'rgba(99, 102, 241, 0.1)', color: scanOpen ? '#f87171' : '#818cf8', border: 'none', padding: '12px 16px', borderRadius: '12px', cursor: 'pointer', fontWeight: 700 }}
                  >
                    <span className="icon-label" style={{ justifyContent: 'center' }}>{scanOpen ? 'Close Scanner' : <><Radar size={15} /> Scan Failsafe</>}</span>
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
                              <span title="Token Generated" style={{ color: '#34d399', fontSize: '0.9rem', background: 'rgba(52, 211, 153, 0.1)', padding: '4px 8px', borderRadius: '6px' }}><span className="icon-label"><UserRoundCheck size={14} /> SECURE</span></span>
                            ) : (
                              <span title="No Token" style={{ color: '#f87171', fontSize: '0.9rem', background: 'rgba(248, 113, 113, 0.1)', padding: '4px 8px', borderRadius: '6px' }}><span className="icon-label"><XCircle size={14} /> NO TOKEN</span></span>
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
                               <Mail size={14} /> {t.email_count || 0} Emails
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
          <div className="login-auth-panel" style={{ background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: isMobile ? '20px' : '36px' }}>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', marginBottom: isMobile ? '20px' : '32px', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? '14px' : 0 }}>
              <div>
                <h2 style={{ color: '#fff', fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Scoring Mastery Matrix</h2>
                <div style={{ display: isMobile ? 'grid' : 'flex', gridTemplateColumns: isMobile ? '1fr 1fr' : undefined, gap: '8px', marginTop: '8px' }}>
                  <button 
                    onClick={() => { 
                      const next = { ...rules, jury_mode: 'manual' }
                      setRules(next)
                      updateRules(next).then(() => { setStatus('Switched to Manual List mode'); refresh() }).catch(err => setStatus(`Save failed: ${err.message}`))
                    }}
                    style={{ 
                      padding: isMobile ? '10px 12px' : '4px 12px', 
                      fontSize: isMobile ? '0.85rem' : '0.75rem', 
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
                      updateRules(next).then(() => { setStatus('Switched to QR Scan mode'); refresh() }).catch(err => setStatus(`Save failed: ${err.message}`))
                    }}
                    style={{ 
                      padding: isMobile ? '10px 12px' : '4px 12px', 
                      fontSize: isMobile ? '0.85rem' : '0.75rem', 
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
              <button onClick={exportScoresToExcel} className="login-tab active" style={{ background: 'rgba(96, 165, 240, 0.2)', color: '#60a5fa', width: isMobile ? '100%' : 'auto', textAlign: 'center' }}><span className="icon-label" style={{ justifyContent: 'center' }}><Download size={15} /> Download Detailed Sheet</span></button>
            </div>
            
            <div className="sheet-wrap" style={{ borderRadius: '20px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto' }}>
              <table className="sheet-table" style={{ minWidth: isMobile ? '920px' : '1150px', fontSize: isMobile ? '0.85rem' : undefined }}>
                <thead>
                  <tr>
                    <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', padding: '18px' }}>Team</th>
                    <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '18px' }}>GitHub Lock</th>
                    <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '18px' }}>Docs Lock</th>
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

                        <td style={{ textAlign: 'center', padding: '18px' }}>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#fff', fontSize: '0.8rem', cursor: verifyingTeamId === t.team_id ? 'not-allowed' : 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={!!t.github_verified}
                              disabled={verifyingTeamId === t.team_id}
                              onChange={() => handleVerificationToggle(t, 'github_verified')}
                              style={{ width: '16px', height: '16px' }}
                            />
                            {t.github_verified ? `${githubMax}/${githubMax}` : 'Auto'}
                          </label>
                        </td>

                        <td style={{ textAlign: 'center', padding: '18px' }}>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#fff', fontSize: '0.8rem', cursor: verifyingTeamId === t.team_id ? 'not-allowed' : 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={!!t.documentation_verified}
                              disabled={verifyingTeamId === t.team_id}
                              onChange={() => handleVerificationToggle(t, 'documentation_verified')}
                              style={{ width: '16px', height: '16px' }}
                            />
                            {t.documentation_verified ? `${documentationMax}/${documentationMax}` : 'Auto'}
                          </label>
                        </td>
                        
                        {juryNames.map(name => {
                          const s = teamScores.find(sc => sc.teacher_name === name)
                          if (s) {
                            sum += getAdjustedTeacherTotal(s, t)
                            count++
                          }
                          return (
                            <td key={name} style={{ textAlign: 'center', color: s ? '#fff' : 'rgba(255,255,255,0.1)' }}>
                              {s ? getAdjustedTeacherTotal(s, t).toFixed(1) : '-'}
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
            <div className="sheet-wrap" style={{ borderRadius: '20px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table className="sheet-table" style={{ minWidth: 640 }}>
                <thead>
                  <tr>
                    <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', padding: '18px' }}>User / Designation</th>
                    <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', padding: '18px' }}>Status</th>
                    <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', textAlign: 'right', padding: '18px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((acc) => {
                    const isApproved = !!(acc && (acc.status === 'approved' || acc.approved || acc.is_approved));
                    return (
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
                            background: isApproved ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            color: isApproved ? '#10b981' : '#f87171',
                            fontWeight: 700
                          }}>
                            {isApproved ? 'ACTIVE' : 'PENDING'}
                          </span>
                        </td>
                        <td style={{ padding: '18px', textAlign: 'right' }}>
                          {!isApproved && (
                            <button onClick={() => handleApprove(acc.id)} className="login-tab active" style={{ padding: '6px 14px', fontSize: '0.8rem', marginRight: '8px' }}>Approve</button>
                          )}
                          <button onClick={() => handleReject(acc.id)} className="login-tab" style={{ padding: '6px 14px', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171' }}>Revoke</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: isMobile ? '18px' : '32px' }}>
            <div className="login-auth-panel" style={{ background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: isMobile ? '18px' : '36px' }}>
              <h2 style={{ color: '#fff', fontSize: '1.6rem', fontWeight: 700, marginBottom: '32px' }}>Event Protocols</h2>
              <div className="stack" style={{ gap: '28px' }}>
                <div className="login-field">
                  <label style={{ color: '#fff', marginBottom: '8px' }}>Protocol Name</label>
                  <div className="login-input-wrap">
                    <input type="text" value={rules.name || ''} onChange={(e) => setRules({ ...rules, name: e.target.value })} placeholder="Hackathon Standard" />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
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
                        updateRules(next).then(() => { setStatus('Switched to Manual List mode'); refresh() }).catch(err => setStatus(`Save failed: ${err.message}`))
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
                        updateRules(next).then(() => { setStatus('Switched to QR Scan mode'); refresh() }).catch(err => setStatus(`Save failed: ${err.message}`))
                      }}
                      className={`login-submit ${rules.jury_mode === 'scan' ? '' : 'secondary'}`}
                      style={{ padding: '12px', fontSize: '0.9rem', background: rules.jury_mode === 'scan' ? '#6366f1' : 'rgba(255,255,255,0.05)', color: rules.jury_mode === 'scan' ? '#fff' : 'rgba(255,255,255,0.4)', opacity: 1 }}
                    >
                      {rules.jury_mode === 'scan' && '● '} QR Scan Only
                    </button>
                  </div>
                  <p className="muted" style={{ marginTop: '12px', fontSize: '0.8rem' }}>
                    {rules.jury_mode === 'scan' 
                      ? <span className="icon-label"><Lock size={13} /> Mandatory: Jury must scan team QR code to grade.</span>
                      : <span className="icon-label"><Unlock size={13} /> Flexible: Jury can pick teams from a searchable list.</span>}
                  </p>
                </div>

                <div className="login-field">
                  <label style={{ color: '#fff', marginBottom: '8px' }}>Penalty per minute (Marks)</label>
                  <div className="login-input-wrap">
                     <span className="login-input-icon"><AlertTriangle size={14} /></span>
                    <input type="number" value={rules.penalty_per_minute || 0} onChange={(e) => setRules({...rules, penalty_per_minute: Number(e.target.value)})} />
                  </div>
                </div>

                <div style={{ padding: '20px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.1)', overflowWrap: 'anywhere' }}>
                   <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
                     <strong>Logic:</strong> Teams will be penalized {rules.penalty_per_minute} marks for every minute they exceed beyond the {rules.max_break_time} min limit.
                   </p>
                </div>

                <button 
                  onClick={() => updateRules({...rules, is_active: true}).then(() => { setStatus('Protocol updated and activated'); refresh() }).catch(err => setStatus(`Save failed: ${err.message}`))}
                  className="login-submit" 
                  style={{ width: '100%', marginTop: '16px' }}
                >
                  Update Active Protocol
                </button>
              </div>
            </div>

            <div className="login-auth-panel" style={{ background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: isMobile ? '18px' : '36px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Managed Protocols</h2>
                  <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.85rem', marginTop: '6px' }}>Create a new protocol or switch the active one here.</p>
                </div>
                <span style={{ padding: '6px 12px', borderRadius: '999px', background: 'rgba(96, 165, 250, 0.12)', color: '#60a5fa', fontSize: '0.8rem', fontWeight: 700 }}>
                  {protocols.length} total
                </span>
              </div>

              <div style={{ display: 'grid', gap: '22px' }}>
                <div style={{ padding: '20px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.18)' }}>
                  <h3 style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 700, marginBottom: '16px' }}>Add New Protocol</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '14px' }}>
                    <div className="login-field">
                      <label style={{ color: '#fff', marginBottom: '8px' }}>Protocol Name</label>
                      <div className="login-input-wrap">
                        <input type="text" value={newProtocol.name} onChange={(e) => setNewProtocol({ ...newProtocol, name: e.target.value })} placeholder="Spring Event Protocol" />
                      </div>
                    </div>
                    <div className="login-field">
                      <label style={{ color: '#fff', marginBottom: '8px' }}>Protocol Logo URL</label>
                      <div className="login-input-wrap">
                        <input type="text" value={newProtocol.event_logo_url} onChange={(e) => setNewProtocol({ ...newProtocol, event_logo_url: e.target.value })} placeholder="https://..." />
                      </div>
                    </div>
                    <div className="login-field">
                      <label style={{ color: '#fff', marginBottom: '8px' }}>Max Break Time</label>
                      <div className="login-input-wrap"><input type="number" value={newProtocol.max_break_time} onChange={(e) => setNewProtocol({ ...newProtocol, max_break_time: Number(e.target.value) })} /></div>
                    </div>
                    <div className="login-field">
                      <label style={{ color: '#fff', marginBottom: '8px' }}>Grace Time</label>
                      <div className="login-input-wrap"><input type="number" value={newProtocol.grace_time} onChange={(e) => setNewProtocol({ ...newProtocol, grace_time: Number(e.target.value) })} /></div>
                    </div>
                    <div className="login-field">
                      <label style={{ color: '#fff', marginBottom: '8px' }}>Penalty / Minute</label>
                      <div className="login-input-wrap"><input type="number" value={newProtocol.penalty_per_minute} onChange={(e) => setNewProtocol({ ...newProtocol, penalty_per_minute: Number(e.target.value) })} /></div>
                    </div>
                    <div className="login-field">
                      <label style={{ color: '#fff', marginBottom: '8px' }}>Jury Mode</label>
                      <div className="login-input-wrap">
                        <select value={newProtocol.jury_mode} onChange={(e) => setNewProtocol({ ...newProtocol, jury_mode: e.target.value })} style={{ width: '100%', background: 'transparent', border: 'none', color: '#fff', outline: 'none' }}>
                          <option value="manual">Manual List</option>
                          <option value="scan">QR Scan Only</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'rgba(255,255,255,0.85)', marginTop: '16px' }}>
                    <input type="checkbox" checked={newProtocol.is_active} onChange={(e) => setNewProtocol({ ...newProtocol, is_active: e.target.checked })} />
                    <span>Activate this protocol immediately</span>
                  </label>
                  <button onClick={handleCreateProtocol} className="login-submit" style={{ marginTop: '18px', width: '100%' }}>
                    Add Protocol
                  </button>
                </div>

                <div className="sheet-wrap" style={{ borderRadius: '20px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <table className="sheet-table">
                    <thead>
                      <tr>
                        <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', padding: '16px' }}>Protocol</th>
                        <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', padding: '16px' }}>Status</th>
                        <th style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', textAlign: 'right', padding: '16px' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {protocols.length === 0 ? (
                        <tr className="sheet-row">
                          <td colSpan="3" style={{ padding: '18px', color: 'rgba(255,255,255,0.55)' }}>No protocols found yet.</td>
                        </tr>
                      ) : protocols.map((protocol) => (
                        <tr key={protocol.id} className="sheet-row">
                          <td style={{ padding: '16px' }}>
                            <strong style={{ color: '#fff', display: 'block' }}>{protocol.name || 'Untitled Protocol'}</strong>
                            <span style={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.8rem' }}>
                              {protocol.max_break_time}m limit · {protocol.penalty_per_minute}pts / min · {protocol.jury_mode === 'scan' ? 'Scan mode' : 'Manual mode'}
                            </span>
                          </td>
                          <td style={{ padding: '16px' }}>
                            <span style={{
                              padding: '4px 10px',
                              borderRadius: '8px',
                              fontSize: '0.75rem',
                              background: protocol.is_active ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255,255,255,0.05)',
                              color: protocol.is_active ? '#10b981' : 'rgba(255,255,255,0.4)',
                              fontWeight: 700
                            }}>
                              {protocol.is_active ? 'ACTIVE' : 'INACTIVE'}
                            </span>
                          </td>
                          <td style={{ padding: '16px', textAlign: 'right' }}>
                            <button
                              onClick={() => handleProtocolToggle(protocol)}
                              className="login-tab"
                              style={{ padding: '6px 14px', fontSize: '0.8rem', background: protocol.is_active ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)', color: protocol.is_active ? '#f87171' : '#60a5fa', marginRight: '8px' }}
                            >
                              {protocol.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              onClick={() => handleProtocolDelete(protocol)}
                              className="login-tab"
                              style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.12)', color: '#f87171' }}
                            >
                              <span className="icon-label" style={{ justifyContent: 'center' }}><Trash2 size={13} /> Delete</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="login-auth-panel" style={{ background: 'rgba(20, 24, 40, 0.72)', backdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '28px', padding: isMobile ? '18px' : '36px' }}>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', marginBottom: '24px', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? '10px' : 0 }}>
                <h2 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 700 }}>Activity Streams (Logs)</h2>
                <button onClick={() => refresh()} className="login-tab active" style={{ padding: '8px 12px', fontSize: '0.85rem', width: isMobile ? '100%' : 'auto' }}>Refresh Logs</button>
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
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(280px, 0.6fr) minmax(400px, 1fr) minmax(400px, 0.9fr)', 
            gap: isMobile ? '16px' : '24px',
            animation: 'fadeIn 0.5s ease-out',
            alignItems: 'start'
          }}>
            {/* Left: List Management & Preview */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '16px' : '24px', flex: '1 1 300px', order: isMobile ? 2 : 1 }}>
              <div className="login-auth-panel" style={{ padding: isMobile ? '16px' : '24px', background: 'rgba(255,255,255,0.02)' }}>
                <h2 style={{ fontSize: '1.4rem', color: '#fff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="icon-label"><Mail size={16} /> Recipient List</span>
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '8px' }}>
                    <label className="login-tab active" style={{ display: 'block', textAlign: 'center', cursor: 'pointer', padding: '10px', background: '#6366f1', fontSize: '0.75rem' }}>
                      New List
                      <input type="file" hidden accept=".csv,.xlsx,.xls" onChange={(e) => handleRecipientImport(e, 'replace')} />
                    </label>
                    <label className="login-tab active" style={{ display: 'block', textAlign: 'center', cursor: 'pointer', padding: '10px', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.3)', fontSize: '0.75rem' }}>
                      Append
                      <input type="file" hidden accept=".csv,.xlsx,.xls" onChange={(e) => handleRecipientImport(e, 'append')} />
                    </label>
                  </div>
                  <button onClick={downloadMailingTemplate} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', padding: '10px', borderRadius: '12px', fontSize: '0.75rem', cursor: 'pointer', marginTop: '4px' }}>
                    <span className="icon-label" style={{ justifyContent: 'center' }}><Download size={14} /> Download Sample Template</span>
                  </button>

                  {/* Manual Recipient Entry */}
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '8px', fontWeight: 600 }}>or Add Manually</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <input 
                        type="text"
                        placeholder="Full Name"
                        value={manualRecipientName}
                        onChange={e => setManualRecipientName(e.target.value)}
                        onKeyPress={e => e.key === 'Enter' && addManualRecipient()}
                        className="login-input"
                        style={{ fontSize: '0.8rem', padding: '8px', background: 'rgba(255,255,255,0.06)', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.12)' }}
                      />
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input 
                          type="email"
                          placeholder="Email"
                          value={manualRecipientEmail}
                          onChange={e => setManualRecipientEmail(e.target.value)}
                          onKeyPress={e => e.key === 'Enter' && addManualRecipient()}
                          className="login-input"
                          style={{ flex: 1, fontSize: '0.8rem', padding: '8px', background: 'rgba(255,255,255,0.06)', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.12)' }}
                        />
                        <button 
                          onClick={addManualRecipient}
                          style={{ background: '#10b981', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, minWidth: '50px' }}>
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {recipients.length > 0 ? (
                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ color: '#4ade80', fontSize: '0.8rem', fontWeight: 600 }}>{recipients.length} Contacts</span>
                      <button onClick={() => { setRecipients([]); setSelectedRecipients([]); setDeliveryStatus({}); setPreviewIndex(0); }} style={{ color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', fontSize: '0.7rem', cursor: 'pointer', textDecoration: 'underline' }}>Clear All</button>
                    </div>

                    <div className="custom-scroll" style={{ maxHeight: isMobile ? '280px' : '350px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead style={{ position: 'sticky', top: 0, background: '#1e293b', zIndex: 1 }}>
                          <tr>
                            <th style={{ padding: '10px', textAlign: 'left', width: '30px' }}>
                              <input 
                                type="checkbox" 
                                checked={selectedRecipients.length === recipients.length} 
                                onChange={(e) => setSelectedRecipients(e.target.checked ? recipients.map(r => r.email) : [])} 
                                style={{ width: isMobile ? '18px' : undefined, height: isMobile ? '18px' : undefined }}
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
                                    style={{ width: isMobile ? '18px' : undefined, height: isMobile ? '18px' : undefined }}
                                  />
                                </td>
                                <td style={{ padding: '8px 10px' }}>
                                  <div style={{ color: '#fff', fontWeight: 600 }}>{r.name || 'No Name'}</div>
                                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>{r.email}</div>
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                  {status?.status === 'success' && <span title="Sent Successfully"><CheckCircle2 size={15} color="#34d399" /></span>}
                                  {status?.status === 'failed' && <span title={status.error} style={{ cursor: 'help' }}><XCircle size={15} color="#f87171" /></span>}
                                  {!status && <span style={{ opacity: 0.2 }}>-</span>}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Scheduled Mails List */}
              <div className="login-auth-panel" style={{ padding: isMobile ? '16px' : '24px', background: 'rgba(255,255,255,0.02)' }}>
                <h2 style={{ fontSize: '1.2rem', color: '#fff', marginBottom: '16px' }}><span className="icon-label"><Activity size={16} /> Scheduled Blasts ({scheduledMails.length})</span></h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto' }}>
                  {scheduledMails.map(m => (
                    <div key={m.id} style={{ padding: '12px', borderRadius: '12px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 600 }}>{m.subject}</span>
                        {m.status === 'pending' ? (
                          <button onClick={() => deleteScheduledEmail(m.id)} style={{ color: '#f87171', background: 'none', border: 'none', fontSize: '0.75rem', cursor: 'pointer' }}>Cancel</button>
                        ) : (
                          <span className="muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase' }}>{m.status}</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                        <span style={{ color: '#60a5fa' }}>{new Date(m.scheduled_at).toLocaleString()}</span>
                        <span className="muted">{m.recipients?.length || 0} users</span>
                      </div>
                    </div>
                  ))}
                  {scheduledMails.length === 0 && <p className="muted" style={{ textAlign: 'center', fontSize: '0.85rem', padding: '20px' }}>No active schedules</p>}
                </div>
              </div>
            </div>

            {/* Middle: Composer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '16px' : '24px', order: isMobile ? 1 : 2 }}>
              <div className="login-auth-panel" style={{ padding: isMobile ? '18px' : '28px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h2 style={{ fontSize: '1.2rem', color: '#fff', margin: 0 }}>✍️ Creator Studio</h2>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>Draft Auto-saved locally</span>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '6px' }}>From Name</label>
                      <input className="login-input" style={{ fontSize: '0.85rem', padding: '10px', background: 'rgba(255,255,255,0.06)', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.12)' }} placeholder="e.g. LRNit Team" value={mailFromName} onChange={e => setMailFromName(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '6px' }}>Reply-to Email</label>
                      <input className="login-input" style={{ fontSize: '0.85rem', padding: '10px', background: 'rgba(255,255,255,0.06)', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.12)' }} placeholder="e.g. admin@lrnit.in" value={mailFromEmail} onChange={e => setMailFromEmail(e.target.value)} />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '6px' }}>Mail Subject</label>
                    <input className="login-input" style={{ fontSize: '0.9rem', padding: '12px', background: 'rgba(255,255,255,0.06)', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.12)' }} placeholder="Enter email subject..." value={mailSubject} onChange={e => setMailSubject(e.target.value)} />
                  </div>

                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '16px', padding: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    {/* Toolbar inspired by Unstop */}
                    <div style={{ display: 'flex', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '12px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {['B', 'I', 'U'].map(btn => (
                           <button
                            key={btn}
                            type="button"
                            onClick={() => {
                              if (btn === 'B') applyMailCommand('bold')
                              if (btn === 'I') applyMailCommand('italic')
                              if (btn === 'U') applyMailCommand('underline')
                            }}
                            style={{ width: '28px', height: '28px', background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '0.8rem', fontWeight: btn === 'B' ? 800 : 400, fontStyle: btn === 'I' ? 'italic' : 'normal', textDecoration: btn === 'U' ? 'underline' : 'none', cursor: 'pointer' }}
                           >
                            {btn}
                           </button>
                        ))}
                      </div>
                      <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
                      <select
                        value={mailFontFamily}
                        onChange={(e) => {
                          setMailFontFamily(e.target.value)
                          applyMailCommand('fontName', e.target.value)
                        }}
                        style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: 'none', fontSize: '0.75rem', borderRadius: '4px', padding: '0 6px', minHeight: '28px' }}
                      >
                        <option value="Arial">Arial</option>
                        <option value="Verdana">Verdana</option>
                        <option value="Georgia">Georgia</option>
                        <option value="Times New Roman">Times New Roman</option>
                        <option value="Trebuchet MS">Trebuchet MS</option>
                      </select>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {['Congrats', 'Update', 'Important', 'Location'].map(token => (
                          <button key={token} onClick={() => insertEmoji(` ${token} `)} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', fontSize: '0.72rem', color: '#cbd5e1', borderRadius: '999px', padding: '4px 8px' }}>{token}</button>
                        ))}
                      </div>
                      <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
                      <select
                        value={mailFontSize}
                        onChange={(e) => {
                          setMailFontSize(e.target.value)
                          applyMailFontSize(Number(e.target.value))
                        }}
                        style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: 'none', fontSize: '0.75rem', borderRadius: '4px', padding: '0 6px', minHeight: '28px' }}
                      >
                        <option value="12">12pt</option>
                        <option value="14">14pt</option>
                        <option value="16">16pt</option>
                        <option value="18">18pt</option>
                      </select>
                    </div>

                    <div style={{ position: 'relative', minHeight: '300px' }}>
                      {!mailContent && (
                        <div style={{ position: 'absolute', top: '12px', left: '12px', color: 'rgba(255,255,255,0.35)', fontSize: '0.9rem', pointerEvents: 'none' }}>
                          {'Write your main content here... Use {{name}} to personalize.'}
                        </div>
                      )}
                      <div
                        ref={mailEditorRef}
                        contentEditable
                        suppressContentEditableWarning
                        onInput={(e) => setMailContent(e.currentTarget.innerHTML)}
                        className="login-input"
                        style={{ width: '100%', minHeight: '300px', resize: 'vertical', padding: '12px', lineHeight: '1.6', background: 'transparent', border: 'none', color: '#fff', outline: 'none', whiteSpace: 'pre-wrap' }}
                      />
                    </div>
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

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(180px, 1fr) auto', gap: '12px', alignItems: 'end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>Signature Logo</label>
                      <label className="login-tab active" style={{ display: 'block', textAlign: 'center', cursor: 'pointer', padding: '10px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        Upload Signature Logo
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

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>Attachments (jpg, png, pdf, doc, docx, xls, xlsx)</label>
                    <label className="login-tab active" style={{ display: 'inline-block', width: 'fit-content', cursor: 'pointer', padding: '8px 12px', fontSize: '0.78rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}>
                      Add Attachments
                      <input type="file" hidden multiple accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.xls,.xlsx" onChange={onAttachmentPick} />
                    </label>
                    {mailAttachments.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {mailAttachments.map((file) => (
                          <div key={file.name} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '999px', padding: '6px 10px', color: '#cbd5e1', fontSize: '0.75rem' }}>
                            <span>{file.name}</span>
                            <button type="button" onClick={() => setMailAttachments(prev => prev.filter(a => a.name !== file.name))} style={{ border: 'none', background: 'transparent', color: '#f87171', cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1 }}>x</button>
                          </div>
                        ))}
                      </div>
                    )}
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
                        <span className="icon-label"><AlertTriangle size={14} /> <strong>{Object.values(deliveryStatus).filter(s => s.status === 'failed').length} Emails Failed</strong></span>
                        <p style={{ margin: '4px 0 0 0', opacity: 0.7, fontSize: '0.75rem' }}>IDs: {Object.entries(deliveryStatus).filter(([_, s]) => s.status === 'failed').map(([email, _]) => email.split('@')[0]).slice(0, 3).join(', ')}...</p>
                      </div>
                      <button 
                        onClick={() => handleSendCustomBatch(true)} 
                        className="login-tab active" 
                        style={{ background: '#f87171', color: '#fff', fontSize: '0.75rem', padding: '6px 12px' }}
                      >
                        <span className="icon-label"><RotateCcw size={13} /> Resend to Failed</span>
                      </button>
                    </div>
                  )}

                  <button 
                    onClick={() => handleSendCustomBatch()}
                    disabled={sendingCustom || (recipients.length === 0 && selectedRecipients.length === 0)}
                    className="login-submit"
                    style={{ minHeight: '50px', background: scheduledAt ? '#10b981' : '#6366f1', color: '#fff', padding: '0 24px', fontSize: isMobile ? '1rem' : '0.9rem', marginTop: '12px' }}
                  >
                    {sendingCustom ? <span className="icon-label" style={{ justifyContent: 'center' }}><LoaderCircle size={15} /> Sending...</span> : scheduledAt ? 'Schedule Campaign' : selectedRecipients.length > 0 ? `Blast to ${selectedRecipients.length} Selected` : `Blast to All (${recipients.length})`}
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Unstop-style Live Preview */}
            <div style={{ position: isMobile ? 'static' : 'sticky', top: '24px', display: 'flex', flexDirection: 'column', gap: '16px', order: 3 }}>
              <div style={{ background: '#f8fafc', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', animation: 'fadeIn 0.5s ease-out' }}>
                  {/* Browser-like navigation bar */}
              <div style={{ background: '#fff', padding: '10px 16px', display: isMobile ? 'none' : 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #e2e8f0' }}>
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

                  {isMobile && (
                    <div style={{ background: '#fff', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0' }}>
                      <strong style={{ color: '#334155', fontSize: '0.85rem' }}>Live Mail Preview</strong>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button onClick={() => setPreviewIndex(prev => Math.max(0, prev - 1))} style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '8px', padding: '4px 8px', cursor: 'pointer' }}>◀</button>
                        <span style={{ color: '#334155', fontSize: '0.8rem', fontWeight: 700 }}>{recipients.length > 0 ? `${previewIndex + 1}/${recipients.length}` : '0/0'}</span>
                        <button onClick={() => setPreviewIndex(prev => Math.min(recipients.length - 1, prev + 1))} style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '8px', padding: '4px 8px', cursor: 'pointer' }}>▶</button>
                      </div>
                    </div>
                  )}

                  {/* The Email Wrapper */}
                  <div style={{ padding: isMobile ? '10px' : '24px', background: '#e2e8f0', minHeight: isMobile ? '380px' : '500px', display: 'flex', justifyContent: 'center' }}>
                    <iframe
                      title="Email preview"
                      style={{ width: '100%', minHeight: isMobile ? '480px' : '640px', border: 'none', borderRadius: '12px', background: '#fff' }}
                      srcDoc={getPreviewHtml()}
                    />
                  </div>
               </div>
               <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', marginTop: '16px' }}>
                 This is how the email will look in your participants' inbox.
               </p>
            </div>
          </div>
        )}
        <Toast message={toast.message} type={toast.type} visible={toast.visible} onClose={() => setToast({ ...toast, visible: false })} />
      </main>
    </div>
  )
}
