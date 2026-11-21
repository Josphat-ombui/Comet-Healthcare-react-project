import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { getToken, setToken, clearToken, request } from '../lib/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }
    request('/auth/me')
      .then(({ user: me }) => setUser(me))
      .catch(() => clearToken())
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email, password) => {
    const { token, user: me } = await request('/auth/login', { method: 'POST', body: { email, password } })
    setToken(token)
    setUser(me)
    return me
  }, [])

  const register = useCallback(async (payload) => {
    const { token, user: me } = await request('/auth/register', { method: 'POST', body: payload })
    setToken(token)
    setUser(me)
    return me
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}