import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const money = v => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))

export default function RomyLabsAgreementSign(){
  const { token } = useParams()
  const [agreement,setAgreement] = useState(null)
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')
  const [signedName,setSignedName] = useState('')
  const [accepted,setAccepted] = useState(false)
  const [signing,setSigning] = useState(false)
  const [done,setDone] = useState(false)

  async function load(){
    setLoading(true); setError('')
    const {data,error:e} = await supabase.rpc('public_romylabs_get_agreement',{p_token:token})
    if(e || !data?.ok){ setError(e?.message || data?.error || 'Agreement not found'); setLoading(false); return }
    setAgreement(data.agreement)
    setSignedName(data.agreement?.signer_name || '')
    if(data.agreement?.status==='signed') setDone(true)
    setLoading(false)
  }
  useEffect(()=>{ if(token) load() },[token])

  const canSign = useMemo(()=>agreement && !['signed','declined','void','expired'].includes(agreement.status),[agreement])

  async function sign(){
    if(!accepted || signedName.trim().length<2 || !canSign) return
    setSigning(true); setError('')
    const {data,error:e} = await supabase.rpc('public_romylabs_sign_agreement',{
      p_token:token,
      p_signed_name:signedName.trim(),
      p_user_agent:navigator.userAgent || null,
    })
    if(e || !data?.ok){ setError(e?.message || data?.error || 'Unable to sign agreement'); setSigning(false); return }
    setDone(true)
    setAgreement(a=>({...a,status:'signed',signed_at:data.signed_at,signed_name:data.signed_name}))
    setSigning(false)
  }

  const bg = '#0b0b14', card='#11111d', border='rgba(99,102,241,.22)'
  if(loading) return <div style={{minHeight:'100vh',background:bg,color:'#94a3b8',display:'grid',placeItems:'center',fontFamily:'system-ui'}}>Loading agreement…</div>
  if(error && !agreement) return <div style={{minHeight:'100vh',background:bg,color:'#fff',display:'grid',placeItems:'center',fontFamily:'system-ui',padding:24}}><div style={{maxWidth:520,textAlign:'center'}}><div style={{fontSize:42}}>⚠️</div><h2>Agreement unavailable</h2><p style={{color:'#94a3b8'}}>{error}</p><p style={{color:'#64748b',fontSize:13}}>Contact RomyLabs if you need a new signing link.</p></div></div>

  return <div style={{minHeight:'100vh',background:bg,color:'#e2e8f0',fontFamily:'system-ui,Arial,sans-serif'}}>
    <div style={{maxWidth:900,margin:'0 auto',padding:'32px 18px 64px'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,marginBottom:24,flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:25,fontWeight:900,color:'#fff'}}>◆ RomyLabs</div>
          <div style={{fontSize:12,color:'#64748b',marginTop:3}}>Secure electronic agreement</div>
        </div>
        <span style={{fontSize:11,fontWeight:800,padding:'5px 10px',borderRadius:20,background:agreement.status==='signed'?'rgba(16,185,129,.14)':'rgba(99,102,241,.14)',color:agreement.status==='signed'?'#10b981':'#a5b4fc',textTransform:'uppercase'}}>{agreement.status}</span>
      </div>

      <div style={{background:card,border:`1px solid ${border}`,borderRadius:16,overflow:'hidden',boxShadow:'0 20px 70px rgba(0,0,0,.28)'}}>
        <div style={{padding:'22px 26px',borderBottom:`1px solid ${border}`}}>
          <div style={{fontSize:21,fontWeight:900,color:'#fff'}}>{agreement.title}</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10,marginTop:16}}>
            {[
              ['Customer',agreement.firm_name],['Product',agreement.product_name],['Seats',agreement.seats||'—'],['Monthly',money(agreement.monthly_amount)]
            ].map(([l,v])=><div key={l} style={{background:'rgba(255,255,255,.03)',borderRadius:9,padding:'10px 12px'}}><div style={{fontSize:9,color:'#64748b',textTransform:'uppercase',fontWeight:800}}>{l}</div><div style={{fontSize:13,color:'#e2e8f0',fontWeight:700,marginTop:4}}>{v}</div></div>)}
          </div>
        </div>
        <div style={{padding:'28px 30px',lineHeight:1.65,color:'#cbd5e1'}} className="romylabs-agreement-copy" dangerouslySetInnerHTML={{__html:agreement.html}} />
      </div>

      {done ? <div style={{marginTop:20,padding:22,borderRadius:14,background:'rgba(16,185,129,.08)',border:'1px solid rgba(16,185,129,.25)'}}>
        <div style={{fontSize:18,fontWeight:900,color:'#10b981'}}>✓ Agreement signed</div>
        <div style={{fontSize:13,color:'#94a3b8',marginTop:6}}>Signed by <strong style={{color:'#e2e8f0'}}>{agreement.signed_name || signedName}</strong>{agreement.signed_at ? ` on ${new Date(agreement.signed_at).toLocaleString()}` : ''}.</div>
        <div style={{fontSize:12,color:'#64748b',marginTop:8}}>RomyLabs has recorded the signature and audit event. You may close this page.</div>
      </div> : canSign ? <div style={{marginTop:20,background:card,border:`1px solid ${border}`,borderRadius:14,padding:22}}>
        <div style={{fontSize:16,fontWeight:900,color:'#fff',marginBottom:14}}>Electronic signature</div>
        <label style={{fontSize:11,fontWeight:800,color:'#94a3b8',display:'block',marginBottom:6,textTransform:'uppercase'}}>Full legal name</label>
        <input value={signedName} onChange={e=>setSignedName(e.target.value)} placeholder="Type your full legal name" style={{width:'100%',boxSizing:'border-box',padding:'11px 13px',borderRadius:9,border:`1px solid ${border}`,background:'rgba(255,255,255,.04)',color:'#fff',fontSize:14}} />
        <label style={{display:'flex',alignItems:'flex-start',gap:9,marginTop:14,fontSize:12,color:'#94a3b8',lineHeight:1.5,cursor:'pointer'}}>
          <input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} style={{marginTop:3}} />
          <span>I have reviewed this Agreement, I am authorized to sign for the Customer, and I agree that typing my name and selecting “Sign Agreement” constitutes my electronic signature.</span>
        </label>
        {error && <div style={{marginTop:10,color:'#fca5a5',fontSize:12}}>{error}</div>}
        <button onClick={sign} disabled={signing||!accepted||signedName.trim().length<2} style={{marginTop:16,width:'100%',padding:'12px 16px',border:0,borderRadius:9,background:'#6366f1',color:'#fff',fontSize:14,fontWeight:800,cursor:'pointer',opacity:signing||!accepted||signedName.trim().length<2?.5:1}}>{signing?'Signing…':'Sign Agreement'}</button>
      </div> : <div style={{marginTop:20,padding:18,borderRadius:12,background:'rgba(245,158,11,.07)',border:'1px solid rgba(245,158,11,.2)',color:'#fbbf24',fontSize:13}}>This agreement is {agreement.status} and is no longer available for signature.</div>}

      <div style={{marginTop:18,fontSize:11,color:'#475569',lineHeight:1.5,textAlign:'center'}}>Electronic records are retained with signing timestamps and audit metadata. Questions? Reply to the agreement email or contact RomyLabs.</div>
    </div>
    <style>{`.romylabs-agreement-copy h2{color:#fff;font-size:22px;margin:0 0 18px}.romylabs-agreement-copy h3{color:#fff;font-size:14px;margin:22px 0 6px}.romylabs-agreement-copy p{margin:0 0 12px}.romylabs-agreement-copy strong{color:#fff}`}</style>
  </div>
}
