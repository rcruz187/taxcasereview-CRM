import fs from 'node:fs'

const path = 'src/pages/Email.jsx'
let s = fs.readFileSync(path, 'utf8')
let changed = false

function replaceBetween(start, end, replacement) {
  const a = s.indexOf(start)
  if (a < 0) throw new Error(`Email state patch start anchor missing: ${start.slice(0, 80)}`)
  const b = s.indexOf(end, a)
  if (b < 0) throw new Error(`Email state patch end anchor missing: ${end.slice(0, 80)}`)
  const current = s.slice(a, b)
  if (current === replacement) return
  s = s.slice(0, a) + replacement + s.slice(b)
  changed = true
}

// Once Gmail mutations are awaited, the database is the source of truth.
// The old localRead preservation masked real unread changes after Refresh.
const oldLoad = `    if (e) {
      // Preserve is_read=true for any email the user already opened this session.
      // Without this, a background lastSyncAt reload resets the unread dot on
      // emails the user just clicked — the DB write from markRead() can race
      // with the reload and the fetch wins with the old value.
      setEmails(prev => {
        const localRead = new Set(prev.filter(x => x.is_read).map(x => x.id))
        return e.map(row => localRead.has(row.id) ? { ...row, is_read: true } : row)
      })
    }`
const newLoad = `    if (e) setEmails(e)`
if (s.includes(oldLoad)) {
  s = s.replace(oldLoad, newLoad)
  changed = true
}

const actionBlock = `  async function runMailboxAction(emailIds, action) {
    const ids = Array.isArray(emailIds) ? emailIds : [emailIds]
    const { data, error } = await supabase.functions.invoke('gmail-sync-cron', {
      body: { mode: 'message_action', email_ids: ids, action },
    })
    if (error) throw new Error(error.message || String(error))
    if (!data?.ok) {
      const detail = data?.failures?.[0]?.error || data?.error || 'Mailbox action failed'
      throw new Error(detail)
    }
    return data
  }

`
if (!s.includes('async function runMailboxAction(')) {
  const anchor = `  async function moveTriage(id, triage) {`
  if (!s.includes(anchor)) throw new Error('moveTriage anchor missing')
  s = s.replace(anchor, actionBlock + anchor)
  changed = true
}

replaceBetween(
  `  async function moveTriage(id, triage) {`,
  `  // The trash icon archives instead of permanently deleting.`,
`  async function moveTriage(id, triage) {
    const current = emails.find(e => e.id === id)
    if (selected?.id === id) setSelected(prev => ({ ...prev, triage }))
    setEmails(prev => prev.map(e => e.id === id ? { ...e, triage } : e))
    try {
      if (triage === 'Archive') {
        await runMailboxAction(id, 'archive')
      } else {
        // Moving a previously archived Gmail message back into an active CRM
        // folder restores Gmail's INBOX label first, then preserves the CRM's
        // richer Action Needed / Waiting classification locally.
        if (current?.triage === 'Archive' && triage !== 'Sent') await runMailboxAction(id, 'inbox')
        const { error } = await supabase.from('emails').update({ triage }).eq('id', id)
        if (error) throw error
      }
      showToast(\`Moved to \${triage}\`)
    } catch (e) {
      await load()
      showToast('Email move failed: ' + e.message)
    }
  }

`)

replaceBetween(
  `  // The trash icon archives instead of permanently deleting.`,
  `  function openEmail(email, index) {`,
`  // Archive/delete/read state must be written to Gmail and TCR together.
  // All operations are awaited so Refresh can never race an unfinished write.
  async function archiveEmail(id) {
    const previous = emails
    setEmails(es => es.map(e => e.id === id ? { ...e, triage: 'Archive' } : e))
    if (selected?.id === id) setSelected(null)
    setCheckedIds(set => { const next = new Set(set); next.delete(id); return next })
    try {
      await runMailboxAction(id, 'archive')
      showToast('Archived')
    } catch (e) {
      setEmails(previous)
      await load()
      showToast('Archive failed: ' + e.message)
    }
  }

  async function archiveSelected() {
    if (checkedIds.size === 0) return
    const ids = [...checkedIds]
    const previous = emails
    setEmails(es => es.map(e => ids.includes(e.id) ? { ...e, triage: 'Archive' } : e))
    if (selected && ids.includes(selected.id)) setSelected(null)
    setCheckedIds(new Set())
    try {
      await runMailboxAction(ids, 'archive')
      showToast(\`Archived \${ids.length} email\${ids.length === 1 ? '' : 's'}\`)
    } catch (e) {
      setEmails(previous)
      await load()
      showToast('Bulk archive failed: ' + e.message)
    }
  }

  async function permanentlyDeleteEmail(id) {
    const previous = emails
    setEmails(es => es.filter(e => e.id !== id))
    if (selected?.id === id) setSelected(null)
    setCheckedIds(set => { const next = new Set(set); next.delete(id); return next })
    try {
      // Gmail's Trash is the safe provider-side delete operation. The CRM
      // soft-deletes its row so the sync dedupe key remains and cannot re-import.
      await runMailboxAction(id, 'trash')
      showToast('Deleted')
    } catch (e) {
      setEmails(previous)
      await load()
      showToast('Delete failed: ' + e.message)
    }
  }

  async function permanentlyDeleteSelected() {
    if (checkedIds.size === 0) return
    const ids = [...checkedIds]
    const previous = emails
    setEmails(es => es.filter(e => !ids.includes(e.id)))
    if (selected && ids.includes(selected.id)) setSelected(null)
    setCheckedIds(new Set())
    try {
      await runMailboxAction(ids, 'trash')
      showToast(\`Deleted \${ids.length} email\${ids.length === 1 ? '' : 's'}\`)
    } catch (e) {
      setEmails(previous)
      await load()
      showToast('Bulk delete failed: ' + e.message)
    }
  }

  async function markRead(email) {
    if (email.is_read) return
    setEmails(es => es.map(e => e.id === email.id ? { ...e, is_read: true } : e))
    if (selected?.id === email.id) setSelected(prev => ({ ...prev, is_read: true }))
    try {
      await runMailboxAction(email.id, 'read')
    } catch (e) {
      await load()
      showToast('Could not mark email read: ' + e.message)
    }
  }

  async function markUnread(email) {
    setEmails(es => es.map(e => e.id === email.id ? { ...e, is_read: false } : e))
    if (selected?.id === email.id) setSelected(prev => ({ ...prev, is_read: false }))
    try {
      await runMailboxAction(email.id, 'unread')
      showToast('Marked as new')
    } catch (e) {
      await load()
      showToast('Could not mark email unread: ' + e.message)
    }
  }

`)

// Don't claim Gmail is permanently deleting mail; Gmail Trash retains its own
// provider retention semantics. The visible CRM behavior is still deletion.
s = s.replaceAll('🗑 Delete Permanently', '🗑 Delete')

if (changed) fs.writeFileSync(path, s)
console.log(`Email Gmail-state synchronization ${changed ? 'patched' : 'already current'}.`)
