// Canonical forward order of the Leads pipeline. Mirrors the STATUS_FLOW
// list in Leads.jsx (kept as a separate small list here, rather than a
// shared import, so this file has zero dependency on page-level code and
// can be safely imported from anywhere — Calendar, BookingWidget, SignPage).
export const STATUS_ORDER = [
  'New Lead', 'Contacted', 'Consultation Scheduled', 'Consultation Completed',
  'Tax Inv Agreement Sent', 'Tax Inv Agreement Signed', 'Tax Inv Fee Paid',
  'Tax Investigation Active', 'IRS Facts Received', 'Addendum Sent', 'Addendum Signed',
  'Resolution Fee Paid', 'Converted to Client',
]

// Advances a lead's status forward only. Safe to call from automated
// triggers (booking confirmed, package sent, e-sign completed, fee paid)
// because it never moves a lead backward — if a lead is already further
// along than the target stage (or already converted/dead), this is a
// silent no-op rather than an overwrite. Matches leads by name, the same
// convention already used for timeentries/tasks/calevents elsewhere in
// this app — there's no foreign key linking esigns/calevents to a lead id.
export async function advanceLeadStatus(supabase, leadName, targetStatus) {
  if (!leadName || !targetStatus) return { skipped: true, reason: 'missing name or target' }
  const targetIdx = STATUS_ORDER.indexOf(targetStatus)
  if (targetIdx === -1) return { skipped: true, reason: 'unknown target status' }

  // .limit(1) rather than .maybeSingle(): maybeSingle() returns NO row when
  // two leads share a name (common with test/duplicate records), which made
  // the pipeline silently fail to advance. Take the most recent match.
  const { data: leads } = await supabase.from('leads').select('id,status')
    .eq('name', leadName).order('created_at', { ascending: false }).limit(1)
  const lead = leads && leads[0]
  if (!lead) return { skipped: true, reason: 'no matching lead (may already be a client)' }

  const curIdx = STATUS_ORDER.indexOf(lead.status)
  if (curIdx >= targetIdx) return { skipped: true, reason: 'lead already at or past this stage' }

  const { error } = await supabase.from('leads').update({ status: targetStatus }).eq('id', lead.id)
  return { skipped: false, error }
}
