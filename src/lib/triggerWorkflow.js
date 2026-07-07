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
      .eq('entity_type', entityType)
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

    // Build task inserts
    const now = new Date()
    const tasks = steps.map(s => {
      const due = new Date(now)
      due.setDate(due.getDate() + (s.due_in_days || 1))
      return {
        title: s.title,
        clientName: entityName,
        assignedTo: actorName, // assign to actor by default; role-based assignment future enhancement
        priority: 'Normal',
        dueDate: due.toISOString().slice(0, 10),
        done: false,
        notes: s.notes || '',
        section_title: s.section_title || null,
        created_at: now.toISOString(),
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
 * Manually apply a single workflow template right now, regardless of its
 * trigger_event — this powers the browsable "Work Template" catalog (pick a
 * template, its steps become tasks immediately) as opposed to the automatic
 * trigger-based instantiation above.
 * @param {string} templateId - workflow_templates.id
 * @param {string} entityName - the client/lead name (for task clientName)
 * @param {string} actorName  - the employee applying the template (assignedTo default)
 */
export async function applyWorkflowTemplate(templateId, entityName, actorName) {
  const { data: steps, error: stepsErr } = await supabase
    .from('workflow_steps')
    .select('*')
    .eq('template_id', templateId)
    .order('step_order')

  if (stepsErr || !steps?.length) return { error: stepsErr?.message || 'This template has no steps defined.' }

  const now = new Date()
  const tasks = steps.map(s => {
    const due = new Date(now)
    due.setDate(due.getDate() + (s.due_in_days || 1))
    return {
      title: s.title,
      clientName: entityName,
      assignedTo: actorName,
      priority: 'Normal',
      dueDate: due.toISOString().slice(0, 10),
      done: false,
      notes: s.notes || '',
      section_title: s.section_title || null,
      created_at: now.toISOString(),
    }
  })

  const { error } = await supabase.from('tasks').insert(tasks)
  if (error) return { error: error.message }
  return { count: tasks.length }
}
