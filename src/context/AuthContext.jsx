import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { DEMO_ACCOUNTS } from '../constants/demoAccounts'
import { authenticateAccount } from '../services/accountService'

const AuthContext = createContext(null)
const SESSION_KEY = 'ticketscan-session'

// Hardcoded super-admin credentials (not stored in Supabase)
const ADMIN_USERNAME = 'Vikirthan'
const ADMIN_PASSWORD = 'Vikirthan@819'

function getStoredSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function setStoredSession(payload) {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(payload))
  } catch {
    // Ignore storage failures
  }
}

function clearStoredSession() {
  try {
    window.localStorage.removeItem(SESSION_KEY)
  } catch {
    // Ignore
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = getStoredSession()
    if (stored?.user && stored?.profile) {
      setUser(stored.user)
      setProfile(stored.profile)
    }
    setLoading(false)
  }, [])

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      login: async (identifier, password) => {
        // 1) Check demo accounts first
        const normalizedId = identifier.trim().toLowerCase()
        const demoAccount = Object.values(DEMO_ACCOUNTS).find(
          (a) => a.email === normalizedId && a.password === password,
        )

        if (demoAccount) {
          const userData = {
            id: demoAccount.uid,
            uid: demoAccount.uid,
            email: demoAccount.email,
            user_metadata: { full_name: demoAccount.name },
          }
          const profileData = {
            id: demoAccount.uid,
            role: demoAccount.role,
            full_name: demoAccount.name,
            email: demoAccount.email,
          }
          setStoredSession({ user: userData, profile: profileData })
          setUser(userData)
          setProfile(profileData)
          setLoading(false)
          return { data: { user: userData }, error: null }
        }

        // 2) Check hardcoded admin
        if (identifier.trim() === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
          const userData = {
            id: 'admin-root',
            uid: 'admin-root',
            email: 'admin@vikirthan.local',
            username: ADMIN_USERNAME,
            user_metadata: { full_name: 'Admin Vikirthan' },
          }
          const profileData = {
            id: 'admin-root',
            role: 'admin',
            full_name: 'Admin Vikirthan',
            email: 'admin@vikirthan.local',
            username: ADMIN_USERNAME,
          }
          setStoredSession({ user: userData, profile: profileData })
          setUser(userData)
          setProfile(profileData)
          setLoading(false)
          return { data: { user: userData }, error: null }
        }

        // 3) Try Supabase account authentication
        const account = await authenticateAccount(identifier.trim(), password)
        if (account) {
          const userData = {
            id: account.id,
            uid: account.id,
            email: account.email,
            username: account.username,
            user_metadata: { full_name: account.full_name },
          }
          const profileData = {
            id: account.id,
            role: account.role,
            full_name: account.full_name,
            email: account.email,
            username: account.username,
          }
          setStoredSession({ user: userData, profile: profileData })
          setUser(userData)
          setProfile(profileData)
          setLoading(false)
          return { data: { user: userData }, error: null }
        }

        throw new Error('Invalid username or password')
      },
      logout: async () => {
        clearStoredSession()
        setUser(null)
        setProfile(null)
        setLoading(false)
      },
    }),
    [loading, profile, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
