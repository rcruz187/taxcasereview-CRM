import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// ──────────────────────────────────────────────────────────────────────
// Gmail sync used to run independently in EVERY logged-in employee's
// browser tab, polling every 30 seconds — meaning N employees logged in
// meant N redundant copies of the same sync work, all hitting Supabase
// with the same queries (including re-fetching the entire clients table)
// at the same time, all day. That was a real, sustained contributor to
// the Supabase Cached Egress overage.
//
// The actual sync work now lives in a single shared scheduled edge
// function (supabase/functions/gmail-sync-cron), running once on a
// schedule no matter how many people are logged in. This context is now
// just a thin, cheap status reader: it reads the `settings` row once on
// mount, then listens for changes via Realtime (push-based — only
// transmits when something actually changes, not on a timer) so the
// Email page's "Synced Xs ago" indicator stays live without polling.
// "Sync now" just invokes the edge function directly instead of
// duplicating its logic in the browser.
// ──────────────────────────────────────────────────────────────────────

const GmailSyncContext = createContext(null)
export function useGmailSync() { return useContext(GmailSyncContext) }

export function GmailSyncProvider({ children }) {
  const [lastSyncAt, setLastSyncAt] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [lastError, setLastError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadInitial() {
      const { data } = await supabase.from('settings')
        .select('id, gmail_last_sync_at, gmail_last_error')
        .limit(1).maybeSingle()
      if (cancelled || !data) return
      if (data.gmail_last_sync_at) setLastSyncAt(new Date(data.gmail_last_sync_at))
      if (data.gmail_last_error) setLastError(data.gmail_last_error)
    }
    loadInitial()

    // Push-based update instead of polling — only fires when the cron
    // function actually finishes a sync and writes the new timestamp.
    const ch = supabase.channel('gmail-sync-status')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'settings' }, ({ new: row }) => {
        if (row.gmail_last_sync_at) setLastSyncAt(new Date(row.gmail_last_sync_at))
        setLastError(row.gmail_last_error || null)
      })
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(ch) }
  }, [])

  // Manual "Sync now" — invokes the shared edge function directly instead
  // of running the sync logic in this browser tab.
  async function syncNow() {
    setSyncing(true)
    try {
      const { error } = await supabase.functions.invoke('gmail-sync-cron')
      if (error) setLastError(error.message || String(error))
    } catch (e) {
      setLastError(e.message || String(e))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <GmailSyncContext.Provider value={{ lastSyncAt, syncing, lastError, syncNow }}>
      {children}
    </GmailSyncContext.Provider>
  )
}
