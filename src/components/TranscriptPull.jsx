import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import {
  PULL_PROVIDERS, getProvider, submitToProvider,
  parseYearSpec, nameKey, namesMatch,
  parseTranscriptFile, storeTranscriptAnalysis,
} from '../lib/transcriptPull'

// ── Pull Transcripts (Track 2) ──
// POA-gated pull requests + a watched TDS download folder that auto-imports,
// parses, matches to the client/request and files everything. The provider
// backend (IRS A2A — the Canopy channel) swaps in via transcriptPull.js when
// enrollment lands; nothing here changes.

const REQ_STATUSES = ['Requested', 'In Progress', 'Completed', 'Canceled']
const REQ_COLORS = { Requested: '#2563eb', 'In Progress': '#b45309', Completed: '#15803d', Canceled: '#64748b' }
const TRANSCRIPT_TYPES = ['Account Transcript', 'Wage and Income', 'Record of Account', 'Return Transcript', 'Verification of Non-Filing']
const BLANK = { clientName: '', types: ['Account Transcript', 'Wage and Income'], taxYears: '', provider: 'manual', notes: '' }

export default function TranscriptPull({ clientNames = [], poas = [], onGoToPoa, onImported }) {
  const { employeeName } = useApp()

  const [requests, setRequests] = useState([])
  const [legacyCount, setLegacyCount] = useState(0)
  const [migrating, setMigrating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [delId, setDelId] = useState(null)
  const [msg, setMsg] = useState('')

  // Watched folder
  const dirRef = useRef(null)          // FileSystemDirectoryHandle
  const seenRef = useRef(new Set())    // name:size:lastModified already processed this session
  const [dirName, setDirName] = useState('')
  const [scanning, setScanning] = useState(false)
  const [lastScan, setLastScan] = useState(null)
  const [imported, setImported] = useState([])   // { file, client, year, type }
  const [unmatched, setUnmatched] = useState([]) // { key, fileName, file, analysis, error?, assignTo }
  const fsSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window

  async function loadRequests() {
    setLoading(true)
    const { data } = await supabase.from('transcript_pull_requests').select('*').order('requested_at', { ascending: false })
    setRequests(data || [])
    setLoading(false)
  }
  useEffect(() => { loadRequests() }, [])

  // ── One-time migration from the retired Transcripts request tracker ──
  // Old `transcripts` rows that haven't been imported yet (marker not set).
  useEffect(() => {
    (async () => {
      const { count } = await supabase.from('transcripts').select('id', { count: 'exact', head: true }).not('migrated_to_pull', 'is', true)
      setLegacyCount(count || 0)
    })().catch(() => setLegacyCount(0))
  }, [])

  async function migrateLegacy() {
    setMigrating(true)
    try {
      const { data: old, error } = await supabase.from('transcripts').select('*').or('migrated_to_pull.is.null,migrated_to_pull.eq.false')
      if (error) throw new Error(error.message)
      const rows = old || []
      let done = 0
      for (const t of rows) {
        const received = (t.status || '').includes('Received')
        const years = Array.isArray(t.taxYears) ? t.taxYears.join(', ') : (t.taxYears || t.taxYearsCustom || null)
        const payload = {
          client_name: t.clientName || 'Unknown',
          transcript_types: t.transcriptType ? [t.transcriptType] : [],
          tax_years: years,
          provider: 'manual',
          status: received ? 'Completed' : ((t.status || '').includes('Error') || t.status === 'On Hold') ? 'Canceled' : 'In Progress',
          poa_record_id: null,
          requested_by: t.assignedTo || null,
          notes: `[Migrated from Transcripts tab] ${t.notes || ''}`.trim(),
          requested_at: t.requestDate || t.created_at || new Date().toISOString(),
          completed_at: received ? (t.receivedDate || null) : null,
        }
        const { error: insErr } = await supabase.from('transcript_pull_requests').insert([payload])
        if (!insErr) {
          await supabase.from('transcripts').update({ migrated_to_pull: true }).eq('id', t.id)
          done++
        }
      }
      setLegacyCount(0)
      loadRequests()
      flash(`✅ Migrated ${done} request${done === 1 ? '' : 's'} from the old Transcripts tab. Originals kept, marked migrated.`)
    } catch (e) {
      flash('❌ Migration failed: ' + e.message)
    }
    setMigrating(false)
  }


  function flash(t) { setMsg(t); setTimeout(() => setMsg(''), 6000) }
  function ff(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // ── POA gate ──
  function poaOnFile(clientName) {
    return poas.find(p => p.status === 'On File' && nameKey(p.client_name) === nameKey(clientName))
  }
  const formPoa = poaOnFile(form.clientName)

  async function createRequest() {
    if (!form.clientName.trim() || form.types.length === 0) return
    const poa = poaOnFile(form.clientName)
    if (!poa) return // gated — button is disabled, belt and suspenders
    setSaving(true)
    try {
      const row = {
        client_name: form.clientName.trim(),
        transcript_types: form.types,
        tax_years: form.taxYears.trim() || null,
        provider: form.provider,
        status: 'Requested',
        poa_record_id: poa.id,
        requested_by: employeeName || null,
        notes: form.notes || null,
      }
      await submitToProvider(form.provider, row)
      const { error } = await supabase.from('transcript_pull_requests').insert([row])
      if (error) throw new Error(error.message)
      setModal(false); setForm(BLANK)
      loadRequests()
      flash('✅ Pull request created. Pull from TDS — the watched folder files everything automatically.')
    } catch (e) {
      flash('❌ ' + e.message)
    }
    setSaving(false)
  }

  async function setStatus(id, status) {
    const patch = { status, updated_at: new Date().toISOString() }
    if (status === 'Completed') patch.completed_at = new Date().toISOString()
    await supabase.from('transcript_pull_requests').update(patch).eq('id', id)
    loadRequests()
  }

  async function deleteRequest(id) {
    await supabase.from('transcript_pull_requests').delete().eq('id', id)
    setDelId(null)
    loadRequests()
  }

  // ── Coverage: mark Completed when every requested year has an analysis ──
  async function refreshCoverage(req, justAddedId) {
    const patch = { updated_at: new Date().toISOString() }
    if (justAddedId) patch.result_analysis_ids = [ ...(req.result_analysis_ids || []), justAddedId ]
    const wanted = parseYearSpec(req.tax_years)
    let done = false
    if (wanted.size > 0) {
      const { data } = await supabase.from('transcript_analyses')
        .select('tax_year').eq('client_name', req.client_name)
      const have = new Set((data || []).map(r => String(r.tax_year || '')))
      done = [...wanted].every(y => have.has(y))
    }
    patch.status = done ? 'Completed' : 'In Progress'
    if (done) patch.completed_at = new Date().toISOString()
    await supabase.from('transcript_pull_requests').update(patch).eq('id', req.id)
  }

  // ── Watched folder ──
  async function connectFolder() {
    try {
      const handle = await window.showDirectoryPicker({ id: 'tds-downloads', mode: 'read' })
      dirRef.current = handle
      setDirName(handle.name)
      scanFolder(true)
    } catch { /* user canceled the picker */ }
  }

  function disconnectFolder() {
    dirRef.current = null
    setDirName('')
  }

  async function routeAnalysis(file, a, key) {
    const tp = a.taxpayer_name || ''
    // 1) open pull request match
    const open = requests.filter(r => r.status === 'Requested' || r.status === 'In Progress')
    const req = open.find(r => namesMatch(tp, r.client_name))
    if (req) {
      const id = await storeTranscriptAnalysis(file, req.client_name, a)
      await refreshCoverage(req, id)
      setImported(im => [...im, { file: file.name, client: req.client_name, year: a.tax_year, type: a.transcript_type }])
      return true
    }
    // 2) known client match (no open request — still file it)
    const client = clientNames.find(c => namesMatch(tp, c))
    if (client) {
      await storeTranscriptAnalysis(file, client, a)
      setImported(im => [...im, { file: file.name, client, year: a.tax_year, type: a.transcript_type }])
      return true
    }
    // 3) unmatched — queue for manual assignment
    setUnmatched(u => [...u, { key, fileName: file.name, file, analysis: a, assignTo: '' }])
    return false
  }

  async function scanFolder(manual = false) {
    const handle = dirRef.current
    if (!handle || scanning) return
    setScanning(true)
    let found = 0, filed = 0
    try {
      for await (const entry of handle.values()) {
        if (entry.kind !== 'file' || !/\.pdf$/i.test(entry.name)) continue
        const file = await entry.getFile()
        const key = `${entry.name}:${file.size}:${file.lastModified}`
        if (seenRef.current.has(key)) continue
        seenRef.current.add(key)
        found++
        try {
          const a = await parseTranscriptFile(file)
          if (await routeAnalysis(file, a, key)) filed++
        } catch (err) {
          setUnmatched(u => [...u, { key, fileName: entry.name, file, analysis: null, error: err.message, assignTo: '' }])
        }
      }
      setLastScan(new Date())
      loadRequests()
      if (onImported && filed > 0) onImported()
      if (manual) flash(found === 0 ? 'Scan complete — no new PDFs in the folder.' : `✅ Scan complete — ${filed} of ${found} new PDF${found === 1 ? '' : 's'} filed automatically.`)
    } catch (e) {
      flash('❌ Folder scan failed: ' + e.message)
    }
    setScanning(false)
  }

  // Rescan every 30s while a folder is connected (local filesystem only — no network polling)
  useEffect(() => {
    const t = setInterval(() => { if (dirRef.current) scanFolder(false) }, 30000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, clientNames])

  async function assignUnmatched(item) {
    if (!item.assignTo.trim() || !item.analysis) return
    try {
      const id = await storeTranscriptAnalysis(item.file, item.assignTo.trim(), item.analysis)
      const open = requests.filter(r => (r.status === 'Requested' || r.status === 'In Progress') && nameKey(r.client_name) === nameKey(item.assignTo))
      if (open[0]) await refreshCoverage(open[0], id)
      setUnmatched(u => u.filter(x => x.key !== item.key))
      setImported(im => [...im, { file: item.fileName, client: item.assignTo.trim(), year: item.analysis.tax_year, type: item.analysis.transcript_type }])
      loadRequests()
      if (onImported) onImported()
    } catch (e) { flash('❌ ' + e.message) }
  }

  const importedCount = (r) => (r.result_analysis_ids || []).length
  const inputStyle = { width: '100%', boxSizing: 'border-box' }

  return (
    <div>
      {legacyCount > 0 && (
        <div style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid #2563eb', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>📥 {legacyCount} request{legacyCount === 1 ? '' : 's'} from the old Transcripts tab</div>
            <div style={{ color: 'var(--t3)', fontSize: 11.5, marginTop: 3 }}>Bring your existing transcript request history into Pull Transcripts. Originals are kept and marked migrated — nothing is deleted.</div>
          </div>
          <button className="btn" disabled={migrating} onClick={migrateLegacy}>{migrating ? 'Migrating…' : `Migrate ${legacyCount}`}</button>
        </div>
      )}

      {/* ── Provider strip ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, marginBottom: 16 }}>
        {PULL_PROVIDERS.map(p => (
          <div key={p.id} style={{ background: 'var(--s2)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', opacity: p.available ? 1 : 0.75 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{p.label}</div>
              <span style={{ background: p.available ? '#15803d' : '#64748b', color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>{p.chip}</span>
            </div>
            <div style={{ color: 'var(--t3)', fontSize: 11.5, marginTop: 6, lineHeight: 1.45 }}>{p.note}</div>
          </div>
        ))}
      </div>

      {/* ── Watched folder ── */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--line)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>📂 Watched TDS Download Folder</div>
            <div style={{ color: 'var(--t3)', fontSize: 11.5, marginTop: 4 }}>
              Point this at the folder where you save TDS downloads. Every new PDF is parsed in the browser,
              matched to the client by the name on the transcript, filed under Transcript Analysis, and counted
              against the open pull request. Nothing leaves your machine except the finished analysis row.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {!fsSupported ? (
              <span style={{ color: 'var(--t3)', fontSize: 12 }}>This browser can't watch folders — use Chrome/Edge, or upload on the Transcript Analysis tab.</span>
            ) : dirName ? (
              <>
                <span style={{ fontSize: 12, color: 'var(--t2)' }}>
                  Watching <b>{dirName}</b>{lastScan ? ` · last scan ${lastScan.toLocaleTimeString()}` : ''} · rescans every 30s
                </span>
                <button className="btn sec" disabled={scanning} onClick={() => scanFolder(true)}>{scanning ? '⏳ Scanning…' : '🔄 Scan Now'}</button>
                <button className="btn sec" onClick={disconnectFolder}>Disconnect</button>
              </>
            ) : (
              <button className="btn" onClick={connectFolder}>Connect Download Folder</button>
            )}
          </div>
        </div>
        {imported.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--t2)' }}>
            {imported.slice(-6).map((i, k) => (
              <div key={k}>✅ {i.file} → <b>{i.client}</b> {i.year ? `(${i.year}` : ''}{i.type ? `${i.year ? ', ' : '('}${i.type})` : i.year ? ')' : ''}</div>
            ))}
          </div>
        )}
        {unmatched.length > 0 && (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>Needs a client ({unmatched.length})</div>
            {unmatched.map(u => (
              <div key={u.key} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '4px 0', fontSize: 12 }}>
                <span style={{ minWidth: 200 }}>{u.fileName}</span>
                {u.error ? (
                  <>
                    <span style={{ color: '#f87171' }}>{u.error}</span>
                    <button className="btn sec" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => setUnmatched(x => x.filter(i => i.key !== u.key))}>Dismiss</button>
                  </>
                ) : (
                  <>
                    <span style={{ color: 'var(--t3)' }}>name on transcript: <b>{u.analysis?.taxpayer_name || 'not found'}</b></span>
                    <input list="irsportal-clients" placeholder="Assign to client…" value={u.assignTo} style={{ width: 200 }}
                      onChange={e => setUnmatched(x => x.map(i => i.key === u.key ? { ...i, assignTo: e.target.value } : i))} />
                    <button className="btn sec" style={{ fontSize: 10, padding: '3px 8px' }} disabled={!u.assignTo.trim()} onClick={() => assignUnmatched(u)}>File It</button>
                    <button className="btn sec" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => setUnmatched(x => x.filter(i => i.key !== u.key))}>Skip</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Requests ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ color: 'var(--t3)', fontSize: 12 }}>
          Requests require a POA <b>On File</b> — same gate the IRS applies to TDS access.
          {msg && <span style={{ marginLeft: 10, color: 'var(--t2)' }}>{msg}</span>}
        </div>
        <button className="btn" onClick={() => { setForm(BLANK); setModal(true) }}>+ New Pull Request</button>
      </div>

      {loading ? <div style={{ color: 'var(--t3)', fontSize: 13 }}>Loading…</div> :
        requests.length === 0 ? (
          <div style={{ color: 'var(--t3)', fontSize: 13 }}>No pull requests yet. Create one for each client whose transcripts you're pulling.</div>
        ) : (
          <div style={{ background: 'var(--s2)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: 'var(--t3)', textAlign: 'left' }}>
                  {['Client', 'Transcripts', 'Years', 'Provider', 'Status', 'Filed', 'Requested', ''].map(h =>
                    <th key={h} style={{ padding: '8px 12px', fontWeight: 600 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {requests.map(r => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 700 }}>{r.client_name}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--t2)', fontSize: 11 }}>{(r.transcript_types || []).join(', ') || '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--t2)' }}>{r.tax_years || '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--t2)', fontSize: 11 }}>{getProvider(r.provider).label.split(' — ')[0]}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ background: REQ_COLORS[r.status] || '#64748b', color: '#fff', borderRadius: 6, padding: '2px 9px', fontSize: 10.5, fontWeight: 700 }}>{r.status}</span>
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--t2)' }}>{importedCount(r)}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--t2)', fontSize: 11 }}>
                      {r.requested_at ? new Date(r.requested_at).toLocaleDateString() : '—'}{r.requested_by ? ` · ${r.requested_by}` : ''}
                    </td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                      <a className="btn sec" style={{ fontSize: 10, padding: '3px 8px', marginRight: 4 }} href="https://www.irs.gov/e-services" target="_blank" rel="noreferrer">↗ TDS</a>
                      {(r.status === 'Requested' || r.status === 'In Progress') &&
                        <button className="btn sec" style={{ fontSize: 10, padding: '3px 8px', marginRight: 4 }} onClick={() => setStatus(r.id, 'Completed')}>Mark Complete</button>}
                      {r.status === 'Completed' &&
                        <button className="btn sec" style={{ fontSize: 10, padding: '3px 8px', marginRight: 4 }} onClick={() => setStatus(r.id, 'In Progress')}>Reopen</button>}
                      <button className="btn sec" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => setDelId(r.id)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <div style={{ color: 'var(--t3)', fontSize: 11, marginTop: 10 }}>
        A request auto-completes once every requested year has an analyzed transcript on file for that client.
        No credential automation, ever — direct pulls activate only through IRS-sanctioned channels (A2A enrollment / authorized partner).
      </div>

      {/* ── New request modal ── */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setModal(false)}>
          <div style={{ background: 'var(--s2)', border: '1px solid var(--line)', borderRadius: 12, padding: 20, width: 'min(540px, 94vw)', maxHeight: '88vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>New Transcript Pull Request</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 11, color: 'var(--t3)' }}>Client</label>
                <input list="irsportal-clients" value={form.clientName} onChange={e => ff('clientName', e.target.value)} style={inputStyle} placeholder="Client name" />
                {form.clientName.trim() && (
                  formPoa ? (
                    <div style={{ fontSize: 11.5, color: '#15803d', marginTop: 4 }}>
                      ✅ POA on file — Form {formPoa.form_type}{formPoa.tax_years ? ` · years ${formPoa.tax_years}` : ''}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11.5, color: '#f87171', marginTop: 4 }}>
                      ❌ No POA with status <b>On File</b> for this client — TDS access requires one.{' '}
                      <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => { setModal(false); onGoToPoa && onGoToPoa() }}>Record it in the POA / CAF Tracker</span> first.
                    </div>
                  )
                )}
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 11, color: 'var(--t3)' }}>Transcript Types</label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                  {TRANSCRIPT_TYPES.map(t => (
                    <label key={t} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.types.includes(t)}
                        onChange={e => ff('types', e.target.checked ? [...form.types, t] : form.types.filter(x => x !== t))} />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--t3)' }}>Tax Years</label>
                <input value={form.taxYears} onChange={e => ff('taxYears', e.target.value)} style={inputStyle} placeholder="2019-2024" />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--t3)' }}>Provider</label>
                <select value={form.provider} onChange={e => ff('provider', e.target.value)} style={inputStyle}>
                  {PULL_PROVIDERS.map(p => <option key={p.id} value={p.id} disabled={!p.available}>{p.label}{p.available ? '' : ` (${p.chip.toLowerCase()})`}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 11, color: 'var(--t3)' }}>Notes</label>
                <textarea value={form.notes} onChange={e => ff('notes', e.target.value)} rows={2} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="btn sec" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn" disabled={saving || !form.clientName.trim() || form.types.length === 0 || !formPoa} onClick={createRequest}>
                {saving ? 'Creating…' : 'Create Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* delete confirm */}
      {delId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--s2)', border: '1px solid var(--line)', borderRadius: 12, padding: 20, width: 'min(380px, 92vw)' }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Delete this pull request? Filed analyses stay on the Transcript Analysis tab.</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn sec" onClick={() => setDelId(null)}>Cancel</button>
              <button className="btn" style={{ background: '#b91c1c' }} onClick={() => deleteRequest(delId)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
