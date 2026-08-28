import { test, expect } from '@playwright/test'

const projectRef = 'mpxgxfqdbquzkrvvejkh'
const supabaseHost = `https://${projectRef}.supabase.co`
const user = {
  id: '00000000-0000-4000-8000-000000000111',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'qa-ui@taxrescrm.test',
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { name: 'QA UI Admin' },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url')
}
const jwt = `${b64url({alg:'none',typ:'JWT'})}.${b64url({sub:user.id,email:user.email,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})}.x`

async function mockSupabase(page) {
  await page.route(`${supabaseHost}/**`, async route => {
    const req = route.request()
    const url = new URL(req.url())
    const pathname = url.pathname
    const accept = req.headers()['accept'] || ''

    if (pathname.startsWith('/auth/v1/token')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        access_token: jwt, token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now()/1000)+3600,
        refresh_token: 'qa-refresh-token', user,
      }) })
    }
    if (pathname === '/auth/v1/user') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
    }
    if (pathname.startsWith('/auth/v1/logout')) {
      return route.fulfill({ status: 204, body: '' })
    }

    if (pathname.includes('/rest/v1/employees')) {
      const employee = {
        id: '00000000-0000-4000-8000-000000000222', tenant_id: '61a89aef-0e7e-4ea2-b222-44ab2024655a',
        email: user.email, name: 'QA UI Admin', role: 'Admin', status: 'active', access_level: 'Admin',
        perm_leads:3, perm_clients:3, perm_billing:3, perm_schedule:3, perm_documents:3,
        perm_irs:3, perm_reports:3, perm_hr:3, perm_comms:3, perm_settings:3,
      }
      const wantsObject = accept.includes('application/vnd.pgrst.object+json')
      return route.fulfill({ status: 200, contentType: 'application/json', headers:{'content-range':'0-0/1'}, body: JSON.stringify(wantsObject ? employee : [employee]) })
    }
    if (pathname.includes('/rest/v1/settings')) {
      const settings = { id:'settings-qa', tenant_id:'61a89aef-0e7e-4ea2-b222-44ab2024655a', firm_name:'Tax Case Review', primary_color:'#1A7FD4', lead_workflow_model:'investigation-resolution' }
      const wantsObject = accept.includes('application/vnd.pgrst.object+json')
      return route.fulfill({ status: 200, contentType:'application/json', headers:{'content-range':'0-0/1'}, body: JSON.stringify(wantsObject ? settings : [settings]) })
    }
    if (pathname.includes('/rest/v1/tenants')) {
      const tenant = { id:'61a89aef-0e7e-4ea2-b222-44ab2024655a', status:'active', plan_tier:'pro', firm_name:'Tax Case Review' }
      const wantsObject = accept.includes('application/vnd.pgrst.object+json')
      return route.fulfill({ status:200, contentType:'application/json', headers:{'content-range':'0-0/1'}, body:JSON.stringify(wantsObject ? tenant : [tenant]) })
    }
    if (pathname.includes('/rest/v1/rpc/')) {
      const rpc = pathname.split('/').pop()
      let body = []
      if (rpc === 'get_branding_by_email_domain') body = { firm_name:'Tax Case Review', logo_url:null, sub:'IRS Resolution Platform' }
      else if (rpc === 'current_tenant_id') body = '61a89aef-0e7e-4ea2-b222-44ab2024655a'
      else if (rpc.includes('tenant') || rpc.includes('branding')) body = { tenant_id:'61a89aef-0e7e-4ea2-b222-44ab2024655a' }
      return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(body) })
    }
    if (pathname.includes('/functions/v1/')) {
      return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ ok:true, data:[] }) })
    }
    if (pathname.includes('/storage/v1/')) {
      return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify([]) })
    }
    if (pathname.includes('/rest/v1/')) {
      const wantsObject = accept.includes('application/vnd.pgrst.object+json')
      return route.fulfill({ status:200, contentType:'application/json', headers:{'content-range':'*/0'}, body:JSON.stringify(wantsObject ? null : []) })
    }
    return route.fulfill({ status:200, contentType:'application/json', body:'{}' })
  })
}

async function login(page) {
  await page.goto('/')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill('qa-password-not-sent')
  await page.getByRole('button', {name:'Sign In'}).click()
  await expect(page.getByRole('button', {name:/New$/})).toBeVisible({timeout:15000})
}

const flows = [
  ['New Case', '/cases?new=1'],
  ['New Client', '/clients?new=1'],
  ['New Corp', '/formacorp?new=1'],
  ['New Document', '/documents?new=1'],
  ['New E-Sign', '/esign?new=1'],
  ['New Email', '/email?new=1'],
  ['New Entry', '/books?new=1'],
  ['New Event', '/calendar?new=1'],
  ['New Fax', '/fax?new=1'],
  ['New Invoice', '/invoices?new=1'],
  ['New Lead', '/leads?new=1'],
  ['New Payment', '/payments?new=1'],
  ['New Task', '/tasks?new=1'],
  ['New Transcript', '/irsportal?new=1'],
]

test('authenticated shell and all global New actions render and navigate', async ({ page }) => {
  const consoleErrors = []
  const pageErrors = []
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  page.on('pageerror', err => pageErrors.push(err.message))
  await mockSupabase(page)
  await login(page)

  for (const [label, target] of flows) {
    await page.goto('/')
    await expect(page.getByRole('button', {name:/New$/})).toBeVisible()
    await page.getByRole('button', {name:/New$/}).click()
    const dialog = page.getByRole('dialog', {name:'Create New'})
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('What would you like to add?')).toBeVisible()
    await dialog.getByRole('button', {name:new RegExp(`^${label}`)}).click()
    await expect(page).toHaveURL(new RegExp(target.replace(/[?]/g,'\\?') + '$'))
    await expect(page.locator('body')).not.toContainText('This page encountered an error')
    await expect(page.locator('.page-content')).toBeVisible()
    const box = await page.locator('.page-content').boundingBox()
    expect(box?.width || 0).toBeGreaterThan(200)
    expect(box?.height || 0).toBeGreaterThan(200)
  }

  expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toEqual([])
  const fatalConsole = consoleErrors.filter(x => !/favicon|ResizeObserver|Failed to load resource/i.test(x))
  expect(fatalConsole, `console errors: ${fatalConsole.join(' | ')}`).toEqual([])
})
