import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { User } from '../types/api'
import { authApi, userApi } from '../services/api'

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
}

interface AuthContextType extends AuthState {
  login: (account: string, password: string) => Promise<User>
  register: (email: string, password: string, username: string, captcha_id?: string, captcha_code?: string, code?: string) => Promise<{ message: string; email: string; user?: User }>
  verifyEmail: (email: string, code: string) => Promise<User>
  logout: () => void
  setUser: (user: User | null) => void
  refreshUser: () => Promise<User | null>
}

const USER_KEY = 'current_user'

const AuthContext = createContext<AuthContextType | null>(null)

function getInitialUser(): User | null {
  try {
    const saved = localStorage.getItem(USER_KEY)
    if (!saved) return null
    const user = JSON.parse(saved)
    if (user.api_key && localStorage.getItem('api_key')) {
      return user
    }
    return null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: getInitialUser(),
    loading: !getInitialUser(),
    error: null
  })

  useEffect(() => {
    const user = getInitialUser()
    if (user) {
      setState({ user, loading: false, error: null })
    } else {
      setState(prev => ({ ...prev, loading: false }))
    }
  }, [])

  const setUser = useCallback((user: User | null) => {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user))
      localStorage.setItem('api_key', user.api_key)
      localStorage.setItem('login_timestamp', String(Date.now()))
    } else {
      localStorage.removeItem(USER_KEY)
      localStorage.removeItem('api_key')
      localStorage.removeItem('login_timestamp')
    }
    setState({ user, loading: false, error: null })
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const res = await userApi.getProfile()
      setUser(res.user)
      return res.user
    } catch {
      return null
    }
  }, [setUser])

  const login = useCallback(async (account: string, password: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }))
    try {
      const res = await authApi.login({ account, password })
      setUser(res.user)
      refreshUser()
      return res.user
    } catch (e: any) {
      setState(prev => ({ ...prev, loading: false, error: e.message }))
      throw e
    }
  }, [setUser, refreshUser])

  const register = useCallback(async (email: string, password: string, username: string, captcha_id?: string, captcha_code?: string, code?: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }))
    try {
      const res = await authApi.register({ email, password, username, captcha_id, captcha_code, code })
      if (res.user) {
        setUser(res.user)
        refreshUser()
      }
      return res
    } catch (e: any) {
      setState(prev => ({ ...prev, loading: false, error: e.message }))
      throw e
    }
  }, [setUser, refreshUser])

  const verifyEmail = useCallback(async (email: string, code: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }))
    try {
      const res = await authApi.verifyEmail({ email, code })
      setUser(res.user)
      return res.user
    } catch (e: any) {
      setState(prev => ({ ...prev, loading: false, error: e.message }))
      throw e
    }
  }, [setUser])

  const logout = useCallback(() => {
    setUser(null)
  }, [setUser])

  return (
    <AuthContext.Provider value={{ ...state, login, register, verifyEmail, logout, setUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}