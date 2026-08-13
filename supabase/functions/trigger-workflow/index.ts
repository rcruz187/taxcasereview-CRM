// trigger-workflow
// Called from SignPage (anonymous) after an e-sign is completed.
// Runs with service role so it can read workflow_templates + insert tasks
// without being blocked by RLS on the anon role.
// JWT verification OFF — called from an anonymous page.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { event, entity_type, entity_name, tenant_id, doc_type } = await req.json()

    if (!event || !entity_name || !tenant_id) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Find matching active templates for this tenant + event
    const { data: templates, error: tmplErr } = await supabase
      .from('workflow_templates')
      .select('id, name, trigger_event, trigger_value, entity_type')
      .eq('tenant_id', tenant_id)
      .eq('active', true)
      .eq('trigger_event', event)

    if (tmplErr || !templates?.length) {
      console.log(`[trigger-workflow] no templates for event="${event}" tenant="${tenant_id}"`)
      return new Response(JSON.stringify({ ok: true, tasks_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Filter by entity_type (support 'both') and trigger_value for esign events
    const matching = templates.filter(t => {
      const typeOk = t.entity_type === entity_type || t.entity_type === 'both'
      const valueOk = event === 'esign_signed'
        ? (!t.trigger_value || t.trigger_value === doc_type)
        : true
      return typeOk && valueOk
    })

    if (!matching.length) {
      return new Response(JSON.stringify({ ok: true, tasks_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch steps
    const ids = matching.map(t => t.id)
    const { data: steps, error: stepsErr } = await supabase
      .from('workflow_steps')
      .select('*')
      .in('template_id', ids)
      .order('step_order')

    if (stepsErr || !steps?.length) {
      return new Response(JSON.stringify({ ok: true, tasks_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Look up advisor from clients table, then leads
    let advisorName: string | null = null
    const { data: cRows } = await supabase
      .from('clients').select('assignedTo').eq('name', entity_name)
      .eq('tenant_id', tenant_id).limit(1)
    advisorName = cRows?.[0]?.assignedTo || null

    if (!advisorName) {
      const { data: lRows } = await supabase
        .from('leads').select('assignedTo').eq('name', entity_name)
        .eq('tenant_id', tenant_id).limit(1)
      advisorName = lRows?.[0]?.assignedTo || null
    }

    // Look up associate
    let associateName: string | null = null
    if (steps.some((s: any) => s.assigned_role === 'ASSOCIATE')) {
      const { data: cRows2 } = await supabase
        .from('clients').select('taxAssociate').eq('name', entity_name)
        .eq('tenant_id', tenant_id).limit(1)
      associateName = cRows2?.[0]?.taxAssociate || null

      if (!associateName) {
        const { data: lRows2 } = await supabase
          .from('leads').select('taxAssociate').eq('name', entity_name)
          .eq('tenant_id', tenant_id).limit(1)
        associateName = lRows2?.[0]?.taxAssociate || null
      }

      if (!associateName) {
        const { data: rr } = await supabase.rpc('get_next_tax_associate')
        associateName = rr || advisorName
      }
    }

    // Build and insert tasks
    const now = new Date()
    const tasks = steps.map((s: any, idx: number) => {
      const due = new Date(now)
      due.setDate(due.getDate() + (s.due_in_days || 1))
      const createdAt = new Date(now.getTime() + idx * 1000)
      const assignee = s.assigned_role === 'ADVISOR' ? advisorName
                     : s.assigned_role === 'ASSOCIATE' ? associateName
                     : advisorName
      return {
        title: s.title,
        clientName: entity_name,
        assignedTo: assignee,
        priority: 'Normal',
        dueDate: due.toISOString().slice(0, 10),
        done: false,
        notes: s.notes || '',
        section_title: s.section_title || null,
        created_at: createdAt.toISOString(),
        tenant_id,
      }
    })

    const { error: insertErr } = await supabase.from('tasks').insert(tasks)
    if (insertErr) {
      console.error('[trigger-workflow] insert error:', insertErr.message)
      return new Response(JSON.stringify({ ok: false, error: insertErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[trigger-workflow] "${event}" → ${tasks.length} tasks for "${entity_name}" (tenant ${tenant_id})`)
    return new Response(JSON.stringify({ ok: true, tasks_created: tasks.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    console.error('[trigger-workflow] unexpected:', e?.message || String(e))
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
