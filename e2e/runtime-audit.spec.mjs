import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8')

test('critical workflow pages bind the authenticated user context', () => {
  const files = [
    'src/pages/Calendar.jsx',
    'src/pages/Payments.jsx',
    'src/pages/Invoices.jsx',
    'src/pages/TaxReturns.jsx',
  ]
  for (const file of files) {
    const source = read(file)
    expect(source, `${file} must import AppContext`).toContain("from '../context/AppContext'")
    expect(source, `${file} must bind user from useApp()`).toContain('const { user } = useApp()')
  }
})

test('manual invoice payments are cumulative and tax-aware', () => {
  const source = read('src/pages/Invoices.jsx')
  expect(source).toContain('const invoiceTotal = subtotal + (subtotal * taxRate / 100)')
  expect(source).toContain('const previouslyPaid = parseFloat(inv.paid || 0)')
  expect(source).toContain('const newPaid = previouslyPaid + paymentAmount')
  expect(source).toContain("paid: String(newPaid)")
  expect(source).toContain('amount: paymentAmount')
  expect(source).not.toContain("update({ paid: String(paid), status")
})
