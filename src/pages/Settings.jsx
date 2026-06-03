import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'

const BUCKET = 'firm-assets'

export default function Settings() {
  const { showToast, user } = useApp()
  const [tab, setTab] = useState('firm')
  const [saving, setSaving] = useState(false)
  const [logoUrl, setLogoUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()

  const [firm, setFirm] = useState({
    name: '', tagline: '', phone: '', email: '',
    address: '', city: '', state: '', zip: '',
    website: '', ein: '', primary_color: '#2563eb',
    preparer_name: '', ptin: '', caf_number: '', efin: '',
    gmail_client_id: '', gmail_client_secret: '', gmail_redirect_uri: ''
  })

  const [pw, setPw] = useState({ next: '', confirm: '' })

  useEffect(() => { loadFirm(); loadLogo() }, [])

  function applyBrandColor(hex) {
    if (!hex || !hex.startsWith('#')) return
    document.documentElement.style.setProperty('--blue', hex)
    // derive a transparent version for badges/borders
    document.documentElement.style.setProperty('--blt', hex + '22')
    document.documentElement.style.setProperty('--b2c', hex + '33')
    // update meta theme-color for mobile browsers
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', hex)
    // persist so it survives page refreshes before Supabase loads
    localStorage.setItem('tcr_brand_color', hex)
  }

  async function loadFirm() {
    const { data } = await supabase.from('settings').select('*').limit(1).maybeSingle()
    if (data) {
      setFirm(f => ({ ...f, ...data }))
      if (data.primary_color) applyBrandColor(data.primary_color)
    }
  }

  async function loadLogo() {
    const { data } = await supabase.storage.from(BUCKET).getPublicUrl('logo')
    if (data?.publicUrl) setLogoUrl(data.publicUrl + '?t=' + Date.now())
  }

  async function saveFirm() {
    setSaving(true)
    try {
      const { data: existing } = await supabase.from('settings').select('id').limit(1).maybeSingle()
      if (existing?.id) {
        await supabase.from('settings').update(firm).eq('id', existing.id)
      } else {
        await supabase.from('settings').insert(firm)
      }
      if (firm.primary_color) applyBrandColor(firm.primary_color)
      showToast('✅ Saved! Brand color applied across the CRM.')
    } catch (e) { showToast(e.message, 'err') } finally { setSaving(false) }
  }

  async function uploadLogo(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const { error } = await supabase.storage.from(BUCKET).upload('logo', file, { upsert: true, contentType: file.type })
      if (error) throw error
      await loadLogo()
      showToast('Logo uploaded!')
    } catch (err) { showToast(err.message, 'err') } finally { setUploading(false) }
  }

  async function changePassword() {
    if (pw.next !== pw.confirm) return showToast('Passwords do not match', 'err')
    if (pw.next.length < 6) return showToast('Min 6 characters', 'err')
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pw.next })
    setSaving(false)
    if (error) return showToast(error.message, 'err')
    showToast('Password updated!')
    setPw({ next: '', confirm: '' })
  }

  const set = k => e => setFirm(f => ({ ...f, [k]: e.target.value }))
  const tabs = ['firm', 'integrations', 'branding', 'users', 'security']

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t} className={`btn${tab === t ? ' pri' : ''}`} onClick={() => setTab(t)}>
            {t === 'firm' ? '🏢 Firm Info' : t === 'integrations' ? '🔌 Integrations' : t === 'branding' ? '🎨 Branding' : t === 'users' ? '👥 Users' : '🔒 Security'}
          </button>
        ))}
      </div>

      {tab === 'firm' && (
        <div className="card">
          <div className="card-header"><span className="card-title">Firm Information</span></div>
          <div style={{ padding: '0 20px 20px' }}>
            <div className="fg2">
              <div className="field"><label>Firm Name</label><input value={firm.name} onChange={set('name')} placeholder="Acme Tax Resolution" /></div>
              <div className="field"><label>Tagline</label><input value={firm.tagline} onChange={set('tagline')} placeholder="We solve IRS problems" /></div>
            </div>
            <div className="fg2">
              <div className="field"><label>Phone</label><input value={firm.phone} onChange={set('phone')} placeholder="(555) 555-5555" /></div>
              <div className="field"><label>Email</label><input value={firm.email} onChange={set('email')} type="email" placeholder="info@yourfirm.com" /></div>
            </div>
            <div className="field"><label>Address</label><input value={firm.address} onChange={set('address')} placeholder="123 Main St" /></div>
            <div className="fg3">
              <div className="field"><label>City</label><input value={firm.city} onChange={set('city')} /></div>
              <div className="field"><label>State</label><input value={firm.state} onChange={set('state')} maxLength={2} /></div>
              <div className="field"><label>ZIP</label><input value={firm.zip} onChange={set('zip')} /></div>
            </div>
            <div className="fg2">
              <div className="field"><label>Website</label><input value={firm.website} onChange={set('website')} placeholder="https://yourfirm.com" /></div>
              <div className="field"><label>EIN</label><input value={firm.ein} onChange={set('ein')} placeholder="XX-XXXXXXX" /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn pri" onClick={saveFirm} disabled={saving}>{saving ? 'Saving…' : 'Save Firm Info'}</button>
            </div>
          </div>
        </div>
      )}


      {tab === 'integrations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* IRS Preparer Credentials */}
          <div className="card">
            <div className="card-header"><span className="card-title">🪪 IRS Preparer Credentials</span></div>
            <div style={{ padding: '0 20px 20px' }}>
              <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.6 }}>
                These credentials auto-populate on every Tax Return in the Submit/Export tab.
              </div>
              <div className="fg2">
                <div className="field"><label>Preparer Name</label>
                  <input value={firm.preparer_name} onChange={set('preparer_name')} placeholder="Your full legal name" />
                </div>
                <div className="field"><label>PTIN (Preparer Tax ID Number)</label>
                  <input value={firm.ptin} onChange={set('ptin')} placeholder="P00000000" />
                </div>
              </div>
              <div className="fg2">
                <div className="field"><label>CAF Number (Central Authorization File)</label>
                  <input value={firm.caf_number} onChange={set('caf_number')} placeholder="Used for POA & IRS transcripts" />
                </div>
                <div className="field"><label>EFIN (Electronic Filing ID Number)</label>
                  <input value={firm.efin} onChange={set('efin')} placeholder="6-digit EFIN from IRS" />
                </div>
              </div>
              <div style={{ background: 'rgba(26,127,212,.1)', border: '1px solid rgba(26,127,212,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--t2)', marginBottom: 14, lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--blue)' }}>📌 Where to find these:</strong><br/>
                PTIN — IRS PTIN system at <strong>irs.gov/ptin</strong><br/>
                CAF# — Your IRS Centralized Authorization File number (shown on Form 2848)<br/>
                EFIN — IRS e-Services at <strong>irs.gov/e-services</strong> (required to e-file)
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn pri" onClick={saveFirm} disabled={saving}>{saving ? 'Saving…' : 'Save Credentials'}</button>
              </div>
            </div>
          </div>

          {/* Gmail OAuth */}
          <div className="card">
            <div className="card-header"><span className="card-title">📧 Gmail OAuth Integration</span></div>
            <div style={{ padding: '0 20px 20px' }}>
              <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.7 }}>
                Connect Gmail to send emails directly from the Email page. Follow the setup steps below.
              </div>

              {/* Step by step */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {[
                  ['1', 'Go to console.cloud.google.com and create a new project (or select existing)'],
                  ['2', 'Enable the Gmail API under APIs & Services → Library'],
                  ['3', 'Go to APIs & Services → Credentials → Create OAuth 2.0 Client ID'],
                  ['4', 'Set Application Type to "Web application"'],
                  ['5', `Add Authorized Redirect URI: ${window.location.origin}/taxcasereview-CRM/auth/callback`],
                  ['6', 'Copy your Client ID and Client Secret below, then save'],
                ].map(([step, text]) => (
                  <div key={step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{step}</div>
                    <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6, paddingTop: 2 }}>{text}</div>
                  </div>
                ))}
              </div>

              <div className="fg2">
                <div className="field"><label>Gmail OAuth Client ID</label>
                  <input value={firm.gmail_client_id} onChange={set('gmail_client_id')} placeholder="xxxxx.apps.googleusercontent.com" />
                </div>
                <div className="field"><label>Gmail OAuth Client Secret</label>
                  <input type="password" value={firm.gmail_client_secret} onChange={set('gmail_client_secret')} placeholder="GOCSPX-xxxxxxxxxx" />
                </div>
              </div>
              <div className="field"><label>Redirect URI (copy this exactly into Google Console)</label>
                <input readOnly value={window.location.origin + '/taxcasereview-CRM/auth/callback'} style={{ color: 'var(--t3)', cursor: 'text' }} onClick={e => { e.target.select(); document.execCommand('copy'); }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 14 }}>Click the Redirect URI field to copy it.</div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn pri" onClick={saveFirm} disabled={saving}>{saving ? 'Saving…' : 'Save Gmail Config'}</button>
                {firm.gmail_client_id && (
                  <button className="btn sec" onClick={() => {
                    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${firm.gmail_client_id}&redirect_uri=${encodeURIComponent(window.location.origin + '/taxcasereview-CRM/auth/callback')}&response_type=code&scope=https://mail.google.com/&access_type=offline&prompt=consent`
                    window.open(url, '_blank')
                  }}>🔗 Authorize Gmail Account</button>
                )}
                {!firm.gmail_client_id && (
                  <span style={{ fontSize: 12, color: 'var(--t3)' }}>Enter your Client ID first to enable authorization</span>
                )}
              </div>
            </div>
          </div>

          {/* Supabase Storage */}
          <div className="card">
            <div className="card-header"><span className="card-title">📁 Document Storage</span></div>
            <div style={{ padding: '0 20px 20px' }}>
              <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.6 }}>
                Document uploads use Supabase Storage. Run the SQL below in your Supabase SQL Editor to create the bucket if you haven't already.
              </div>
              <div style={{ background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 8, padding: '12px 16px', fontFamily: 'monospace', fontSize: 12, color: 'var(--ok)', marginBottom: 14, whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{`-- Run in Supabase SQL Editor:
insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do nothing;

drop policy if exists "Public read documents" on storage.objects;
create policy "Public read documents"
  on storage.objects for select using (bucket_id = 'documents');

drop policy if exists "Auth upload documents" on storage.objects;
create policy "Auth upload documents"
  on storage.objects for insert
  with check (bucket_id = 'documents');`}</div>
              <button className="btn sec" onClick={() => {
                navigator.clipboard.writeText(`insert into storage.buckets (id, name, public)\nvalues ('documents', 'documents', true)\non conflict (id) do nothing;`)
                showToast('SQL copied!')
              }}>📋 Copy SQL</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'branding' && (
        <div className="card">
          <div className="card-header"><span className="card-title">Branding</span></div>
          <div style={{ padding: '0 20px 20px' }}>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Company Logo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                <div style={{
                  width: 120, height: 80, borderRadius: 10, border: '2px dashed var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', background: 'var(--bg2)'
                }}>
                  {logoUrl
                    ? <img src={logoUrl} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    : <span style={{ fontSize: 28 }}>🏢</span>}
                </div>
                <div>
                  <button className="btn pri" onClick={() => fileRef.current.click()} disabled={uploading}>
                    {uploading ? 'Uploading…' : '📤 Upload Logo'}
                  </button>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 6 }}>PNG, JPG, SVG — max 2MB</div>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadLogo} />
                </div>
              </div>
            </div>
            <div className="field" style={{ maxWidth: 260 }}>
              <label>Primary Color</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input type="color" value={firm.primary_color} onChange={e => { set('primary_color')(e); applyBrandColor(e.target.value) }} style={{ width: 48, height: 36, borderRadius: 6, border: 'none', cursor: 'pointer' }} />
                <input value={firm.primary_color} onChange={e => { set('primary_color')(e); applyBrandColor(e.target.value) }} style={{ flex: 1 }} placeholder="#2563eb" />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn pri" onClick={saveFirm} disabled={saving}>{saving ? 'Saving…' : 'Save Branding'}</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="card">
          <div className="card-header"><span className="card-title">Team Members</span></div>
          <div style={{ padding: '0 20px 20px' }}>
            {[
              { name:'Romy Cruz',        email:'romy@taxcasereview.org',    role:'Super Admin', color:'br' },
              { name:'Dana Richard',     email:'dana@taxcasereview.org',    role:'Admin',       color:'bb' },
              { name:'Yesenia Gonzalez', email:'yesenia@taxcasereview.org', role:'Admin',       color:'bb' },
            ].map(m => (
              <div key={m.email} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 0', borderBottom:'1px solid var(--br)' }}>
                <div style={{ width:40, height:40, borderRadius:'50%', background:'var(--blue)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:16, color:'#fff', flexShrink:0 }}>
                  {m.name[0]}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:14 }}>
                    {m.name}
                    {m.email === user?.email && <span style={{ fontSize:10, color:'var(--ok)', marginLeft:8 }}>● You</span>}
                  </div>
                  <div style={{ color:'var(--t2)', fontSize:12 }}>{m.email}</div>
                </div>
                <span className={`bdg ${m.color}`} style={{ fontSize:11 }}>{m.role}</span>
              </div>
            ))}
            <div style={{ color:'var(--t3)', fontSize:12, marginTop:14 }}>
              To add or remove team members, go to Supabase → Authentication → Users.
            </div>
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="card">
          <div className="card-header"><span className="card-title">Change Password</span></div>
          <div style={{ padding: '0 20px 20px', maxWidth: 400 }}>
            <div className="field"><label>New Password</label><input type="password" value={pw.next} onChange={e => setPw(p => ({ ...p, next: e.target.value }))} /></div>
            <div className="field"><label>Confirm Password</label><input type="password" value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} /></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn pri" onClick={changePassword} disabled={saving}>{saving ? 'Saving…' : 'Update Password'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
