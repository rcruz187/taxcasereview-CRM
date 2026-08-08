import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Gather platform stats
    const [tenantsRes, calRes] = await Promise.all([
      supabase.rpc('admin_tenant_overview'),
      supabase.from('calevents')
        .select('title, date, time, eventType')
        .eq('tenant_id', 'a0000000-0000-0000-0000-000000000001')
        .gte('date', new Date().toISOString().slice(0,10))
        .lte('date', new Date(Date.now() + 7*86400000).toISOString().slice(0,10))
        .order('date', { ascending: true })
        .limit(5),
    ])

    const tenants = tenantsRes.data || []
    const activeTenants = tenants.filter((t: any) => t.status === 'active')
    const totalMRR = tenants.reduce((s: number, r: any) => s + Number(r.effective_monthly || 0), 0)
    const totalClients = tenants.reduce((s: number, r: any) => s + Number(r.client_count || 0), 0)
    const totalLeads = tenants.reduce((s: number, r: any) => s + Number(r.lead_count || 0), 0)
    const upcoming = calRes.data || []

    const today = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric', timeZone:'America/New_York' })

    const calHtml = upcoming.length > 0
      ? upcoming.map((e: any) => `<tr><td style="padding:6px 12px;color:#94a3b8;font-size:12px;">${e.date}</td><td style="padding:6px 12px;color:#e2e8f0;font-size:13px;">${e.title}</td><td style="padding:6px 12px;color:#6366f1;font-size:12px;">${e.time || ''}</td></tr>`).join('')
      : '<tr><td colspan="3" style="padding:12px;color:#475569;font-size:13px;">No upcoming events</td></tr>'

    const html = `<!DOCTYPE html><html><body style="background:#0d0c1a;font-family:system-ui,Arial,sans-serif;margin:0;padding:32px;">
<div style="max-width:600px;margin:0 auto;">
  <img src="https://taxresolutioncrm.github.io/taxcasereview-CRM/assets/taxrescrm-logo.png" style="height:36px;margin-bottom:24px;" />
  <h1 style="color:#fff;font-size:22px;font-weight:800;margin-bottom:4px;">Good morning, Romy 👋</h1>
  <p style="color:#475569;font-size:13px;margin-bottom:28px;">${today}</p>
  
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px;">
    ${[
      ['Active Offices', activeTenants.length, '#10b981'],
      ['Platform MRR', '$'+totalMRR.toLocaleString(), '#6366f1'],
      ['Total Clients', totalClients, '#0ea5e9'],
      ['Total Leads', totalLeads, '#f59e0b'],
    ].map(([label, val, color]) => `<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:16px;">
      <div style="font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">${label}</div>
      <div style="font-size:22px;font-weight:900;color:${color};">${val}</div>
    </div>`).join('')}
  </div>

  <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:20px;margin-bottom:24px;">
    <div style="font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px;">Upcoming Calendar</div>
    <table style="width:100%;border-collapse:collapse;">${calHtml}</table>
  </div>

  <p style="color:#334155;font-size:11px;text-align:center;">TaxRes CRM Platform · romy@taxrescrm.net</p>
</div></body></html>`

    // Send via Stalwart SMTP
    const settings = await supabase.from('settings')
      .select('smtp_host,smtp_port,smtp_user,smtp_pass,email')
      .eq('tenant_id', 'a0000000-0000-0000-0000-000000000001')
      .maybeSingle()

    // Use send-email edge function
    const sendRes = await supabase.functions.invoke('send-email', {
      body: {
        to: 'romy@taxrescrm.net',
        subject: `TaxRes CRM Daily Brief — ${today}`,
        html,
        tenant_id: 'a0000000-0000-0000-0000-000000000001',
      }
    })

    return new Response(JSON.stringify({ ok: true, sent: !sendRes.error }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch(err) {
    console.error('daily-briefing error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
