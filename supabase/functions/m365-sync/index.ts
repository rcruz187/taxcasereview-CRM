import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

async function refreshIfNeeded(supabase: any, acct: any, settings: any) {
  if (new Date(acct.m365_token_expiry) > new Date(Date.now() + 5 * 60000)) {
    return acct.m365_access_token
  }
  const res = await fetch(`https://login.microsoftonline.com/${settings.m365_tenant_id || 'common'}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     settings.m365_client_id,
      client_secret: settings.m365_client_secret,
      refresh_token: acct.m365_refresh_token,
      grant_type:    'refresh_token',
    })
  })
  const tokens = await res.json()
  if (tokens.error) throw new Error(tokens.error_description || tokens.error)
  const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  await supabase.from('employee_m365_accounts').update({
    m365_access_token: tokens.access_token,
    m365_refresh_token: tokens.refresh_token || acct.m365_refresh_token,
    m365_token_expiry: expiry,
  }).eq('employee_email', acct.employee_email)
  return tokens.access_token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body = await req.json().catch(() => ({}))
    const { employee_email, tenant_id } = body

    // Get all connected M365 accounts for this tenant (or just one employee)
    let query = supabase.from('employee_m365_accounts')
      .select('*').not('m365_refresh_token', 'is', null)
    if (tenant_id) query = query.eq('tenant_id', tenant_id)
    if (employee_email) query = query.eq('employee_email', employee_email)
    const { data: accounts } = await query

    if (!accounts?.length) return new Response(JSON.stringify({ synced: 0 }), { headers: cors })

    let synced = 0
    for (const acct of accounts) {
      try {
        const { data: settings } = await supabase.from('settings')
          .select('m365_client_id, m365_client_secret, m365_tenant_id')
          .eq('tenant_id', acct.tenant_id).single()
        if (!settings?.m365_client_id) continue

        const token = await refreshIfNeeded(supabase, acct, settings)

        // Sync emails (last 50 unread from inbox)
        if (acct.m365_email_sync) {
          const emailRes = await fetch(
            'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=50&$select=id,subject,from,toRecipients,bodyPreview,receivedDateTime,isRead&$filter=isRead eq false&$orderby=receivedDateTime desc',
            { headers: { Authorization: `Bearer ${token}` } }
          )
          const emailData = await emailRes.json()
          for (const msg of emailData.value || []) {
            const fromEmail = msg.from?.emailAddress?.address
            // Match to a lead/client by email and log as a note
            for (const table of ['leads', 'clients']) {
              const noteTable = table === 'leads' ? 'lead_notes' : 'client_notes'
              const idField = table === 'leads' ? 'lead_id' : 'client_id'
              const { data: match } = await supabase.from(table)
                .select('id').eq('email', fromEmail)
                .eq('tenant_id', acct.tenant_id).maybeSingle()
              if (match) {
                await supabase.from(noteTable).upsert({
                  [idField]: match.id,
                  note: `📧 Email received: **${msg.subject}**\n\n${msg.bodyPreview}`,
                  author: acct.employee_email,
                  created_at: msg.receivedDateTime,
                  source: 'm365',
                  external_id: msg.id,
                }, { onConflict: 'external_id', ignoreDuplicates: true }).catch(() => {})
              }
            }
          }
        }

        // Sync calendar events (next 30 days)
        if (acct.m365_calendar_sync) {
          const now = new Date().toISOString()
          const future = new Date(Date.now() + 30 * 86400000).toISOString()
          const calRes = await fetch(
            `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${now}&endDateTime=${future}&$select=id,subject,start,end,bodyPreview,attendees,onlineMeeting&$top=50&$orderby=start/dateTime`,
            { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' } }
          )
          const calData = await calRes.json()
          for (const ev of calData.value || []) {
            const start = ev.start?.dateTime
            const end   = ev.end?.dateTime
            if (!start) continue
            // Upsert into calevents
            await supabase.from('calevents').upsert({
              tenant_id:    acct.tenant_id,
              title:        ev.subject || 'Meeting',
              date:         start.slice(0, 10),
              time:         start.slice(11, 16),
              end_time:     end?.slice(11, 16),
              assignedTo:   acct.employee_email,
              eventType:    'Meeting',
              source:       'm365',
              external_id:  ev.id,
              notes:        ev.bodyPreview,
              meeting_link: ev.onlineMeeting?.joinUrl || '',
            }, { onConflict: 'external_id', ignoreDuplicates: true }).catch(() => {})
          }
        }

        await supabase.from('employee_m365_accounts').update({
          m365_last_sync_at: new Date().toISOString(),
          m365_last_error: null,
        }).eq('employee_email', acct.employee_email)

        synced++
      } catch (e) {
        await supabase.from('employee_m365_accounts').update({
          m365_last_error: e.message,
        }).eq('employee_email', acct.employee_email)
      }
    }

    return new Response(JSON.stringify({ synced }), { headers: cors })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors })
  }
})
