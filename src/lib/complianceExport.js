import * as XLSX from 'xlsx'

function n(v) { const x = parseFloat(v); return isNaN(x) ? 0 : x }

const FORM_SHEETS = [
  { key: '1040',      sheet: 'Pers Fed Tax Prac',       label: 'Personal Federal (1040)', quarterly: false },
  { key: 'STATE',     sheet: 'Pers State Tax Prac',      label: 'Personal State',          quarterly: false },
  { key: 'PERS_CP',   sheet: 'Pers CP Tax Prac',         label: 'Personal CP',             quarterly: true  },
  { key: '940',       sheet: 'Biz 940 Tax Prac Sheet',   label: 'Business 940 (FUTA)',      quarterly: false },
  { key: '1065',      sheet: 'Biz 1065 Tax Prac Sheet',  label: 'Business 1065',           quarterly: false },
  { key: '1120',      sheet: 'Biz 1120 Tax Prac Sheet',  label: 'Business 1120',           quarterly: false },
  { key: '1120S',     sheet: 'Biz 1120s Tax Prac Sheet', label: 'Business 1120-S',          quarterly: false },
  { key: '941',       sheet: 'Biz 941 Tax Prac Sheet',   label: 'Business 941 (Payroll)',   quarterly: true  },
  { key: 'CP',        sheet: 'CP Fed Tax Prac',          label: 'Business CP (Federal)',   quarterly: true  },
  { key: 'BIZ_STATE', sheet: 'Biz State Tax Prac',       label: 'Business State',          quarterly: false },
]

function buildSheet(label, records, isQuarterly) {
  const rows = []
  const push = (...r) => rows.push(r)
  push(label.toUpperCase())
  push('')
  if (isQuarterly) {
    push('Tax Year', 'Quarter', 'Filed Status', 'Amount', 'Credits/Payments', 'Deposits', 'Lien', 'Assessment Date', 'CSED')
  } else {
    push('Tax Year', 'Filed Status', 'Amount', 'Credits', 'Lien', 'Assessment Date', 'CSED')
  }
  const sorted = [...records].sort((a, b) => (a.tax_year - b.tax_year) || ((a.quarter || 0) - (b.quarter || 0)))
  sorted.forEach(r => {
    if (isQuarterly) {
      push(r.tax_year, r.quarter || '', r.filed_status || '', n(r.amount), n(r.credits), n(r.deposit), r.lien || '', r.assessment_date || '', r.csed || '')
    } else {
      push(r.tax_year, r.filed_status || '', n(r.amount), n(r.credits), r.lien || '', r.assessment_date || '', r.csed || '')
    }
  })
  push('')
  const totalAmount = records.reduce((s, r) => s + n(r.amount), 0)
  const totalCredits = records.reduce((s, r) => s + n(r.credits), 0)
  push('Total', isQuarterly ? '' : '', totalAmount, totalCredits)
  return rows
}

// Builds a single overview sheet so the client/recipient gets a quick
// at-a-glance summary before digging into each form type's own tab.
function buildOverviewSheet(clientName, recordsByForm) {
  const rows = []
  const push = (...r) => rows.push(r)
  push('TAX COMPLIANCE OVERVIEW')
  push('Client', clientName || '')
  push('Generated', new Date().toLocaleDateString('en-US'))
  push('')
  push('Form Type', 'Years on File', 'Total Balance', 'Total Credits/Payments', 'Open Liens')
  FORM_SHEETS.forEach(({ key, label }) => {
    const recs = recordsByForm[key] || []
    if (recs.length === 0) return
    const totalAmount = recs.reduce((s, r) => s + n(r.amount), 0)
    const totalCredits = recs.reduce((s, r) => s + n(r.credits), 0)
    const liens = recs.filter(r => r.lien === 'Yes').length
    push(label, recs.length, totalAmount, totalCredits, liens)
  })
  return rows
}

export function exportComplianceToExcel(clientName, records) {
  const recordsByForm = {}
  FORM_SHEETS.forEach(({ key }) => { recordsByForm[key] = (records || []).filter(r => r.form_type === key) })

  const wb = XLSX.utils.book_new()
  const addSheet = (name, rows) => {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = Array.from({ length: 9 }, () => ({ wch: 20 }))
    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  addSheet('Overview', buildOverviewSheet(clientName, recordsByForm))
  FORM_SHEETS.forEach(({ key, sheet, label, quarterly }) => {
    const recs = recordsByForm[key]
    if (recs.length === 0) return // skip empty tabs so the workbook only shows what's relevant
    addSheet(sheet, buildSheet(label, recs, quarterly))
  })

  const safeName = (clientName || 'client').replace(/[^a-z0-9]+/gi, '_')
  XLSX.writeFile(wb, `${safeName}_Tax_Compliance.xlsx`)
}
