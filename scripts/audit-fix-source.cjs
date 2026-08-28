const fs = require('fs')

function replaceExactly(path, search, replacement, label) {
  const src = fs.readFileSync(path, 'utf8')
  const count = src.split(search).length - 1
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`)
  fs.writeFileSync(path, src.replace(search, replacement))
}

// Tax Returns: never offer an insecure copy/paste schema that grants anon ALL.
{
  const path = 'src/pages/TaxReturns.jsx'
  let src = fs.readFileSync(path, 'utf8')
  const setupRx = /const SQL_SETUP = `create table if not exists tax_returns \([\s\S]*?create policy "anon_all" on tax_returns for all using \(true\) with check \(true\);`/
  if (!setupRx.test(src)) throw new Error('TaxReturns SQL_SETUP block not found')
  src = src.replace(setupRx, "const SQL_SETUP = `Tax Returns database setup is managed by secure Supabase migrations. Contact a platform administrator if this module reports that setup is required.`")

  const start = src.indexOf('function calcTotals(r) {')
  const end = src.indexOf('\nfunction fmt(n) {', start)
  if (start < 0 || end < 0) throw new Error('TaxReturns calcTotals block not found')

  const calc = `const TAX_RULES = {
  '2024': {
    standard: { 'Single': 14600, 'Married Filing Jointly': 29200, 'Married Filing Separately': 14600, 'Head of Household': 21900, 'Qualifying Surviving Spouse': 29200 },
    brackets: {
      'Single': [[11600,.10],[47150,.12],[100525,.22],[191950,.24],[243725,.32],[609350,.35],[Infinity,.37]],
      'Married Filing Jointly': [[23200,.10],[94300,.12],[201050,.22],[383900,.24],[487450,.32],[731200,.35],[Infinity,.37]],
      'Married Filing Separately': [[11600,.10],[47150,.12],[100525,.22],[191950,.24],[243725,.32],[365600,.35],[Infinity,.37]],
      'Head of Household': [[16550,.10],[63100,.12],[100500,.22],[191950,.24],[243700,.32],[609350,.35],[Infinity,.37]],
      'Qualifying Surviving Spouse': [[23200,.10],[94300,.12],[201050,.22],[383900,.24],[487450,.32],[731200,.35],[Infinity,.37]],
    },
  },
  '2025': {
    standard: { 'Single': 15750, 'Married Filing Jointly': 31500, 'Married Filing Separately': 15750, 'Head of Household': 23625, 'Qualifying Surviving Spouse': 31500 },
    brackets: {
      'Single': [[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[626350,.35],[Infinity,.37]],
      'Married Filing Jointly': [[23850,.10],[96950,.12],[206700,.22],[394600,.24],[501050,.32],[751600,.35],[Infinity,.37]],
      'Married Filing Separately': [[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[375800,.35],[Infinity,.37]],
      'Head of Household': [[17000,.10],[64850,.12],[103350,.22],[197300,.24],[250500,.32],[626350,.35],[Infinity,.37]],
      'Qualifying Surviving Spouse': [[23850,.10],[96950,.12],[206700,.22],[394600,.24],[501050,.32],[751600,.35],[Infinity,.37]],
    },
  },
  '2026': {
    standard: { 'Single': 16100, 'Married Filing Jointly': 32200, 'Married Filing Separately': 16100, 'Head of Household': 24150, 'Qualifying Surviving Spouse': 32200 },
    brackets: {
      'Single': [[12400,.10],[50400,.12],[105700,.22],[201775,.24],[256225,.32],[640600,.35],[Infinity,.37]],
      'Married Filing Jointly': [[24800,.10],[100800,.12],[211400,.22],[403550,.24],[512450,.32],[768700,.35],[Infinity,.37]],
      'Married Filing Separately': [[12400,.10],[50400,.12],[105700,.22],[201775,.24],[256225,.32],[384350,.35],[Infinity,.37]],
      'Head of Household': [[17700,.10],[67450,.12],[105700,.22],[201750,.24],[256200,.32],[640600,.35],[Infinity,.37]],
      'Qualifying Surviving Spouse': [[24800,.10],[100800,.12],[211400,.22],[403550,.24],[512450,.32],[768700,.35],[Infinity,.37]],
    },
  },
}

function calcTotals(r) {
  const n = k => parseFloat(r[k] || 0) || 0
  const grossIncome = n('wages') + n('interest') + n('dividends') + n('capitalGains') +
    n('businessIncome') + n('rentalIncome') + n('retirementIncome') + n('socialSecurity') + n('otherIncome')
  const adjustments = n('studentLoanInterest') + n('iraDeduction') + n('selfEmployedHealth') +
    n('selfEmployedTax') + n('alimonyPaid') + n('otherAdjustments')
  const agi = grossIncome - adjustments
  const rules = TAX_RULES[String(r.taxYear || '')]

  // Historical returns remain editable/tracked, but we do not silently apply a
  // different year's federal thresholds. Unsupported years show no estimate.
  if (!rules) {
    return { grossIncome, adjustments, agi, deductions: null, taxableIncome: null, tax: null,
      credits: null, taxAfterCredits: null, payments: null, refundOrOwed: null, estimateUnsupported: true }
  }

  let deductions = 0
  if (r.deductionType === 'Standard') {
    deductions = rules.standard[r.filingStatus] ?? rules.standard.Single
  } else {
    deductions = n('stateLocalTax') + n('mortgageInterest') + n('charitableContrib') + n('medicalExpenses') + n('itemizedDeductions')
  }
  const taxableIncome = Math.max(0, agi - deductions)
  const brackets = rules.brackets[r.filingStatus] || rules.brackets.Single
  let tax = 0
  let remaining = taxableIncome
  let prev = 0
  for (const [limit, rate] of brackets) {
    const range = Math.min(remaining, limit - prev)
    if (range <= 0) break
    tax += range * rate
    remaining -= range
    prev = limit
    if (remaining <= 0) break
  }
  const credits = n('childTaxCredit') + n('earnedIncomeCredit') + n('childCareCredit') + n('educationCredit') + n('otherCredits')
  const taxAfterCredits = Math.max(0, tax - credits)
  const payments = n('withholding') + n('estimatedPayments') + n('refundable')
  const refundOrOwed = payments - taxAfterCredits

  return { grossIncome, adjustments, agi, deductions, taxableIncome, tax, credits, taxAfterCredits, payments, refundOrOwed, estimateUnsupported: false }
}`

  src = src.slice(0, start) + calc + src.slice(end)
  fs.writeFileSync(path, src)
}

// Parsed document metadata must not fail silently.
replaceExactly(
  'src/components/TaxDocParser.jsx',
  "      try { await supabase.from('tax_doc_uploads').insert(inserts) } catch (_) {}",
  `      try {
        const { error: saveError } = await supabase.from('tax_doc_uploads').insert(inserts)
        if (saveError) console.error('Failed to persist parsed tax-document metadata:', saveError)
      } catch (saveError) {
        console.error('Failed to persist parsed tax-document metadata:', saveError)
      }`,
  'TaxDocParser persistence handling'
)

console.log('Audit source repairs applied successfully')
