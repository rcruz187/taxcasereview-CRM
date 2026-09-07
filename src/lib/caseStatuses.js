// ── Case status — single source of truth ─────────────────────────────────────
// cases.status is free text in the DB (no constraint). This file is the
// authoritative ordered list + badge colors + rollup groupings. Every page that
// lists, colors, or counts case statuses imports from here so the values can
// never drift out of sync (which previously caused counts to silently under-
// report cases in statuses one page didn't know about).
//
// Merged 7/28 to fold in the resolution pipeline stages: Collection Hold,
// Compliance (Filing/Payment), Financials, Penalty Abatement, Monitoring/Review.
// Existing statuses are preserved so no current case is orphaned.

export const CASE_STATUSES = [
  'Open',
  'Active',
  'Collection Hold',
  'Pending IRS',
  'Docs Needed',
  'POA Sent',
  'Compliance (Filing/Payment)',
  'Financials',
  'Active Plan',
  'Under Review',
  'Resolved',
  'Penalty Abatement',
  'Monitoring/Review',
  'Completed',
  'Closed',
]

// Badge class per status (bb/ba/bg/bn/br are the existing badge palette).
export const CASE_STATUS_COLORS = {
  'Open': 'bb',
  'Collection Hold': 'br',
  'Pending IRS': 'ba',
  'Docs Needed': 'ba',
  'POA Sent': 'bb',
  'Compliance (Filing/Payment)': 'ba',
  'Financials': 'ba',
  'Active Plan': 'bg',
  'Under Review': 'bn',
  'Resolved': 'bg',
  'Penalty Abatement': 'bb',
  'Monitoring/Review': 'bn',
  'Completed': 'bg',
  'Closed': 'bn',
}

// Terminal — case is done and off the active board.
export const CLOSED_STATUSES = ['Resolved', 'Completed', 'Closed']

// Everything still on the active board (drives "open cases" counts + sidebar badge).
export const OPEN_STATUSES = CASE_STATUSES.filter(s => !CLOSED_STATUSES.includes(s))

// Actively being worked (in-flight). Non-overlapping with PENDING below.
export const ACTIVE_STATUSES = [
  'Open',
  'Active',
  'Collection Hold',
  'Pending IRS',
  'Compliance (Filing/Payment)',
  'Financials',
  'Active Plan',
  'Penalty Abatement',
  'Monitoring/Review',
]

// Waiting on an external party or document.
export const PENDING_STATUSES = [
  'Docs Needed',
  'POA Sent',
  'Under Review',
]

// Rolled up as "resolved" in summary tiles.
export const RESOLVED_STATUSES = ['Resolved', 'Completed']

export const caseStatusColor = s => CASE_STATUS_COLORS[s] || 'bn'

// ── Client resolution pipeline (clients.pipelineStage) ───────────────────────
// Distinct from cases.status above: this is the ordered lifecycle a CLIENT moves
// through, stored as lowercase keys with a label map. Drives the client stepper,
// the 📊 badge, the add/edit-client dropdown, and the Reports pipeline funnel.
// 7/28: combined pipeline — Dana's intake/progression stages (Investigation→
// Negotiation) followed by Chris's resolution-execution stages, deduped. One
// ordered client journey. Rendered as a compact current-stage display (badge +
// dropdown + progress), NOT an all-stages horizontal stepper, so it never
// overflows regardless of length.
export const PIPELINE_STAGES = [
  { key: 'investigation',      label: 'Investigation' },
  { key: 'transcripts',        label: 'Transcripts' },
  { key: 'analysis',           label: 'Analysis' },
  { key: 'collection_hold',    label: 'Collection Hold' },
  { key: 'compliance',         label: 'Compliance (Filing/Payment)' },
  { key: 'financials',         label: 'Financials' },
  { key: 'proposal',           label: 'Proposal' },
  { key: 'negotiation',        label: 'Negotiation' },
  { key: 'resolution_pending', label: 'Resolution Pending' },
  { key: 'penalty_abatement',  label: 'Penalty Abatement' },
  { key: 'resolved',           label: 'Resolved' },
  { key: 'monitoring_review',  label: 'Monitoring/Review' },
  { key: 'close_file',         label: 'Close File' },
]

// Parallel actions/services — NOT sequential stages. A client can have several
// at once (e.g. Collection Hold while in Analysis; Penalty Abatement pursued
// alongside the resolution). These were wrongly forced into the linear pipeline
// before, which produced impossible orderings like "Resolved → Penalty Abatement".
// They live OFF the pipeline, tracked as clients.services (text[]).
export const CASE_SERVICES = ['Collection Hold', 'Penalty Abatement', 'Monitoring/Review']

export const DEFAULT_PIPELINE_STAGE = PIPELINE_STAGES[0].key // 'investigation'
export const PIPELINE_STAGE_KEYS = PIPELINE_STAGES.map(s => s.key)
export const PIPELINE_STAGE_LABELS = Object.fromEntries(PIPELINE_STAGES.map(s => [s.key, s.label]))
export const pipelineStageLabel = k => PIPELINE_STAGE_LABELS[k] || PIPELINE_STAGES[0].label
