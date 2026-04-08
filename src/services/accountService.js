import { hasSupabaseConfig, supabase } from '../config/supabase'

export async function requestAccount({ username, password, role, fullName, email }) {
  if (!hasSupabaseConfig || !supabase) throw new Error('Supabase is not configured yet')

  const { error } = await supabase.rpc('request_user_account', {
    p_username: username,
    p_password: password,
    p_role: role,
    p_full_name: fullName,
    p_email: email || null,
  })

  if (error) throw error
}

export async function authenticateAccount(identifier, password) {
  if (!hasSupabaseConfig || !supabase) return null

  const { data, error } = await supabase.rpc('authenticate_user_account', {
    p_identifier: identifier,
    p_password: password,
  })

  if (error) throw error
  return Array.isArray(data) && data.length > 0 ? data[0] : null
}

export async function getPendingAccounts() {
  if (!hasSupabaseConfig || !supabase) return []

  const { data, error } = await supabase.rpc('list_pending_user_accounts')

  if (error) throw error
  return data ?? []
}

export async function getAllAccounts() {
  if (!hasSupabaseConfig || !supabase) return []

  const { data, error } = await supabase.rpc('list_all_user_accounts')

  if (error) throw error
  return data ?? []
}

export async function approveAccount(accountId) {
  if (!hasSupabaseConfig || !supabase) throw new Error('Supabase is not configured yet')

  const { error } = await supabase.rpc('approve_user_account', {
    p_account_id: accountId,
  })

  if (error) throw error
}

export async function rejectAccount(accountId) {
  if (!hasSupabaseConfig || !supabase) throw new Error('Supabase is not configured yet')

  const { error } = await supabase.rpc('reject_user_account', {
    p_account_id: accountId,
  })

  if (error) throw error
}

export async function deleteAccount(accountId) {
  if (!hasSupabaseConfig || !supabase) throw new Error('Supabase is not configured yet')

  const { error } = await supabase.rpc('delete_user_account', {
    p_account_id: accountId,
  })

  if (error) throw error
}
