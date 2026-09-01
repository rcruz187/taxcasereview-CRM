import React,{useEffect,useMemo,useState} from 'react'

const BRAND={
  taxres_crm:{name:'TaxRes CRM',email:'romy@taxrescrm.net'},
  camvella:{name:'Camvella',email:'romy@camvella.com'},
  arcvena:{name:'Arcvena',email:'romy@arcvena.com'},
  bocasync:{name:'BocaSync',email:'romy@bocasync.com'},
  groundivo:{name:'Groundivo',email:'info@romylabs.com'},
  oculivo:{name:'Oculivo',email:'info@romylabs.com'},
  romylabs:{name:'RomyLabs',email:'info@romylabs.com'},
}
const STATUS={draft:'#64748b',sent:'#6366f1',viewed:'#0ea5e9',signed:'#10b981',declined:'#ef4444',expired:'#f59e0b',void:'#475569'}
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const dt=v=>v?new Date(v).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}):'—'

export default function UniversalOfficeESign({supabase,productKey,externalOfficeId,firmName,contactName='',contactEmail='',contactPhone='',seats=null,monthlyAmount=null}){
  const [registry,setRegistry]=useState(null)
  const [rows,setRows]=useState([])
  const [form,setForm]=useState({name:contactName||'',email:contactEmail||'',phone:contactPhone||'',seats:seats??'',monthly:monthlyAmount??''})
  const [working,setWorking]=useState(false)
  const [loading,setLoading]=useState(true)
  const [msg,setMsg]=useState('')
  const [error,setError]=useState('')
  const brand=BRAND[productKey]||BRAND.romylabs
  const seatN=Math.max(Number(form.seats||1),1)
  const monthlyN=Number(form.monthly||0)
  const pps=seatN>0&&monthlyN>0?monthlyN/seatN:0

  async function load(){
    if(!productKey||!externalOfficeId)return
    setLoading(true);setError('')
    const reg=await supabase.rpc('admin_romylabs_office_registry',{p_product_key:productKey,p_external_office_id:String(externalOfficeId)})
    if(reg.error){setError(reg.error.message)}
    else if(reg.data&&Object.keys(reg.data).length){
      setRegistry(reg.data)
      setForm(f=>({
        name:reg.data.primary_contact_name||f.name||'',
        email:reg.data.primary_contact_email||f.email||'',
        phone:reg.data.primary_contact_phone||f.phone||'',
        seats:reg.data.seats??f.seats??'',
        monthly:reg.data.monthly_amount??f.monthly??'',
      }))
    }else{
      await supabase.rpc('admin_romylabs_upsert_office_registry',{
        p_product_key:productKey,p_external_office_id:String(externalOfficeId),p_firm_name:firmName,
        p_primary_contact_name:contactName||null,p_primary_contact_email:contactEmail||null,p_primary_contact_phone:contactPhone||null,
        p_seats:seats??null,p_monthly_amount:monthlyAmount??null,p_status:'active',p_metadata:{},p_trial_start_date:null,p_trial_end_date:null,
      })
    }
    const agr=await supabase.rpc('admin_romylabs_agreements_for_office',{p_product_key:productKey,p_external_office_id:String(externalOfficeId)})
    if(agr.error)setError(agr.error.message); else setRows(Array.isArray(agr.data)?agr.data:[])
    setLoading(false)
  }
  useEffect(()=>{load()},[productKey,externalOfficeId])

  async function saveOffice(){
    setWorking(true);setError('');setMsg('')
    const {data,error:e}=await supabase.rpc('admin_romylabs_upsert_office_registry',{
      p_product_key:productKey,p_external_office_id:String(externalOfficeId),p_firm_name:firmName,
      p_primary_contact_name:form.name||null,p_primary_contact_email:form.email||null,p_primary_contact_phone:form.phone||null,
      p_seats:form.seats?Number(form.seats):null,p_monthly_amount:form.monthly?Number(form.monthly):null,
      p_trial_start_date:registry?.trial_start_date||null,p_trial_end_date:registry?.trial_end_date||null,p_status:registry?.status||'active',p_metadata:registry?.metadata||{},
    })
    setWorking(false)
    if(e){setError(e.message);return}
    setRegistry(data);setMsg('Office agreement details saved ✓')
  }

  async function sendEmail(payload){
    const html=`<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#172033"><h2>${brand.name} Subscription Agreement</h2><p>Hi ${form.name||'there'},</p><p>Your agreement for <strong>${brand.name}</strong> is ready to review and sign electronically.</p><div style="background:#f5f7fb;border-radius:10px;padding:14px 16px;margin:18px 0"><strong>${firmName}</strong><br>${payload.seats||seatN} seats · ${money(payload.monthly_amount??monthlyN)}/month</div><p><a href="${payload.sign_url}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Review & Sign Agreement</a></p><p style="font-size:12px;color:#64748b">This secure signing link expires in 14 days.</p><p>Best Regards,<br><strong>${brand.name}</strong><br>RomyLabs</p></div>`
    const {data,error:e}=await supabase.functions.invoke('send-email',{body:{to:form.email,subject:`${brand.name} Agreement — ${firmName}`,html,tenant_id:'a0000000-0000-0000-0000-000000000001',from_name:brand.name,from_email:brand.email}})
    if(e||!data?.success)throw new Error(e?.message||data?.error||'Email send failed')
  }

  async function createAndSend(){
    if(!form.email){setError('Signer email is required.');return}
    if(!window.confirm(`Create and email a ${brand.name} agreement to ${form.email}?`))return
    setWorking(true);setError('');setMsg('')
    try{
      await saveOffice()
      const {data,error:e}=await supabase.rpc('admin_romylabs_create_office_agreement',{
        p_product_key:productKey,p_external_office_id:String(externalOfficeId),p_firm_name:firmName,p_signer_name:form.name||null,p_signer_email:form.email,
        p_seats:seatN,p_price_per_seat:pps||null,p_monthly_amount:monthlyN||null,p_expires_days:14,
      })
      if(e||!data?.ok)throw new Error(e?.message||data?.error||'Agreement creation failed')
      await sendEmail(data)
      const sent=await supabase.rpc('admin_romylabs_mark_agreement_sent',{p_agreement_id:data.agreement_id})
      if(sent.error)throw sent.error
      setMsg(`Agreement sent to ${form.email} ✓`);await load()
    }catch(e){setError(e.message||String(e))}
    setWorking(false)
  }

  async function resend(row){
    setWorking(true);setError('');setMsg('')
    try{const {data,error:e}=await supabase.rpc('admin_romylabs_refresh_agreement_link',{p_agreement_id:row.id});if(e||!data?.ok)throw new Error(e?.message||data?.error||'Could not refresh signing link');await sendEmail(data);setMsg('Fresh signing link emailed ✓');await load()}catch(e){setError(e.message||String(e))}setWorking(false)
  }
  async function voidAgreement(row){
    const reason=window.prompt('Reason for voiding this agreement?');if(reason===null)return
    setWorking(true);const {data,error:e}=await supabase.rpc('admin_romylabs_void_agreement',{p_agreement_id:row.id,p_reason:reason||null});setWorking(false);if(e||!data?.ok)setError(e?.message||data?.error||'Void failed');else{setMsg('Agreement voided');await load()}
  }
  async function viewSigned(row){
    const {data,error:e}=await supabase.rpc('admin_romylabs_signed_agreement_html',{p_agreement_id:row.id});if(e){setError(e.message);return}
    const cert=`<hr><h3>Electronic Signature Certificate</h3><p><strong>Signed by:</strong> ${data.signed_name||''}<br><strong>Email:</strong> ${data.signer_email||''}<br><strong>Signed:</strong> ${dt(data.signed_at)}</p>`
    const w=window.open('','_blank');if(w){w.document.write(`<!doctype html><html><head><title>${data.title||'Signed Agreement'}</title></head><body>${data.html||''}${cert}</body></html>`);w.document.close()}
  }

  const active=useMemo(()=>rows.find(r=>['draft','sent','viewed'].includes(r.status)),[rows])
  return <div style={{background:'rgba(255,255,255,.025)',border:'1px solid rgba(99,102,241,.18)',borderRadius:12,padding:18}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:14,alignItems:'center',marginBottom:16}}><div><div style={{fontSize:15,fontWeight:900,color:'#fff'}}>Documents & E-Sign</div><div style={{fontSize:11,color:'#64748b',marginTop:3}}>Office agreement · secure electronic signature · signed-copy history</div></div><button disabled={working||!!active||!form.email} onClick={createAndSend} style={{padding:'8px 12px',borderRadius:8,border:'none',background:'#6366f1',color:'#fff',fontWeight:800,fontSize:11,cursor:'pointer',opacity:(working||!!active||!form.email)?.5:1}}>{working?'Working…':'+ Create & Email Agreement'}</button></div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:8,marginBottom:10}}>
      {[['Signer name','name','text'],['Signer email','email','email'],['Phone','phone','text'],['Seats','seats','number'],['Monthly','monthly','number']].map(([label,key,type])=><label key={key} style={{fontSize:9,color:'#64748b',fontWeight:800,textTransform:'uppercase'}}>{label}<input type={type} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={{display:'block',width:'100%',boxSizing:'border-box',marginTop:5,padding:'8px 9px',borderRadius:7,border:'1px solid rgba(99,102,241,.2)',background:'rgba(255,255,255,.035)',color:'#e2e8f0',fontSize:12}}/></label>)}
    </div>
    <button onClick={saveOffice} disabled={working} style={{fontSize:10,padding:'6px 10px',borderRadius:7,border:'1px solid rgba(99,102,241,.25)',background:'rgba(99,102,241,.08)',color:'#a5b4fc',cursor:'pointer',marginBottom:14}}>Save Office Agreement Details</button>
    {registry?.trial_end_date&&<div style={{fontSize:10,color:'#f59e0b',marginBottom:10}}>Trial through {new Date(registry.trial_end_date+'T12:00:00').toLocaleDateString()}</div>}
    {loading?<div style={{fontSize:11,color:'#64748b'}}>Loading agreements…</div>:rows.length===0?<div style={{fontSize:11,color:'#64748b'}}>No agreements yet.</div>:rows.slice(0,8).map(row=>{const c=STATUS[row.status]||'#64748b';return <div key={row.id} style={{padding:10,borderRadius:8,border:'1px solid rgba(99,102,241,.1)',background:'rgba(255,255,255,.02)',marginBottom:7}}><div style={{display:'flex',gap:8,alignItems:'center'}}><span style={{fontSize:9,fontWeight:900,color:c,textTransform:'uppercase'}}>{row.status}</span><span style={{fontSize:10,color:'#64748b'}}>{row.sent_at?`Sent ${dt(row.sent_at)}`:`Created ${dt(row.created_at)}`}</span>{row.signed_at&&<span style={{fontSize:10,color:'#10b981',marginLeft:'auto'}}>Signed {dt(row.signed_at)}</span>}</div><div style={{fontSize:11,color:'#cbd5e1',marginTop:5}}>{row.agreement_title} · {row.seats||'—'} seats · {money(row.monthly_amount)}/mo</div>{row.signed_name&&<div style={{fontSize:10,color:'#10b981',marginTop:4}}>✓ Signed by {row.signed_name}</div>}<div style={{display:'flex',gap:6,marginTop:7}}>{row.status==='signed'&&<button onClick={()=>viewSigned(row)} style={{fontSize:9,padding:'4px 8px',borderRadius:6,border:'1px solid rgba(16,185,129,.25)',background:'rgba(16,185,129,.08)',color:'#34d399',cursor:'pointer'}}>View Signed Agreement</button>}{!['signed','declined','void'].includes(row.status)&&<><button onClick={()=>resend(row)} disabled={working} style={{fontSize:9,padding:'4px 8px',borderRadius:6,border:'1px solid rgba(99,102,241,.25)',background:'rgba(99,102,241,.08)',color:'#a5b4fc',cursor:'pointer'}}>Resend Fresh Link</button><button onClick={()=>voidAgreement(row)} disabled={working} style={{fontSize:9,padding:'4px 8px',borderRadius:6,border:'1px solid rgba(239,68,68,.2)',background:'rgba(239,68,68,.06)',color:'#f87171',cursor:'pointer'}}>Void</button></>}</div></div>})}
    {msg&&<div style={{fontSize:10,color:'#10b981',marginTop:8}}>{msg}</div>}{error&&<div style={{fontSize:10,color:'#f87171',marginTop:8}}>{error}</div>}
  </div>
}
