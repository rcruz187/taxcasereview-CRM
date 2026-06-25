import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'

const ENTITY_TYPES = ['LLC','S-Corp','C-Corp','Sole Proprietorship','Partnership','Non-Profit 501(c)(3)','Professional LLC (PLLC)']
const ENTITY_ICONS = {
  'LLC':'🏢','S-Corp':'📈','C-Corp':'🏦','Sole Proprietorship':'👤','Partnership':'🤝',
  'Non-Profit 501(c)(3)':'❤️','Professional LLC (PLLC)':'⚖️'
}
const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']
const STAGES = ['Consultation','Documents Prep','State Filing','EIN Application','Operating Agreement','Bank Account Setup','Complete']

const BLANK = {
  client_name:'', entity_name:'', entity_type:'LLC', state:'FL',
  owners:'', registered_agent:'', business_purpose:'',
  ein:'', state_file_num:'', stage:'Consultation',
  notes:'', formation_date:'', fee:'', fee_paid:false
}

const WIZ_BLANK = {
  entity_type: '', state: '', client_name: '', entity_name: '',
  owners: '', registered_agent: 'Self (Owner)', business_purpose: ''
}

export default function FormaCorp() {
  const { showToast } = useApp()
  const [cases,    setCases]    = useState([])
  const [clients,  setClients]  = useState([])
  const [modal,    setModal]    = useState(false)
  const [detail,   setDetail]   = useState(null)
  const [form,     setForm]     = useState(BLANK)
  const [saving,   setSaving]   = useState(false)
  const [search,   setSearch]   = useState('')
  const [stageFilter, setSF]    = useState('All')
  const [confirmDel, setCD]     = useState(null)
  const [sugg,     setSugg]     = useState([])
  const [showSug,  setShowSug]  = useState(false)
  const [stateReqs, setStateReqs] = useState({})
  const [wizard,   setWizard]   = useState(false)
  const [wStep,    setWStep]    = useState(1)
  const [wForm,    setWForm]    = useState(WIZ_BLANK)
  const [wSugg,    setWSugg]    = useState([])
  const [wShowSug, setWShowSug] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data:c }, { data:cl }, { data:sr }] = await Promise.all([
      supabase.from('formacorp').select('*').order('created_at', { ascending:false }),
      supabase.from('clients').select('id,name,email,phone'),
      supabase.from('state_formation_requirements').select('*')
    ])
    setCases(c || [])
    setClients(cl || [])
    const map = {}
    for (const r of (sr || [])) map[r.state] = r
    setStateReqs(map)
  }

  function fld(k,v) { setForm(f=>({...f,[k]:v})) }
  function wFld(k,v) { setWForm(f=>({...f,[k]:v})) }

  function wSearchClient(val) {
    wFld('client_name', val)
    if (val.length < 2) { setWSugg([]); setWShowSug(false); return }
    const m = clients.filter(c=>c.name.toLowerCase().includes(val.toLowerCase())).slice(0,6)
    setWSugg(m); setWShowSug(m.length > 0)
  }

  function openWizard() {
    setWForm(WIZ_BLANK)
    setWStep(1)
    setWizard(true)
  }

  async function createFromWizard() {
    if (!wForm.client_name || !wForm.entity_name || !wForm.entity_type || !wForm.state) {
      showToast('Please complete all required fields', 'err'); return
    }
    setSaving(true)
    const req = stateReqs[wForm.state]
    const fee = req?.llc_filing_fee ? parseFloat(req.llc_filing_fee.replace(/[^0-9.]/g, '')) : null
    const payload = {
      client_name: wForm.client_name,
      entity_name: wForm.entity_name,
      entity_type: wForm.entity_type,
      state: wForm.state,
      owners: wForm.owners,
      registered_agent: wForm.registered_agent,
      business_purpose: wForm.business_purpose,
      stage: 'Consultation',
      fee: fee,
      fee_paid: false,
      ein: '', state_file_num: '', notes: '', formation_date: '',
      created_at: new Date().toISOString()
    }
    const { data, error } = await supabase.from('formacorp').insert([payload]).select().single()
    setSaving(false)
    if (error) { showToast('Error: '+error.message, 'err'); return }
    showToast('🏢 Formation case created!')
    setWizard(false)
    await load()
    setDetail(data)
  }

  function searchClient(val) {
    fld('client_name', val)
    if (val.length < 2) { setSugg([]); setShowSug(false); return }
    const m = clients.filter(c=>c.name.toLowerCase().includes(val.toLowerCase())).slice(0,6)
    setSugg(m); setShowSug(m.length > 0)
  }

  async function save() {
    if (!form.client_name || !form.entity_name || !form.entity_type) {
      showToast('Client, entity name and type required', 'err'); return
    }
    setSaving(true)
    const payload = { ...form, fee: form.fee ? parseFloat(form.fee) : null, created_at: new Date().toISOString() }
    const { error } = modal === 'edit'
      ? await supabase.from('formacorp').update(payload).eq('id', form.id)
      : await supabase.from('formacorp').insert([payload])
    setSaving(false)
    if (error) { showToast('Error: '+error.message, 'err'); return }
    showToast(modal==='edit' ? '✅ Updated!' : '✅ Case created!')
    setModal(false); setForm(BLANK); load()
  }

  async function updateStage(id, stage) {
    await supabase.from('formacorp').update({ stage }).eq('id', id)
    showToast(`Stage → ${stage}`)
    load()
    if (detail?.id === id) setDetail(d => ({...d, stage}))
  }

  async function del(id) {
    await supabase.from('formacorp').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id)); setCD(null); showToast('Deleted')
    if (detail?.id === id) setDetail(null)
  }

  const filtered = cases.filter(c => {
    const q = search.toLowerCase()
    const mq = !q || c.client_name?.toLowerCase().includes(q) || c.entity_name?.toLowerCase().includes(q)
    const ms = stageFilter === 'All' || c.stage === stageFilter
    return mq && ms
  })

  const stageColor = { 'Consultation':'#f59e0b','Documents Prep':'#3b82f6','State Filing':'#8b5cf6',
    'EIN Application':'#06b6d4','Operating Agreement':'#ec4899','Bank Account Setup':'#f97316','Complete':'#22c55e' }

  // ── DETAIL VIEW ──────────────────────────────────────────────────────────
  if (detail) {
    const c = cases.find(x=>x.id===detail.id) || detail
    const stageIdx = STAGES.indexOf(c.stage)
    return (
      <div style={{maxWidth:900}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <button className="btn sm" onClick={()=>setDetail(null)}>← Back</button>
            <span style={{color:'var(--t3)',fontSize:12}}>FormaCorp / {c.entity_name}</span>
          </div>
          <div style={{display:'flex',gap:6}}>
            <button className="btn sm" onClick={()=>{setForm(c);setModal('edit')}}>✏️ Edit</button>
            <button className="btn del sm" onClick={()=>setCD(c.id)}>🗑 Delete</button>
          </div>
        </div>

        {/* Header */}
        <div className="card" style={{padding:'14px 16px',marginBottom:10}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:44,height:44,borderRadius:10,background:'var(--blt)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>🏢</div>
            <div style={{flex:1}}>
              <div style={{fontSize:17,fontWeight:800}}>{c.entity_name}</div>
              <div style={{display:'flex',gap:6,marginTop:4,flexWrap:'wrap'}}>
                <span className="bdg bb" style={{fontSize:10}}>{c.entity_type}</span>
                <span className="bdg" style={{fontSize:10,background:stageColor[c.stage]+'22',color:stageColor[c.stage],border:`1px solid ${stageColor[c.stage]}44`}}>{c.stage}</span>
                <span className="bdg bn" style={{fontSize:10}}>{c.state}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Pipeline */}
        <div className="card" style={{padding:'10px 16px',marginBottom:10}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>Formation Pipeline</div>
          <div style={{display:'flex',alignItems:'center',overflowX:'auto',gap:0}}>
            {STAGES.map((s,i)=>{
              const done = i <= stageIdx
              const active = i === stageIdx
              return (
                <div key={s} style={{display:'flex',alignItems:'center',flex:1,minWidth:70}}>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',flex:1,cursor:'pointer'}} onClick={()=>updateStage(c.id,s)}>
                    <div style={{width:22,height:22,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,background:done?stageColor[c.stage]:'var(--s3)',color:done?'#fff':'var(--t3)',border:`2px solid ${done?stageColor[c.stage]:'var(--br)'}`,outline:active?`3px solid ${stageColor[c.stage]}44`:'none'}}>
                      {done&&!active?'✓':i+1}
                    </div>
                    <div style={{fontSize:8,marginTop:3,textAlign:'center',color:done?stageColor[c.stage]:'var(--t3)',whiteSpace:'nowrap',maxWidth:60,overflow:'hidden',textOverflow:'ellipsis'}}>{s}</div>
                  </div>
                  {i < STAGES.length-1 && <div style={{height:2,flex:1,maxWidth:20,background:done&&i<stageIdx?stageColor[c.stage]:'var(--br)',marginBottom:14}}/>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Info grid */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
          <div className="card" style={{padding:'12px 16px'}}>
            <div className="stitle" style={{marginBottom:8}}>Client & Entity</div>
            {[['Client',c.client_name],['Entity Name',c.entity_name],['Entity Type',c.entity_type],['State',c.state],['Formation Date',c.formation_date||'—'],['Owners/Members',c.owners||'—'],['Registered Agent',c.registered_agent||'—']].map(([l,v])=>(
              <div key={l} className="dr"><span className="dl">{l}</span><span className="dv">{v||'—'}</span></div>
            ))}
          </div>
          <div className="card" style={{padding:'12px 16px'}}>
            <div className="stitle" style={{marginBottom:8}}>Filing & Fee</div>
            {[['EIN',c.ein||'—'],['State File #',c.state_file_num||'—'],['Fee',c.fee?`$${c.fee}`:'—'],['Fee Paid',c.fee_paid?'✅ Yes':'⏳ Pending'],['Business Purpose',c.business_purpose||'—']].map(([l,v])=>(
              <div key={l} className="dr"><span className="dl">{l}</span><span className="dv">{v}</span></div>
            ))}
          </div>
        </div>

        {/* State Filing Requirements */}
        {stateReqs[c.state] && (
          <div className="card" style={{padding:'12px 16px',marginBottom:10}}>
            <div className="stitle" style={{marginBottom:8}}>📍 {stateReqs[c.state].state_name} Filing Requirements</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:0}}>
              <div className="dr"><span className="dl">LLC Filing Fee</span><span className="dv">{stateReqs[c.state].llc_filing_fee||'—'}</span></div>
              <div className="dr"><span className="dl">Processing Time</span><span className="dv">{stateReqs[c.state].processing_time||'—'}</span></div>
              <div className="dr"><span className="dl">Annual Report</span><span className="dv">{stateReqs[c.state].annual_report_fee||'—'}</span></div>
            </div>
            {stateReqs[c.state].notes && (
              <div style={{fontSize:12,color:'var(--t3)',marginTop:8,lineHeight:1.5,paddingTop:8,borderTop:'1px solid var(--br)'}}>ℹ️ {stateReqs[c.state].notes}</div>
            )}
          </div>
        )}

        {/* Resources */}
        <div className="card" style={{padding:'12px 16px',marginBottom:10}}>
          <div className="stitle" style={{marginBottom:10}}>Quick Links & Resources</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <a href="https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online" target="_blank" rel="noreferrer"
              style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',borderRadius:7,background:'var(--s2)',border:'1px solid var(--br)',fontSize:12,fontWeight:600,color:'var(--blue)',textDecoration:'none'}}>
              🔢 Apply for EIN — IRS.gov
            </a>
            <a href={stateReqs[c.state]?.sos_url || `https://www.sos.${c.state?.toLowerCase()}.gov`} target="_blank" rel="noreferrer"
              style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',borderRadius:7,background:'var(--s2)',border:'1px solid var(--br)',fontSize:12,fontWeight:600,color:'var(--blue)',textDecoration:'none'}}>
              🏛️ File with {c.state} Secretary of State
            </a>
            <a href="https://www.irs.gov/businesses/small-businesses-self-employed/s-corporations" target="_blank" rel="noreferrer"
              style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',borderRadius:7,background:'var(--s2)',border:'1px solid var(--br)',fontSize:12,fontWeight:600,color:'var(--blue)',textDecoration:'none'}}>
              📋 IRS S-Corp / LLC Info
            </a>
          </div>
        </div>

        {c.notes && (
          <div className="card" style={{padding:'10px 16px',marginBottom:10}}>
            <div className="stitle" style={{marginBottom:4}}>Notes</div>
            <div style={{fontSize:13,color:'var(--t2)',lineHeight:1.7,whiteSpace:'pre-wrap'}}>{c.notes}</div>
          </div>
        )}

        {confirmDel && (
          <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setCD(null)}>
            <div className="modal" style={{maxWidth:380,textAlign:'center'}}>
              <div style={{fontSize:36,marginBottom:12}}>🗑</div>
              <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>Delete this case?</div>
              <div style={{fontSize:13,color:'var(--t3)',marginBottom:20}}>This cannot be undone.</div>
              <div style={{display:'flex',gap:8}}>
                <button className="btn sec" style={{flex:1,justifyContent:'center'}} onClick={()=>setCD(null)}>Cancel</button>
                <button className="btn del" style={{flex:1,justifyContent:'center'}} onClick={()=>del(confirmDel)}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── LIST VIEW ─────────────────────────────────────────────────────────────
  return (
    <div style={{maxWidth:1000}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
        <h2 style={{fontSize:15,fontWeight:700,margin:0}}>🏢 FormaCorp — Business Formation</h2>
        <div style={{display:'flex',gap:8}}>
          <button className="btn pri" onClick={openWizard} style={{display:'flex',alignItems:'center',gap:6}}>🚀 Start a Business</button>
          <button className="btn" onClick={()=>{setForm(BLANK);setModal('new')}}>+ New Formation Case</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',gap:8,marginBottom:14}}>
        {[
          ['Total Cases', cases.length, 'var(--tx)'],
          ['In Progress', cases.filter(c=>c.stage!=='Complete').length, 'var(--warn)'],
          ['Complete', cases.filter(c=>c.stage==='Complete').length, 'var(--ok)'],
          ['EIN Filed', cases.filter(c=>c.ein).length, 'var(--b2)'],
        ].map(([l,v,color])=>(
          <div key={l} className="card" style={{padding:'10px 14px',textAlign:'center'}}>
            <div style={{fontWeight:800,fontSize:20,color}}>{v}</div>
            <div style={{fontSize:10,color:'var(--t3)',marginTop:2,textTransform:'uppercase',letterSpacing:'.05em'}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search client or entity…"
          style={{flex:1,minWidth:180,padding:'7px 12px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:12}}/>
        <select value={stageFilter} onChange={e=>setSF(e.target.value)}
          style={{padding:'7px 12px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:12}}>
          <option value="All">All Stages</option>
          {STAGES.map(s=><option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="card" style={{padding:32,textAlign:'center',color:'var(--t3)'}}>
          <div style={{fontSize:36,marginBottom:10}}>🏢</div>
          <div style={{fontWeight:700,fontSize:15,color:'var(--tx)',marginBottom:4}}>No formation cases yet</div>
          <div style={{fontSize:13}}>Click "🚀 Start a Business" for a guided setup, or "+ New Formation Case" for a quick manual entry.</div>
        </div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:10}}>
          {filtered.map(c=>(
            <div key={c.id} className="card" style={{padding:'14px 16px',cursor:'pointer',borderTop:`3px solid ${stageColor[c.stage]||'var(--br)'}`}}
              onClick={()=>setDetail(c)}
              onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow=`0 6px 20px ${stageColor[c.stage]}22`}}
              onMouseLeave={e=>{e.currentTarget.style.transform='';e.currentTarget.style.boxShadow=''}}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:8}}>
                <div>
                  <div style={{fontSize:14,fontWeight:800,marginBottom:2}}>{c.entity_name}</div>
                  <div style={{fontSize:12,color:'var(--t3)'}}>{c.client_name}</div>
                </div>
                <span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:stageColor[c.stage]+'22',color:stageColor[c.stage],border:`1px solid ${stageColor[c.stage]}44`,fontWeight:600,whiteSpace:'nowrap'}}>{c.stage}</span>
              </div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                <span className="bdg bb" style={{fontSize:10}}>{c.entity_type}</span>
                <span className="bdg bn" style={{fontSize:10}}>{c.state}</span>
                {c.ein && <span className="bdg bg" style={{fontSize:10}}>EIN ✓</span>}
                {c.fee_paid && <span className="bdg bg" style={{fontSize:10}}>Paid</span>}
              </div>
              {/* Mini pipeline */}
              <div style={{display:'flex',gap:3,marginTop:10,alignItems:'center'}}>
                {STAGES.map((s,i)=>{
                  const done = i <= STAGES.indexOf(c.stage)
                  return <div key={s} style={{flex:1,height:4,borderRadius:2,background:done?stageColor[c.stage]:'var(--s3)'}}/>
                })}
              </div>
              <div style={{fontSize:9,color:'var(--t3)',marginTop:3}}>
                Step {STAGES.indexOf(c.stage)+1} of {STAGES.length}: {c.stage}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setCD(null)}>
          <div className="modal" style={{maxWidth:380,textAlign:'center'}}>
            <div style={{fontSize:36,marginBottom:12}}>🗑</div>
            <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>Delete this case?</div>
            <div style={{fontSize:13,color:'var(--t3)',marginBottom:20}}>Cannot be undone.</div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn sec" style={{flex:1,justifyContent:'center'}} onClick={()=>setCD(null)}>Cancel</button>
              <button className="btn del" style={{flex:1,justifyContent:'center'}} onClick={()=>del(confirmDel)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* New / Edit Modal */}
      {modal && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal" style={{width:580,maxHeight:'90vh',overflowY:'auto'}}>
            <div className="mh">
              <span className="mt">🏢 {modal==='edit'?'Edit':'New'} Formation Case</span>
              <button className="xbtn" onClick={()=>setModal(false)}>&times;</button>
            </div>

            {/* Client */}
            <div style={{position:'relative'}} className="field">
              <label>Client *</label>
              <input value={form.client_name} onChange={e=>searchClient(e.target.value)} placeholder="Search client…"/>
              {showSug && sugg.length>0 && (
                <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--sf)',border:'1px solid var(--br)',borderRadius:6,zIndex:50,maxHeight:160,overflowY:'auto'}}>
                  {sugg.map(c=>(
                    <div key={c.id} onClick={()=>{fld('client_name',c.name);setSugg([]);setShowSug(false)}}
                      style={{padding:'8px 12px',cursor:'pointer',fontSize:13}}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--s2)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      {c.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="fg2">
              <div className="field"><label>Entity Name *</label>
                <input value={form.entity_name} onChange={e=>fld('entity_name',e.target.value)} placeholder="e.g. Smith Holdings LLC"/>
              </div>
              <div className="field"><label>Entity Type *</label>
                <select value={form.entity_type} onChange={e=>fld('entity_type',e.target.value)}>
                  {ENTITY_TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div className="fg2">
              <div className="field"><label>State of Formation</label>
                <select value={form.state} onChange={e=>fld('state',e.target.value)}>
                  {STATES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="field"><label>Formation Date</label>
                <input type="date" value={form.formation_date} onChange={e=>fld('formation_date',e.target.value)}/>
              </div>
            </div>

            <div className="field"><label>Owners / Members (names & %)</label>
              <input value={form.owners} onChange={e=>fld('owners',e.target.value)} placeholder="e.g. John Smith 60%, Jane Smith 40%"/>
            </div>

            <div className="field"><label>Registered Agent</label>
              <input value={form.registered_agent} onChange={e=>fld('registered_agent',e.target.value)} placeholder="Name or company"/>
            </div>

            <div className="field"><label>Business Purpose</label>
              <input value={form.business_purpose} onChange={e=>fld('business_purpose',e.target.value)} placeholder="e.g. Tax resolution consulting services"/>
            </div>

            <div className="fg2">
              <div className="field"><label>EIN (if obtained)</label>
                <input value={form.ein} onChange={e=>fld('ein',e.target.value)} placeholder="XX-XXXXXXX"/>
              </div>
              <div className="field"><label>State Filing Number</label>
                <input value={form.state_file_num} onChange={e=>fld('state_file_num',e.target.value)} placeholder="State-issued #"/>
              </div>
            </div>

            <div className="fg2">
              <div className="field"><label>Formation Fee</label>
                <input type="number" value={form.fee} onChange={e=>fld('fee',e.target.value)} placeholder="0.00"/>
              </div>
              <div className="field"><label>Stage</label>
                <select value={form.stage} onChange={e=>fld('stage',e.target.value)}>
                  {STAGES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="field">
              <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
                <input type="checkbox" checked={form.fee_paid} onChange={e=>fld('fee_paid',e.target.checked)} style={{width:'auto'}}/>
                Fee Paid
              </label>
            </div>

            <div className="field"><label>Notes</label>
              <textarea value={form.notes} onChange={e=>fld('notes',e.target.value)} rows={3}
                style={{width:'100%',resize:'vertical',padding:'8px 12px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:13,fontFamily:'inherit'}}/>
            </div>

            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={save} disabled={saving}>
              {saving ? 'Saving…' : modal==='edit' ? '💾 Update Case' : '🏢 Create Formation Case'}
            </button>
          </div>
        </div>
      )}

      {/* Start a Business Wizard */}
      {wizard && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setWizard(false)}>
          <div className="modal" style={{width:560,maxHeight:'90vh',overflowY:'auto'}}>
            <div className="mh">
              <span className="mt">🚀 Start a Business</span>
              <button className="xbtn" onClick={()=>setWizard(false)}>&times;</button>
            </div>

            {/* Step indicator */}
            <div style={{display:'flex',alignItems:'center',gap:0,marginBottom:20}}>
              {['Entity Type','State','Details','Review'].map((label,i)=>{
                const step = i+1
                const done = step < wStep
                const active = step === wStep
                return (
                  <div key={label} style={{display:'flex',alignItems:'center',flex:1}}>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',flex:1}}>
                      <div style={{width:24,height:24,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,
                        background:done||active?'var(--blue)':'var(--s3)',color:done||active?'#fff':'var(--t3)',
                        border:`2px solid ${done||active?'var(--blue)':'var(--br)'}`}}>
                        {done?'✓':step}
                      </div>
                      <div style={{fontSize:10,marginTop:4,color:done||active?'var(--tx)':'var(--t3)',whiteSpace:'nowrap'}}>{label}</div>
                    </div>
                    {step<4 && <div style={{height:2,flex:1,background:done?'var(--blue)':'var(--br)',marginBottom:16}}/>}
                  </div>
                )
              })}
            </div>

            {/* Step 1: Entity Type */}
            {wStep === 1 && (
              <div>
                <div style={{fontSize:13,color:'var(--t3)',marginBottom:14}}>What type of business entity does your client want to form?</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  {ENTITY_TYPES.map(t=>(
                    <div key={t} onClick={()=>wFld('entity_type',t)}
                      style={{padding:'16px 14px',borderRadius:8,border:`2px solid ${wForm.entity_type===t?'var(--blue)':'var(--br)'}`,
                        background:wForm.entity_type===t?'var(--blt)':'var(--s2)',cursor:'pointer',fontWeight:600,fontSize:13,
                        display:'flex',alignItems:'center',gap:8,transition:'all .1s'}}>
                      <span style={{fontSize:18}}>{ENTITY_ICONS[t]||'🏢'}</span> {t}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: State */}
            {wStep === 2 && (
              <div>
                <div style={{fontSize:13,color:'var(--t3)',marginBottom:14}}>Which state will {wForm.entity_type || 'the business'} be formed in?</div>
                <select value={wForm.state} onChange={e=>wFld('state',e.target.value)}
                  style={{width:'100%',padding:'10px 12px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:8,color:'var(--tx)',fontSize:14,marginBottom:14}}>
                  <option value="">— Select a state —</option>
                  {STATES.map(s=><option key={s} value={s}>{stateReqs[s]?.state_name || s} ({s})</option>)}
                </select>
                {wForm.state && stateReqs[wForm.state] && (
                  <div className="card" style={{padding:'14px 16px',background:'var(--s2)'}}>
                    <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>📍 {stateReqs[wForm.state].state_name}</div>
                    <div className="dr"><span className="dl">Filing Fee</span><span className="dv">{stateReqs[wForm.state].llc_filing_fee}</span></div>
                    <div className="dr"><span className="dl">Processing Time</span><span className="dv">{stateReqs[wForm.state].processing_time}</span></div>
                    <div className="dr"><span className="dl">Annual Report</span><span className="dv">{stateReqs[wForm.state].annual_report_fee}</span></div>
                    {stateReqs[wForm.state].notes && (
                      <div style={{fontSize:12,color:'var(--t3)',marginTop:8,paddingTop:8,borderTop:'1px solid var(--br)',lineHeight:1.5}}>ℹ️ {stateReqs[wForm.state].notes}</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Details */}
            {wStep === 3 && (
              <div>
                <div style={{fontSize:13,color:'var(--t3)',marginBottom:14}}>Tell us about the business.</div>
                <div style={{position:'relative'}} className="field">
                  <label>Client *</label>
                  <input value={wForm.client_name} onChange={e=>wSearchClient(e.target.value)} placeholder="Search or type client name…"/>
                  {wShowSug && wSugg.length>0 && (
                    <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--sf)',border:'1px solid var(--br)',borderRadius:6,zIndex:50,maxHeight:160,overflowY:'auto'}}>
                      {wSugg.map(c=>(
                        <div key={c.id} onClick={()=>{wFld('client_name',c.name);setWSugg([]);setWShowSug(false)}}
                          style={{padding:'8px 12px',cursor:'pointer',fontSize:13}}
                          onMouseEnter={e=>e.currentTarget.style.background='var(--s2)'}
                          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                          {c.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="field"><label>Entity Name *</label>
                  <input value={wForm.entity_name} onChange={e=>wFld('entity_name',e.target.value)} placeholder="e.g. Smith Holdings LLC"/>
                </div>
                <div className="field"><label>Owners / Members (names & %)</label>
                  <input value={wForm.owners} onChange={e=>wFld('owners',e.target.value)} placeholder="e.g. John Smith 60%, Jane Smith 40%"/>
                </div>
                <div className="field"><label>Registered Agent</label>
                  <input value={wForm.registered_agent} onChange={e=>wFld('registered_agent',e.target.value)} placeholder="Self (Owner), or agency name"/>
                </div>
                <div className="field"><label>Business Purpose</label>
                  <input value={wForm.business_purpose} onChange={e=>wFld('business_purpose',e.target.value)} placeholder="e.g. Tax resolution consulting services"/>
                </div>
              </div>
            )}

            {/* Step 4: Review */}
            {wStep === 4 && (
              <div>
                <div style={{fontSize:13,color:'var(--t3)',marginBottom:14}}>Review the details below, then create the formation case.</div>
                <div className="card" style={{padding:'14px 16px',background:'var(--s2)',marginBottom:10}}>
                  {[
                    ['Entity Type', `${ENTITY_ICONS[wForm.entity_type]||'🏢'} ${wForm.entity_type}`],
                    ['State', `${stateReqs[wForm.state]?.state_name || wForm.state} (${wForm.state})`],
                    ['Client', wForm.client_name],
                    ['Entity Name', wForm.entity_name],
                    ['Owners/Members', wForm.owners || '—'],
                    ['Registered Agent', wForm.registered_agent || '—'],
                    ['Business Purpose', wForm.business_purpose || '—'],
                  ].map(([l,v])=>(
                    <div key={l} className="dr"><span className="dl">{l}</span><span className="dv">{v}</span></div>
                  ))}
                </div>
                {stateReqs[wForm.state] && (
                  <div className="card" style={{padding:'14px 16px',background:'var(--s2)'}}>
                    <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>📍 {stateReqs[wForm.state].state_name} Filing Snapshot</div>
                    <div className="dr"><span className="dl">Filing Fee</span><span className="dv">{stateReqs[wForm.state].llc_filing_fee}</span></div>
                    <div className="dr"><span className="dl">Processing Time</span><span className="dv">{stateReqs[wForm.state].processing_time}</span></div>
                    <div className="dr"><span className="dl">Annual Report</span><span className="dv">{stateReqs[wForm.state].annual_report_fee}</span></div>
                  </div>
                )}
                <div style={{fontSize:12,color:'var(--t3)',marginTop:10,lineHeight:1.6}}>
                  This creates a formation case starting at the <strong>Consultation</strong> stage. You'll be taken to the case page where you can track progress through filing, EIN, operating agreement, and more.
                </div>
              </div>
            )}

            {/* Wizard nav */}
            <div style={{display:'flex',justifyContent:'space-between',gap:10,marginTop:20,paddingTop:16,borderTop:'1px solid var(--br)'}}>
              <button className="btn" onClick={()=> wStep===1 ? setWizard(false) : setWStep(s=>s-1)}>
                {wStep===1 ? 'Cancel' : '← Back'}
              </button>
              {wStep < 4 ? (
                <button className="btn pri" disabled={
                  (wStep===1 && !wForm.entity_type) ||
                  (wStep===2 && !wForm.state) ||
                  (wStep===3 && (!wForm.client_name || !wForm.entity_name))
                } onClick={()=>setWStep(s=>s+1)}>
                  Continue →
                </button>
              ) : (
                <button className="btn pri" onClick={createFromWizard} disabled={saving}>
                  {saving ? 'Creating…' : '🏢 Create Formation Case'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
