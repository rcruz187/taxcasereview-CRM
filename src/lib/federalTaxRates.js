// ─── Federal withholding + FICA estimation ───────────────────────────────────
// Feeds the Financial Intake wizard so a client who enters gross pay doesn't
// have to dig out their pay stub for the withholding lines. Every value these
// produce is an ESTIMATE and every field stays editable — the pay stub wins.
//
// FICA is exact. Federal income tax is not: actual withholding depends on the
// W-4 on file (dependents, extra withholding, multiple-jobs checkbox), none of
// which the intake collects. What this computes is annual tax liability under
// the standard deduction, spread evenly across the year — the right basis for a
// 433 ability-to-pay analysis, and usually within a reasonable margin of what
// an employer actually withholds.
//
// ⚠️ UPDATE ANNUALLY. These constants are the 2025 figures. Verify against the
// IRS release each January, and spot-check a few cases against
// https://www.paycheckcity.com/calculator/salary before relying on them.

export const TAX_YEAR = 2025

// FICA — exact, and the part clients most often leave blank.
export const SOCIAL_SECURITY_RATE = 0.062
export const SOCIAL_SECURITY_WAGE_BASE = 176100  // 2025
export const MEDICARE_RATE = 0.0145
export const ADDITIONAL_MEDICARE_RATE = 0.009
export const ADDITIONAL_MEDICARE_THRESHOLD = 200000 // single-filer withholding trigger

export const STANDARD_DEDUCTION = {
  'Single': 15750,
  'Married Filing Jointly': 31500,
  'Married Filing Separately': 15750,
  'Head of Household': 23625,
  'Widowed': 31500,
}

// [upper bound of bracket, marginal rate] — last entry is the top bracket.
const BRACKETS = {
  'Single': [
    [11925, 0.10], [48475, 0.12], [103350, 0.22], [197300, 0.24],
    [250525, 0.32], [626350, 0.35], [Infinity, 0.37],
  ],
  'Married Filing Jointly': [
    [23850, 0.10], [96950, 0.12], [206700, 0.22], [394600, 0.24],
    [501050, 0.32], [751600, 0.35], [Infinity, 0.37],
  ],
  'Married Filing Separately': [
    [11925, 0.10], [48475, 0.12], [103350, 0.22], [197300, 0.24],
    [250525, 0.32], [375800, 0.35], [Infinity, 0.37],
  ],
  'Head of Household': [
    [17000, 0.10], [64850, 0.12], [103350, 0.22], [197300, 0.24],
    [250500, 0.32], [626350, 0.35], [Infinity, 0.37],
  ],
}
BRACKETS['Widowed'] = BRACKETS['Married Filing Jointly']

function bracketsFor(filingStatus) {
  return BRACKETS[filingStatus] || BRACKETS['Single']
}

/**
 * Estimated federal income tax withheld per month.
 * @param {number} grossMonthly
 * @param {string} filingStatus  one of the intake's filing status options
 * @returns {number} whole dollars per month, 0 if income is below the standard deduction
 */
export function estimateFederalWithholding(grossMonthly, filingStatus) {
  const gross = parseFloat(grossMonthly) || 0
  if (gross <= 0) return 0

  const annual = gross * 12
  const deduction = STANDARD_DEDUCTION[filingStatus] ?? STANDARD_DEDUCTION['Single']
  const taxable = Math.max(0, annual - deduction)
  if (taxable === 0) return 0

  let tax = 0
  let floor = 0
  for (const [ceiling, rate] of bracketsFor(filingStatus)) {
    if (taxable <= floor) break
    tax += (Math.min(taxable, ceiling) - floor) * rate
    floor = ceiling
  }
  return Math.round(tax / 12)
}

/**
 * Social Security + Medicare withheld per month.
 * Exact for wage earners: 6.2% up to the wage base, plus 1.45% on everything,
 * plus the 0.9% additional Medicare an employer withholds above the threshold.
 * @param {number} grossMonthly
 * @returns {number} whole dollars per month
 */
export function estimateFicaWithholding(grossMonthly) {
  const gross = parseFloat(grossMonthly) || 0
  if (gross <= 0) return 0

  const annual = gross * 12
  const socialSecurity = Math.min(annual, SOCIAL_SECURITY_WAGE_BASE) * SOCIAL_SECURITY_RATE
  let medicare = annual * MEDICARE_RATE
  if (annual > ADDITIONAL_MEDICARE_THRESHOLD) {
    medicare += (annual - ADDITIONAL_MEDICARE_THRESHOLD) * ADDITIONAL_MEDICARE_RATE
  }
  return Math.round((socialSecurity + medicare) / 12)
}
