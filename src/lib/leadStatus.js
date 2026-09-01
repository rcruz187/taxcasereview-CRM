// ─────────────────────────────────────────────────────────────────────────────
// Lead Pipeline Model Definitions
//
// The production model is investigation-resolution. A direct-resolution key is
// reserved for a future Nashville-specific business contract, but it is not an
// active production pipeline until an exact stage sequence is formally defined.
// Existing tenants therefore resolve to investigation-resolution.
// ─────────────────────────────────────────────────────────────────────────────

// ── Model A: Investigation → Resolution (TCR / existing behavior) ────────────
// Exactly 13 forward stages + 2 exit stages. Nothing changed from original.
const INV_RES_STAGES = [
  'New Lead', 'Contacted', 'Consultation Scheduled', 'Consultation Completed',
  'Tax Inv Agreement Sent', 'Tax Inv Agreement Signed', 'Tax Inv Fee Paid',
  'Tax Investigation Active', 'IRS Facts Received', 'Addendum Sent', 'Addendum Signed',
  'Resolution Fee Paid', 'Converted to Client',
]

// Colors for the UI pipeline widget. Mirrors the old STATUS_FLOW constant.
const INV_RES_FLOW = [
  { s: 'New Lead',                   c: '#3b82f6' },
  { s: 'Contacted',                  c: '#6366f1' },
  { s: 'Consultation Scheduled',     c: '#8b5cf6' },
  { s: 'Consultation Completed',     c: '#a855f7' },
  { s: 'Tax Inv Agreement Sent',     c: '#f59e0b' },
  { s: 'Tax Inv Agreement Signed',   c: '#f97316' },
  { s: 'Tax Inv Fee Paid',           c: '#10b981' },
  { s: 'Tax Investigation Active',   c: '#059669' },
  { s: 'IRS Facts Received',         c: '#0ea5e9' },
  { s: 'Addendum Sent',              c: '#f59e0b' },
  { s: 'Addendum Signed',            c: '#f97316' },
  { s: 'Resolution Fee Paid',        c: '#10b981' },
  { s: 'Converted to Client',        c: '#25A25A' },
]

// Badge CSS class map. Mirrors the old STATUS_C constant.
const INV_RES_BADGE = {
  'New Lead': 'bb', 'Contacted': 'bn',
  'Consultation Scheduled': 'ba', 'Consultation Completed': 'ba',
  'Tax Inv Agreement Sent': 'ba', 'Tax Inv Agreement Signed': 'bg',
  'Tax Inv Fee Paid': 'bg', 'Tax Investigation Active': 'bg',
  'IRS Facts Received': 'bg', 'Addendum Sent': 'ba',
  'Addendum Signed': 'bg', 'Resolution Fee Paid': 'bg',
  'Converted to Client': 'bg',
}

// The set of statuses that conclude a lead (no longer in active pipeline).
// Used by Dashboard, Dialer, and lead list filters.
const INV_RES_CLOSED = ['Converted to Client', 'Dead', 'Do Not Contact']

// The conversion-trigger status — reaching this causes convertToClient() to fire.
const INV_RES_CONVERSION_TRIGGER = 'Resolution Fee Paid'

// The pipelineStage value written to the new client record at conversion.
// Investigation model: 'analysis' (investigation already completed pre-conversion).
const INV_RES_CLIENT_PIPELINE_STAGE = 'analysis'


// ── Reserved model key: Direct Resolution ────────────────────────────────────
// This model is deliberately unavailable until its business-defined stage
// contract exists. Empty definitions force getModel() to the production model,
// preventing a partially defined pipeline from ever becoming active by accident.
const DIR_RES_STAGES = []
const DIR_RES_FLOW   = []
const DIR_RES_BADGE  = {}
const DIR_RES_CLOSED = ['Converted to Client', 'Dead', 'Do Not Contact']
const DIR_RES_CONVERSION_TRIGGER     = null
const DIR_RES_CLIENT_PIPELINE_STAGE  = null


// ── Model registry ───────────────────────────────────────────────────────────
export const PIPELINE_MODELS = {
  'investigation-resolution': {
    stages:             INV_RES_STAGES,
    flow:               INV_RES_FLOW,
    badge:              INV_RES_BADGE,
    closedStatuses:     INV_RES_CLOSED,
    conversionTrigger:  INV_RES_CONVERSION_TRIGGER,
    clientPipelineStage: INV_RES_CLIENT_PIPELINE_STAGE,
  },
  'direct-resolution': {
    stages:             DIR_RES_STAGES,
    flow:               DIR_RES_FLOW,
    badge:              DIR_RES_BADGE,
    closedStatuses:     DIR_RES_CLOSED,
    conversionTrigger:  DIR_RES_CONVERSION_TRIGGER,
    clientPipelineStage: DIR_RES_CLIENT_PIPELINE_STAGE,
  },
}

// Safe model resolver. Falls back to investigation-resolution if model is
// unknown, null, or a reserved model does not have a production stage contract.
export function getModel(modelKey) {
  const m = PIPELINE_MODELS[modelKey]
  if (!m || !m.stages || m.stages.length === 0) {
    return PIPELINE_MODELS['investigation-resolution']
  }
  return m
}


// ── Public API (backwards-compatible) ────────────────────────────────────────

// Legacy: STATUS_ORDER — callers that don't pass a model get investigation-resolution.
// Keeping this export so Calendar.jsx, BookingWidget.jsx continue to work unchanged.
export const STATUS_ORDER = INV_RES_STAGES

// advanceLeadStatus: unchanged signature + behavior for existing callers.
// New optional `model` parameter allows model-aware callers to pass the tenant model.
export async function advanceLeadStatus(supabase, leadName, targetStatus, model) {
  if (!leadName || !targetStatus) return { skipped: true, reason: 'missing name or target' }

  const stageList = getModel(model).stages
  const targetIdx = stageList.indexOf(targetStatus)
  if (targetIdx === -1) return { skipped: true, reason: 'unknown target status for model' }

  const { data: leads } = await supabase.from('leads').select('id,status')
    .eq('name', leadName).order('created_at', { ascending: false }).limit(1)
  const lead = leads && leads[0]
  if (!lead) return { skipped: true, reason: 'no matching lead (may already be a client)' }

  const curIdx = stageList.indexOf(lead.status)
  if (curIdx >= targetIdx) return { skipped: true, reason: 'lead already at or past this stage' }

  const { error } = await supabase.from('leads').update({ status: targetStatus }).eq('id', lead.id)
  return { skipped: false, error }
}
