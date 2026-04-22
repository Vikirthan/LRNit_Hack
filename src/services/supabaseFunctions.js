import { supabase, hasSupabaseConfig } from '../config/supabase'

async function invokeFunction(name, payload) {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error('Supabase is not configured yet')
  }

  const { data, error } = await supabase.functions.invoke(name, {
    body: payload,
  })

  if (error) {
    const rawMessage = error?.message || 'Edge function request failed'
    if (rawMessage.includes('ATX_0')) {
      throw new Error(`Unable to reach Edge Function "${name}". Verify the function is deployed and Supabase URL/key are correct.`)
    }
    throw error
  }
  return data
}

export async function generateTeamQrToken(teamId) {
  return invokeFunction('generate-team-qr-token', { teamId })
}

export async function sendTeamQrEmail(teamId, baseUrl) {
  return invokeFunction('send-team-qr-email', { teamId, baseUrl })
}

export async function sendOverdueAlert(teamId, durationMin, overage) {
  return invokeFunction('send-overdue-alert', { teamId, durationMin, overage })
}

export async function sendAbsentAlert(teamId, baseUrl) {
  return invokeFunction('alert-away-teams', { teamId, baseUrl })
}

export async function sendCustomEmail(payload) {
  // payload: { email, name, subject, content, signature }
  return invokeFunction('send-custom-email', payload)
}
