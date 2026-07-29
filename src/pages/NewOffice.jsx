import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'

const TCR_TENANT = '61a89aef-0e7e-4ea2-b222-44ab2024655a'
const BLANK = { firm_name:'', tenant_code:'', admin_name:'', admin_email:'', firm_phone:'', brand_color:'#2563eb', plan_tier:'starter' }

// Platform-only tool: provisions a brand-new office (tenant) — creates the
// tenant, its settings row, and the office's first Super Admin employee + a
// working login, all via the provision-tenant edge function. This is a TCR
// PLATFORM action, not a per-tenant admin one, so it's gated on the caller's
// own employee row belonging to the TCR tenant specifically (checked here,
// and re-checked server-side by the edge function regardless).
export default function NewOffice() {
  const { user, showToast } = useApp()
  const [checking, setChecking] = useState(true)
  const [allowed, setAllowed]   = useState(false)
  const [form, setForm]         = useState(BLANK)
  const [saving, setSaving]     = useState(false)
  const [result, setResult]     = useState(null) // { tenant_code, admin_email, temp_password, ... }
  const [copied, setCopied]     = useState(false)
  const [offices, setOffices]   = useState(null) // null = not loaded yet
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (!user?.email) { setChecking(false); return }
    supabase.from('employees').select('access,tenant_id').eq('email', user.email).maybeSingle()
      .then(({ data }) => {
        const ok = !!data && data.access === 'Super Admin' && data.tenant_id === TCR_TENANT
        setAllowed(ok)
        setChecking(false)
        if (ok) loadOffices()
      })
  }, [user?.email])

  async function loadOffices() {
    const { data, error } = await supabase.rpc('list_tenants')
    if (error) { showToast('❌ ' + error.message); return }
    setOffices(data || [])
  }

  function fld(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function slugify(name) {
    return name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 12)
  }

  async function submit() {
    if (!form.firm_name.trim() || !form.tenant_code.trim() || !form.admin_email.trim()) {
      showToast('Firm name, office code, and admin email are required'); return
    }
    setSaving(true)
    const { data, error } = await supabase.functions.invoke('provision-tenant', {
      body: {
        firm_name: form.firm_name.trim(),
        tenant_code: form.tenant_code.trim(),
        admin_name: form.admin_name.trim(),
        admin_email: form.admin_email.trim().toLowerCase(),
        firm_phone: form.firm_phone.trim() || null,
        brand_color: form.brand_color || null,
        plan_tier: form.plan_tier,
      }
    })
    setSaving(false)
    if (error || data?.error) { showToast('❌ ' + (data?.error || error.message)); return }
    setResult(data)
    setForm(BLANK)
    loadOffices()
  }

  function copyCreds() {
    const text = `TaxRes CRM login\nURL: https://taxrescrm.app\nEmail: ${result.admin_email}\nTemporary password: ${result.temp_password}\n\nPlease sign in and change your password.`
    navigator.clipboard.writeText(text)
    setCopied(true); setTimeout(() => setCopied(false), 2500)
  }

  if (checking) return <div style={{padding:40,color:'var(--t3)'}}>Checking access…</div>
  if (!allowed) return (
    <div style={{padding:40,maxWidth:520}}>
      <div style={{fontSize:18,fontWeight:700,marginBottom:8,color:'var(--tx)'}}>Not available</div>
      <div style={{color:'var(--t3)',fontSize:13.5,lineHeight:1.6}}>Provisioning a new office is a platform-level action and isn't available from this account.</div>
    </div>
  )

  return (
    <div style={{padding:'28px 32px',maxWidth:760}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
        <div style={{fontSize:20,fontWeight:800,color:'var(--tx)'}}>🏢 Offices</div>
        {!result && (
          <button className="btn pri" onClick={() => setShowForm(s => !s)}>
            {showForm ? '← Back to list' : '+ New Office'}
          </button>
        )}
      </div>
      <div style={{color:'var(--t3)',fontSize:13,marginBottom:24}}>
        Every office running on this platform, and its own isolated tenant — separate data, staff, and login from every other office.
      </div>

      {result ? (
        <div style={{background:'var(--s2)',border:'1px solid var(--br)',borderRadius:10,padding:20}}>
          <div style={{fontSize:15,fontWeight:700,color:'#10b981',marginBottom:12}}>✅ Office created</div>
          <div style={{fontSize:13,lineHeight:2,color:'var(--tx)'}}>
            <div><b>Office code:</b> {result.tenant_code}</div>
            <div><b>Admin email:</b> {result.admin_email}</div>
            <div><b>Temporary password:</b> <code style={{background:'var(--s3)',padding:'2px 8px',borderRadius:5}}>{result.temp_password}</code></div>
          </div>
          <div style={{fontSize:12,color:'var(--t3)',marginTop:10,lineHeight:1.6}}>
            This password is shown once and isn't stored anywhere retrievable — copy it now and send it to the new admin over a secure channel. They should sign in and change it right away.
          </div>
          <div style={{display:'flex',gap:10,marginTop:16}}>
            <button className="btn pri" onClick={copyCreds}>{copied ? '✓ Copied' : '📋 Copy login details'}</button>
            <button className="btn sec" onClick={() => { setResult(null); setShowForm(false) }}>← Back to list</button>
          </div>
        </div>
      ) : showForm ? (
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div className="field"><label>Firm Name *</label>
            <input value={form.firm_name} onChange={e=>{fld('firm_name',e.target.value); if(!form.tenant_code) fld('tenant_code', slugify(e.target.value))}} placeholder="e.g. Bennett Tax Resolution"/>
          </div>
          <div className="field"><label>Office Code *</label>
            <input value={form.tenant_code} onChange={e=>fld('tenant_code', slugify(e.target.value))} placeholder="e.g. BENNETT" style={{fontFamily:'monospace'}}/>
            <div style={{fontSize:11,color:'var(--t3)',marginTop:4}}>Short, unique identifier for this office. Auto-filled from the firm name — edit if you'd like something shorter.</div>
          </div>
          <div style={{display:'flex',gap:14}}>
            <div className="field" style={{flex:1}}><label>Admin Name</label>
              <input value={form.admin_name} onChange={e=>fld('admin_name',e.target.value)} placeholder="e.g. Chris Bennett"/>
            </div>
            <div className="field" style={{flex:1}}><label>Admin Email *</label>
              <input value={form.admin_email} onChange={e=>fld('admin_email',e.target.value)} placeholder="chris@theirfirm.com" type="email"/>
            </div>
          </div>
          <div style={{display:'flex',gap:14}}>
            <div className="field" style={{flex:1}}><label>Firm Phone</label>
              <input value={form.firm_phone} onChange={e=>fld('firm_phone',e.target.value)} placeholder="Optional"/>
            </div>
            <div className="field" style={{flex:1}}><label>Brand Color</label>
              <input type="color" value={form.brand_color} onChange={e=>fld('brand_color',e.target.value)} style={{height:38,padding:2,cursor:'pointer'}}/>
            </div>
          </div>
          <div className="field"><label>Plan</label>
            <select value={form.plan_tier} onChange={e=>fld('plan_tier',e.target.value)}>
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="pro">Pro</option>
            </select>
          </div>
          <button className="btn pri" disabled={saving} onClick={submit} style={{marginTop:8,alignSelf:'flex-start',padding:'10px 24px'}}>
            {saving ? 'Creating office…' : 'Create Office'}
          </button>
        </div>
      ) : (
        <div style={{border:'1px solid var(--br)',borderRadius:10,overflow:'hidden'}}>
          {offices === null ? (
            <div style={{padding:24,color:'var(--t3)',fontSize:13}}>Loading offices…</div>
          ) : offices.length === 0 ? (
            <div style={{padding:24,color:'var(--t3)',fontSize:13}}>No offices yet.</div>
          ) : (
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{background:'var(--s2)',textAlign:'left'}}>
                  <th style={{padding:'10px 14px',fontSize:11,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.04em'}}>Firm</th>
                  <th style={{padding:'10px 14px',fontSize:11,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.04em'}}>Code</th>
                  <th style={{padding:'10px 14px',fontSize:11,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.04em'}}>Admin</th>
                  <th style={{padding:'10px 14px',fontSize:11,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.04em'}}>Staff</th>
                  <th style={{padding:'10px 14px',fontSize:11,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.04em'}}>Plan</th>
                  <th style={{padding:'10px 14px',fontSize:11,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.04em'}}>Status</th>
                </tr>
              </thead>
              <tbody>
                {offices.map(o => (
                  <tr key={o.id} style={{borderTop:'1px solid var(--br)'}}>
                    <td style={{padding:'10px 14px',color:'var(--tx)',fontWeight:600}}>
                      {o.brand_color && <span style={{display:'inline-block',width:9,height:9,borderRadius:'50%',background:o.brand_color,marginRight:8}}/>}
                      {o.firm_name}
                    </td>
                    <td style={{padding:'10px 14px',color:'var(--t2)',fontFamily:'monospace'}}>{o.tenant_code}</td>
                    <td style={{padding:'10px 14px',color:'var(--t2)'}}>{o.admin_email || '—'}</td>
                    <td style={{padding:'10px 14px',color:'var(--t2)'}}>{o.employee_count}</td>
                    <td style={{padding:'10px 14px',color:'var(--t2)',textTransform:'capitalize'}}>{o.plan_tier}</td>
                    <td style={{padding:'10px 14px'}}>
                      <span style={{
                        fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20,textTransform:'capitalize',
                        background:o.status==='active'?'#10b98122':o.status==='trial'?'#f59e0b22':'#ef444422',
                        color:o.status==='active'?'#10b981':o.status==='trial'?'#f59e0b':'#ef4444'
                      }}>{o.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
