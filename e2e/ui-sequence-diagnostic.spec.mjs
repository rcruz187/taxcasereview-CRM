import { test, expect } from '@playwright/test'

const projectRef = 'mpxgxfqdbquzkrvvejkh'
const supabaseHost = `https://${projectRef}.supabase.co`
const user = {
  id: '00000000-0000-4000-8000-000000000111',
  aud: 'authenticated', role: 'authenticated', email: 'qa-ui@taxrescrm.test',
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider:'email', providers:['email'] },
  user_metadata: { name:'QA UI Admin' },
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
}
function b64url(obj) { return Buffer.from(JSON.stringify(obj)).toString('base64url') }
const jwt = `${b64url({alg:'none',typ:'JWT'})}.${b64url({sub:user.id,email:user.email,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})}.x`

async function mockSupabase(page) {
  await page.route('https://api.allorigins.win/**', route => route.fulfill({
    status:200, contentType:'application/json',
    body:JSON.stringify({ contents:'<?xml version="1.0"?><rss version="2.0"><channel><title>Taxpayer Advocate</title></channel></rss>', status:{http_code:200} }),
  }))
  await page.route(`${supabaseHost}/**`, async route => {
    const req = route.request(); const url = new URL(req.url()); const pathname = url.pathname
    const accept = req.headers()['accept'] || ''
    if (pathname.startsWith('/auth/v1/token')) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:jwt,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'mock',user})})
    if (pathname === '/auth/v1/user') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(user)})
    if (pathname.startsWith('/auth/v1/logout')) return route.fulfill({status:204,body:''})
    if (pathname.includes('/rest/v1/employees')) {
      const employee={id:'00000000-0000-4000-8000-000000000222',tenant_id:'61a89aef-0e7e-4ea2-b222-44ab2024655a',email:user.email,name:'QA UI Admin',role:'Admin',status:'active',access_level:'Admin',perm_leads:3,perm_clients:3,perm_billing:3,perm_schedule:3,perm_documents:3,perm_irs:3,perm_reports:3,perm_hr:3,perm_comms:3,perm_settings:3}
      const wantsObject=accept.includes('application/vnd.pgrst.object+json')
      return route.fulfill({status:200,contentType:'application/json',headers:{'content-range':'0-0/1'},body:JSON.stringify(wantsObject?employee:[employee])})
    }
    if (pathname.includes('/rest/v1/settings')) {
      const settings={id:'settings-qa',tenant_id:'61a89aef-0e7e-4ea2-b222-44ab2024655a',firm_name:'Tax Case Review',primary_color:'#1A7FD4',lead_workflow_model:'investigation-resolution'}
      const wantsObject=accept.includes('application/vnd.pgrst.object+json')
      return route.fulfill({status:200,contentType:'application/json',headers:{'content-range':'0-0/1'},body:JSON.stringify(wantsObject?settings:[settings])})
    }
    if (pathname.includes('/rest/v1/tenants')) {
      const tenant={id:'61a89aef-0e7e-4ea2-b222-44ab2024655a',status:'active',plan_tier:'pro',firm_name:'Tax Case Review'}
      const wantsObject=accept.includes('application/vnd.pgrst.object+json')
      return route.fulfill({status:200,contentType:'application/json',headers:{'content-range':'0-0/1'},body:JSON.stringify(wantsObject?tenant:[tenant])})
    }
    if (pathname.includes('/rest/v1/rpc/')) {
      const rpc=pathname.split('/').pop(); let body=[]
      if (rpc==='get_branding_by_email_domain') body={firm_name:'Tax Case Review',logo_url:null,sub:'IRS Resolution Platform'}
      else if (rpc==='current_tenant_id') body='61a89aef-0e7e-4ea2-b222-44ab2024655a'
      else if (rpc.includes('tenant')||rpc.includes('branding')) body={tenant_id:'61a89aef-0e7e-4ea2-b222-44ab2024655a'}
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
    }
    if (pathname.includes('/functions/v1/')) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:[]})})
    if (pathname.includes('/storage/v1/')) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([])})
    if (pathname.includes('/rest/v1/')) {
      const wantsObject=accept.includes('application/vnd.pgrst.object+json')
      return route.fulfill({status:200,contentType:'application/json',headers:{'content-range':'*/0'},body:JSON.stringify(wantsObject?null:[])})
    }
    return route.fulfill({status:200,contentType:'application/json',body:'{}'})
  })
}

async function login(page) {
  await page.goto('/')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill('qa-password-not-sent')
  await page.getByRole('button',{name:'Sign In'}).click()
  await expect(page.getByRole('button',{name:/New$/})).toBeVisible({timeout:15000})
}

test('diagnose communications sequence crash', async ({page}) => {
  const errors=[]
  page.on('pageerror', err => errors.push({url:page.url(), message:err.message, stack:err.stack||''}))
  await mockSupabase(page)
  await login(page)
  const header=page.getByText('Communications',{exact:true}); await expect(header).toBeVisible(); await header.click()
  const steps=[['SMS','/sms'],['Fax','/fax'],['Documents','/documents'],['E-Signatures','/esign'],['SMS','/sms'],['Documents','/documents'],['Fax','/fax'],['E-Signatures','/esign']]
  for (const [label,target] of steps) {
    const before=errors.length
    const link=page.getByRole('link',{name:label,exact:true}); await expect(link).toBeVisible(); await link.click()
    await expect(page).toHaveURL(new RegExp(`${target}$`)); await page.waitForTimeout(250)
    if (errors.length>before) throw new Error(`After ${label} ${target}: ${JSON.stringify(errors.slice(before),null,2)}`)
  }
})
