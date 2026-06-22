import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useLocation } from 'react-router-dom'

const BLANK = { to_number:'', from_number:'', client_name:'', subject:'', notes:'' }

function fmtPhone(v) {
  const d = v.replace(/\D/g,'')
  if (d.length <= 3) return d
  if (d.length <= 6) return `(${d.slice(0,3)}) ${d.slice(3)}`
  if (d.length <= 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  return `+${d.slice(0,1)} (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7,11)}`
}

export default function Fax() {
  const { user } = useApp()
  const [logs,     setLogs]     = useState([])
  const [clients,  setClients]  = useState([])
  const [modal,    setModal]    = useState(false)
  const location = useLocation()
  const qp = new URLSearchParams(location.search)
  const [form, setForm] = useState({...BLANK,
    client_name: qp.get('client') || '',
    to_number:   (qp.get('phone') || '').replace(/\D/g,'')
  })
  const [file,     setFile]     = useState(null)
  const [sending,  setSending]  = useState(false)
  const [toast,    setToast]    = useState('')
  const [search,   setSearch]   = useState('')
  const [filterStatus, setFilter] = useState('All')
  const [settings, setSettings]  = useState({})
  const [confirmDel, setConfirmDel] = useState(null)
  const [showSug,  setShowSug]  = useState(false)
  const [sugg,     setSugg]     = useState([])

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data:f },{ data:c },{ data:s }] = await Promise.all([
      supabase.from('fax_logs').select('*').order('created_at',{ascending:false}),
      supabase.from('clients').select('id,name,phone'),
      supabase.from('settings').select('sw_space_url,sw_inbound_did,firm_fax_number').limit(1).maybeSingle(),
    ])
    if (f) setLogs(f)
    if (c) setClients(c)
    if (s) {
      setSettings(s)
      const defaultFrom = s.firm_fax_number || s.sw_inbound_did
      if (defaultFrom) setForm(prev => prev.from_number ? prev : { ...prev, from_number: defaultFrom.replace(/\D/g,'') })
    }
  }

  function showToast(msg,type='ok') { setToast({msg,type}); setTimeout(()=>setToast(''),4000) }
  function fld(k,v) { setForm(f=>({...f,[k]:v})) }

  function searchClient(val) {
    fld('client_name', val)
    if (val.length < 2) { setSugg([]); setShowSug(false); return }
    const m = clients.filter(c=>c.name.toLowerCase().includes(val.toLowerCase())).slice(0,6)
    setSugg(m); setShowSug(m.length>0)
  }

  function pickClient(c) {
    fld('client_name', c.name)
    if (c.phone) fld('to_number', c.phone.replace(/\D/g,''))
    setSugg([]); setShowSug(false)
  }

  async function sendFax() {
    if (!form.to_number) { showToast('Recipient fax number required','err'); return }
    if (!file && !form.notes) { showToast('Attach a PDF or enter a message','err'); return }
    setSending(true)

    try {
      let mediaUrl = null

      // Upload file to Supabase storage first if provided
      if (file) {
        const path = `fax/${Date.now()}_${file.name}`
        const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
        if (upErr) throw new Error('Upload failed: ' + upErr.message)
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
        mediaUrl = urlData.publicUrl
      }

      // Format numbers E.164
      const toNum   = '+1' + form.to_number.replace(/\D/g,'').slice(-10)
      const fromNum = form.from_number
        ? '+1' + form.from_number.replace(/\D/g,'').slice(-10)
        : (settings.firm_fax_number || settings.sw_inbound_did || '')

      // Call the send-fax Supabase Edge Function
      const { data: resData, error: invokeErr } = await supabase.functions.invoke('send-fax', {
        body: {
          to: toNum,
          from: fromNum,
          ...(mediaUrl ? { document_url: mediaUrl } : {}),
        }
      })

      const sw_id = resData?.sid || null
      const status = !invokeErr && resData?.success ? 'Sent' : 'Failed'

      // Log to Supabase regardless of result
      const { error: logErr } = await supabase.from('fax_logs').insert([{
        to_number: toNum, from_number: fromNum,
        client_name: form.client_name, subject: form.subject,
        notes: form.notes, file_name: file?.name || null,
        file_url: mediaUrl, signalwire_fax_id: sw_id,
        status, sent_by: user?.email || 'Unknown',
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        error_msg: status === 'Failed' ? JSON.stringify(resData?.error || invokeErr?.message || 'Send failed').slice(0,200) : null,
      }])

      if (logErr) console.error('Log error:', logErr)
      if (status === 'Sent') {
        showToast('✅ Fax sent successfully!')
        setModal(false); setForm(BLANK); setFile(null); load()
      } else {
        showToast('Error: ' + (resData?.error || invokeErr?.message || 'Check SignalWire credentials in Settings'), 'err')
        load()
      }
    } catch(e) {
      showToast('Error: ' + e.message, 'err')
    } finally {
      setSending(false)
    }
  }

  async function del(id) {
    await supabase.from('fax_logs').delete().eq('id', id)
    setConfirmDel(null); showToast('Deleted'); load()
  }

  const filtered = logs.filter(l => {
    const q = search.toLowerCase()
    const mq = !q || l.client_name?.toLowerCase().includes(q) || l.to_number?.includes(q) || l.subject?.toLowerCase().includes(q)
    const ms = filterStatus==='All' || l.status===filterStatus
    return mq && ms
  })

  const outboundLogs = logs.filter(l=>l.direction!=='inbound')
  const inboundLogs  = logs.filter(l=>l.direction==='inbound')
  const sent     = outboundLogs.filter(l=>l.status==='Sent').length
  const failed   = outboundLogs.filter(l=>l.status==='Failed').length
  const received = inboundLogs.length

  return (
    <div style={{maxWidth:1000}}>
      {toast && <div className={`toast show ${toast.type==='err'?'terr':''}`}>{toast.msg||toast}</div>}

      {!settings?.sw_space_url && (
        <div style={{background:'rgba(245,158,11,.08)',border:'1px solid rgba(245,158,11,.3)',borderRadius:8,padding:'10px 16px',marginBottom:14,fontSize:12,color:'var(--warn)',display:'flex',alignItems:'center',gap:10}}>
          <span>⚠️</span>
          <span>SignalWire isn't configured yet. <strong>Settings → 📞 SignalWire</strong> to set up. You can still log faxes manually.</span>
        </div>
      )}

      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
        <h2 style={{fontSize:15,fontWeight:700,margin:0}}>📠 Fax</h2>
        <button className="btn pri" onClick={()=>{setForm(BLANK);setFile(null);setModal(true)}}>+ Send Fax</button>
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:8,marginBottom:14}}>
        {[
          ['Total Sent', outboundLogs.length, 'var(--tx)'],
          ['Successful', sent, 'var(--ok)'],
          ['Failed', failed, 'var(--bad)'],
          ['Received', received, 'var(--blue)'],
          ['This Month', logs.filter(l=>(l.sent_at||l.created_at)?.slice(0,7)===new Date().toISOString().slice(0,7)).length, 'var(--b2)'],
        ].map(([l,v,c])=>(
          <div key={l} className="card" style={{padding:'10px 14px',textAlign:'center'}}>
            <div style={{fontWeight:800,fontSize:20,color:c}}>{v}</div>
            <div style={{fontSize:10,color:'var(--t3)',marginTop:2,textTransform:'uppercase',letterSpacing:'.05em'}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search client, number, subject…"
          style={{flex:1,minWidth:180,padding:'7px 12px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:12}}/>
        {['All','Sent','Failed','Pending'].map(s=>(
          <button key={s} className={`btn ${filterStatus===s?'pri':'sec'}`} style={{fontSize:10,padding:'4px 10px'}} onClick={()=>setFilter(s)}>{s}</button>
        ))}
      </div>

      {/* Fax log table */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        {filtered.length===0 ? (
          <div style={{padding:32,textAlign:'center',color:'var(--t3)',fontSize:13}}>
            {logs.length===0 ? '📠 No faxes sent yet. Click "+ Send Fax" to get started.' : 'No faxes match your filters.'}
          </div>
        ) : (
          <div className="ovx"><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{borderBottom:'1px solid var(--br)',background:'var(--s2)'}}>
                {['','Date & Time','Client','To Number','Subject','File','Status','Sent By',''].map(h=>(
                  <th key={h} style={{padding:'9px 12px',textAlign:'left',fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.05em'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(l=>(
                <tr key={l.id} style={{borderBottom:'1px solid var(--br)'}}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--s2)'}
                  onMouseLeave={e=>e.currentTarget.style.background=''}>
                  <td style={{padding:'9px 12px'}}>{l.direction==='inbound'?<span title="Received" style={{color:'var(--blue)'}}>📥</span>:<span title="Sent" style={{color:'var(--t3)'}}>📤</span>}</td>
                  <td style={{padding:'9px 12px',color:'var(--t2)',whiteSpace:'nowrap'}}>
                    <div style={{fontWeight:600,fontSize:12}}>{(l.sent_at||l.created_at) ? new Date(l.sent_at||l.created_at).toLocaleDateString() : '—'}</div>
                    <div style={{fontSize:10,color:'var(--t3)'}}>{(l.sent_at||l.created_at) ? new Date(l.sent_at||l.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : ''}</div>
                  </td>
                  <td style={{padding:'9px 12px',fontWeight:600}}>{l.client_name||'—'}</td>
                  <td style={{padding:'9px 12px',fontFamily:'monospace',fontSize:11}}>{l.to_number||'—'}</td>
                  <td style={{padding:'9px 12px',color:'var(--t2)',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.subject||'—'}</td>
                  <td style={{padding:'9px 12px'}}>
                    {l.file_url ? (
                      <a href={l.file_url} target="_blank" rel="noreferrer" style={{fontSize:11,color:'var(--blue)',textDecoration:'none',display:'flex',alignItems:'center',gap:4}}>
                        📄 {l.file_name?.slice(0,18)||'View'}
                      </a>
                    ) : <span style={{color:'var(--t3)'}}>—</span>}
                  </td>
                  <td style={{padding:'9px 12px'}}>
                    <span className={`bdg ${l.status==='Sent'?'bg':l.status==='Failed'?'br':'ba'}`}>{l.status}</span>
                    {l.error_msg && <div style={{fontSize:9,color:'var(--bad)',marginTop:2,maxWidth:120,overflow:'hidden',textOverflow:'ellipsis'}}>{l.error_msg.slice(0,40)}</div>}
                  </td>
                  <td style={{padding:'9px 12px',fontSize:11,color:'var(--t3)'}}>{l.sent_by?.split('@')[0]||'—'}</td>
                  <td style={{padding:'9px 12px'}}>
                    <button className="btn del" style={{fontSize:10,padding:'3px 8px'}} onClick={()=>setConfirmDel(l.id)}>Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      {/* Delete confirm */}
      {confirmDel && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setConfirmDel(null)}>
          <div className="modal" style={{maxWidth:360,textAlign:'center'}}>
            <div style={{fontSize:36,marginBottom:12}}>🗑</div>
            <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>Delete this fax log?</div>
            <div style={{fontSize:13,color:'var(--t3)',marginBottom:20}}>This cannot be undone.</div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn sec" style={{flex:1,justifyContent:'center'}} onClick={()=>setConfirmDel(null)}>Cancel</button>
              <button className="btn del" style={{flex:1,justifyContent:'center'}} onClick={()=>del(confirmDel)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Send Fax Modal */}
      {modal && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal" style={{width:540}}>
            <div className="mh">
              <span className="mt">📠 Send Fax</span>
              <button className="xbtn" onClick={()=>setModal(false)}>&times;</button>
            </div>

            <div style={{position:'relative'}} className="field"><label>Client (optional)</label>
              <input value={form.client_name} onChange={e=>searchClient(e.target.value)} placeholder="Search client…"/>
              {showSug && sugg.length>0 && (
                <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--sf)',border:'1px solid var(--br)',borderRadius:6,zIndex:50,maxHeight:160,overflowY:'auto'}}>
                  {sugg.map(c=>(
                    <div key={c.id} onClick={()=>pickClient(c)} style={{padding:'8px 12px',cursor:'pointer',fontSize:13,display:'flex',justifyContent:'space-between'}}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--s2)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <span>{c.name}</span>
                      {c.phone&&<span style={{color:'var(--t3)',fontSize:11}}>{c.phone}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="fg2">
              <div className="field"><label>To Fax Number *</label>
                <input value={form.to_number} onChange={e=>fld('to_number',e.target.value.replace(/\D/g,''))} placeholder="8005551234" maxLength={11}/>
                <div style={{fontSize:10,color:'var(--t3)',marginTop:3}}>10 digits, no dashes</div>
              </div>
              <div className="field"><label>From Number (override)</label>
                <input value={form.from_number} onChange={e=>fld('from_number',e.target.value.replace(/\D/g,''))} placeholder={settings.firm_fax_number||settings.sw_inbound_did||'Uses SignalWire DID'}/>
              </div>
            </div>

            <div className="field"><label>Subject / Cover Note</label>
              <input value={form.subject} onChange={e=>fld('subject',e.target.value)} placeholder="e.g. Form 2848 — Power of Attorney"/>
            </div>

            <div className="field"><label>Attach PDF / Document</label>
              <div style={{border:'2px dashed var(--br)',borderRadius:8,padding:'16px',textAlign:'center',cursor:'pointer',background:file?'rgba(34,197,94,.06)':'var(--s2)'}}
                onClick={()=>document.getElementById('fax-file').click()}
                onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor='var(--blue)'}}
                onDragLeave={e=>e.currentTarget.style.borderColor='var(--br)'}
                onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)setFile(f);e.currentTarget.style.borderColor='var(--br)'}}>
                {file ? (
                  <div style={{display:'flex',alignItems:'center',gap:8,justifyContent:'center'}}>
                    <span style={{fontSize:20}}>📄</span>
                    <span style={{fontSize:13,fontWeight:600,color:'var(--ok)'}}>{file.name}</span>
                    <button onClick={e=>{e.stopPropagation();setFile(null)}} style={{background:'none',border:'none',color:'var(--bad)',cursor:'pointer',fontSize:16}}>×</button>
                  </div>
                ) : (
                  <div>
                    <div style={{fontSize:24,marginBottom:6}}>📎</div>
                    <div style={{fontSize:12,color:'var(--t2)'}}>Drop PDF here or click to browse</div>
                    <div style={{fontSize:10,color:'var(--t3)',marginTop:4}}>PDF, TIFF, or image files</div>
                  </div>
                )}
                <input id="fax-file" type="file" accept=".pdf,.tiff,.tif,.jpg,.png" style={{display:'none'}} onChange={e=>setFile(e.target.files[0])}/>
              </div>
            </div>

            <div className="field"><label>Additional Notes (logged internally)</label>
              <textarea value={form.notes} onChange={e=>fld('notes',e.target.value)} rows={2}
                style={{width:'100%',resize:'none',padding:'8px 12px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:13,fontFamily:'inherit'}}
                placeholder="Internal notes about this fax…"/>
            </div>

            <div style={{background:'var(--s2)',borderRadius:6,padding:'8px 14px',marginBottom:14,fontSize:11,color:'var(--t3)',lineHeight:1.6}}>
              🕐 Every fax is automatically <strong>timestamped</strong> with date, time, sender, recipient, and file — all saved in the client's fax history.
            </div>

            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={sendFax} disabled={sending}>
              {sending ? '📠 Sending…' : '📠 Send Fax'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
