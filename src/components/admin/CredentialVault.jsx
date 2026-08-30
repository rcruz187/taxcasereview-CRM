import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

const CARD = { background:'rgba(255,255,255,.035)', border:'1px solid rgba(99,102,241,.18)', borderRadius:12 }
const INPUT = { width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,.05)', border:'1px solid rgba(99,102,241,.22)', borderRadius:8, padding:'9px 11px', color:'#e2e8f0', fontSize:12, outline:'none' }
const BTN = (kind='primary') => ({
  borderRadius:8, padding:'8px 13px', cursor:'pointer', fontSize:12, fontWeight:700,
  ...(kind==='primary' ? { border:'none', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff' }
    : kind==='danger' ? { border:'1px solid rgba(239,68,68,.3)', background:'rgba(239,68,68,.08)', color:'#f87171' }
    : { border:'1px solid rgba(99,102,241,.24)', background:'rgba(99,102,241,.08)', color:'#a5b4fc' })
})

const FALLBACK_PRODUCTS = [
  { product_id:'romylabs', name:'RomyLabs' },
  { product_id:'taxres_crm', name:'TaxRes CRM' },
  { product_id:'camvella', name:'Camvella' },
  { product_id:'arcvena', name:'Arcvena' },
  { product_id:'bocasync', name:'BocaSync' },
  { product_id:'groundivo', name:'GroundIVO' },
  { product_id:'oculivo', name:'Oculivo' },
]

const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?'
function securePassword(length=24, useSymbols=true) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789' + (useSymbols ? SYMBOLS : '')
  if (!window.crypto?.getRandomValues) throw new Error('Secure browser randomness is unavailable')
  const max = Math.floor(256 / alphabet.length) * alphabet.length
  const chars = []
  while (chars.length < length) {
    const bytes = new Uint8Array(Math.max(32, length * 2))
    window.crypto.getRandomValues(bytes)
    for (const n of bytes) {
      if (n >= max) continue
      chars.push(alphabet[n % alphabet.length])
      if (chars.length === length) break
    }
  }
  return chars.join('')
}

function maskSecret(secret='') {
  return secret ? '•'.repeat(Math.min(Math.max(secret.length, 12), 24)) : '••••••••••••••••'
}

export default function CredentialVault() {
  const [entries, setEntries] = useState([])
  const [products, setProducts] = useState(FALLBACK_PRODUCTS)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [revealed, setRevealed] = useState({})
  const revealTimers = useRef({})
  const [unlockUntil, setUnlockUntil] = useState(0)
  const [showUnlock, setShowUnlock] = useState(false)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [pendingReveal, setPendingReveal] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({ product_id:'romylabs', service:'', account_label:'', username:'', login_url:'', notes:'', secret_type:'password', secret:'' })
  const [generatorLength, setGeneratorLength] = useState(24)
  const [generatorSymbols, setGeneratorSymbols] = useState(true)

  function notify(msg) { setToast(msg); setTimeout(() => setToast(''), 2400) }

  async function load() {
    setLoading(true)
    const [{ data, error }, productRes] = await Promise.all([
      supabase.rpc('credential_vault_list'),
      supabase.from('romylabs_products').select('product_id,name,active,sort_order').eq('active', true).order('sort_order')
    ])
    if (error) notify(error.message)
    setEntries(data || [])
    if (productRes.data?.length) setProducts(productRes.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => () => Object.values(revealTimers.current).forEach(clearTimeout), [])

  const productName = id => products.find(p => p.product_id===id)?.name || id
  const filtered = useMemo(() => entries.filter(e => {
    if (filter !== 'all' && e.product_id !== filter) return false
    const hay = `${productName(e.product_id)} ${e.service} ${e.account_label||''} ${e.username||''} ${e.notes||''}`.toLowerCase()
    return hay.includes(query.trim().toLowerCase())
  }), [entries, products, filter, query])

  function resetForm() {
    setEditing(null)
    setForm({ product_id:filter!=='all'?filter:'romylabs', service:'', account_label:'', username:'', login_url:'', notes:'', secret_type:'password', secret:'' })
    setShowForm(false)
  }

  function editEntry(e) {
    setEditing(e)
    setForm({ product_id:e.product_id, service:e.service, account_label:e.account_label||'', username:e.username||'', login_url:e.login_url||'', notes:e.notes||'', secret_type:e.secret_type||'password', secret:'' })
    setShowForm(true)
  }

  function generate() {
    try {
      const password = securePassword(Number(generatorLength), generatorSymbols)
      setForm(f => ({ ...f, secret:password }))
      notify('Strong password generated')
    } catch (e) { notify(e.message) }
  }

  async function copy(text, label='Copied') {
    await navigator.clipboard.writeText(text || '')
    notify(label)
  }

  async function save() {
    if (!form.product_id || !form.service.trim() || (!editing && !form.secret)) {
      notify('Product, service, and password/secret are required')
      return
    }
    setBusy(true)
    const { error } = await supabase.rpc('credential_vault_save', {
      p_id: editing?.id || null,
      p_product_id: form.product_id,
      p_service: form.service.trim(),
      p_account_label: form.account_label || null,
      p_username: form.username || null,
      p_login_url: form.login_url || null,
      p_notes: form.notes || null,
      p_secret_type: form.secret_type,
      p_secret: form.secret || null,
    })
    setBusy(false)
    if (error) { notify(error.message); return }
    notify(editing ? 'Credential updated securely' : 'Credential encrypted and saved')
    resetForm()
    await load()
  }

  async function unlockAndReveal() {
    if (!pendingReveal || !unlockPassword) return
    setBusy(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) { setBusy(false); notify('Unable to verify account'); return }
    const { error } = await supabase.auth.signInWithPassword({ email:user.email, password:unlockPassword })
    setBusy(false)
    if (error) { notify('Password verification failed'); return }
    setUnlockUntil(Date.now() + 5*60*1000)
    setShowUnlock(false)
    setUnlockPassword('')
    const id = pendingReveal
    setPendingReveal(null)
    await reveal(id, true)
  }

  async function reveal(id, skipUnlock=false) {
    if (!skipUnlock && Date.now() >= unlockUntil) {
      setPendingReveal(id)
      setShowUnlock(true)
      return
    }
    setBusy(true)
    const { data, error } = await supabase.rpc('credential_vault_reveal', { p_id:id })
    setBusy(false)
    if (error) { notify(error.message); return }
    setRevealed(r => ({ ...r, [id]:data }))
    clearTimeout(revealTimers.current[id])
    revealTimers.current[id] = setTimeout(() => setRevealed(r => { const n={...r}; delete n[id]; return n }), 45000)
  }

  async function remove(entry) {
    if (!window.confirm(`Delete ${entry.service} credential for ${productName(entry.product_id)}? This cannot be undone.`)) return
    const { error } = await supabase.rpc('credential_vault_delete', { p_id:entry.id })
    if (error) { notify(error.message); return }
    notify('Credential deleted')
    await load()
  }

  return (
    <div style={{ padding:'28px 32px', maxWidth:1200 }}>
      {toast && <div style={{ position:'fixed', right:24, bottom:24, zIndex:9999, background:'#14532d', color:'#fff', borderRadius:9, padding:'10px 16px', fontSize:12, fontWeight:700 }}>{toast}</div>}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, marginBottom:22 }}>
        <div>
          <div style={{ fontSize:24, fontWeight:900, color:'#fff' }}>🔐 Credential Vault</div>
          <div style={{ color:'#64748b', fontSize:12, marginTop:5 }}>RomyLabs owner-only encrypted password, API key, and account store.</div>
          <div style={{ color:'#475569', fontSize:11, marginTop:4 }}>Secrets are encrypted with Supabase Vault. Reveals auto-hide after 45 seconds.</div>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true) }} style={BTN('primary')}>+ Add Credential</button>
      </div>

      <div style={{ ...CARD, padding:16, marginBottom:18 }}>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
          <select value={filter} onChange={e=>setFilter(e.target.value)} style={{ ...INPUT, width:190 }}>
            <option value="all">All Products</option>
            {products.map(p => <option key={p.product_id} value={p.product_id}>{p.name}</option>)}
          </select>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search service, username, notes…" style={{ ...INPUT, flex:1, minWidth:220 }} />
          <div style={{ fontSize:11, color:'#64748b' }}>{entries.length} stored</div>
        </div>
      </div>

      {showForm && (
        <div style={{ ...CARD, padding:18, marginBottom:18, border:'1px solid rgba(99,102,241,.38)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div style={{ fontSize:14, fontWeight:800, color:'#fff' }}>{editing ? 'Edit Credential' : 'Add Credential'}</div>
            <button onClick={resetForm} style={BTN('ghost')}>× Close</button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:12 }}>
            <label style={{ fontSize:10, color:'#64748b' }}>PRODUCT<select value={form.product_id} onChange={e=>setForm(f=>({...f,product_id:e.target.value}))} style={{...INPUT,marginTop:5}}>{products.map(p=><option key={p.product_id} value={p.product_id}>{p.name}</option>)}</select></label>
            <label style={{ fontSize:10, color:'#64748b' }}>SERVICE<input value={form.service} onChange={e=>setForm(f=>({...f,service:e.target.value}))} placeholder="Supabase, Stalwart, Cloudflare…" style={{...INPUT,marginTop:5}}/></label>
            <label style={{ fontSize:10, color:'#64748b' }}>ACCOUNT LABEL<input value={form.account_label} onChange={e=>setForm(f=>({...f,account_label:e.target.value}))} placeholder="Production / Admin / Main" style={{...INPUT,marginTop:5}}/></label>
            <label style={{ fontSize:10, color:'#64748b' }}>USERNAME / EMAIL<input value={form.username} onChange={e=>setForm(f=>({...f,username:e.target.value}))} placeholder="info@example.com" style={{...INPUT,marginTop:5}}/></label>
            <label style={{ fontSize:10, color:'#64748b' }}>LOGIN URL<input value={form.login_url} onChange={e=>setForm(f=>({...f,login_url:e.target.value}))} placeholder="https://…" style={{...INPUT,marginTop:5}}/></label>
            <label style={{ fontSize:10, color:'#64748b' }}>SECRET TYPE<select value={form.secret_type} onChange={e=>setForm(f=>({...f,secret_type:e.target.value}))} style={{...INPUT,marginTop:5}}><option value="password">Password</option><option value="api_key">API Key</option><option value="token">Token</option><option value="secret">Secret</option><option value="other">Other</option></select></label>
          </div>

          <div style={{ marginTop:12 }}>
            <div style={{ fontSize:10, color:'#64748b', marginBottom:5 }}>{editing ? 'NEW PASSWORD / SECRET — leave blank to keep existing' : 'PASSWORD / SECRET'}</div>
            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
              <input value={form.secret} onChange={e=>setForm(f=>({...f,secret:e.target.value}))} type="text" autoComplete="new-password" placeholder="Generate or paste a secret" style={{...INPUT,flex:1,minWidth:240,fontFamily:'ui-monospace,SFMono-Regular,Menlo,monospace'}}/>
              <button onClick={generate} type="button" style={BTN('ghost')}>🎲 Generate Strong Password</button>
              {form.secret && <button onClick={()=>copy(form.secret,'Password copied')} type="button" style={BTN('ghost')}>📋 Copy</button>}
            </div>
            <div style={{ display:'flex', gap:14, alignItems:'center', marginTop:8, flexWrap:'wrap' }}>
              <label style={{ fontSize:11, color:'#64748b' }}>Length <select value={generatorLength} onChange={e=>setGeneratorLength(Number(e.target.value))} style={{...INPUT,width:72,padding:'5px 7px',marginLeft:5}}>{[16,20,24,32,40,48].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
              <label style={{ fontSize:11, color:'#64748b', display:'flex', alignItems:'center', gap:6 }}><input type="checkbox" checked={generatorSymbols} onChange={e=>setGeneratorSymbols(e.target.checked)}/> Include symbols</label>
              <span style={{ fontSize:10, color:'#334155' }}>Generated locally using cryptographically secure browser randomness.</span>
            </div>
          </div>

          <label style={{ display:'block', fontSize:10, color:'#64748b', marginTop:12 }}>NOTES<textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3} placeholder="Production project, recovery notes, MFA location…" style={{...INPUT,marginTop:5,resize:'vertical'}}/></label>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:14 }}><button onClick={resetForm} style={BTN('ghost')}>Cancel</button><button onClick={save} disabled={busy} style={BTN('primary')}>{busy?'Saving…':editing?'Save Changes':'Encrypt & Save'}</button></div>
        </div>
      )}

      {loading ? <div style={{ color:'#64748b', padding:30 }}>Loading vault…</div> : filtered.length===0 ? (
        <div style={{ ...CARD, padding:38, textAlign:'center', color:'#64748b' }}>No credentials yet. Click <b style={{color:'#a5b4fc'}}>+ Add Credential</b> to store the first one.</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(330px,1fr))', gap:12 }}>
          {filtered.map(e => {
            const value = revealed[e.id]
            return <div key={e.id} style={{ ...CARD, padding:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'flex-start' }}>
                <div><div style={{ color:'#fff', fontSize:14, fontWeight:800 }}>{e.service}</div><div style={{ color:'#6366f1', fontSize:11, fontWeight:700, marginTop:2 }}>{productName(e.product_id)}{e.account_label?` · ${e.account_label}`:''}</div></div>
                <span style={{ fontSize:9, color:'#64748b', textTransform:'uppercase', border:'1px solid rgba(99,102,241,.2)', borderRadius:20, padding:'2px 7px' }}>{(e.secret_type||'password').replace('_',' ')}</span>
              </div>
              <div style={{ marginTop:13, display:'grid', gap:8 }}>
                <div><div style={{fontSize:9,color:'#475569',textTransform:'uppercase'}}>Username / Email</div><div style={{display:'flex',gap:6,alignItems:'center',marginTop:2}}><span style={{color:'#cbd5e1',fontSize:12,overflow:'hidden',textOverflow:'ellipsis'}}>{e.username||'—'}</span>{e.username&&<button onClick={()=>copy(e.username,'Username copied')} style={{...BTN('ghost'),padding:'3px 7px',fontSize:10}}>Copy</button>}</div></div>
                <div><div style={{fontSize:9,color:'#475569',textTransform:'uppercase'}}>Secret</div><div style={{display:'flex',gap:6,alignItems:'center',marginTop:2}}><span style={{color:value?'#e2e8f0':'#64748b',fontSize:12,fontFamily:'ui-monospace,SFMono-Regular,Menlo,monospace',overflow:'hidden',textOverflow:'ellipsis'}}>{value||maskSecret()}</span><button onClick={()=>value?setRevealed(r=>{const n={...r};delete n[e.id];return n}):reveal(e.id)} disabled={busy} style={{...BTN('ghost'),padding:'3px 7px',fontSize:10}}>{value?'Hide':'Reveal'}</button>{value&&<button onClick={()=>copy(value,'Secret copied')} style={{...BTN('ghost'),padding:'3px 7px',fontSize:10}}>Copy</button>}</div></div>
                {e.login_url && <a href={e.login_url} target="_blank" rel="noreferrer" style={{color:'#818cf8',fontSize:11,textDecoration:'none'}}>Open login ↗</a>}
                {e.notes && <div style={{fontSize:11,color:'#64748b',lineHeight:1.45}}>{e.notes}</div>}
              </div>
              <div style={{ display:'flex', gap:6, borderTop:'1px solid rgba(99,102,241,.1)', marginTop:13, paddingTop:10 }}><button onClick={()=>editEntry(e)} style={{...BTN('ghost'),padding:'5px 9px',fontSize:10}}>Edit</button><button onClick={()=>remove(e)} style={{...BTN('danger'),padding:'5px 9px',fontSize:10,marginLeft:'auto'}}>Delete</button></div>
            </div>
          })}
        </div>
      )}

      {showUnlock && <div style={{ position:'fixed', inset:0, zIndex:10000, background:'rgba(4,6,18,.82)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
        <div style={{ ...CARD, width:'100%', maxWidth:390, padding:22, background:'#111021' }}>
          <div style={{ fontSize:16, fontWeight:900, color:'#fff' }}>🔓 Unlock Credential Vault</div>
          <div style={{ fontSize:11, color:'#64748b', lineHeight:1.5, marginTop:6 }}>Confirm your RomyLabs Admin password before revealing secrets. The vault stays unlocked for 5 minutes in this browser tab only.</div>
          <input type="password" value={unlockPassword} onChange={e=>setUnlockPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&unlockAndReveal()} autoFocus placeholder="Your Admin Portal password" style={{...INPUT,marginTop:15}}/>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:14 }}><button onClick={()=>{setShowUnlock(false);setUnlockPassword('');setPendingReveal(null)}} style={BTN('ghost')}>Cancel</button><button onClick={unlockAndReveal} disabled={busy||!unlockPassword} style={BTN('primary')}>{busy?'Checking…':'Unlock & Reveal'}</button></div>
        </div>
      </div>}
    </div>
  )
}
