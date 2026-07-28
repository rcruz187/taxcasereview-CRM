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
