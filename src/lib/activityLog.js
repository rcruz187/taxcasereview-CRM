// ── Activity Logger ───────────────────────────────────────────────────────────
// Single utility called from anywhere in the CRM to log employee actions.
// Never throws — always fire-and-forget so it never blocks the UI.

import { supabase } from './supabase'

const ICONS = {
  lead:     '👥',
  client:   '👤',
  call:     '📞',
  email:    '📧',
  sms:      '💬',
  fax:      '📠',
  payment:  '💳',
  esign:    '✍️',
  document: '📁',
  session:  '🔐',
  case:     '📋',
  task:     '✅',
  note:     '📝',
  invoice:  '🧾',
}

/**
 * Log an employee action to the activity_log table.
 * @param {object} supabaseClient - The supabase client instance
 * @param {object} params
 * @param {string} params.employeeName   - Name of the employee doing the action
 * @param {string} params.employeeEmail  - Email of the employee
 * @param {string} params.action         - Action key e.g. 'lead_created'
 * @param {string} params.category       - Category: lead|client|call|email|payment|esign|document|session|case|task|note|invoice
 * @param {string} params.description    - Human-readable description
 * @param {string} [params.entityName]   - Name of the lead/client involved
 * @param {string} [params.entityId]     - UUID of the entity
 * @param {object} [params.meta]         - Extra metadata
 */
export async function logActivity(supabaseClient, {
  employeeName, employeeEmail, action, category, description, entityName, entityId, meta = {}
}) {
  if (!employeeName || !action) return
  try {
    await supabaseClient.from('activity_log').insert([{
      employee_name:  employeeName,
      employee_email: employeeEmail || null,
      action,
      category,
      description,
      entity_name: entityName || null,
      entity_id:   entityId   || null,
      meta,
    }])
  } catch(e) {
    // Never block the UI for logging failures
    console.warn('[activityLog] failed to log:', e?.message)
  }
}

export { ICONS }

/**
 * Helper to get actor info from the auth user object
 */
export function getActor(user) {
  return {
    name:  user?.user_metadata?.name || user?.email?.split('@')[0] || 'Staff',
    email: user?.email || null,
  }
}
