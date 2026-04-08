import { supabase, hasSupabaseConfig } from '../config/supabase'

async function invokeFunction(name, payload) {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error('Supabase is not configured yet')
  }

  const { data, error } = await supabase.functions.invoke(name, {
    body: payload,
  })

  if (error) throw error
  return data
}

export async function generateTeamQrToken(teamId) {
  return invokeFunction('generate-team-qr-token', { teamId })
}

export async function sendTeamQrEmail(teamId) {
  return invokeFunction('send-team-qr-email', { teamId })
}

export async function sendOverdueAlert(teamId, durationMin, overage) {
  return invokeFunction('send-overdue-alert', { teamId, durationMin, overage })
}
