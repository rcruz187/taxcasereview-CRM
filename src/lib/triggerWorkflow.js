// ── Workflow Trigger Engine ───────────────────────────────────────────────────
// Checks active workflow templates for a matching trigger event and auto-creates
// tasks. Called from Leads.jsx, Clients.jsx, and Cases.jsx at trigger points.
// Never touches existing hardcoded triggers — runs alongside them.

import { supabase } from './supabase'

/**
 * Fire a workflow trigger.
 * @param {string} event      - Trigger event key e.g. 'lead_status_changed'
 * @param {string} entityType - 'lead' | 'client' | 'case'
 * @param {string} entityName - The lead/client/case name (for task clientName)
 * @param {string} actorName  - The employee who triggered this (for assignedTo)
 * @param {string} [value]    - Optional status value for status_changed events
 */
export async function triggerWorkflow(event, entityType, entityName, actorName, value = null) {
  try {
    // Fetch matching active templates
    let query = supabase
      .from('workflow_templates')
      .select('id, name, trigger_event, trigger_value')
      .eq('active', true)
      .in('entity_type', [entityType, 'both'])
      .eq('trigger_event', event)

    const { data: templates, error: tmplErr } = await query
    if (tmplErr || !templates?.length) return

    // Filter by trigger_value if event requires it
    const STATUS_CHANGE_EVENTS = [
      'lead_status_changed', 'case_status_changed', 'client_status_changed'
    ]
    const matching = templates.filter(t => {
      if (STATUS_CHANGE_EVENTS.includes(event)) {
        return !t.trigger_value || t.trigger_value === value
      }
      return true
    })

    if (!matching.length) return

    // Fetch steps for matching templates
    const ids = matching.map(t => t.id)
    const { data: steps, error: stepsErr } = await supabase
      .from('workflow_steps')
      .select('*')
      .in('template_id', ids)
      .order('step_order')

    if (stepsErr || !steps?.length) return

    // Honour assigned_role exactly as applyWorkTemplate does. This used to dump
    // every task on actorName — which, when the trigger is a CLIENT signing an
    // e-sign package, is not an employee at all, so the whole investigation
    // landed on nobody's queue.
    // ADVISOR  → whoever the lead/client is permanently assigned to.
    // ASSOCIATE→ one round-robin associate for this whole firing, not a fresh
    //            pick per step, so the package stays with one person.
    let advisorName = null
    if (entityType === 'client' || entityType === 'case') {
      const { data: cRows } = await supabase.from('clients').select('assignedTo').eq('name', entityName).limit(1)
      advisorName = cRows?.[0]?.assignedTo || null
    }
    if (!advisorName) {
      const { data: lRows } = await supabase.from('leads').select('assignedTo').eq('name', entityName).limit(1)
      advisorName = lRows?.[0]?.assignedTo || null
    }
    advisorName = advisorName || actorName

    // An associate named on the record wins; round-robin is only the fallback
    // for records that haven't been assigned one.
    let associateName = null
    if (steps.some(s => s.assigned_role === 'ASSOCIATE')) {
      let named = null
      if (entityType === 'client' || entityType === 'case') {
        const { data: cRows } = await supabase.from('clients').select('taxAssociate').eq('name', entityName).limit(1)
        named = cRows?.[0]?.taxAssociate || null
      }
      if (!named) {
        const { data: lRows } = await supabase.from('leads').select('taxAssociate').eq('name', entityName).limit(1)
        named = lRows?.[0]?.taxAssociate || null
      }
      if (named) {
        associateName = named
      } else {
        const { data: rr } = await supabase.rpc('get_next_tax_associate')
        associateName = rr || advisorName
      }
    }

    // Build task inserts
    const now = new Date()
    const tasks = steps.map((s, idx) => {
      const due = new Date(now)
      due.setDate(due.getDate() + (s.due_in_days || 1))
      // Task lists sort by due date then created_at ASCENDING, so space the
      // steps forward a second each. Templates where every step shares the same
      // due_in_days (the Business IRS one) rely on this entirely for order.
      const createdAt = new Date(now.getTime() + idx * 1000)
      const assignee = s.assigned_role === 'ADVISOR' ? advisorName
                      : s.assigned_role === 'ASSOCIATE' ? associateName
                      : advisorName
      return {
        title: s.title,
        clientName: entityName,
        assignedTo: assignee,
        priority: 'Normal',
        dueDate: due.toISOString().slice(0, 10),
        done: false,
        notes: s.notes || '',
        section_title: s.section_title || null,
        created_at: createdAt.toISOString(),
      }
    })

    if (tasks.length) {
      await supabase.from('tasks').insert(tasks)
      console.log(`[workflow] fired "${event}" → created ${tasks.length} task(s) for ${entityName}`)
    }
  } catch (err) {
    console.error('[workflow] error:', err)
  }
}

/**
 * Manually apply one or more workflow templates right now, regardless of
 * their trigger_event — this powers the browsable "Work Template" catalog.
 * Accepts a single templateId or an array — when multiple are given (e.g.
 * applying both the IRS and State modules to the same case), their steps
 * are merged into one task batch: one shared advisor and one shared
 * round-robin associate across ALL of them (not a fresh pick per
 * template), so the client has one consistent point of contact even
 * when both modules apply. Steps stay grouped by template and keep their
 * own step_order within that group; templates apply in the order their
 * IDs were passed in.
 * @param {string|string[]} templateIds - workflow_templates.id (or array)
 * @param {string} entityName - the client/lead name (for task clientName)
 * @param {string} actorName  - the employee applying the template (assignedTo default)
 * @param {string} [entityKind] - 'lead' | 'client' — which page this was applied
 *                                from, so ADVISOR steps look up the right table.
 *                                Defaults to 'lead' (original behavior).
 */
export async function applyWorkflowTemplate(templateIds, entityName, actorName, entityKind = 'lead') {
  const ids = Array.isArray(templateIds) ? templateIds : [templateIds]

  const { data: allSteps, error: stepsErr } = await supabase
    .from('workflow_steps')
    .select('*')
    .in('template_id', ids)
    .order('step_order')

  if (stepsErr || !allSteps?.length) return { error: stepsErr?.message || 'This template has no steps defined.' }

  // Preserve selection order across templates, step_order within each
  const steps = allSteps.slice().sort((a, b) => {
    const ai = ids.indexOf(a.template_id), bi = ids.indexOf(b.template_id)
    return ai !== bi ? ai - bi : a.step_order - b.step_order
  })

  // 'ADVISOR' steps go to whoever the entity is permanently assigned to.
  // Applied from the Clients page (entityKind='client'): check the client's
  // own assignedTo first — converted clients live in `clients`, not `leads` —
  // then fall back to a matching lead row (the original pitching advisor).
  // Applied from the Leads page: check the lead row only (original behavior).
  // Final fallback in both cases: the acting user.
  // 'ASSOCIATE' steps all go to the SAME round-robin-picked associate for
  // this whole application (all templates included), not a fresh pick per
  // step or per template.
  // Note: .limit(1) instead of .maybeSingle() so a duplicate-name row can
  // never turn the lookup into a hard error — we just take the first match.
  let advisorName = null
  if (entityKind === 'client') {
    const { data: cRows } = await supabase.from('clients').select('assignedTo').eq('name', entityName).limit(1)
    advisorName = cRows?.[0]?.assignedTo || null
  }
  if (!advisorName) {
    const { data: lRows } = await supabase.from('leads').select('assignedTo').eq('name', entityName).limit(1)
    advisorName = lRows?.[0]?.assignedTo || null
  }
  advisorName = advisorName || actorName

  let associateName = null
  if (steps.some(s => s.assigned_role === 'ASSOCIATE')) {
    // Named associate on the record wins over the round-robin pick.
    let named = null
    if (entityKind === 'client') {
      const { data: cRows } = await supabase.from('clients').select('taxAssociate').eq('name', entityName).limit(1)
      named = cRows?.[0]?.taxAssociate || null
    }
    if (!named) {
      const { data: lRows } = await supabase.from('leads').select('taxAssociate').eq('name', entityName).limit(1)
      named = lRows?.[0]?.taxAssociate || null
    }
    if (named) associateName = named
    else {
      const { data: rr } = await supabase.rpc('get_next_tax_associate')
      associateName = rr || actorName
    }
  }

  const now = new Date()
  const tasks = steps.map((s, idx) => {
    const due = new Date(now)
    due.setDate(due.getDate() + (s.due_in_days || 1))
    // Tasks lists sort by created_at descending (newest first). Giving every
    // step the exact same timestamp made their relative order undefined —
    // spacing them 1 second apart (first step = latest timestamp) makes the
    // intended step_order survive that sort correctly.
    const createdAt = new Date(now.getTime() + idx * 1000)
    const assignee = s.assigned_role === 'ADVISOR' ? advisorName
                    : s.assigned_role === 'ASSOCIATE' ? associateName
                    : actorName
    return {
      title: s.title,
      clientName: entityName,
      assignedTo: assignee,
      priority: 'Normal',
      dueDate: due.toISOString().slice(0, 10),
      done: false,
      notes: s.notes || '',
      section_title: s.section_title || null,
      created_at: createdAt.toISOString(),
    }
  })

  const { error } = await supabase.from('tasks').insert(tasks)
  if (error) return { error: error.message }
  return { count: tasks.length }
}
