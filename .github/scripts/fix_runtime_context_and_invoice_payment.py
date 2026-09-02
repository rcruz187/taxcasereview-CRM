from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def replace_once(path, old, new):
    p = ROOT / path
    s = p.read_text()
    if new in s:
        print(f'{path}: already patched')
        return False
    if old not in s:
        raise SystemExit(f'{path}: expected anchor not found')
    p.write_text(s.replace(old, new, 1))
    print(f'{path}: patched')
    return True


# Missing AppContext user bindings. These references only fail at runtime,
# so the production build can be green while the post-save workflow crashes.
replace_once(
    'src/pages/Payments.jsx',
    "import { supabase } from '../lib/supabase'\n",
    "import { supabase } from '../lib/supabase'\nimport { useApp } from '../context/AppContext'\n",
)
replace_once(
    'src/pages/Payments.jsx',
    "export default function Payments() {\n",
    "export default function Payments() {\n  const { user } = useApp()\n",
)
replace_once(
    'src/pages/Invoices.jsx',
    "export default function Invoices() {\n",
    "export default function Invoices() {\n  const { user } = useApp()\n",
)
replace_once(
    'src/pages/Calendar.jsx',
    "import { supabase } from '../lib/supabase'\n",
    "import { supabase } from '../lib/supabase'\nimport { useApp } from '../context/AppContext'\n",
)
replace_once(
    'src/pages/Calendar.jsx',
    "export default function Calendar() {\n",
    "export default function Calendar() {\n  const { user } = useApp()\n",
)
replace_once(
    'src/pages/TaxReturns.jsx',
    "import { supabase } from '../lib/supabase'\n",
    "import { supabase } from '../lib/supabase'\nimport { useApp } from '../context/AppContext'\n",
)
replace_once(
    'src/pages/TaxReturns.jsx',
    "export default function TaxReturns() {\n",
    "export default function TaxReturns() {\n  const { user } = useApp()\n",
)

# Record Payment must ADD to prior paid balance and include invoice tax when
# deciding whether the invoice is fully paid. The previous implementation
# overwrote earlier partial payments and compared only against subtotal.
old = '''  async function recordPayment(inv) {
    const amount = prompt(`Record payment for Invoice #${inv.invNum||inv.id?.slice(-6)||''}.\\nEnter amount received:`, inv.total)
    if (!amount) return
    const paid = parseFloat(amount)
    const total = parseFloat(inv.total || 0)
    const status = paid >= total ? 'Paid' : 'Partial'
    const { error } = await supabase.from('invoices').update({ paid: String(paid), status, updated_at: new Date().toISOString() }).eq('id', inv.id)
    if (!error) {
      // Also create a payment record
      await supabase.from('payments').insert([{ clientName: inv.clientName, amount: paid, method: 'Manual', invoiceId: inv.id, notes: `Payment for Invoice #${inv.invNum||''}`, created_at: new Date().toISOString() }])
      showToast(`✅ Payment of $${paid.toLocaleString()} recorded`)
      load()
    }
  }
'''
new = '''  async function recordPayment(inv) {
    const subtotal = parseFloat(inv.total || 0)
    const taxRate = parseFloat(inv.taxRate || 0)
    const invoiceTotal = subtotal + (subtotal * taxRate / 100)
    const previouslyPaid = parseFloat(inv.paid || 0)
    const remaining = Math.max(0, invoiceTotal - previouslyPaid)
    const amount = prompt(`Record payment for Invoice #${inv.invNum||inv.id?.slice(-6)||''}.\\nEnter amount received:`, remaining.toFixed(2))
    if (!amount) return
    const paymentAmount = parseFloat(amount)
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) { showToast('Enter a valid payment amount'); return }
    const newPaid = previouslyPaid + paymentAmount
    const status = newPaid >= invoiceTotal - 0.005 ? 'Paid' : 'Partial'
    const { error } = await supabase.from('invoices').update({ paid: String(newPaid), status, updated_at: new Date().toISOString() }).eq('id', inv.id)
    if (!error) {
      // Also create a payment record for this transaction only; invoice.paid is cumulative.
      await supabase.from('payments').insert([{ clientName: inv.clientName, amount: paymentAmount, method: 'Manual', invoiceId: inv.id, notes: `Payment for Invoice #${inv.invNum||''}`, created_at: new Date().toISOString() }])
      showToast(`✅ Payment of $${paymentAmount.toLocaleString()} recorded`)
      load()
    }
  }
'''
replace_once('src/pages/Invoices.jsx', old, new)
