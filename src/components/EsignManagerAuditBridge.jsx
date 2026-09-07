import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

function fmtDate(v) {
  if (!v) return '—'
  try { return new Date(v).toLocaleString() } catch { return '—' }
}

function eventLabel(v) {
  if (!v) return 'No activity'
  return String(v).replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function EsignManagerAuditBridge() {
  const [visible, setVisible] = useState(window.location.pathname === '/esign')
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const timer = setInterval(() => setVisible(window.location.pathname === '/esign'), 400)
    return () => clearInterval(timer)
  }, [])

  async function load() {
    setLoading(true); setError('')
    const { data, error } = await supabase.rpc('esign_audit_overview')
    setLoading(false)
    if (error) { setError(error.message || 'Could not load signing audit'); return }
    setRows(data || [])
  }

  async function show() {
    setOpen(true)
    await load()
  }

  if (!visible) return null

  return (
    <>
      <button onClick={show} className="btn" style={{position:'fixed',right:24,bottom:24,zIndex:1200,fontWeight:800,boxShadow:'0 8px 24px rgba(0,0,0,.2)'}}>
        📊 Signing Audit
      </button>
      {open && (
        <div className="modal-bg open" style={{zIndex:5000}} onClick={e=>e.target===e.currentTarget&&setOpen(false)}>
          <div className="modal" style={{width:'min(1100px,94vw)',maxHeight:'86vh',overflow:'hidden',display:'flex',flexDirection:'column'}}>
            <div className="mh">
              <div>
                <div className="mt">📊 E-Signature Audit</div>
                <div style={{fontSize:11,color:'var(--t3)',marginTop:3}}>DocuSign-style opens, sessions, progress and completion telemetry</div>
              </div>
              <button className="xbtn" onClick={()=>setOpen(false)}>&times;</button>
            </div>
            <div style={{padding:'0 18px 12px',display:'flex',justifyContent:'flex-end'}}>
              <button className="btn sec" onClick={load} disabled={loading}>{loading?'Refreshing…':'↻ Refresh'}</button>
            </div>
            <div style={{overflow:'auto',padding:'0 18px 18px'}}>
              {error ? <div style={{padding:18,color:'var(--bad)'}}>{error}</div> : loading && rows.length===0 ? <div style={{padding:30,textAlign:'center',color:'var(--t3)'}}>Loading audit…</div> : (
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead><tr>
                    {['Client / Document','Status','Opens','Sessions','Progress','Last Activity','Last Seen','Completed'].map(h=><th key={h} style={{textAlign:'left',padding:'8px 9px',borderBottom:'1px solid var(--br)',whiteSpace:'nowrap'}}>{h}</th>)}
                  </tr></thead>
                  <tbody>{rows.map(r=><tr key={r.esign_id}>
                    <td style={{padding:'9px',borderBottom:'1px solid var(--br)'}}><div style={{fontWeight:700}}>{r.client_name||'—'}</div><div style={{fontSize:11,color:'var(--t3)'}}>{r.doc_type||'Document'}</div></td>
                    <td style={{padding:'9px',borderBottom:'1px solid var(--br)'}}>{r.status||'—'}</td>
                    <td style={{padding:'9px',borderBottom:'1px solid var(--br)',fontWeight:800}}>{Number(r.open_count||0)}</td>
                    <td style={{padding:'9px',borderBottom:'1px solid var(--br)'}}>{Number(r.session_count||0)}</td>
                    <td style={{padding:'9px',borderBottom:'1px solid var(--br)',fontWeight:800}}>{Number(r.max_progress||0)}%</td>
                    <td style={{padding:'9px',borderBottom:'1px solid var(--br)'}}>{eventLabel(r.last_event)}</td>
                    <td style={{padding:'9px',borderBottom:'1px solid var(--br)',whiteSpace:'nowrap'}}>{fmtDate(r.last_event_at)}</td>
                    <td style={{padding:'9px',borderBottom:'1px solid var(--br)',whiteSpace:'nowrap'}}>{fmtDate(r.completed_at)}</td>
                  </tr>)}</tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
