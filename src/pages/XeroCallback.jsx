import { useEffect, useState } from 'react'

const EDGE_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/xero-oauth-callback`

export default function XeroCallback(){
  const [message,setMessage]=useState('Connecting Xero…')
  const [error,setError]=useState(false)
  useEffect(()=>{;(async()=>{
    const p=new URLSearchParams(window.location.search)
    const code=p.get('code'),state=p.get('state'),oauthError=p.get('error')
    if(oauthError||!code||!state){setError(true);setMessage(oauthError?'Xero connection was canceled.':'Missing required parameters from Xero.');return}
    try{
      const url=`${EDGE_FN}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
      const res=await fetch(url,{redirect:'manual'})
      if(res.status===0||res.status===301||res.status===302||res.type==='opaqueredirect'){
        window.location.href='/settings?xero_connect=ok&msg='+encodeURIComponent('Xero connection updated')
        return
      }
      if(!res.ok)throw new Error('Xero connection failed')
      window.location.href='/settings?xero_connect=ok&msg='+encodeURIComponent('Xero connected successfully')
    }catch(e){setError(true);setMessage(e.message||'Something went wrong connecting Xero.')}
  })()},[])
  return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0f172a',color:'#f1f5f9',fontFamily:'Arial,sans-serif',padding:24}}><div style={{background:'#1e293b',borderRadius:14,padding:32,maxWidth:420,width:'100%',textAlign:'center'}}><div style={{fontSize:48,marginBottom:16}}>{error?'⚠️':'⏳'}</div><div style={{fontWeight:800,fontSize:18,marginBottom:8}}>{error?'Connection Failed':'Connecting Xero…'}</div><div style={{fontSize:13,color:'#94a3b8',lineHeight:1.6}}>{message}</div>{error&&<button onClick={()=>window.location.href='/settings'} style={{marginTop:20,padding:'10px 24px',background:'#3b82f6',color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontSize:14}}>Back to Settings</button>}</div></div>
}
