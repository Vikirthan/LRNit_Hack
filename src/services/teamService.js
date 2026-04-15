import { hasSupabaseConfig, supabase } from '../config/supabase'
import { generateTeamQrToken, sendOverdueAlert, sendTeamQrEmail } from './supabaseFunctions'
export { generateTeamQrToken }

const LOCAL_TEAMS_KEY = 'ticketscan-local-teams'

const defaultRules = {
  max_break_time: 30,
  grace_time: 5,
  penalty_per_minute: 1,
  overdue_email_enabled: false,
  jury_mode: 'manual', // 'manual' or 'scan'
  is_active: true,
  event_logo_url: null,
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
  if (!hasSupabaseConfig || !supabase) return readLocalRules()

  try {
    const { data, error } = await supabase.from('settings').select('*').eq('key', 'rules').maybeSingle()
    if (error) throw error
    const merged = data ? { ...defaultRules, ...data } : { ...defaultRules }
    writeLocalRules(merged) // cache locally
    return merged
  } catch (err) {
    console.warn('getRules: Supabase failed, falling back to local', err)
    return readLocalRules()
  }
}

export async function saveRules(payload) {
  // Always update locally for instant UI feedback
  const merged = { ...readLocalRules(), ...payload }
  writeLocalRules(merged)

  if (!hasSupabaseConfig || !supabase) return

  try {
    const { error } = await supabase.from('settings').upsert({ key: 'rules', ...payload, updated_at: new Date().toISOString() })
    if (error) throw error
  } catch (err) {
    console.warn('saveRules: Supabase failed, rules saved locally only', err)
  }
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
  const { data, error } = await supabase.functions.invoke('alert-away-teams', {
    body: { teamId, baseUrl }
  })
  if (error) throw error
  return data
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

  const { data, error } = await supabase.functions.invoke('verify-qr-token', {
    body: { token },
  })
  if (error) throw error

  const teamId = data?.teamId
  if (!teamId) throw new Error('Invalid QR token')

  const { data: teamData, error: teamError } = await supabase.from('teams').select('*').eq('team_id', teamId).maybeSingle()
  if (teamError) throw teamError
  if (!teamData) throw new Error('Team not found')

  return teamData
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
    .select('*')
    .or(`team_name.ilike.%${query}%,team_id.ilike.%${query}%`)
    .limit(15)

  if (error) throw error
  return data ?? []
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
    p_actor_id: actorUid ?? null,
  })

  if (error) throw error
  return data
}

export async function markIn(teamId, actorUid) {
  if (!supabase) throw new Error('Supabase is not configured yet')

  const { data, error } = await supabase.rpc('mark_in', {
    p_team_id: teamId,
    p_actor_id: actorUid ?? null,
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
    actor_id: actorUid ?? null
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
      // Map to flatten emails for easier UI use if needed
      const mapped = data.map(t => ({
        ...t,
        email_count: t.team_emails?.length || 0,
        leader_email: t.team_emails?.[0]?.email || null
      }))
      writeLocalTeams(mapped)
      return mapped
    }
  } catch (error) {
    console.warn('Falling back to local team cache:', error.message)
  }

  return readLocalTeams()
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

export async function saveTeacherScore(teamId, scores, remarks, teacherName, teacherId) {
  if (!supabase) throw new Error('Supabase is not configured yet')

  const payload = {
    team_id: teamId,
    // teacher_id references auth.users(id), but local accounts live in
    // user_accounts, so we must set this to null to avoid FK violations.
    teacher_id: null,
    teacher_name: teacherName,
    problem_understanding: scores.problem_understanding || 0,
    novelty: scores.novelty || 0,
    technical_depth: scores.technical_depth || 0,
    social_relevance: scores.social_relevance || 0,
    presentation: scores.presentation || 0,
    github: scores.github || 0,
    documentation: scores.documentation || 0,
    total: Object.values(scores).reduce((sum, val) => sum + (Number(val) || 0), 0),
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
    .channel('public:settings')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: 'key=eq.rules' }, async (payload) => {
      const merged = { ...defaultRules, ...payload.new }
      writeLocalRules(merged)
      onUpdate(merged)
    })
    .subscribe()

  return () => {
    clearInterval(pollInterval)
    supabase.removeChannel(channel)
  }
}
