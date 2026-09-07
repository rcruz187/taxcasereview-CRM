import { supabase } from './supabase'

// ── Invoice write-back (single source of truth) ──
// A payment cleared or reversed anywhere — the Payments screen or the
// Accounts Receivable screen — updates the linked invoice the same way, so
// the two views can never drift. Invoice-linked rows only: when there's no
// invNum, there's nothing to write back and we leave invoices alone.

async function findInvoice(invNum) {
  if (!invNum) return null
  const { data } = await supabase.from('invoices')
    .select('id, invNum, total, taxRate, paid, status').eq('invNum', invNum).limit(1)
  return data?.[0] || null
}

function invoiceTotal(inv) {
  const subtotal = parseFloat(inv?.total || 0)
  const taxRate = parseFloat(inv?.taxRate || 0)
  return subtotal + (subtotal * taxRate / 100)
}

function nextStatus(paid, total) {
  if (paid >= total - 0.005 && total > 0) return 'Paid'
  return paid > 0 ? 'Partial' : 'Unpaid'
}

// Add `amount` to the linked invoice's cumulative paid total.
export async function applyPaymentToInvoice(invNum, amount) {
  const inv = await findInvoice(invNum)
  if (!inv) return null
  const total = invoiceTotal(inv)
  const newPaid = parseFloat(inv.paid || 0) + parseFloat(amount || 0)
  const paid = Math.max(0, newPaid)
  const status = nextStatus(paid, total)
  await supabase.from('invoices').update({ paid: String(paid), status }).eq('id', inv.id)
  return { id: inv.id, paid, status }
}

// Subtract `amount` back off the linked invoice — a mistaken/bounced payment
// reversal. Floors at 0 so a double-reverse can't drive paid negative.
export async function reversePaymentFromInvoice(invNum, amount) {
  const inv = await findInvoice(invNum)
  if (!inv) return null
  const total = invoiceTotal(inv)
  const paid = Math.max(0, parseFloat(inv.paid || 0) - parseFloat(amount || 0))
  const status = nextStatus(paid, total)
  await supabase.from('invoices').update({ paid: String(paid), status }).eq('id', inv.id)
  return { id: inv.id, paid, status }
}
