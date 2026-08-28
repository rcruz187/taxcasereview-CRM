import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}
const TOKEN_URL='https://oauth2.googleapis.com/token', SEND_URL='https://gmail.googleapis.com/gmail/v1/users/me/messages/send'
const PUBLIC_KINDS=new Set(['booking_confirmation','booking_firm_notification'])
const PRODUCT_BRANDS:any={
  romylabs:{name:'RomyLabs',email:'romy@romylabs.com'}, camvella:{name:'Camvella',email:'romy@camvella.com'},
  arcvena:{name:'Arcvena',email:'romy@arcvena.com'}, bocasync:{name:'BocaSync',email:'romy@bocasync.com'}
}
const safe=(v:any)=>String(v??'').replace(/[\r\n]+/g,' ').trim()
const esc=(v:any)=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
function b64url(s:string){const u=new TextEncoder().encode(s);let b='';u.forEach(x=>b+=String.fromCharCode(x));return btoa(b).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function enc(s:string){if(!s||/^[\x00-\x7F]*$/.test(s))return s;const u=new TextEncoder().encode(s);let b='';u.forEach(x=>b+=String.fromCharCode(x));return `=?UTF-8?B?${btoa(b)}?=`}
function fmt12(t:string){const[h,m]=String(t).slice(0,5).split(':').map(Number);return `${((h+11)%12)+1}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`}
function whenLong(d:string,t:string){return `${new Date(d+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})} at ${fmt12(t)} (Eastern)`}
function whenShort(d:string,t:string){return `${new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})} at ${fmt12(t)}`}
async function gmailToken(sb:any,s:any){const exp=s.gmail_token_expiry?new Date(s.gmail_token_expiry).getTime():0;if(s.gmail_access_token&&exp>Date.now()+60000)return s.gmail_access_token;const body=new URLSearchParams({refresh_token:s.gmail_refresh_token,client_id:s.gmail_client_id,client_secret:s.gmail_client_secret,grant_type:'refresh_token'});const r=await fetch(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});const d=await r.json();if(!r.ok)throw new Error(d.error_description||d.error||'Gmail token refresh failed');await sb.from('settings').update({gmail_access_token:d.access_token,gmail_token_expiry:new Date(Date.now()+(d.expires_in||3600)*1000).toISOString()}).eq('id',s.id);return d.access_token}
function raw(o:any){const atts=o.atts||[];const from=`${enc(safe(o.fromName))} <${safe(o.from)}>`;if(atts.length){const bd=`tcr_${crypto.randomUUID()}`;const h=[`To: ${safe(o.to)}`,`From: ${from}`,...(o.replyTo?[`Reply-To: ${safe(o.replyTo)}`]:[]),`Subject: ${enc(safe(o.subject))}`,'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${bd}"`].join('\r\n');const body=`--${bd}\r\nContent-Type: ${o.isHtml?'text/html':'text/plain'}; charset="UTF-8"\r\n\r\n${o.body}\r\n`;const ap=atts.map((a:any)=>`--${bd}\r\nContent-Type: ${a.contentType||'application/octet-stream'}\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="${safe(a.filename)||'attachment'}"\r\n\r\n${a.b64.match(/.{1,76}/g)?.join('\r\n')||a.b64}\r\n`).join('');return `${h}\r\n\r\n${body}${ap}--${bd}--`}
 const h=[`To: ${safe(o.to)}`,`From: ${from}`,...(o.replyTo?[`Reply-To: ${safe(o.replyTo)}`]:[]),`Subject: ${enc(safe(o.subject))}`,`Date: ${new Date().toUTCString()}`,`Content-Type: ${o.isHtml?'text/html':'text/plain'}; charset="UTF-8"`,'MIME-Version: 1.0'].join('\r\n');return `${h}\r\n\r\n${o.body}`}

serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
 if(req.method!=='POST')return new Response(JSON.stringify({error:'Method not allowed'}),{status:405,headers:{...corsHeaders,'Content-Type':'application/json'}})
 try{
  const body=await req.json(), url=Deno.env.get('SUPABASE_URL')??'', service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'', anon=Deno.env.get('SUPABASE_ANON_KEY')??''
  const admin=createClient(url,service); let authenticated=false
  const auth=req.headers.get('authorization')||''
  if(auth.startsWith('Bearer ')&&anon){const jwt=auth.slice(7);const uc=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${jwt}`}}});const{data}=await uc.auth.getUser(jwt);authenticated=!!data?.user}
  let {to,subject,html,text,attachments,tenant_id,from_email,from_name}=body
  if(!authenticated){
   if(!PUBLIC_KINDS.has(body.kind)||!body.booking_token)return new Response(JSON.stringify({error:'Unauthorized'}),{status:401,headers:{...corsHeaders,'Content-Type':'application/json'}})
   const{data:ev,error:evErr}=await admin.from('calevents').select('booking_token,clientName,eventType,date,time,contact_email,tenant_id,product_id').eq('booking_token',String(body.booking_token)).maybeSingle()
   if(evErr||!ev)return new Response(JSON.stringify({error:'Invalid booking token'}),{status:403,headers:{...corsHeaders,'Content-Type':'application/json'}})
   tenant_id=ev.tenant_id;attachments=[]
   const{data:ts}=await admin.from('settings').select('name,firmname,email,firmemail,smtp_email,tenant_id').eq('tenant_id',tenant_id).maybeSingle()
   const product=String(ev.product_id||'taxres_crm'), pb=PRODUCT_BRANDS[product]
   const brandName=pb?.name||ts?.name||ts?.firmname||'TaxRes CRM', reply=pb?.email||ts?.email||ts?.firmemail||ts?.smtp_email||'romy@taxrescrm.net'
   from_name=brandName;from_email=reply
   const n=esc(ev.clientName||'there'), typ=esc(ev.eventType||'Appointment'), d=String(ev.date), t=String(ev.time).slice(0,5)
   if(body.kind==='booking_confirmation'){
    if(!ev.contact_email)return new Response(JSON.stringify({error:'Booking has no email'}),{status:422,headers:{...corsHeaders,'Content-Type':'application/json'}})
    to=ev.contact_email;subject=`Appointment Confirmed — ${safe(ev.eventType||'Appointment')}, ${whenShort(d,t)}`;html=`<p>Hi <strong>${n}</strong>,</p><p>Your appointment is confirmed:</p><p><strong>${typ}</strong><br>${esc(whenLong(d,t))}</p><p>Need to make a change? Reply to this email and we’ll take care of it.</p><p>Talk soon,<br><strong>${esc(brandName)}</strong></p>`
   }else{
    to=reply;subject=`New booking: ${safe(ev.clientName||'Client')} — ${whenShort(d,t)}`;html=`<p><strong>${n}</strong> just booked online:</p><p><strong>${typ}</strong><br>${esc(whenLong(d,t))}<br>Email: ${esc(ev.contact_email||'—')}</p><p>The appointment is on the CRM calendar.</p>`
   }
  }
  if(!to||!subject||(!html&&!text))return new Response(JSON.stringify({error:'Missing required fields'}),{status:400,headers:{...corsHeaders,'Content-Type':'application/json'}})
  let q=admin.from('settings').select('*');if(tenant_id)q=q.eq('tenant_id',tenant_id);else q=q.limit(1);const{data:ts}=await q.maybeSingle()
  const{data:gs}=await admin.from('settings').select('*').not('gmail_refresh_token','is',null).limit(1).maybeSingle();if(!gs?.gmail_refresh_token)return new Response(JSON.stringify({error:'No Gmail OAuth configured'}),{status:422,headers:{...corsHeaders,'Content-Type':'application/json'}})
  const atts:any[]=[]
  if(authenticated&&Array.isArray(attachments)){const allowedHost=new URL(url).hostname;for(const a of attachments.slice(0,10)){if(!a?.url)continue;try{const u=new URL(a.url);if(u.protocol!=='https:'||u.hostname!==allowedHost){console.warn('[send-email] blocked attachment host',u.hostname);continue}const r=await fetch(u.toString());if(!r.ok)continue;const buf=new Uint8Array(await r.arrayBuffer());if(buf.byteLength>15*1024*1024)continue;let bin='';for(let i=0;i<buf.length;i++)bin+=String.fromCharCode(buf[i]);atts.push({filename:a.filename||'attachment',contentType:r.headers.get('content-type')||'application/octet-stream',b64:btoa(bin)})}catch{}}}
  const fromDisplay=safe(from_name||ts?.name||ts?.firmname||'TaxRes CRM'),fromAddr=safe(from_email||ts?.smtp_email||ts?.email||ts?.firmemail||'romy@taxrescrm.net'),finalBody=html||`${text}${ts?.email_signature?'\n\n'+ts.email_signature:''}`
  let access=await gmailToken(admin,gs);for(const recipient of (Array.isArray(to)?to:[to]).slice(0,25)){const msg=raw({from:gs.email||'info@taxcasereview.org',fromName:fromDisplay,to:recipient,subject,body:finalBody,isHtml:!!html,replyTo:fromAddr,atts});let sr:any,sd:any;for(let a=0;a<4;a++){if(a)await new Promise(r=>setTimeout(r,2**(a-1)*1000));sr=await fetch(SEND_URL,{method:'POST',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({raw:b64url(msg)})});sd=await sr.json();if(sr.ok||(sr.status!==429&&sr.status<500))break}if(!sr.ok)return new Response(JSON.stringify({error:sd?.error?.message||'Gmail send failed',retryable:sr.status===429}),{status:sr.status===429?429:502,headers:{...corsHeaders,'Content-Type':'application/json'}})}
  return new Response(JSON.stringify({success:true,via:'gmail'}),{headers:{...corsHeaders,'Content-Type':'application/json'}})
 }catch(e){console.error('[send-email]',e);return new Response(JSON.stringify({error:e?.message||'Send failed'}),{status:500,headers:{...corsHeaders,'Content-Type':'application/json'}})}
})