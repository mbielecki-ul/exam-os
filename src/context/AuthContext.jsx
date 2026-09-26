import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signOut as fbSignOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { getAdminEmails } from '../lib/admins'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = loading, null = logged out
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    // The user is only published once the admin check is done, so guards
    // never see a signed-in admin as a non-admin for a moment. `latest`
    // drops a slow check that a newer sign-in/out has overtaken.
    let latest = 0
    const unsub = onAuthStateChanged(auth, async (u) => {
      const run = ++latest
      let admin = false
      if (u) {
        try {
          admin = (await getAdminEmails()) !== null
        } catch {
          admin = false
        }
      }
      if (run !== latest) return
      setIsAdmin(admin)
      setUser(u)
    })
    return unsub
  }, [])

  const value = {
    user,
    loading: user === undefined,
    isAdmin: !!user && isAdmin,
    signOut: () => fbSignOut(auth),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
