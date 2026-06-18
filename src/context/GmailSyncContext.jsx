import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { listGmailMessages, getAndParseGmailMessage } from '../lib/gmailUtils'

// ──────────────────────────────────────────────────────────────────────
// Mounted once at the Shell level (same pattern as CallContext) so it
// keeps running no matter which page is open — not just the Email page.
//
// Polling interval is 30 seconds, not "every couple seconds": Gmail's API
// has a quota, and checking that aggressively buys nothing in practice
// (mail arriving 30s later vs 3s later makes no real difference) while
// running the account toward rate limits over a full day of use. 30s
// still feels instant in normal use. Easy to change — just POLL_MS below.
//
// First-ever run backfills the last 12 months (Inbox, then Sent) a page
// at a time across multiple ticks so it doesn't try to pull a year of
// mail in one go. After that it's steady-state: every tick checks the
// newest ~20 Inbox + ~20 Sent messages and imports anything not already
// known (de-duped on gmail_message_id). Once a day it also prunes
// anything in the `emails` table older than 12 months.
// ──────────────────────────────────────────────────────────────────────

const POLL_MS = 30000
const RETENTION_DAYS = 365
const BACKFILL_MONTHS = 12

const GmailSyncContext = createContext(null)
export function useGmailSync() { return useContext(GmailSyncContext) }

function monthsAgoGmailDate(months) {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

export function GmailSyncProvider({ children }) {
  const [lastSyncAt, setLastSyncAt] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [lastError, setLastError] = useState(null)
  const runningRef = useRef(false)
  const timerRef = useRef(null)

  async function filterUnknownIds(ids) {
    if (!ids.length) return []
    const { data } = await supabase.from('emails').select('gmail_message_id').in('gmail_message_id', ids)
    const known = new Set((data || []).map(r => r.gmail_message_id))
    return ids.filter(id => !known.has(id))
  }

  async function importIds(ids, clients) {
    for (const id of ids) {
      try {
        const parsed = await getAndParseGmailMessage(supabase, id, clients)
        if (parsed) {
          await supabase.from('emails').upsert([parsed], { onConflict: 'gmail_message_id', ignoreDuplicates: true })
        }
      } catch (e) {
        console.error('Gmail import error for', id, e)
      }
    }
  }

  async function runBackfillStep(settings, clients) {
    const phase = settings.gmail_backfill_phase || 'inbox'
    if (phase === 'done') return false

    const label = phase === 'inbox' ? 'INBOX' : 'SENT'
    const { ids, nextPageToken } = await listGmailMessages(supabase, {
      labelIds: label,
      query: `after:${monthsAgoGmailDate(BACKFILL_MONTHS)}`,
      pageToken: settings.gmail_backfill_page_token || undefined,
      maxResults: 25,
    })
    const newIds = await filterUnknownIds(ids)
    await importIds(newIds, clients)

    if (nextPageToken) {
      await supabase.from('settings').update({ gmail_backfill_page_token: nextPageToken }).eq('id', settings.id)
    } else if (phase === 'inbox') {
      // Inbox done, move on to Sent.
      await supabase.from('settings').update({ gmail_backfill_phase: 'sent', gmail_backfill_page_token: null }).eq('id', settings.id)
    } else {
      // Sent done too — backfill complete, switch to steady-state.
      await supabase.from('settings').update({
        gmail_backfill_phase: 'done', gmail_backfill_page_token: null, gmail_last_sync_at: new Date().toISOString(),
      }).eq('id', settings.id)
    }
    return true
  }

  async function runSteadyStateStep(settings, clients) {
    for (const label of ['INBOX', 'SENT']) {
      const { ids } = await listGmailMessages(supabase, { labelIds: label, maxResults: 20 })
      const newIds = await filterUnknownIds(ids)
      await importIds(newIds.slice(0, 15), clients) // gentle cap per tick per label
    }
    await supabase.from('settings').update({ gmail_last_sync_at: new Date().toISOString() }).eq('id', settings.id)
  }

  async function maybeRunRetentionCleanup(settings) {
    const last = settings.gmail_last_cleanup_at ? new Date(settings.gmail_last_cleanup_at).getTime() : 0
    if (Date.now() - last < 24 * 60 * 60 * 1000) return
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('emails').delete().lt('created_at', cutoff)
    await supabase.from('settings').update({ gmail_last_cleanup_at: new Date().toISOString() }).eq('id', settings.id)
  }

  async function tick() {
    if (runningRef.current) return
    runningRef.current = true
    setSyncing(true)
    try {
      const { data: settings } = await supabase.from('settings')
        .select('id, gmail_refresh_token, gmail_backfill_phase, gmail_backfill_page_token, gmail_last_sync_at, gmail_last_cleanup_at')
        .limit(1).maybeSingle()

      if (!settings?.gmail_refresh_token) { setSyncing(false); runningRef.current = false; return } // not connected, nothing to do

      const { data: clients } = await supabase.from('clients').select('id,name,email')

      if ((settings.gmail_backfill_phase || 'inbox') !== 'done') {
        await runBackfillStep(settings, clients || [])
      } else {
        await runSteadyStateStep(settings, clients || [])
        await maybeRunRetentionCleanup(settings)
      }
      setLastSyncAt(new Date())
      setLastError(null)
    } catch (e) {
      console.error('Gmail sync error:', e)
      setLastError(e.message || String(e))
    } finally {
      setSyncing(false)
      runningRef.current = false
    }
  }

  useEffect(() => {
    tick() // run immediately on load, then every POLL_MS
    timerRef.current = setInterval(tick, POLL_MS)
    return () => clearInterval(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <GmailSyncContext.Provider value={{ lastSyncAt, syncing, lastError, syncNow: tick }}>
      {children}
    </GmailSyncContext.Provider>
  )
}
