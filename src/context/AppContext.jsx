import { createContext, useContext, useState, useCallback, useRef } from 'react'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [user, setUser]         = useState(null)
  const [toast, setToast]       = useState({ msg: '', type: 'ok', show: false })
  const [modal, setModal]       = useState({ open: false, title: '', body: null })
  const [searchQ, setSearchQ]   = useState('')
  const toastTimer = useRef(null)

  /* ── Toast ── */
  const showToast = useCallback((msg, type = 'ok') => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, type, show: true })
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 3000)
  }, [])

  /* ── Modal ── */
  const openModal  = useCallback((title, body) => setModal({ open: true, title, body }), [])
  const closeModal = useCallback(() => setModal({ open: false, title: '', body: null }), [])

  /* ── Auth ── */
  const login  = useCallback((u) => setUser(u), [])
  const logout = useCallback(async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }) } catch {}
    setUser(null)
  }, [])

  return (
    <AppContext.Provider value={{
      user, login, logout,
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
