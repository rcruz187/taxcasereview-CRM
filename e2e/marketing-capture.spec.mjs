import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const projectRef = 'mpxgxfqdbquzkrvvejkh'
const supabaseHost = `https://${projectRef}.supabase.co`
const user = {
  id: '00000000-0000-4000-8000-000000000111',
  aud: 'authenticated', role: 'authenticated', email: 'qa-ui@taxrescrm.test',
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { name: 'TaxRes Demo Admin' },
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
}
function b64url(obj) { return Buffer.from(JSON.stringify(obj)).toString('base64url') }
const jwt = `${b64url({alg:'none',typ:'JWT'})}.${b64url({sub:user.id,email:user.email,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})}.x`
const rangeFor = n => n > 0 ? `0-${n - 1}/${n}` : '*/0'

async function mockSupabase(page) {
  await page.route('https://api.rss2json.com/**', r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'ok',items:[]})}))
  await page.route('https://api.allorigins.win/**', r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({contents:'<?xml version="1.0"?><rss version="2.0"><channel><title>Taxpayer Advocate</title></channel></rss>',status:{http_code:200}})}))
  await page.routeWebSocket(`wss://${projectRef}.supabase.co/**`, () => {})
  await page.route(`${supabaseHost}/**`, async route => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname; const accept = req.headers()['accept'] || ''
    if (p.startsWith('/auth/v1/token')) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:jwt,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user})})
    if (p === '/auth/v1/user') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(user)})
    if (p.startsWith('/auth/v1/logout')) return route.fulfill({status:204,body:''})
    if (p.includes('/rest/v1/employees')) {
      const x={id:'00000000-0000-4000-8000-000000000222',tenant_id:'61a89aef-0e7e-4ea2-b222-44ab2024655a',email:user.email,name:'TaxRes Demo Admin',role:'Admin',status:'active',access_level:'Admin',perm_leads:3,perm_clients:3,perm_billing:3,perm_schedule:3,perm_documents:3,perm_irs:3,perm_reports:3,perm_hr:3,perm_comms:3,perm_settings:3}
      return route.fulfill({status:200,contentType:'application/json',headers:{'content-range':'0-0/1'},body:JSON.stringify(accept.includes('application/vnd.pgrst.object+json')?x:[x])})
    }
    if (p.includes('/rest/v1/settings')) {
      const x={id:'settings-qa',tenant_id:'61a89aef-0e7e-4ea2-b222-44ab2024655a',firm_name:'TaxRes CRM Demo Office',primary_color:'#1A7FD4',lead_workflow_model:'investigation-resolution'}
      return route.fulfill({status:200,contentType:'application/json',headers:{'content-range':'0-0/1'},body:JSON.stringify(accept.includes('application/vnd.pgrst.object+json')?x:[x])})
    }
    if (p.includes('/rest/v1/tenants')) {
      const x={id:'61a89aef-0e7e-4ea2-b222-44ab2024655a',status:'active',plan_tier:'pro',firm_name:'TaxRes CRM Demo Office'}
      return route.fulfill({status:200,contentType:'application/json',headers:{'content-range':'0-0/1'},body:JSON.stringify(accept.includes('application/vnd.pgrst.object+json')?x:[x])})
    }
    if (p.includes('/rest/v1/emails')) {
      const rows=[{id:'email-1',mailbox_owner:user.email,is_read:false,triage:'Inbox',deleted_at:null,created_at:new Date().toISOString(),subject:'IRS notice follow-up',clientName:'Demo Client',recipient:'demo@example.test',status:'Received'}]
      if(req.method()==='HEAD') return route.fulfill({status:200,headers:{'content-range':rangeFor(1)}})
      return route.fulfill({status:200,contentType:'application/json',headers:{'content-range':'0-0/1'},body:JSON.stringify(rows)})
    }
    const mk=(n,fn)=>Array.from({length:n},(_,i)=>fn(i))
    if (p.includes('/rest/v1/tasks')) { const rows=mk(6,i=>({id:`task-${i}`,done:false,deleted:false,title:['Call IRS ACS','Review 2848','Request transcripts','Client follow-up','State POA','Payment plan review'][i],created_at:new Date().toISOString()})); if(req.method()==='HEAD')return route.fulfill({status:200,headers:{'content-range':rangeFor(6)}}); return route.fulfill({status:200,contentType:'application/json',headers:{'content-range':'0-5/6'},body:JSON.stringify(rows)}) }
    if (p.includes('/rest/v1/leads')) { const rows=mk(4,i=>({id:`lead-${i}`,name:`Demo Lead ${i+1}`,status:'New Lead',created_at:new Date().toISOString()})); if(req.method()==='HEAD')return route.fulfill({status:200,headers:{'content-range':rangeFor(4)}}); return route.fulfill({status:200,contentType:'application/json',headers:{'content-range':'0-3/4'},body:JSON.stringify(rows)}) }
    if (p.includes('/rest/v1/clients')) { const rows=mk(12,i=>({id:`client-${i}`,name:`Demo Client ${i+1}`,created_at:new Date().toISOString()})); if(req.method()==='HEAD')return route.fulfill({status:200,headers:{'content-range':rangeFor(12)}}); return route.fulfill({status:200,contentType:'application/json',headers:{'content-range':'0-11/12'},body:JSON.stringify(rows)}) }
    if (p.includes('/rest/v1/cases')) { const rows=mk(8,i=>({id:`case-${i}`,caseNum:`TR-${1000+i}`,clientName:`Demo Client ${i+1}`,status:'Active',created_at:new Date().toISOString()})); if(req.method()==='HEAD')return route.fulfill({status:200,headers:{'content-range':rangeFor(8)}}); return route.fulfill({status:200,contentType:'application/json',headers:{'content-range':'0-7/8'},body:JSON.stringify(rows)}) }
    if (p.includes('/rest/v1/rpc/')) {
      const rpc=p.split('/').pop(); let body=[]
      if(rpc==='get_branding_by_email_domain') body={firm_name:'TaxRes CRM Demo Office',logo_url:null,sub:'Tax Resolution CRM'}
      else if(rpc==='current_tenant_id') body='61a89aef-0e7e-4ea2-b222-44ab2024655a'
      else if(rpc==='get_sidebar_badge_counts') body={email:1,tasks:6,leads:4,clients:12,cases:8,deadlines:3,calendar:2,esign:2,voicemails:1,fax:1,sms:2,chat:3}
      else if(rpc.includes('tenant')||rpc.includes('branding')) body={tenant_id:'61a89aef-0e7e-4ea2-b222-44ab2024655a'}
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
    }
    if (p.includes('/functions/v1/')) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:[]})})
    if (p.includes('/storage/v1/')) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([])})
    if (p.includes('/rest/v1/')) return route.fulfill({status:200,contentType:'application/json',headers:{'content-range':'*/0'},body:JSON.stringify(accept.includes('application/vnd.pgrst.object+json')?null:[])})
    return route.fulfill({status:200,contentType:'application/json',body:'{}'})
  })
}

async function login(page){
  await page.goto('/')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill('qa-password-not-sent')
  await page.getByRole('button',{name:'Sign In'}).click()
  await expect(page.getByRole('button',{name:/New$/})).toBeVisible({timeout:15000})
}

test('capture current TaxRes marketing screenshots', async ({page})=>{
  fs.mkdirSync('marketing-screenshots',{recursive:true})
  await page.setViewportSize({width:1600,height:1050})
  await mockSupabase(page); await login(page)
  await page.waitForTimeout(1200)
  await page.screenshot({path:'marketing-screenshots/taxres-dashboard-current.png',fullPage:true})

  await page.goto('/irsforms'); await page.waitForTimeout(900)
  await page.screenshot({path:'marketing-screenshots/taxres-irs-workflows-current.png',fullPage:true})

  await page.goto('/esign'); await page.waitForTimeout(900)
  await page.screenshot({path:'marketing-screenshots/taxres-esign-current.png',fullPage:true})
})
