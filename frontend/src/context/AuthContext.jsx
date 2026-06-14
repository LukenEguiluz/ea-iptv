import { createContext, useContext, useMemo, useState } from 'react'
import { isLoggedIn, login as apiLogin, logout as apiLogout } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [authenticated, setAuthenticated] = useState(isLoggedIn())

  const value = useMemo(() => ({
    isAuthenticated: authenticated,
    async login(username, password) {
      await apiLogin(username, password)
      setAuthenticated(true)
    },
    logout() {
      apiLogout()
      setAuthenticated(false)
    },
  }), [authenticated])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
