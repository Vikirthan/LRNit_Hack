import { hasSupabaseConfig, supabase } from '../config/supabase'
import { generateTeamQrToken, sendAbsentAlert as sendAbsentAlertFunction, sendCustomEmail, sendOverdueAlert, sendTeamQrEmail } from './supabaseFunctions'
import { ADMIN_VERIFICATION_CRITERIA, TEACHER_CRITERIA } from '../constants/teacherCriteria'
export { generateTeamQrToken }

const LOCAL_TEAMS_KEY = 'ticketscan-local-teams'
const LOCAL_TEAM_VERIFICATION_KEY = 'ticketscan-team-verification-locks'
const LOCAL_PROTOCOLS_KEY = 'ticketscan-local-protocols'
const LEGACY_RULES_KEY = 'ticketscan-local-rules'

const defaultRules = {
  max_break_time: 30,
  grace_time: 5,
  penalty_per_minute: 1,
  overdue_email_enabled: false,
  jury_mode: 'manual', // 'manual' or 'scan'
  is_active: true,
  event_logo_url: null,
}

const defaultProtocolName = 'Hackathon Standard'

function normalizeProtocol(protocol = {}) {
  const id = protocol.id ?? protocol.protocol_id ?? protocol.key ?? null
  return {
    id,
    name: protocol.name || protocol.protocol_name || defaultProtocolName,
    max_break_time: Number(protocol.max_break_time ?? defaultRules.max_break_time),
    grace_time: Number(protocol.grace_time ?? defaultRules.grace_time),
    penalty_per_minute: Number(protocol.penalty_per_minute ?? defaultRules.penalty_per_minute),
    overdue_email_enabled: Boolean(protocol.overdue_email_enabled ?? defaultRules.overdue_email_enabled),
    jury_mode: protocol.jury_mode || defaultRules.jury_mode,
    is_active: Boolean(protocol.is_active ?? true),
    event_logo_url: protocol.event_logo_url ?? null,
    created_at: protocol.created_at || new Date().toISOString(),
    updated_at: protocol.updated_at || new Date().toISOString(),
  }
}

function protocolToRulePayload(protocol = {}) {
  const normalized = normalizeProtocol(protocol)
  return {
    ...normalized,
    // Keep the payload backwards compatible with older callers that expect a single rules object.
    key: protocol.key || 'rules',
  }
}

function protocolFromLegacyRules(rules = {}) {
  return normalizeProtocol({
    id: 'legacy-rules',
    name: rules.name || defaultProtocolName,
    ...defaultRules,
    ...rules,
    is_active: rules.is_active ?? true,
  })
}

function readLocalProtocols() {
  try {
    const raw = window.localStorage.getItem(LOCAL_PROTOCOLS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(normalizeProtocol)
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_RULES_KEY)
    if (legacyRaw) {
      return [protocolFromLegacyRules(JSON.parse(legacyRaw))]
    }

    return [normalizeProtocol({ id: 'default', name: defaultProtocolName, is_active: true })]
  } catch {
    return [normalizeProtocol({ id: 'default', name: defaultProtocolName, is_active: true })]
  }
}

function writeLocalProtocols(protocols) {
  try {
    window.localStorage.setItem(LOCAL_PROTOCOLS_KEY, JSON.stringify(protocols.map(normalizeProtocol)))
  } catch {
    // Ignore storage failures.
  }
}

function setOneProtocolActive(protocols, protocolId) {
  return protocols.map((protocol) => ({
    ...protocol,
    is_active: protocol.id === protocolId,
  }))
}

async function canUseSupabaseProtocolWrites() {
  if (!hasSupabaseConfig || !supabase) return false

  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      console.warn('canUseSupabaseProtocolWrites: failed to get session', error)
      return false
    }
    return Boolean(data?.session?.user?.id)
  } catch (err) {
    console.warn('canUseSupabaseProtocolWrites: unexpected session error', err)
    return false
  }
}

async function persistProtocolActivation(protocolId) {
  if (!supabase) return

  const { error: deactivateError } = await supabase
    .from('event_protocols')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('is_active', true)

  if (deactivateError) throw deactivateError

  const { error: activateError } = await supabase
    .from('event_protocols')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', protocolId)

  if (activateError) throw activateError
}

async function persistLocalProtocolUpdate(protocols, updatedProtocol, activateSelected = false) {
  const nextProtocols = protocols.map((protocol) => {
    if (protocol.id === updatedProtocol.id) {
      return normalizeProtocol(updatedProtocol)
    }
    return activateSelected ? { ...normalizeProtocol(protocol), is_active: false } : normalizeProtocol(protocol)
  })

  if (!nextProtocols.some((protocol) => protocol.id === updatedProtocol.id)) {
    nextProtocols.push(normalizeProtocol(updatedProtocol))
  }

  const normalized = activateSelected ? setOneProtocolActive(nextProtocols, updatedProtocol.id) : nextProtocols
  writeLocalProtocols(normalized)
  return normalized
}

async function persistProtocolToBackend(protocol, { activate = false } = {}) {
  if (!supabase) return normalizeProtocol(protocol)

  const shouldActivate = activate || Boolean(protocol.is_active)
  const payload = {
    name: protocol.name || defaultProtocolName,
    max_break_time: Number(protocol.max_break_time ?? defaultRules.max_break_time),
    grace_time: Number(protocol.grace_time ?? defaultRules.grace_time),
    penalty_per_minute: Number(protocol.penalty_per_minute ?? defaultRules.penalty_per_minute),
    overdue_email_enabled: Boolean(protocol.overdue_email_enabled ?? defaultRules.overdue_email_enabled),
    jury_mode: protocol.jury_mode || defaultRules.jury_mode,
    is_active: false,
    event_logo_url: protocol.event_logo_url ?? null,
    updated_at: new Date().toISOString(),
  }

  if (protocol.id && protocol.id !== 'default' && protocol.id !== 'legacy-rules') {
    payload.id = protocol.id
  }

  const writeResult = payload.id
    ? await supabase.from('event_protocols').upsert(payload, { onConflict: 'id' }).select('*').maybeSingle()
    : await supabase.from('event_protocols').insert(payload).select('*').maybeSingle()

  const { data, error } = writeResult

  if (error) throw error
  const saved = normalizeProtocol(data || payload)

  if (shouldActivate) {
    if (!saved.id) throw new Error('Saved protocol is missing an ID')
    await persistProtocolActivation(saved.id)
    return { ...saved, is_active: true }
  }

  return saved
}

async function loadProtocolsFromBackend() {
  if (!supabase) return readLocalProtocols()

  const { data, error } = await supabase
    .from('event_protocols')
    .select('*')
    .order('is_active', { ascending: false })
    .order('updated_at', { ascending: false })

  if (error) throw error

  const mapped = (data ?? []).map(normalizeProtocol)
  if (mapped.length === 0) return readLocalProtocols()

  writeLocalProtocols(mapped)
  return mapped
}

async function persistProtocolSetActive(protocolId) {
  if (!protocolId) throw new Error('Protocol ID is required')
  if (!supabase) {
    const next = setOneProtocolActive(readLocalProtocols(), protocolId)
    writeLocalProtocols(next)
    return next
  }

  await persistProtocolActivation(protocolId)
  const refreshed = await loadProtocolsFromBackend()
  return refreshed
}

const CRITERIA_MAX_BY_KEY = TEACHER_CRITERIA.reduce((acc, criterion) => {
  acc[criterion.key] = criterion.max
  return acc
}, ADMIN_VERIFICATION_CRITERIA.reduce((acc, criterion) => {
  acc[criterion.key] = criterion.max
  return acc
}, {}))

function applyVerificationToScores(scores = {}, locks = {}) {
  const next = { ...scores }

  if (locks.github_verified) {
    next.github = CRITERIA_MAX_BY_KEY.github ?? 10
  }

  if (locks.documentation_verified) {
    next.documentation = CRITERIA_MAX_BY_KEY.documentation ?? 10
  }

  return next
}

function computeTeacherTotal(scores = {}) {
  return TEACHER_CRITERIA.reduce((sum, criterion) => {
    const raw = Number(scores[criterion.key])
    const bounded = Number.isNaN(raw) ? 0 : Math.max(0, Math.min(criterion.max, raw))
    return sum + bounded
  }, 0)
}

async function reconcileTeamScoreLocks(teamId, locks) {
  if (!supabase) return

  const { data, error } = await supabase
    .from('teacher_scores')
    .select('id, problem_understanding, novelty, technical_depth, social_relevance, presentation, github, documentation')
    .eq('team_id', teamId)

  if (error) {
    console.warn('reconcileTeamScoreLocks: failed to fetch teacher scores', error)
    return
  }

  const updates = (data ?? [])
    .map((row) => {
      const effective = applyVerificationToScores(row, locks)
      const nextGithub = Number(effective.github) || 0
      const nextDocumentation = Number(effective.documentation) || 0
      const nextTotal = computeTeacherTotal(effective)

      if (nextGithub === (Number(row.github) || 0) && nextDocumentation === (Number(row.documentation) || 0) && nextTotal === computeTeacherTotal(row)) {
        return null
      }

      return {
        id: row.id,
        github: nextGithub,
        documentation: nextDocumentation,
        total: nextTotal,
        updated_at: new Date().toISOString(),
      }
    })
    .filter(Boolean)

  if (updates.length === 0) return

  const { error: updateError } = await supabase.from('teacher_scores').upsert(updates, { onConflict: 'id' })
  if (updateError) {
    console.warn('reconcileTeamScoreLocks: failed to persist teacher score updates', updateError)
  }
}

function readLocalTeams() {
  try {
    const raw = window.localStorage.getItem(LOCAL_TEAMS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeLocalTeams(teams) {
  try {
    window.localStorage.setItem(LOCAL_TEAMS_KEY, JSON.stringify(teams))
  } catch {
    // Ignore local storage failures in demo mode.
  }
}

function readTeamVerificationLocks() {
  try {
    const raw = window.localStorage.getItem(LOCAL_TEAM_VERIFICATION_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeTeamVerificationLocks(locks) {
  try {
    window.localStorage.setItem(LOCAL_TEAM_VERIFICATION_KEY, JSON.stringify(locks))
  } catch {
    // Ignore storage failures
  }
}

function mergeLocalTeam(team) {
  const teams = readLocalTeams()
  const nextTeam = {
    team_id: team.team_id,
    team_name: team.team_name,
    members_count: Number(team.members_count) || 0,
    room_number: team.room_number || '',
    penalty_points: Number(team.penalty_points) || 0,
    qr_version: Number(team.qr_version) || 1,
    active_out: team.active_out ?? null,
    emails: Array.isArray(team.emails) ? team.emails : [],
    created_at: team.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const existingIndex = teams.findIndex((item) => item.team_id === nextTeam.team_id)
  if (existingIndex >= 0) {
    teams[existingIndex] = { ...teams[existingIndex], ...nextTeam }
  } else {
    teams.push(nextTeam)
  }

  writeLocalTeams(teams)
  return nextTeam
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildAbsentAlertHtml(team, ticketUrl) {
  const teamName = escapeHtml(team?.team_name || 'Team')
  const room = escapeHtml(team?.room_number || 'TBA')
  const members = Number(team?.members_count || 0)
  const safeTicketUrl = escapeHtml(ticketUrl)

  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;padding:24px;border:1px solid #fde68a;border-radius:14px;background:#fffbeb;">
      <h2 style="margin:0 0 10px;color:#92400e;">Report to Arena Immediately</h2>
      <p style="margin:0 0 16px;color:#78350f;">Hello <strong>${teamName}</strong>,</p>
      <p style="margin:0 0 14px;color:#78350f;line-height:1.6;">Your team is currently marked absent from the arena. Please return as soon as possible for attendance verification.</p>
      <ul style="margin:0 0 16px;padding-left:20px;color:#78350f;line-height:1.7;">
        <li>Room: <strong>${room}</strong></li>
        <li>Members expected: <strong>${members}</strong></li>
        <li>Keep your team QR ready for verification.</li>
      </ul>
      <p style="margin:0 0 18px;">
        <a href="${safeTicketUrl}" style="display:inline-block;background:#d97706;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">View Team QR Ticket</a>
      </p>
      <p style="margin:0;color:#92400e;font-size:13px;">If you are already in the arena, contact the help desk for a status refresh.</p>
    </div>
  `
}

async function sendAbsentAlertFallback(teamId, baseUrl) {
  if (!supabase) throw new Error('Supabase is not configured yet')

  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('team_id, team_name, room_number, members_count, qr_token, team_emails(email)')
    .eq('team_id', teamId)
    .maybeSingle()

  if (teamError) throw teamError
  if (!team) throw new Error('Team not found')

  const emails = (team.team_emails || []).map((item) => item?.email).filter(Boolean)
  if (emails.length === 0) {
    return { success: false, error: 'No emails found for this team', fallback: true }
  }

  const origin = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
  const ticketUrl = `${origin}/scan?token=${team.qr_token || 'missing'}`
  const subject = `URGENT: Please Report to Hackathon Arena - Team ${team.team_name}`
  const htmlContent = buildAbsentAlertHtml(team, ticketUrl)
  const plainContent = [
    `Hello ${team.team_name},`,
    '',
    'You are currently marked absent from the arena.',
    `Please report to room ${team.room_number || 'TBA'} immediately with your team QR ticket.`,
    ticketUrl,
  ].join('\n')

  let sent = 0
  let failed = 0
  let lastError = null

  for (const email of emails) {
    try {
      const response = await sendCustomEmail({
        email,
        name: team.team_name,
        subject,
        content: plainContent,
        htmlContent,
        signature: 'Aethera X Organizing Team',
      })

      if (!response?.success) {
        throw new Error(response?.error || 'Failed to send absent alert email')
      }
      sent++
    } catch (error) {
      failed++
      lastError = error
    }
  }

  return {
    success: failed === 0,
    fallback: true,
    sent,
    failed,
    error: lastError?.message,
  }
}

function normalizeJuryTeam(team = {}) {
  return {
    team_id: team.team_id,
    team_name: team.team_name,
    room_number: team.room_number || '',
    is_present: Boolean(team.is_present),
    github_verified: Boolean(team.github_verified),
    documentation_verified: Boolean(team.documentation_verified),
    updated_at: team.updated_at || new Date().toISOString(),
  }
}

const LOCAL_RULES_KEY = 'ticketscan-local-rules'

function readLocalRules() {
  try {
    const raw = window.localStorage.getItem(LOCAL_RULES_KEY)
    return raw ? { ...defaultRules, ...JSON.parse(raw) } : { ...defaultRules }
  } catch {
    return { ...defaultRules }
  }
}

function writeLocalRules(rules) {
  try {
    window.localStorage.setItem(LOCAL_RULES_KEY, JSON.stringify(rules))
  } catch {
    // Ignore storage failures
  }
}

export async function getRules() {
  try {
    const protocols = await getProtocols()
    const activeProtocol = protocols.find((protocol) => protocol.is_active)
    if (activeProtocol) return activeProtocol

    const latestProtocol = protocols[0]
    if (latestProtocol) {
      return {
        ...latestProtocol,
        is_active: false,
      }
    }

    return normalizeProtocol({ id: 'default', name: defaultProtocolName, is_active: false })
  } catch (err) {
    console.warn('getRules: falling back to local protocol cache', err)
    const localProtocols = readLocalProtocols()
    const activeLocalProtocol = localProtocols.find((protocol) => protocol.is_active)
    if (activeLocalProtocol) return activeLocalProtocol

    if (localProtocols[0]) {
      return {
        ...localProtocols[0],
        is_active: false,
      }
    }

    return normalizeProtocol({ id: 'default', name: defaultProtocolName, is_active: false })
  }
}

export async function saveRules(payload) {
  try {
    const protocols = readLocalProtocols()
    const current = protocols.find((protocol) => protocol.id === payload.id) || protocols.find((protocol) => protocol.is_active) || protocols[0]
    const nextProtocol = normalizeProtocol({
      ...current,
      ...payload,
      id: payload.id || current?.id || 'default',
    })

    const nextProtocols = await persistLocalProtocolUpdate(protocols, nextProtocol, Boolean(nextProtocol.is_active))
    writeLocalProtocols(nextProtocols)

    if (!(await canUseSupabaseProtocolWrites())) return nextProtocol

    const saved = await persistProtocolToBackend(nextProtocol, { activate: Boolean(nextProtocol.is_active) })
    await loadProtocolsFromBackend()
    return saved
  } catch (err) {
    console.warn('saveRules: failed to save protocol', err)
    throw err
  }
}

export async function getProtocols() {
  if (!hasSupabaseConfig || !supabase) return readLocalProtocols()
  try {
    return await loadProtocolsFromBackend()
  } catch (err) {
    console.warn('getProtocols: falling back to local protocol cache', err)
    return readLocalProtocols()
  }
}

export async function createProtocol(payload) {
  const protocolId = payload?.id || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : null)
  const protocol = normalizeProtocol({
    name: payload?.name || defaultProtocolName,
    ...defaultRules,
    ...payload,
    id: protocolId,
    is_active: Boolean(payload?.is_active),
  })

  const localProtocols = readLocalProtocols()
  const nextLocal = protocol.is_active
    ? setOneProtocolActive([...localProtocols.filter((item) => item.id !== protocol.id), protocol], protocol.id)
    : [...localProtocols.filter((item) => item.id !== protocol.id), protocol]
  writeLocalProtocols(nextLocal)

  if (!(await canUseSupabaseProtocolWrites())) return protocol

  const saved = await persistProtocolToBackend(protocol, { activate: protocol.is_active })
  await loadProtocolsFromBackend()
  return saved
}

export async function activateProtocol(protocolId) {
  if (!(await canUseSupabaseProtocolWrites())) {
    const next = setOneProtocolActive(readLocalProtocols(), protocolId)
    writeLocalProtocols(next)
    return next
  }
  return persistProtocolSetActive(protocolId)
}

export async function deactivateProtocol(protocolId) {
  if (!protocolId) throw new Error('Protocol ID is required')

  if (!(await canUseSupabaseProtocolWrites())) {
    const next = readLocalProtocols().map((protocol) => (
      protocol.id === protocolId ? { ...protocol, is_active: false, updated_at: new Date().toISOString() } : protocol
    ))
    writeLocalProtocols(next)
    return next
  }

  const { error } = await supabase
    .from('event_protocols')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', protocolId)

  if (error) throw error
  return loadProtocolsFromBackend()
}

export async function deleteProtocol(protocolId) {
  if (!protocolId) throw new Error('Protocol ID is required')
  if (!(await canUseSupabaseProtocolWrites())) {
    const next = readLocalProtocols().filter((protocol) => protocol.id !== protocolId)
    writeLocalProtocols(next.length ? next : [normalizeProtocol({ id: 'default', name: defaultProtocolName, is_active: true })])
    return true
  }

  const { error } = await supabase.from('event_protocols').delete().eq('id', protocolId)
  if (error) throw error
  return true
}

export async function upsertTeam(team) {
  return upsertTeams([team])
}

export async function upsertTeams(teams) {
  if (!supabase) {
    for (const t of teams) mergeLocalTeam(t)
    return null
  }

  try {
    const ids = teams.map((t) => t.team_id)
    const { data: existingData, error: fetchError } = await supabase
      .from('teams')
      .select('team_id, penalty_points, active_out')
      .in('team_id', ids)

    if (fetchError) throw fetchError

    const existingMap = new Map((existingData ?? []).map((t) => [t.team_id, t]))
    const date = new Date().toISOString()

    const teamRows = teams.map((t) => {
      const existing = existingMap.get(t.team_id)
      return {
        team_id: t.team_id,
        team_name: t.team_name,
        members_count: t.members_count,
        room_number: t.room_number,
        penalty_points: existing?.penalty_points ?? 0,
        active_out: existing?.active_out ?? null,
        source_file: t.source_file || null,
        updated_at: date,
      }
    })

    const { error } = await supabase.from('teams').upsert(teamRows, { onConflict: 'team_id' })
    if (error) {
      console.error('Failed to batch upsert teams:', error)
      throw error
    }

    const emailRows = []
    console.log(`[Import] Processing ${teams.length} teams for emails...`)
    for (const t of teams) {
      if (Array.isArray(t.emails) && t.emails.length) {
        console.log(`[Import] Team ${t.team_id} has emails:`, t.emails)
        t.emails.forEach((email) => {
          emailRows.push({ team_id: t.team_id, email })
        })
      } else {
        console.warn(`[Import] Team ${t.team_id} has NO emails in the parsed object!`)
      }
    }

    if (emailRows.length) {
      try {
        console.log(`[Import] Deleting old emails for ${ids.length} teams...`)
        await supabase.from('team_emails').delete().in('team_id', ids)
        
        console.log(`[Import] Inserting ${emailRows.length} email records...`)
        const { error: emailError } = await supabase.from('team_emails').insert(emailRows)
        
        if (emailError) {
          console.error('[Import] ERROR inserting emails:', emailError)
          alert("Import partially failed: Teams saved but emails blocked by database. Check RLS or permissions.")
        } else {
          console.log('[Import] Successfully inserted all emails.')
        }
      } catch (e) {
        console.error('[Import] CRITICAL error handling emails:', e)
      }
    } else {
      console.warn('[Import] No email rows were generated to insert.')
    }

    const firstToken = teams.length === 1 ? await generateTeamQrToken(teams[0].team_id).then(r => r.token).catch(() => null) : null
    
    // Also update local cache for smooth UI
    for (const t of teamRows) {
        const fullTeam = teams.find(st => st.team_id === t.team_id)
        mergeLocalTeam({ ...t, emails: fullTeam?.emails || [] })
    }

    return firstToken
  } catch (err) {
    console.error('CRITICAL: upsertTeams failed:', err.message)
    throw err
  }
}

export async function sendQrEmails(teamId, baseUrl) {
  return sendTeamQrEmail(teamId, baseUrl)
}

export async function sendAbsentAlert(teamId, baseUrl) {
  if (!teamId) throw new Error('Team ID is required')
  try {
    return await sendAbsentAlertFunction(teamId, baseUrl)
  } catch (error) {
    const message = String(error?.message || '')
    const isInvokeTransportError = message.includes('ATX_0') || message.includes('Failed to send a request to the Edge Function')

    if (!isInvokeTransportError) throw error

    console.warn('alert-away-teams invocation failed. Falling back to send-custom-email path.', error)
    return sendAbsentAlertFallback(teamId, baseUrl)
  }
}

export async function deleteTeamsBySource(sourceFile) {
  if (!supabase) throw new Error('Supabase is not configured yet')
  if (!sourceFile) throw new Error('Source file name is required')

  const { error } = await supabase
    .from('teams')
    .delete()
    .eq('source_file', sourceFile)

  if (error) throw error
}

export async function verifyScanToken(token) {
  if (!supabase) throw new Error('Supabase is not configured yet')
  // Call edge function and provide clearer error messages when it fails
  const invokeResult = await supabase.functions.invoke('verify-qr-token', {
    body: { token },
  })

  if (invokeResult.error) {
    // Attempt to extract a helpful message from the function response body
    let serverMsg = invokeResult.error.message || 'Edge function error'
    try {
      if (invokeResult.data) {
        const parsed = typeof invokeResult.data === 'string' ? JSON.parse(invokeResult.data) : invokeResult.data
        if (parsed?.error) serverMsg = parsed.error
      }
    } catch (e) {
      // ignore parse errors
    }
    // Log the full invoke result for debugging in browser console
    try { console.error('verify-qr-token invokeResult:', invokeResult) } catch(e) {}
    throw new Error(serverMsg)
  }

  const data = invokeResult.data
  const teamId = data?.teamId
  if (!teamId) throw new Error('Invalid QR token')

  const { data: teamData, error: teamError } = await supabase.from('teams').select('*').eq('team_id', teamId).maybeSingle()
  if (teamError) throw teamError
  if (!teamData) throw new Error('Team not found')

  return teamData
}

export async function verifyJuryScanToken(token) {
  if (!supabase) throw new Error('Supabase is not configured yet')

  const invokeResult = await supabase.functions.invoke('verify-qr-token', {
    body: { token },
  })

  if (invokeResult.error) {
    let serverMsg = invokeResult.error.message || 'Edge function error'
    try {
      if (invokeResult.data) {
        const parsed = typeof invokeResult.data === 'string' ? JSON.parse(invokeResult.data) : invokeResult.data
        if (parsed?.error) serverMsg = parsed.error
      }
    } catch (e) {
      // ignore parse errors
    }
    throw new Error(serverMsg)
  }

  const data = invokeResult.data
  const teamId = data?.teamId
  if (!teamId) throw new Error('Invalid QR token')

  const { data: teamData, error: teamError } = await supabase
    .from('teams')
    .select('team_id, team_name, room_number, is_present, github_verified, documentation_verified, updated_at')
    .eq('team_id', teamId)
    .eq('is_present', true)
    .maybeSingle()

  if (teamError) throw teamError
  if (!teamData) throw new Error('Team has not been admitted by volunteers yet')

  return normalizeJuryTeam(teamData)
}

export async function getAdmittedTeamsForJury() {
  if (!supabase) {
    return readLocalTeams()
      .filter((team) => team.is_present === true)
      .map(normalizeJuryTeam)
  }

  const { data, error } = await supabase
    .from('teams')
    .select('team_id, team_name, room_number, is_present, github_verified, documentation_verified, updated_at')
    .eq('is_present', true)
    .order('team_name', { ascending: true })

  if (error) throw error
  return (data ?? []).map(normalizeJuryTeam)
}

export async function searchTeamsByName(queryText) {
  if (!supabase) {
    const query = queryText.trim().toLowerCase()
    const teams = readLocalTeams()
    if (!query) return teams
    return teams.filter((team) =>
      String(team.team_name || '').toLowerCase().includes(query) || String(team.team_id || '').toLowerCase().includes(query),
    )
  }

  const query = queryText.trim()
  if (!query) return getTeams()

  const { data, error } = await supabase
    .from('teams')
    .select('team_id, team_name, room_number, is_present, github_verified, documentation_verified, updated_at')
    .or(`team_name.ilike.%${query}%,team_id.ilike.%${query}%`)
    .limit(15)

  if (error) throw error
  return (data ?? []).map(normalizeJuryTeam)
}

export async function applyManualPenalty(teamId, delta, reason = 'manual_override') {
  if (!supabase) throw new Error('Supabase is not configured yet')

  const { error } = await supabase.rpc('apply_manual_penalty', {
    p_team_id: teamId,
    p_delta: delta,
    p_reason: reason,
    p_actor_id: null,
  })
  if (error) throw error
}

export async function resetPenalty(teamId) {
  if (!supabase) throw new Error('Supabase is not configured yet')

  const { error } = await supabase.rpc('reset_penalty', {
    p_team_id: teamId,
    p_actor_id: null,
  })
  if (error) throw error
}

export async function markOut(teamId, membersOut, actorUid) {
  if (!supabase) throw new Error('Supabase is not configured yet')

  const { data, error } = await supabase.rpc('mark_out', {
    p_team_id: teamId,
    p_members_out: membersOut,
    // user_accounts/demo IDs are not guaranteed to exist in auth.users; avoid FK violations
    p_actor_id: null,
  })

  if (error) throw error
  return data
}

export async function markIn(teamId, actorUid) {
  if (!supabase) throw new Error('Supabase is not configured yet')

  const { data, error } = await supabase.rpc('mark_in', {
    p_team_id: teamId,
    // user_accounts/demo IDs are not guaranteed to exist in auth.users; avoid FK violations
    p_actor_id: null,
  })

  if (error) throw error

  if (data?.penalty > 0) {
    sendOverdueAlert(teamId, data.duration_min, data.penalty).catch(() => undefined)
  }

  return { durationMin: data?.duration_min ?? 0, penalty: data?.penalty ?? 0 }
}

export async function markAttendance(teamId, actorUid) {
  if (!supabase) {
    const teams = readLocalTeams()
    const idx = teams.findIndex(t => t.team_id === teamId)
    if (idx >= 0) {
      teams[idx].is_present = true
      writeLocalTeams(teams)
    }
    return { success: true }
  }

  const { error } = await supabase
    .from('teams')
    .update({ is_present: true, updated_at: new Date().toISOString() })
    .eq('team_id', teamId)

  if (error) throw error
  
  // Log the attendance
  await supabase.from('scan_logs').insert({
    team_id: teamId,
    action_type: 'ATTENDANCE',
    payload: { is_present: true },
    // user_accounts/demo IDs are not guaranteed to exist in auth.users; avoid FK violations
    actor_id: null
  })

  return { success: true }
}

export async function getActiveOutTeams() {
  if (!supabase) return []

  const { data, error } = await supabase.from('teams').select('*').not('active_out', 'is', null)
  if (error) throw error
  return data ?? []
}

export async function getScoreboard() {
  if (!supabase) return []

  const { data, error } = await supabase.from('teams').select('*').order('penalty_points', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getTeams() {
  if (!supabase) return readLocalTeams()

  try {
      const { data, error } = await supabase
      .from('teams')
      .select('*, team_emails(email)')
      .order('team_name', { ascending: true })
    if (error) throw error
    if (data) {
      const verificationLocks = readTeamVerificationLocks()
      // Map to flatten emails for easier UI use if needed
      const mapped = data.map(t => ({
        ...t,
        email_count: t.team_emails?.length || 0,
        leader_email: t.team_emails?.[0]?.email || null,
        github_verified: t.github_verified ?? verificationLocks[t.team_id]?.github_verified ?? false,
        documentation_verified: t.documentation_verified ?? verificationLocks[t.team_id]?.documentation_verified ?? false,
      }))
      writeLocalTeams(mapped)
      return mapped
    }
  } catch (error) {
    console.warn('Falling back to local team cache:', error.message)
  }

  return readLocalTeams()
}

export async function setTeamVerificationLocks(teamId, { githubVerified, documentationVerified }) {
  if (!teamId) throw new Error('Team ID is required')

  const locks = readTeamVerificationLocks()
  locks[teamId] = {
    github_verified: Boolean(githubVerified),
    documentation_verified: Boolean(documentationVerified),
  }
  const teamLocks = locks[teamId]
  writeTeamVerificationLocks(locks)

  const teams = readLocalTeams()
  const idx = teams.findIndex(t => t.team_id === teamId)
  if (idx >= 0) {
    teams[idx] = {
      ...teams[idx],
      github_verified: Boolean(githubVerified),
      documentation_verified: Boolean(documentationVerified),
      updated_at: new Date().toISOString(),
    }
    writeLocalTeams(teams)
  }

  if (!supabase) return { persisted: false }

  // Try persisting to backend if columns exist; keep local fallback if schema doesn't support yet.
  const { error } = await supabase
    .from('teams')
    .update({
      github_verified: Boolean(githubVerified),
      documentation_verified: Boolean(documentationVerified),
      updated_at: new Date().toISOString(),
    })
    .eq('team_id', teamId)

  if (error) {
    console.warn('setTeamVerificationLocks: backend schema may be missing verification columns, using local fallback', error)
    await reconcileTeamScoreLocks(teamId, teamLocks)
    return { persisted: false }
  }

  await reconcileTeamScoreLocks(teamId, teamLocks)

  return { persisted: true }
}

export async function verifyTeamsInBackend(teamIds = []) {
  if (!supabase) {
    return {
      backendAvailable: false,
      backendCount: 0,
      foundTeams: [],
      missingTeamIds: teamIds,
    }
  }

  const uniqueIds = [...new Set(teamIds.filter(Boolean))]
  if (uniqueIds.length === 0) {
    const { data, error } = await supabase.from('teams').select('team_id')
    if (error) throw error
    return {
      backendAvailable: true,
      backendCount: data?.length ?? 0,
      foundTeams: data ?? [],
      missingTeamIds: [],
    }
  }

  const { data, error } = await supabase
    .from('teams')
    .select('team_id, team_name, members_count, room_number, updated_at')
    .in('team_id', uniqueIds)

  if (error) throw error

  const foundTeamIds = new Set((data ?? []).map((item) => item.team_id))
  return {
    backendAvailable: true,
    backendCount: data?.length ?? 0,
    foundTeams: data ?? [],
    missingTeamIds: uniqueIds.filter((teamId) => !foundTeamIds.has(teamId)),
  }
}

export async function getLatestLogs() {
  if (!supabase) return []

  const { data, error } = await supabase.from('scan_logs').select('*').order('created_at', { ascending: false }).limit(50)
  if (error) throw error
  return data ?? []
}

export async function saveTeacherScore(teamId, scores, remarks, teacherName, teacherId, lockState = null) {
  if (!supabase) throw new Error('Supabase is not configured yet')

  const locks = readTeamVerificationLocks()
  const localLock = locks[teamId] || {}
  const effectiveLocks = {
    github_verified: Boolean(lockState?.githubVerified ?? localLock.github_verified),
    documentation_verified: Boolean(lockState?.documentationVerified ?? localLock.documentation_verified),
  }
  const effectiveScores = applyVerificationToScores(scores, effectiveLocks)

  const payload = {
    team_id: teamId,
    // teacher_id references auth.users(id), but local accounts live in
    // user_accounts, so we must set this to null to avoid FK violations.
    teacher_id: null,
    teacher_name: teacherName,
    problem_understanding: effectiveScores.problem_understanding || 0,
    novelty: effectiveScores.novelty || 0,
    technical_depth: effectiveScores.technical_depth || 0,
    social_relevance: effectiveScores.social_relevance || 0,
    presentation: effectiveScores.presentation || 0,
    github: effectiveScores.github || 0,
    documentation: effectiveScores.documentation || 0,
    total: computeTeacherTotal(effectiveScores),
    remarks: remarks || '',
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('teacher_scores').upsert(payload, { onConflict: 'team_id, teacher_name' })
  if (error) {
    // If composite unique constraint doesn't exist, fallback to insert
    const { error: retryError } = await supabase.from('teacher_scores').insert(payload)
    if (retryError) throw retryError
  }
}

export async function getTeacherScores() {
  if (!supabase) return []

  const { data, error } = await supabase.from('teacher_scores').select('*').order('updated_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getActivityLog() {
  if (!supabase) return []

  const [scans, breaks, penalties, scores] = await Promise.all([
    supabase.from('scan_logs').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('break_sessions').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('penalty_adjustments').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('teacher_scores').select('*').order('updated_at', { ascending: false }).limit(100),
  ])

  const logItems = []
  if (scans.data) logItems.push(...scans.data.map(s => ({ type: 'scan', ...s, timestamp: s.created_at })))
  if (breaks.data) logItems.push(...breaks.data.map(b => ({ type: 'break', ...b, timestamp: b.created_at })))
  if (penalties.data) logItems.push(...penalties.data.map(p => ({ type: 'penalty', ...p, timestamp: p.created_at })))
  if (scores.data) logItems.push(...scores.data.map(sc => ({ type: 'score', ...sc, timestamp: sc.updated_at })))

  return logItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
}

export function subscribeToTeams(onUpdate) {
  if (!supabase) return () => {}

  const channel = supabase
    .channel('public:teams')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, async (payload) => {
      // Whenever teams table changes, fetch fresh data and call the callback
      try {
        const teams = await getTeams()
        onUpdate(teams)
      } catch (err) {
        console.error('Error fetching teams on update:', err)
      }
    })
    .subscribe()

  // Return unsubscribe function
  return () => {
    supabase.removeChannel(channel)
  }
}

export function subscribeToAdmittedTeams(onUpdate) {
  if (!supabase) return () => {}

  const channel = supabase
    .channel('public:teams:admitted')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, async () => {
      try {
        const teams = await getAdmittedTeamsForJury()
        onUpdate(teams)
      } catch (err) {
        console.error('Error fetching admitted teams for jury:', err)
      }
    })
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

export function subscribeToRules(onUpdate) {
  // Poll localStorage for rule changes (covers admin saving locally)
  const pollInterval = setInterval(async () => {
    try {
      const rules = await getRules()
      onUpdate(rules)
    } catch { /* ignore */ }
  }, 3000)

  if (!supabase) return () => clearInterval(pollInterval)

  const channel = supabase
    .channel('public:event_protocols:active')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'event_protocols' }, async () => {
      const rules = await getRules()
      onUpdate(rules)
    })
    .subscribe()

  return () => {
    clearInterval(pollInterval)
    supabase.removeChannel(channel)
  }
}

export function subscribeToProtocols(onUpdate) {
  const pollInterval = setInterval(async () => {
    try {
      const protocols = await getProtocols()
      onUpdate(protocols)
    } catch { /* ignore */ }
  }, 3000)

  if (!supabase) return () => clearInterval(pollInterval)

  const channel = supabase
    .channel('public:event_protocols')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'event_protocols' }, async () => {
      try {
        const protocols = await getProtocols()
        onUpdate(protocols)
      } catch (err) {
        console.error('Error fetching protocols on update:', err)
      }
    })
    .subscribe()

  return () => {
    clearInterval(pollInterval)
    supabase.removeChannel(channel)
  }
}
