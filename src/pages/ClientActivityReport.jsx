// ClientActivityReport — "What have we done for you" report for a single client or lead.
// Pulls every touch point: notes, calls, emails, SMS, tasks, e-signs, payments, time entries.
// Embedded in Clients and Leads detail view as a tab. Printable as a clean PDF.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { FIRM } from '../lib/firmBranding'

const firmName = () => FIRM.name || 'Tax Case Review'

function fmt(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function fmtDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtMoney(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtHours(h) { return Number(h || 0).toFixed(2) + 'h' }

const TYPE_ICON = {
  note: '📝', call: '📞', email: '📧', sms: '💬', task: '✅',
  esign: '✍️', payment: '💳', time: '⏱️', fax: '📠', document: '📄',
}
const TYPE_COLOR = {
  note: '#64748b', call: '#22c55e', email: '#0ea5e9', sms: '#6366f1',
  task: '#06b6d4', esign: '#7c3aed', payment: '#10b981', time: '#f59e0b',
  fax: '#dc2626', document: '#f97316',
}

export default function ClientActivityReport({ entityId, entityName, entityType = 'client' }) {
  const [events,   setEvents]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [printing, setPrinting] = useState(false)

  const load = useCallback(async () => {
    if (!entityName) return
    setLoading(true)

    const isClient = entityType === 'client'
    const nameCol  = isClient ? 'clientname' : 'lead_name'
    const idCol    = isClient ? 'client_id'  : 'lead_id'

    const [
      notesRes, callRes, smsRes, taskRes, esignRes, payRes, timeRes, actRes
    ] = await Promise.all([
      // Notes (client_notes or lead_notes)
      isClient
        ? supabase.from('client_notes').select('id,text,author,type,note_type,created_at').eq('clientname', entityName).order('created_at', { ascending: false })
        : supabase.from('lead_notes').select('id,text,author,type,note_type,created_at').eq('lead_name', entityName).order('created_at', { ascending: false }),

      // Call logs
      entityId
        ? supabase.from('call_logs').select('id,direction,from_number,to_number,duration_sec,status,notes,created_at').eq(idCol, entityId).order('created_at', { ascending: false })
        : supabase.from('call_logs').select('id,direction,from_number,to_number,duration_sec,status,notes,created_at').order('created_at', { ascending: false }).limit(0),

      // SMS
      supabase.from('sms_messages').select('id,direction,body,created_at').eq('clientName', entityName).order('created_at', { ascending: false }),

      // Tasks
      supabase.from('tasks').select('id,title,done,dueDate,assignedTo,created_at').eq('clientName', entityName).not('deleted','is',true).order('created_at', { ascending: false }),

      // E-signatures
      supabase.from('esigns').select('id,doc_type,status,created_at,signed_at,client_email').eq('client_name', entityName).order('created_at', { ascending: false }),

      // Payments
      isClient
        ? supabase.from('payments').select('id,amount,method,status,description,created_at').eq('clientName', entityName).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),

      // Time entries
      entityId
        ? supabase.from('billing_time_entries').select('id,activity_type,date,hours,rate,amount,description,employee_name,billed').eq('client_id', entityId).order('date', { ascending: false })
        : supabase.from('billing_time_entries').select('id,activity_type,date,hours,rate,amount,description,employee_name,billed').eq('client_name', entityName).order('date', { ascending: false }),

      // Activity log
      supabase.from('activity_log').select('id,action,category,description,employee_name,created_at').eq('entity_name', entityName).order('created_at', { ascending: false }).limit(200),
    ])

    const all = [
      ...(notesRes.data || []).map(r => ({
        id: 'note-' + r.id, type: 'note', date: r.created_at,
        title: r.type || r.note_type || 'Note',
        body: r.text, author: r.author,
      })),
      ...(callRes.data || []).map(r => ({
        id: 'call-' + r.id, type: 'call', date: r.created_at,
        title: `${r.direction === 'inbound' ? '↙ Inbound' : '↗ Outbound'} Call${r.duration_sec ? ` (${Math.floor(r.duration_sec/60)}m ${r.duration_sec%60}s)` : ''}`,
        body: r.notes || r.status || '', author: '',
      })),
      ...(smsRes.data || []).map(r => ({
        id: 'sms-' + r.id, type: 'sms', date: r.created_at,
        title: r.direction === 'inbound' ? '↙ SMS Received' : '↗ SMS Sent',
        body: r.body, author: '',
      })),
      ...(taskRes.data || []).map(r => ({
        id: 'task-' + r.id, type: 'task', date: r.created_at,
        title: `${r.done ? '✅' : '⬜'} Task: ${r.title}`,
        body: r.dueDate ? `Due ${fmtDate(r.dueDate)}` : '', author: r.assignedTo || '',
      })),
      ...(esignRes.data || []).map(r => ({
        id: 'esign-' + r.id, type: 'esign', date: r.created_at,
        title: `E-Sign: ${r.doc_type || 'Document'} — ${r.status || 'Sent'}`,
        body: r.signed_at ? `Signed ${fmt(r.signed_at)}` : 'Awaiting signature',
        author: '',
      })),
      ...(payRes.data || []).map(r => ({
        id: 'pay-' + r.id, type: 'payment', date: r.created_at,
        title: `Payment: ${fmtMoney(r.amount)} — ${r.method || ''}`,
        body: r.description || r.status || '', author: '',
      })),
      ...(timeRes.data || []).map(r => ({
        id: 'time-' + r.id, type: 'time', date: r.date + 'T12:00:00',
        title: `${r.activity_type} — ${fmtHours(r.hours)} @ ${fmtMoney(r.rate)}/hr = ${fmtMoney(r.amount)}`,
        body: r.description || '', author: r.employee_name,
        billed: r.billed,
      })),
      ...(actRes.data || [])
        .filter(r => !['session_login','session_logout'].includes(r.action))
        .map(r => ({
          id: 'act-' + r.id, type: r.category || 'note', date: r.created_at,
          title: r.description || r.action,
          body: '', author: r.employee_name,
          _fromActivity: true,
        })),
    ]

    // Deduplicate: activity_log entries often duplicate notes/calls, remove if same date+text
    const seen = new Set()
    const deduped = all.filter(e => {
      if (!e._fromActivity) { seen.add(e.title + '|' + e.date?.slice(0,16)); return true }
      const key = e.title + '|' + e.date?.slice(0,16)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    deduped.sort((a, b) => new Date(b.date) - new Date(a.date))
    setEvents(deduped)
    setLoading(false)
  }, [entityId, entityName, entityType])

  useEffect(() => { load() }, [load])

  const filtered = events.filter(e => {
    if (typeFilter !== 'all' && e.type !== typeFilter) return false
    if (dateFrom && e.date < dateFrom) return false
    if (dateTo   && e.date > dateTo + 'T23:59:59') return false
    return true
  })

  // Billing summary
  const timeEntries = filtered.filter(e => e.type === 'time')
  const totalHours  = events.filter(e => e.type === 'time').reduce((s,e) => s + parseFloat(e.title.match(/[\d.]+h/)?.[0] || 0), 0)
  const wipAmount   = events.filter(e => e.type === 'time' && !e.billed).reduce((s,e) => {
    const m = e.title.match(/= \$([\d,]+\.?\d*)/)
    return s + parseFloat((m?.[1]||'0').replace(/,/g,''))
  }, 0)

  function printReport() {
    setPrinting(true)
    const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const rows = filtered.map(e =>
      `<tr>
        <td style="white-space:nowrap">${fmtDate(e.date)}</td>
        <td><span style="background:${TYPE_COLOR[e.type]}22;color:${TYPE_COLOR[e.type]};padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase">${e.type}</span></td>
        <td style="font-weight:600">${e.title.replace(/[✅⬜↙↗⏱️📞📧💬✍️💳📠📄📝]/g,'').trim()}</td>
        <td style="color:#475569;font-size:11px">${e.body || ''}</td>
        <td style="color:#64748b;font-size:11px">${e.author || ''}</td>
      </tr>`
    ).join('')

    const w = window.open('', '_blank', 'width=1000,height=800')
    w.document.write(`<!DOCTYPE html><html><head><title>Client Report — ${entityName}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;padding:36px;color:#1e293b;font-size:12px}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #1e3a8a}
      .firm{font-size:18px;font-weight:800;color:#1e3a8a}
      .client-name{font-size:22px;font-weight:800;color:#111;margin-bottom:4px}
      .meta{font-size:11px;color:#64748b}
      .summary{display:flex;gap:24px;margin-bottom:24px;padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px}
      .stat-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
      .stat-val{font-size:20px;font-weight:800;color:#1e3a8a}
      .stat-sub{font-size:10px;color:#94a3b8}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th{background:#f1f5f9;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;border:1px solid #e2e8f0}
      td{padding:7px 10px;border:1px solid #e2e8f0;vertical-align:top}
      tr:nth-child(even) td{background:#fafafa}
      .footer{margin-top:28px;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px;display:flex;justify-content:space-between}
      @media print{body{padding:16px}.no-print{display:none}}
    </style></head><body>
    <div class="header">
      <div>
        <div class="firm">${firmName()}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">${FIRM.address || ''} · ${FIRM.phone || ''}</div>
      </div>
      <div style="text-align:right">
        <div class="client-name">${entityName}</div>
        <div class="meta">${entityType.charAt(0).toUpperCase() + entityType.slice(1)} Activity Report · ${now}</div>
        ${dateFrom || dateTo ? `<div class="meta">${dateFrom || '—'} to ${dateTo || 'present'}</div>` : ''}
      </div>
    </div>
    <div class="summary">
      <div><div class="stat-label">Total Activities</div><div class="stat-val">${filtered.length}</div><div class="stat-sub">all types</div></div>
      <div><div class="stat-label">Calls</div><div class="stat-val">${filtered.filter(e=>e.type==='call').length}</div></div>
      <div><div class="stat-label">Tasks</div><div class="stat-val">${filtered.filter(e=>e.type==='task').length}</div></div>
      <div><div class="stat-label">E-Signs</div><div class="stat-val">${filtered.filter(e=>e.type==='esign').length}</div></div>
      <div><div class="stat-label">Payments</div><div class="stat-val">${filtered.filter(e=>e.type==='payment').length}</div></div>
      <div><div class="stat-label">WIP Hours</div><div class="stat-val">${totalHours.toFixed(1)}h</div><div class="stat-sub">$${wipAmount.toLocaleString('en-US',{maximumFractionDigits:0})} unbilled</div></div>
    </div>
    <table>
      <thead><tr><th>Date</th><th>Type</th><th>Activity</th><th>Details</th><th>By</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="footer">
      <span>${firmName()} · Confidential</span>
      <span>Generated ${now}</span>
    </div>
    </body></html>`)
    w.document.close()
    setTimeout(() => { w.print(); setPrinting(false) }, 500)
  }

  const TYPES = ['all','note','call','sms','email','task','esign','payment','time']

  if (loading) return <div style={{ padding: 24, color: 'var(--t3)', fontSize: 13 }}>Loading activity…</div>

  return (
    <div style={{ padding: 16 }}>

      {/* Header + print */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--tx)' }}>📋 Activity Report</div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{filtered.length} activities{dateFrom||dateTo ? ` · ${dateFrom||'—'} to ${dateTo||'present'}` : ' · all time'}</div>
        </div>
        <button onClick={printReport} disabled={printing}
          style={{ padding: '7px 16px', background: '#1e3a8a', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
          🖨️ {printing ? 'Preparing…' : 'Print / PDF'}
        </button>
      </div>

      {/* Summary bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { label: 'Calls',    val: events.filter(e=>e.type==='call').length,    color: '#22c55e' },
          { label: 'Tasks',    val: events.filter(e=>e.type==='task').length,    color: '#06b6d4' },
          { label: 'E-Signs',  val: events.filter(e=>e.type==='esign').length,   color: '#7c3aed' },
          { label: 'Payments', val: events.filter(e=>e.type==='payment').length, color: '#10b981' },
          { label: 'WIP',      val: `${totalHours.toFixed(1)}h`, color: '#f59e0b', sub: `$${wipAmount.toLocaleString('en-US',{maximumFractionDigits:0})} unbilled` },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--s1)', border: '1px solid var(--br)', borderRadius: 8, padding: '8px 12px', minWidth: 70 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.val}</div>
            {s.sub && <div style={{ fontSize: 10, color: 'var(--t3)' }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 3, background: 'var(--s1)', border: '1px solid var(--br)', borderRadius: 7, padding: 3, flexWrap: 'wrap' }}>
          {TYPES.map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              style={{ padding: '3px 9px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                       background: typeFilter === t ? (TYPE_COLOR[t] || 'var(--blue)') : 'transparent',
                       color: typeFilter === t ? '#fff' : 'var(--t2)' }}>
              {TYPE_ICON[t] || ''} {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{ padding: '5px 8px', background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }} />
        <span style={{ fontSize: 12, color: 'var(--t3)' }}>to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{ padding: '5px 8px', background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 6, color: 'var(--tx)', fontSize: 12 }} />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo('') }} style={{ fontSize: 11, color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer' }}>✕ Clear</button>
        )}
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>No activity found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.map(e => (
            <div key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px',
                                     background: 'var(--s1)', border: '1px solid var(--br)', borderRadius: 8 }}>
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{TYPE_ICON[e.type] || '•'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>{e.title}</span>
                  {e.type === 'time' && (
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 700,
                                   background: e.billed ? '#dcfce7' : '#fef3c7', color: e.billed ? '#15803d' : '#92400e' }}>
                      {e.billed ? 'Billed' : 'WIP'}
                    </span>
                  )}
                </div>
                {e.body && <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2 }}>{e.body}</div>}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--t3)', whiteSpace: 'nowrap' }}>{fmtDate(e.date)}</div>
                {e.author && <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1 }}>{e.author}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
