from pathlib import Path

# Backend: tenant-scope Gmail OAuth credentials and truthful sync result.
p = Path('supabase/functions/gmail-sync-cron/index.ts')
s = p.read_text()

old_catch = """  } catch (e) {
    console.error('gmail-sync-cron error for', acct.employee_email, e)
    await supabase.from('employee_gmail_accounts').update({ gmail_last_error: String((e as Error).message || e) }).eq('employee_email', acct.employee_email)
  }
}
"""
new_catch = """    return { ok: true }
  } catch (e) {
    console.error('gmail-sync-cron error for', acct.employee_email, e)
    await supabase.from('employee_gmail_accounts').update({ gmail_last_error: String((e as Error).message || e) }).eq('employee_email', acct.employee_email)
    return { ok: false, error: String((e as Error).message || e) }
  }
}
"""
if old_catch not in s:
    raise SystemExit('syncOneAccount catch block not found')
s = s.replace(old_catch, new_catch, 1)

start = s.index("    const { data: settings } = await supabase.from('settings')")
end_marker = "    return new Response(JSON.stringify({ ok: true, synced: accounts.length }), { status: 200, headers: corsHeaders })"
end = s.index(end_marker, start) + len(end_marker)
new_main = """    // OAuth refresh tokens are bound to the OAuth client that issued them.
    // Resolve credentials by the employee's tenant instead of using an arbitrary settings row.
    const { data: settingsRows } = await supabase.from('settings')
      .select('tenant_id, gmail_client_id, gmail_client_secret')
      .not('gmail_client_id', 'is', null)

    const settingsByTenant = new Map((settingsRows || [])
      .filter((r: any) => r.tenant_id && r.gmail_client_id && r.gmail_client_secret)
      .map((r: any) => [r.tenant_id, r]))

    const { data: accounts } = await supabase.from('employee_gmail_accounts')
      .select('employee_email, gmail_refresh_token, gmail_access_token, gmail_token_expiry, gmail_backfill_phase, gmail_backfill_page_token, gmail_last_cleanup_at')
      .not('gmail_refresh_token', 'is', null)

    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: 'No employees have connected Gmail yet', synced: 0, failed: 0 }), { status: 200, headers: corsHeaders })
    }

    const employeeEmails = accounts.map((a: any) => a.employee_email).filter(Boolean)
    const { data: employeeRows } = await supabase.from('employees').select('email,tenant_id').in('email', employeeEmails)
    const tenantByEmail = new Map((employeeRows || []).map((r: any) => [String(r.email || '').toLowerCase(), r.tenant_id]))

    const { data: clients } = await supabase.from('clients').select('id,name,email')
    const { data: leads } = await supabase.from('leads').select('id,name,email')

    let synced = 0
    let failed = 0
    const errors: any[] = []

    for (const acct of accounts) {
      const tenantId = tenantByEmail.get(String(acct.employee_email || '').toLowerCase())
      const appCreds = tenantId ? settingsByTenant.get(tenantId) : null
      if (!tenantId || !appCreds) {
        const message = !tenantId ? 'Employee tenant not found' : 'Gmail OAuth credentials not configured for employee tenant'
        failed++
        errors.push({ employee_email: acct.employee_email, error: message })
        await supabase.from('employee_gmail_accounts').update({ gmail_last_error: message }).eq('employee_email', acct.employee_email)
        continue
      }

      const result = await syncOneAccount(supabase, acct, appCreds, tenantId, clients || [], leads || [])
      if (result?.ok) synced++
      else {
        failed++
        errors.push({ employee_email: acct.employee_email, error: result?.error || 'Unknown sync error' })
      }
    }

    return new Response(JSON.stringify({ ok: failed === 0, synced, failed, errors }), { status: failed === 0 ? 200 : 207, headers: corsHeaders })"""
s = s[:start] + new_main + s[end:]
p.write_text(s)

# Frontend: make manual refresh obvious and actually reload after sync.
p = Path('src/pages/Email.jsx')
s = p.read_text()
old = """              <span onClick={syncNow} style={{ cursor: 'pointer', textDecoration: 'underline' }}>Sync now</span>
"""
new = """              <button
                className=\"btn\"
                disabled={syncing}
                onClick={async () => {
                  await syncNow()
                  await load()
                  showToast(lastError ? 'Email sync error: ' + lastError : '✅ Email refreshed')
                }}
                style={{ padding:'4px 8px', fontSize:10, fontWeight:700, whiteSpace:'nowrap' }}
              >
                {syncing ? '⟳ Refreshing…' : '↻ Refresh Email'}
              </button>
"""
if old not in s:
    raise SystemExit('Sync now link not found')
s = s.replace(old, new, 1)
p.write_text(s)
