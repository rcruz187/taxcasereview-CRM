import { supabase } from './supabase'

// ── Invoice write-back (single source of truth) ──
// A payment cleared or reversed anywhere — the Payments screen or the
// Accounts Receivable screen — updates the linked invoice the same way, so
// the two views can never drift. Invoice-linked rows only: when there's no
// invNum, there's nothing to write back and we leave invoices alone.
//
// status rule (unchanged from the original Payments logic):
//   paid >= total → 'Paid'; paid > 0 → 'Partial'; else 'Unpaid' (floored at 0)

async function findInvoice(invNum) {
  if (!invNum) return null
  const { data } = await supabase.from('invoices')
    .select('id, invNum, total, paid, status').eq('invNum', invNum).maybeSingle()
  return data || null
}

function nextStatus(paid, total) {
  if (paid >= total && total > 0) return 'Paid'
  return paid > 0 ? 'Partial' : 'Unpaid'
}

// Add `amount` to the linked invoice's paid total.
export async function applyPaymentToInvoice(invNum, amount) {
  const inv = await findInvoice(invNum)
  if (!inv) return null
  const total = parseFloat(inv.total || 0)
  const newPaid = parseFloat(inv.paid || 0) + parseFloat(amount || 0)
  const paid = Math.max(0, newPaid)
  await supabase.from('invoices').update({ paid: String(paid), status: nextStatus(paid, total) }).eq('id', inv.id)
  return { id: inv.id, paid, status: nextStatus(paid, total) }
}

// Subtract `amount` back off the linked invoice — a mistaken/ bounced payment
// un-marked. Floors at 0 so a double-reverse can't drive paid negative.
export async function reversePaymentFromInvoice(invNum, amount) {
  const inv = await findInvoice(invNum)
  if (!inv) return null
  const total = parseFloat(inv.total || 0)
  const paid = Math.max(0, parseFloat(inv.paid || 0) - parseFloat(amount || 0))
  await supabase.from('invoices').update({ paid: String(paid), status: nextStatus(paid, total) }).eq('id', inv.id)
  return { id: inv.id, paid, status: nextStatus(paid, total) }
}
