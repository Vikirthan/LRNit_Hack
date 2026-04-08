/**
 * Local account management service using localStorage.
 * Replaces Supabase RPC calls for a fully offline-capable demo.
 */

const ACCOUNTS_KEY = 'ticketscan-user-accounts'
const ADMIN_USERNAME = 'Vikirthan'
const ADMIN_PASSWORD = 'Vikirthan@819'

function getAccounts() {
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveAccounts(accounts) {
  window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
}

/**
 * Request a new account (status = 'pending')
 */
export function requestAccount({ username, password, role, fullName, email }) {
  const accounts = getAccounts()

  // Check for duplicate username
  const exists = accounts.find(
    (a) => a.username.toLowerCase() === username.trim().toLowerCase(),
  )
  if (exists) throw new Error('Username already taken')

  const newAccount = {
    id: `acct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    username: username.trim(),
    password,
    role,
    full_name: fullName,
    email: email || null,
    status: 'pending',
    created_at: new Date().toISOString(),
  }

  accounts.push(newAccount)
  saveAccounts(accounts)
  return newAccount
}

/**
 * Authenticate a user by username/email and password.
 * Returns null if no match or account not approved.
 */
export function authenticateLocalAccount(identifier, password) {
  // Check admin first
  if (identifier === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return {
      id: 'admin-root',
      username: ADMIN_USERNAME,
      full_name: 'Admin Vikirthan',
      email: 'admin@vikirthan.local',
      role: 'admin',
      status: 'approved',
    }
  }

  const accounts = getAccounts()
  const match = accounts.find(
    (a) =>
      (a.username.toLowerCase() === identifier.trim().toLowerCase() ||
        (a.email && a.email.toLowerCase() === identifier.trim().toLowerCase())) &&
      a.password === password,
  )

  if (!match) return null
  if (match.status !== 'approved') {
    throw new Error(
      match.status === 'pending'
        ? 'Your account is pending admin approval'
        : 'Your account request was rejected',
    )
  }
  return match
}

/**
 * Get all pending accounts
 */
export function getPendingAccounts() {
  return getAccounts().filter((a) => a.status === 'pending')
}

/**
 * Get all accounts (for admin view)
 */
export function getAllAccounts() {
  return getAccounts()
}

/**
 * Approve an account by ID
 */
export function approveAccount(accountId) {
  const accounts = getAccounts()
  const idx = accounts.findIndex((a) => a.id === accountId)
  if (idx === -1) throw new Error('Account not found')
  accounts[idx].status = 'approved'
  accounts[idx].approved_at = new Date().toISOString()
  saveAccounts(accounts)
}

/**
 * Reject an account by ID
 */
export function rejectAccount(accountId) {
  const accounts = getAccounts()
  const idx = accounts.findIndex((a) => a.id === accountId)
  if (idx === -1) throw new Error('Account not found')
  accounts[idx].status = 'rejected'
  accounts[idx].rejected_at = new Date().toISOString()
  saveAccounts(accounts)
}

/**
 * Delete an account by ID
 */
export function deleteAccount(accountId) {
  const accounts = getAccounts().filter((a) => a.id !== accountId)
  saveAccounts(accounts)
}
