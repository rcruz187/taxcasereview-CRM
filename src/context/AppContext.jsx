import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [user, setUser]         = useState(null)
  const [checking, setChecking] = useState(true)
  const [toast, setToast]       = useState({ msg: '', type: 'ok', show: false })
  const [modal, setModal]       = useState({ open: false, title: '', body: null })
  const [searchQ, setSearchQ]   = useState('')
  const toastTimer = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) setUser(data.session.user)
      setChecking(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const showToast = useCallback((msg, type = 'ok') => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, type, show: true })
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 3000)
  }, [])

  const openModal  = useCallback((title, body) => setModal({ open: true, title, body }), [])
  const closeModal = useCallback(() => setModal({ open: false, title: '', body: null }), [])

  const login  = useCallback((u) => setUser(u), [])
  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
  }, [])

  return (
    <AppContext.Provider value={{
      user, login, logout, checking,
      toast, showToast,
      modal, openModal, closeModal,
      searchQ, setSearchQ,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}