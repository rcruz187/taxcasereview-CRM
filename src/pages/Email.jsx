import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const TEMPLATES = [
  { label:'Welcome Letter',       subject:'Welcome to Tax Case Review', body:'Dear {name},\n\nWelcome to Tax Case Review! We are pleased to begin working on your tax resolution case. Your dedicated case representative will be in touch shortly.\n\nBest regards,\nTax Case Review' },
  { label:'Document Request',     subject:'Documents Needed — Your Tax Case', body:'Dear {name},\n\nTo proceed with your case, we need the following documents:\n\n1. Last 2 years of tax returns\n2. Most recent IRS notice(s)\n3. Photo ID\n\nPlease provide these at your earliest convenience.\n\nThank you,\nTax Case Review' },
  { label:'OIC Update',           subject:'Update on Your Offer in Compromise', body:'Dear {name},\n\nWe have an update regarding your Offer in Compromise. The IRS has reviewed your submission and we are awaiting their response.\n\nBest regards,\nTax Case Review' },
  { label:'Appointment Reminder', subject:'Appointment Reminder — Tax Case Review', body:'Dear {name},\n\nThis is a reminder of your upcoming appointment. Please ensure you have all requested documents ready.\n\nThank you,\nTax Case Review' },
  { label:'Resolution Complete',  subject:'Your Case Has Been Resolved', body:'Dear {name},\n\nWe are pleased to inform you that your tax resolution case has been successfully resolved.\n\nThank you for trusting Tax Case Review.\n\nBest regards,\nTax Case Review' },
  { label:'IRS Notice Response',  subject:'Re: IRS Notice — Action Required', body:'Dear {name},\n\nWe have reviewed your IRS notice and are preparing a response on your behalf. No action is required from you at this time.\n\nWe will keep you updated on all developments.\n\nBest regards,\nTax Case Review' },
  { label:'Payment Receipt',      subject:'Payment Received — Thank You', body:'Dear {name},\n\nThank you for your payment. Your account has been updated and we will continue working diligently on your case.\n\nBest regards,\nTax Case Review' },
]

const TRIAGE = ['Inbox','Action Needed','Waiting','Sent','Archive']
const TRIAGE_COLORS = { 'Action Needed':'var(--bad)', 'Waiting':'var(--warn)', 'Inbox':'var(--blue)', 'Sent':'var(--ok)', 'Archive':'var(--t3)' }
const BLANK = { recipient:'', clientName:'', subject:'', body:'', triage:'Inbox', status:'Sent' }

export default function Email() {
  const [emails, setEmails]     = useState([])
  const [confirmDel, setConfirmDel] = useState(null)
  const [clients, setClients]   = useState([])
  const [form, setForm]         = useState(BLANK)
  const [sug, setSug]           = useState([])
  const [saving, setSaving]     = useState(false)
  const [toast, setToast]       = useState('')
  const [view, setView]         = useState('inbox') // inbox | compose | templates
  const [triageFilter, setTriageFilter] = useState('Inbox')
  const [selected, setSelected] = useState(null)
  const [search, setSearch]     = useState('')
  const [gmailConnected, setGmailConnected] = useState(false)
  const [gmailClientId, setGmailClientId] = useState('')

  useEffect(() => { load(); loadGmailConfig() }, [])

  async function loadGmailConfig() {
    const { data } = await supabase.from('settings').select('gmail_client_id').limit(1).maybeSingle()
    if (data?.gmail_client_id) setGmailClientId(data.gmail_client_id)
  }

  async function load() {
    const [{ data: e }, { data: c }] = await Promise.all([
      supabase.from('emails').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('id,name,email')
    ])
    if (e) setEmails(e)
    if (c) setClients(c)
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3500) }
  function fld(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function searchClient(val) {
    fld('clientName', val)
    if (val.length < 2) { setSug([]); return }
    const m = clients.filter(c => c.name.toLowerCase().includes(val.toLowerCase())).slice(0, 5)
    setSug(m)
    const match = clients.find(c => c.name.toLowerCase() === val.toLowerCase())
    if (match?.email) fld('recipient', match.email)
  }

  function useTemplate(t) {
    const name = form.clientName || '{name}'
    setForm(f => ({ ...f, subject: t.subject, body: t.body.replace(/{name}/g, name) }))
    setView('compose')
  }

  async function send() {
    if (!form.clientName || !form.subject || !form.body) { showToast('Client, subject and body required'); return }
    setSaving(true)
    const { error } = await supabase.from('emails').insert([{ ...form, created_at: new Date().toISOString() }])
    setSaving(false)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('✅ Email logged!')
    setForm(BLANK); setView('inbox'); load()
  }

  async function moveTriage(id, triage) {
    await supabase.from('emails').update({ triage }).eq('id', id)
    load()
    if (selected?.id === id) setSelected(prev => ({ ...prev, triage }))
  }

  async function deleteEmail(id) {
    if (!confirmDel) { setConfirmDel('pending'); return }
    setConfirmDel(null)
    await supabase.from('emails').delete().eq('id', id)
    setSelected(null); load()
  }

  const filtered = emails.filter(e => {
    const t = e.triage || 'Inbox'
    if (triageFilter !== t) return false
    if (search && !e.subject?.toLowerCase().includes(search.toLowerCase()) && !e.clientName?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const counts = {}
  TRIAGE.forEach(t => { counts[t] = emails.filter(e => (e.triage || 'Inbox') === t).length })

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 52px)', margin: '-16px', overflow: 'hidden', background: 'var(--bg)' }}>
      {toast && <div className="toast show">{toast}</div>}

      {/* ── Left sidebar ── */}
      <div style={{ width: 220, flexShrink: 0, background: 'var(--nav)', borderRight: '1px solid var(--br)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 14px 10px' }}>
          <button className="btn pri" style={{ width: '100%', justifyContent: 'center', fontWeight: 700 }} onClick={() => { setForm(BLANK); setView('compose') }}>
            ✏️ Compose
          </button>
        </div>

        {/* Gmail connect banner */}
        {!gmailConnected && (
          <div style={{ margin: '0 10px 10px', padding: '10px 12px', background: 'rgba(26,127,212,.12)', borderRadius: 8, border: '1px solid rgba(26,127,212,.3)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', marginBottom: 4 }}>📧 Connect Gmail</div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 8, lineHeight: 1.5 }}>Link your Gmail account to send & receive emails directly.</div>
            {gmailClientId ? (
              <button onClick={() => {
                const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${gmailClientId}&redirect_uri=${encodeURIComponent(window.location.origin + '/taxcasereview-CRM/auth/callback')}&response_type=code&scope=https://mail.google.com/&access_type=offline&prompt=consent`
                window.open(url, '_blank')
                showToast('Complete authorization in the popup window')
              }} style={{ width: '100%', padding: '5px 0', borderRadius: 6, border: 'none', background: 'var(--blue)', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                🔗 Connect Gmail
              </button>
            ) : (
              <button onClick={() => showToast('Go to Settings → Integrations to add your Gmail Client ID first')} style={{ width: '100%', padding: '5px 0', borderRadius: 6, border: 'none', background: 'var(--s2)', color: 'var(--t3)', cursor: 'pointer', fontSize: 11, border: '1px solid var(--br)' }}>
                ⚙️ Setup in Settings
              </button>
            )}
          </div>
        )}

        {/* Triage folders */}
        <div style={{ padding: '4px 0' }}>
          <div style={{ padding: '6px 14px 4px', fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Triage</div>
          {TRIAGE.map(t => (
            <div key={t} onClick={() => { setTriageFilter(t); setView('inbox'); setSelected(null) }} style={{
              padding: '7px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: triageFilter === t && view === 'inbox' ? 'rgba(26,127,212,.18)' : 'transparent',
              borderLeft: triageFilter === t && view === 'inbox' ? '3px solid var(--blue)' : '3px solid transparent',
              borderRadius: 0, transition: 'all .1s',
            }}>
              <span style={{ fontSize: 13, color: triageFilter === t && view === 'inbox' ? 'var(--blue)' : 'var(--t2)', fontWeight: triageFilter === t ? 700 : 400 }}>
                {t === 'Action Needed' ? '🔴' : t === 'Waiting' ? '🟡' : t === 'Inbox' ? '📥' : t === 'Sent' ? '📤' : '📦'} {t}
              </span>
              {counts[t] > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: TRIAGE_COLORS[t] + '33', color: TRIAGE_COLORS[t] }}>{counts[t]}</span>
              )}
            </div>
          ))}
        </div>

        <div style={{ height: 1, background: 'var(--br)', margin: '8px 0' }} />

        {/* Templates shortcut */}
        <div onClick={() => setView('templates')} style={{
          padding: '7px 14px', cursor: 'pointer', fontSize: 13, color: 'var(--t2)',
          borderLeft: view === 'templates' ? '3px solid var(--blue)' : '3px solid transparent',
          background: view === 'templates' ? 'rgba(26,127,212,.18)' : 'transparent',
        }}>
          📋 Templates ({TEMPLATES.length})
        </div>
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Email list */}
        {view === 'inbox' && (
          <>
            <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--br)', display: 'flex', flexDirection: 'column', background: 'var(--sf)' }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--br)' }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search emails…"
                  style={{ width: '100%', padding: '7px 12px', borderRadius: 8, border: '1px solid var(--br)', background: 'var(--s2)', color: 'var(--tx)', fontSize: 13 }} />
              </div>
              <div style={{ flex: 1, overflow: 'auto' }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: 30, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>No emails in {triageFilter}</div>
                ) : filtered.map(e => (
                  <div key={e.id} onClick={() => setSelected(e)} style={{
                    padding: '12px 14px', borderBottom: '1px solid var(--br)', cursor: 'pointer',
                    background: selected?.id === e.id ? 'rgba(26,127,212,.14)' : 'transparent',
                    borderLeft: selected?.id === e.id ? '3px solid var(--blue)' : '3px solid transparent',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--tx)' }}>{e.clientName || e.recipient || 'Unknown'}</div>
                      <div style={{ fontSize: 10, color: 'var(--t3)', flexShrink: 0, marginLeft: 8 }}>
                        {e.created_at ? new Date(e.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.subject}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.body?.slice(0, 80)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Email detail */}
            <div style={{ flex: 1, overflow: 'auto', padding: 24, background: 'var(--bg)' }}>
              {selected ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--tx)', marginBottom: 6 }}>{selected.subject}</div>
                      <div style={{ fontSize: 13, color: 'var(--t3)' }}>To: {selected.clientName} {selected.recipient ? `<${selected.recipient}>` : ''}</div>
                      <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>{selected.created_at ? new Date(selected.created_at).toLocaleString() : ''}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {/* Move triage */}
                      {TRIAGE.filter(t => t !== (selected.triage || 'Inbox')).map(t => (
                        <button key={t} className="btn sec" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => moveTriage(selected.id, t)}>→ {t}</button>
                      ))}
                      <button className="btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setForm({ ...BLANK, clientName: selected.clientName, recipient: selected.recipient, subject: 'Re: ' + selected.subject }); setView('compose') }}>↩ Reply</button>
                      <button className="btn del" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => deleteEmail(selected.id)}>🗑</button>
                    </div>
                  </div>
                  <div style={{ background: 'var(--sf)', border: '1px solid var(--br)', borderRadius: 10, padding: 20, fontSize: 14, lineHeight: 1.8, color: 'var(--tx)', whiteSpace: 'pre-wrap' }}>
                    {selected.body}
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--t3)' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>📧</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--tx)', marginBottom: 6 }}>Select an email to read</div>
                  <div style={{ fontSize: 13 }}>Or compose a new one</div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Compose */}
        {view === 'compose' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 32, maxWidth: 700 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <button className="btn" onClick={() => setView('inbox')}>← Back</button>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--tx)' }}>New Email</div>
            </div>

            <div className="field" style={{ position: 'relative' }}>
              <label>Client Name *</label>
              <input value={form.clientName} onChange={e => searchClient(e.target.value)} placeholder="Search client…" autoComplete="off" onBlur={() => setTimeout(() => setSug([]), 150)} />
              {sug.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--s3)', border: '1px solid var(--br)', borderRadius: 7, zIndex: 100 }}>
                  {sug.map(c => <div key={c.id} onClick={() => { fld('clientName', c.name); if (c.email) fld('recipient', c.email); setSug([]) }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}>{c.name} {c.email ? `— ${c.email}` : ''}</div>)}
                </div>
              )}
            </div>
            <div className="field"><label>To (email address)</label>
              <input type="email" value={form.recipient} onChange={e => fld('recipient', e.target.value)} placeholder="client@email.com" />
            </div>
            <div className="field"><label>Subject *</label>
              <input value={form.subject} onChange={e => fld('subject', e.target.value)} placeholder="Email subject…" />
            </div>

            {/* Quick templates */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Quick Templates</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TEMPLATES.map(t => (
                  <button key={t.label} className="btn sec" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => useTemplate(t)}>{t.label}</button>
                ))}
              </div>
            </div>

            <div className="field"><label>Body *</label>
              <textarea value={form.body} onChange={e => fld('body', e.target.value)} rows={14} style={{ minHeight: 280, fontFamily: 'inherit', lineHeight: 1.7 }} placeholder="Email body…" />
            </div>
            <div className="field"><label>Triage</label>
              <select value={form.triage} onChange={e => fld('triage', e.target.value)}>
                {TRIAGE.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn" onClick={() => setView('inbox')}>Cancel</button>
              <button className="btn pri" style={{ flex: 1, justifyContent: 'center', padding: 12 }} onClick={send} disabled={saving}>
                {saving ? 'Saving…' : '📤 Log Email'}
              </button>
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--t3)', textAlign: 'center' }}>
              Connect Gmail in the sidebar to send directly. Until then, emails are logged for tracking.
            </div>
          </div>
        )}

        {/* Templates library */}
        {view === 'templates' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 32 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--tx)', marginBottom: 20 }}>📋 Email Templates</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
              {TEMPLATES.map(t => (
                <div key={t.label} className="card" style={{ padding: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--tx)', marginBottom: 4 }}>{t.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--blue)', marginBottom: 10 }}>{t.subject}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'hidden' }}>{t.body}</div>
                  <button className="btn pri" style={{ marginTop: 14, width: '100%', justifyContent: 'center', fontSize: 12 }} onClick={() => useTemplate(t)}>
                    Use Template
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {confirmDel && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setConfirmDel(null)}>
          <div className="modal" style={{maxWidth:360,textAlign:'center'}}>
            <div style={{fontSize:36,marginBottom:12}}>🗑</div>
            <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>Delete this email?</div>
            <div style={{fontSize:13,color:'var(--t3)',marginBottom:20}}>This cannot be undone.</div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn sec" style={{flex:1,justifyContent:'center'}} onClick={()=>setConfirmDel(null)}>Cancel</button>
              <button className="btn del" style={{flex:1,justifyContent:'center'}} onClick={()=>{ deleteEmail(confirmDel); setConfirmDel(null) }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
