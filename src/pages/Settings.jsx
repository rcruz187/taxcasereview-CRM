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
    const r = parseInt(hex.slice(1,3),16)
    const g = parseInt(hex.slice(3,5),16)
    const b = parseInt(hex.slice(5,7),16)
    const rgb = `${r},${g},${b}`
    const root = document.documentElement
    // Primary accent — used everywhere var(--blue) appears
    root.style.setProperty('--blue', hex)
    root.style.setProperty('--b2',   hex)
    // Transparent variants for backgrounds, badges, borders
    root.style.setProperty('--blt',  `rgba(${rgb},.18)`)
    root.style.setProperty('--b2c',  `rgba(${rgb},.14)`)
    // Inject a style tag to override the hardcoded rgba in .nav-item.active
    // (CSS variables can't override static rgba() values in existing rules)
    let styleTag = document.getElementById('tcr-brand-override')
    if (!styleTag) {
      styleTag = document.createElement('style')
      styleTag.id = 'tcr-brand-override'
      document.head.appendChild(styleTag)
    }
    styleTag.textContent = `
      .nav-item.active { background: rgba(${rgb},.18) !important; color: ${hex} !important; border-left-color: ${hex} !important; }
      .btn.pri { background: ${hex} !important; border-color: ${hex} !important; }
      .btn.pri:hover { background: ${hex}dd !important; }
      .bdg.blue, .bdg.bb { background: rgba(${rgb},.18) !important; color: ${hex} !important; }
      .chip.active, .chip:hover, .chip.on { background: rgba(${rgb},.18) !important; color: ${hex} !important; border-color: ${hex} !important; }
      .tl-dot.blue { background: ${hex} !important; }
      .cal-event { background: ${hex} !important; }
      .cal-day.today { border-color: ${hex} !important; }
      .field input:focus, .field select:focus, .field textarea:focus { border-color: ${hex} !important; }
      .search-input:focus { border-color: ${hex} !important; }
      .metric:hover { border-color: ${hex} !important; }
      .tab-active, [class*="tab"].active { border-bottom-color: ${hex} !important; color: ${hex} !important; }
      a { color: ${hex}; }
    `
    // Update meta theme-color for mobile browsers
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', hex)
    // Persist so it survives page refreshes
    localStorage.setItem('tcr_brand_color', hex)
    localStorage.setItem('tcr_brand_rgb', rgb)
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
      // Only save known DB columns - exclude any React state extras
      const payload = {
        name: firm.name, tagline: firm.tagline, phone: firm.phone,
        email: firm.email, address: firm.address, city: firm.city,
        state: firm.state, zip: firm.zip, website: firm.website,
        ein: firm.ein, primary_color: firm.primary_color,
        preparer_name: firm.preparer_name, ptin: firm.ptin,
        caf_number: firm.caf_number, efin: firm.efin,
        gmail_client_id: firm.gmail_client_id,
        gmail_client_secret: firm.gmail_client_secret,
        gmail_redirect_uri: firm.gmail_redirect_uri,
        telnyx_api_key: firm.telnyx_api_key,
        firm_fax_number: firm.firm_fax_number,
        smtp_host: firm.smtp_host, smtp_port: firm.smtp_port,
        smtp_email: firm.smtp_email, smtp_password: firm.smtp_password,
        smtp_name: firm.smtp_name, smtp_encryption: firm.smtp_encryption,
        twilio_sid: firm.twilio_sid, twilio_token: firm.twilio_token,
        twilio_phone: firm.twilio_phone,
        sw_space_url: firm.sw_space_url,
        sw_project_id: firm.sw_project_id,
        sw_api_token: firm.sw_api_token,
        sw_sip_username: firm.sw_sip_username,
        sw_sip_password: firm.sw_sip_password,
        sw_inbound_did: firm.sw_inbound_did,
        signalwire_backend: firm.signalwire_backend,
        qb_client_id: firm.qb_client_id,
        qb_client_secret: firm.qb_client_secret,
      }
      const { data: existing, error: fetchErr } = await supabase.from('settings').select('id').limit(1).maybeSingle()
      if (fetchErr) throw fetchErr
      let saveErr
      if (existing?.id) {
        const { error } = await supabase.from('settings').update(payload).eq('id', existing.id)
        saveErr = error
      } else {
        const { error } = await supabase.from('settings').insert([payload])
        saveErr = error
      }
      if (saveErr) throw saveErr
      if (firm.primary_color) applyBrandColor(firm.primary_color)
      // Refresh the Sidebar firm name
      window.dispatchEvent(new Event('firm-updated'))
      showToast('✅ Settings saved!')
    } catch (e) { showToast('Error: ' + e.message, 'err') } finally { setSaving(false) }
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
  const tabs = ['firm', 'integrations', 'fax', 'branding', 'users', 'security']

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t} className={`btn${tab === t ? ' pri' : ''}`} onClick={() => setTab(t)}>
            {t === 'firm' ? '🏢 Firm Info' : t === 'integrations' ? '🔌 Integrations' : t === 'fax' ? '📠 Fax' : t === 'branding' ? '🎨 Branding' : t === 'users' ? '👥 Users' : '🔒 Security'}
          </button>
        ))}
      </div>

      {tab === 'firm' && (
        <div className="card">
          <div className="card-header"><span className="card-title">Firm Information</span></div>
          <div style={{ padding: '0 20px 20px' }}>
            <div className="fg2">
              <div className="field"><label>Firm Name</label><input value={firm.name} onChange={set('name')} placeholder="Tax Case Review" /></div>
              <div style={{height:1,background:'var(--br)',margin:'18px 0'}}/>
              <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>📬 POP / SMTP Email</div>
              <div style={{fontSize:12,color:'var(--t3)',marginBottom:12,lineHeight:1.6}}>Use any provider — Outlook, Yahoo, Zoho, custom domain. No Google required.</div>
              <div className="fg2">
                <div className="field"><label>SMTP Host</label><input value={firm.smtp_host||''} onChange={set('smtp_host')} placeholder="smtp.yourprovider.com"/></div>
                <div className="field"><label>SMTP Port</label><input value={firm.smtp_port||''} onChange={set('smtp_port')} placeholder="587"/></div>
              </div>
              <div className="fg2">
                <div className="field"><label>Email Address</label><input type="email" value={firm.smtp_email||''} onChange={set('smtp_email')} placeholder="you@yourdomain.com"/></div>
                <div className="field"><label>Password / App Password</label><input type="password" value={firm.smtp_password||''} onChange={set('smtp_password')} placeholder="••••••••"/></div>
              </div>
              <div className="fg2">
                <div className="field"><label>From Name</label><input value={firm.smtp_name||''} onChange={set('smtp_name')} placeholder="ClearCase.Tax"/></div>
                <div className="field"><label>Encryption</label>
                  <select value={firm.smtp_encryption||'TLS'} onChange={set('smtp_encryption')}><option>TLS</option><option>SSL</option><option>None</option></select>
                </div>
              </div>
              <div style={{background:'var(--s2)',borderRadius:6,padding:'8px 14px',fontSize:11,color:'var(--t3)',lineHeight:1.7,marginBottom:12}}>
                💡 Outlook: smtp.office365.com:587 · Yahoo: smtp.mail.yahoo.com:587 · Zoho: smtp.zoho.com:587
              </div>
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

          {/* SignalWire Dialer */}
          <div className="card">
            <div className="card-header"><span className="card-title">📞 SignalWire Dialer</span></div>
            <div style={{ padding: '0 20px 20px' }}>
              <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.6 }}>
                Powers the built-in dialer, SMS, and fax. Get credentials at <strong>signalwire.com</strong>.
              </div>
              <div className="fg2">
                <div className="field"><label>Space URL</label>
                  <input value={firm.sw_space_url || ''} onChange={set('sw_space_url')} placeholder="yourspace.signalwire.com" />
                </div>
                <div className="field"><label>Project ID</label>
                  <input value={firm.sw_project_id || ''} onChange={set('sw_project_id')} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                </div>
              </div>
              <div className="fg2">
                <div className="field"><label>API Token</label>
                  <input type="password" value={firm.sw_api_token || ''} onChange={set('sw_api_token')} placeholder="PT..." />
                </div>
                <div className="field"><label>Inbound DID (Phone Number)</label>
                  <input value={firm.sw_inbound_did || ''} onChange={set('sw_inbound_did')} placeholder="+15615551234" />
                </div>
              </div>
              <div className="fg2">
                <div className="field"><label>SIP Username</label>
                  <input value={firm.sw_sip_username || ''} onChange={set('sw_sip_username')} placeholder="SIP endpoint username" />
                </div>
                <div className="field"><label>SIP Password</label>
                  <input type="password" value={firm.sw_sip_password || ''} onChange={set('sw_sip_password')} placeholder="SIP endpoint password" />
                </div>
              </div>
              <div className="field"><label>Backend Server URL</label>
                <input value={firm.signalwire_backend || ''} onChange={set('signalwire_backend')} placeholder="https://your-backend.onrender.com" />
                <div style={{fontSize:10,color:'var(--t3)',marginTop:3}}>URL where signalwire-backend (server.js) is deployed. Powers SMS, fax, and dialer.</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button className="btn pri" onClick={saveFirm} disabled={saving}>{saving ? 'Saving…' : 'Save SignalWire'}</button>
              </div>
            </div>
          </div>

          {/* QuickBooks Online */}
          <div className="card">
            <div className="card-header"><span className="card-title">📊 QuickBooks Online</span></div>
            <div style={{ padding: '0 20px 20px' }}>
              <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.7 }}>
                Connect QuickBooks Online to sync invoices and payments automatically. Until this is connected, use the
                <strong> "Export to QuickBooks" </strong> button on the Books & Ledger page to download a CSV you can
                import manually under QuickBooks → Banking → Upload from file.
              </div>

              {/* Step by step */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {[
                  ['1', 'Go to developer.intuit.com and sign in with your QuickBooks account'],
                  ['2', 'Create a new app → choose "QuickBooks Online and Payments"'],
                  ['3', 'In the app\'s Keys & OAuth section, grab your Client ID and Client Secret (use the Production keys, not Sandbox)'],
                  ['4', `Add Redirect URI: ${window.location.origin}/taxcasereview-CRM/auth/quickbooks-callback`],
                  ['5', 'Copy your Client ID and Client Secret below, then save'],
                ].map(([step, text]) => (
                  <div key={step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#2CA01C', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{step}</div>
                    <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6, paddingTop: 2 }}>{text}</div>
                  </div>
                ))}
              </div>

              <div className="fg2">
                <div className="field"><label>QuickBooks Client ID</label>
                  <input value={firm.qb_client_id || ''} onChange={set('qb_client_id')} placeholder="ABxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
                </div>
                <div className="field"><label>QuickBooks Client Secret</label>
                  <input type="password" value={firm.qb_client_secret || ''} onChange={set('qb_client_secret')} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
                </div>
              </div>
              <div className="field"><label>Redirect URI (copy this exactly into the Intuit Developer app)</label>
                <input readOnly value={window.location.origin + '/taxcasereview-CRM/auth/quickbooks-callback'} style={{ color: 'var(--t3)', cursor: 'text' }} onClick={e => { e.target.select(); document.execCommand('copy'); }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 14 }}>Click the Redirect URI field to copy it.</div>

              <div style={{ background: 'rgba(212,147,10,.1)', border: '1px solid rgba(212,147,10,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--t2)', marginBottom: 14, lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--warn)' }}>⚠️ Note:</strong> Saving credentials here stores them for when the sync feature is fully wired up.
                The "Connect to QuickBooks" button below isn't live yet — it needs a small server-side piece to securely exchange the authorization code, which is in progress.
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn pri" onClick={saveFirm} disabled={saving}>{saving ? 'Saving…' : 'Save QuickBooks Config'}</button>
                <button className="btn sec" disabled style={{ opacity: .5, cursor: 'not-allowed' }} title="Coming soon">🔗 Connect to QuickBooks (coming soon)</button>
              </div>
            </div>
          </div>


          <div className="card">
            <div className="card-header"><span className="card-title">📁 Document Storage</span></div>
            <div style={{ padding: '0 20px 20px' }}>
              <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 14, lineHeight: 1.6 }}>
                Document uploads use Supabase Storage. The bucket is configured and active.
              </div>
                            <div style={{background:"rgba(34,197,94,.08)",border:"1px solid rgba(34,197,94,.25)",borderRadius:8,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:10,fontSize:12,color:"var(--ok)"}}><span>✅</span><span>Storage bucket configured and active.</span></div>
              </div>
          </div>
        </div>
      )}

      {tab === 'fax' && (
        <div className="card">
          <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>📠 Fax Integration — SignalWire</div>
          <div style={{fontSize:12,color:'var(--t3)',marginBottom:16,lineHeight:1.7}}>
            Fax is sent via your SignalWire backend's <code>/fax/send</code> endpoint, using the same SignalWire project as your dialer and SMS.
          </div>
          <div style={{background:'var(--s2)',borderRadius:8,padding:'12px 16px',marginBottom:16,fontSize:12,lineHeight:1.8}}>
            <div style={{fontWeight:700,color:'var(--tx)',marginBottom:6}}>Setup:</div>
            {[['1','Set up SignalWire credentials in 📞 Integrations → SignalWire Dialer'],['2','Deploy signalwire-backend (server.js) to a host like Render or Railway'],['3','Enter the deployed Backend Server URL in the SignalWire card'],['4','Your SignalWire phone number (Inbound DID) is used as the fax From number']].map(([step,text])=>(
              <div key={step} style={{display:'flex',gap:10,marginBottom:4,alignItems:'flex-start'}}>
                <div style={{width:20,height:20,borderRadius:'50%',background:'var(--blue)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800,flexShrink:0,marginTop:1}}>{step}</div>
                <div style={{color:'var(--t2)'}}>{text}</div>
              </div>
            ))}
          </div>
          <div style={{background:'rgba(26,127,212,.08)',border:'1px solid rgba(26,127,212,.2)',borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:12,color:'var(--t2)',lineHeight:1.6}}>
            Backend URL: <strong>{firm.signalwire_backend || 'Not configured'}</strong><br/>
            Fax From Number: <strong>{firm.sw_inbound_did || 'Not configured'}</strong><br/>
            Configure both in 🔌 Integrations → SignalWire Dialer.
          </div>
        </div>
      )}

      {tab === 'integrations_smtp' && null}

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
              { name:'Dana Richard',     email:'flipnitnow@gmail.com',    role:'Admin',       color:'bb' },
              { name:'Yesenia Gonzalez', email:'yeseniagt1@gmail.com', role:'Admin',       color:'bb' },
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
