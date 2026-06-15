import * as XLSX from 'xlsx'

function n(v) { const x = parseFloat(v); return isNaN(x) ? 0 : x }

// ─── Shared calc helpers (mirrors FinancialProfile.jsx) ────────────────────
function calcIncome(profile) {
  const et1 = profile.employment_taxpayer_1 || {}, et2 = profile.employment_taxpayer_2 || {}
  const es1 = profile.employment_spouse_1 || {}, es2 = profile.employment_spouse_2 || {}
  const b1 = profile.business_1 || {}, b2 = profile.business_2 || {}
  const re = profile.real_estate || []

  const wagesT1 = n(et1.gross_monthly_salary), wagesT2 = n(et2.gross_monthly_salary)
  const wagesS1 = n(es1.gross_monthly_salary), wagesS2 = n(es2.gross_monthly_salary)

  const taxesT1 = n(et1.fed_withheld) + n(et1.ss_med_withheld) + n(et1.state_withheld)
  const taxesT2 = n(et2.fed_withheld) + n(et2.ss_med_withheld) + n(et2.state_withheld)
  const taxesS1 = n(es1.fed_withheld) + n(es1.ss_med_withheld) + n(es1.state_withheld)
  const taxesS2 = n(es2.fed_withheld) + n(es2.ss_med_withheld) + n(es2.state_withheld)

  const netBizIncome = n(b1.net_income) + n(b2.net_income)
  const seTax = netBizIncome * 0.153
  const k1 = n(b1.k1_distribution) + n(b2.k1_distribution)

  let rentalIncome = 0
  re.forEach((p,i) => { if (i>0) rentalIncome += n(p.rental_income) - n(p.mortgage_1) })

  const otherIncome = (profile.other_income||[]).reduce((s,r)=>s+n(r.amount),0)

  const grossIncomeTotal = wagesT1+wagesT2+wagesS1+wagesS2 + netBizIncome + k1 + rentalIncome + otherIncome
  const taxesTotal = taxesT1+taxesT2+taxesS1+taxesS2 + seTax

  return { wagesT1, wagesT2, wagesS1, wagesS2, taxesT1, taxesT2, taxesS1, taxesS2,
    netBizIncome, seTax, k1, rentalIncome, otherIncome, grossIncomeTotal, taxesTotal,
    netMonthlyIncome: grossIncomeTotal - taxesTotal }
}

const NATIONAL_STANDARD_FOOD_CLOTHING = (hh) => {
  if (hh <= 0) return 0
  if (hh === 1) return 836
  if (hh === 2) return 1478
  if (hh === 3) return 1694
  if (hh === 4) return 2054
  return 2054 + (hh - 4) * 389
}
const OOP_HEALTH_UNDER65 = 68, OOP_HEALTH_65PLUS = 142
const VEHICLE_OWNERSHIP_STD = { 0: 0, 1: 617, 2: 1234 }

function calcExpenses(profile, totalHousehold) {
  const e = profile.expenses || {}
  const re = profile.real_estate?.[0] || {}
  const vehicles = profile.vehicles || []
  const osd = profile.other_secured_debt || {}
  const ccTotal = (profile.credit_cards||[]).reduce((s,c)=>s+n(c.min_payment),0)
  const income = calcIncome(profile)

  const foodClothingStd = NATIONAL_STANDARD_FOOD_CLOTHING(totalHousehold)
  const foodClothingActual = n(e.food_clothing) || foodClothingStd

  const housing = n(re.mortgage_1) + n(re.mortgage_2) + n(e.homeowners_insurance) + n(e.property_taxes) +
    n(e.hoa_dues) + n(e.rent) + n(e.renters_insurance) + n(e.electricity) + n(e.water_sewer_trash) +
    n(e.waste_sewer) + n(e.trash) + n(e.heating_gas) + n(e.heating_propane) + n(e.cell_phone) +
    n(e.internet) + n(e.cable) + n(e.pest_control) + n(e.lawn) + n(e.maintenance)
  const housingStd = n(e.housing_standard) || 0

  const vehiclesWithPayment = vehicles.filter(v=>n(v.monthly_payment)>0).length
  const vehicle1Payment = n(vehicles[0]?.monthly_payment)
  const vehicle2Payment = n(vehicles[1]?.monthly_payment)
  const vehicleTotal = n(e.public_transportation) + vehicle1Payment + vehicle2Payment + n(e.car_misc)

  const oopHealthStd = n(profile.household_under_65)*OOP_HEALTH_UNDER65 + n(profile.household_over_65)*OOP_HEALTH_65PLUS
  const oopHealthActual = n(e.health_oop) || oopHealthStd
  const healthTotal = n(e.health_major_medical) + n(e.health_supplemental) + n(e.health_dental) + n(e.health_vision) + oopHealthActual

  const creditTotal = n(e.credit_card_min) || ccTotal
  const courtTotal = n(e.child_support) + n(e.court_judgment)
  const childCare = n(e.child_care)
  const otherSecured = n(osd.monthly_payment)
  const lifeTotal = n(e.life_term) + n(e.life_whole)
  const taxesSubtotal = income.taxesTotal + n(e.irs_installment) + n(e.state_installment)

  const totalMonthlyExpenses = foodClothingActual + housing + vehicleTotal + healthTotal + creditTotal +
    courtTotal + childCare + otherSecured + lifeTotal + taxesSubtotal

  const netDisposableIncome = income.grossIncomeTotal - totalMonthlyExpenses

  const homeOverNS = Math.max(0, housing - housingStd) + n(e.maintenance)
  const vehicle1OverNS = Math.max(0, vehicle1Payment - 588)
  const vehicle2OverNS = Math.max(0, vehicle2Payment - 588)
  const oicNDI = netDisposableIncome + homeOverNS + vehicle1OverNS + vehicle2OverNS

  return { foodClothingStd, foodClothingActual, housing, housingStd, vehicleTotal,
    oopHealthStd, oopHealthActual, healthTotal, creditTotal, courtTotal, childCare,
    otherSecured, lifeTotal, taxesSubtotal, totalMonthlyExpenses, netDisposableIncome,
    homeOverNS, vehicle1OverNS, vehicle2OverNS, oicNDI, vehicle1Payment, vehicle2Payment, ccTotal }
}

function calcAssets(profile) {
  const assets = profile.assets || []
  const re = profile.real_estate || []
  const vehicles = profile.vehicles || []
  const cash = n(profile.cash_on_hand)

  const bankAccounts = assets.filter(a=>a.type==='bank_account')
  let bankTotal = { value:0, loan:0, amount:0 }
  bankAccounts.forEach(a=>{ bankTotal.value += n(a.value); bankTotal.loan += n(a.loan_against) })
  bankTotal.amount = Math.max(0, bankTotal.value - bankTotal.loan - 1000)

  const lifeInsurance = assets.filter(a=>a.type==='life_insurance')
  let lifeTotal = { value:0, loan:0, amount:0 }
  lifeInsurance.forEach(a=>{ const v=n(a.value),l=n(a.loan_against); lifeTotal.value+=v; lifeTotal.loan+=l; lifeTotal.amount+=Math.max(0,v*0.7-l) })

  const retirement = assets.filter(a=>a.type==='retirement')
  let retTotal = { value:0, loan:0, amount:0 }
  retirement.forEach(a=>{ const v=n(a.value),l=n(a.loan_against); retTotal.value+=v; retTotal.loan+=l; retTotal.amount+=Math.max(0,v*0.7-l) })

  let vehicleTotal = { value:0, loan:0, amount:0 }
  vehicles.forEach(v=>{ const val=n(v.kbb_value),l=n(v.remaining_balance); if(!val) return; vehicleTotal.value+=val; vehicleTotal.loan+=l; vehicleTotal.amount+=Math.max(0,val*0.8-l) })

  let reTotal = { value:0, loan:0, amount:0 }
  re.forEach(p=>{ const val=n(p.zillow_value),l=n(p.mortgage_balance); if(!val) return; reTotal.value+=val; reTotal.loan+=l; reTotal.amount+=Math.max(0,val*0.8-l) })

  const businessAssets = assets.filter(a=>a.type==='business_asset')
  let bizTotal = { value:0, loan:0, amount:0 }
  businessAssets.forEach(a=>{ const v=n(a.value),l=n(a.loan_against); bizTotal.value+=v; bizTotal.loan+=l; bizTotal.amount+=Math.max(0,v-l) })

  const additionalAssets = assets.filter(a=>a.type==='additional_asset')
  let addlTotal = { value:0, loan:0, amount:0 }
  additionalAssets.forEach(a=>{ const v=n(a.value),l=n(a.loan_against); addlTotal.value+=v; addlTotal.loan+=l; addlTotal.amount+=Math.max(0,v*0.8-l) })

  const grandTotal = {
    value: bankTotal.value+lifeTotal.value+retTotal.value+vehicleTotal.value+reTotal.value+bizTotal.value+addlTotal.value+cash,
    loan: bankTotal.loan+lifeTotal.loan+retTotal.loan+vehicleTotal.loan+reTotal.loan+bizTotal.loan+addlTotal.loan,
    amount: bankTotal.amount+lifeTotal.amount+retTotal.amount+vehicleTotal.amount+reTotal.amount+bizTotal.amount+addlTotal.amount+cash,
  }

  return { bankTotal, lifeTotal, retTotal, vehicleTotal, reTotal, bizTotal, addlTotal, cash, grandTotal }
}

// ─── Sheet builders ──────────────────────────────────────────────────────
// Each builder returns an array of [colA, colB, ...] rows (AOA format)

function buildToWorksheet(profile, client, totalHousehold) {
  const rows = []
  const push = (...r) => rows.push(r)
  const dep = (label, v) => push(label, v ?? '')

  push('Client Name', client?.name||'', 'SSN', client?.ssn||'', 'DOB', profile.dob||'', 'County', profile.county||'', 'Phone', client?.phone||'')
  push('')
  push('Household under 65', profile.household_under_65||0, 'Household over 65', profile.household_over_65||0, 'Total Household Size', totalHousehold)
  push('Filing Status', profile.filing_status||'')
  push('Tax Years Not Filed', profile.tax_years_not_filed||'')
  push('Has client ever lived in another State?', profile.has_lived_other_states||'', 'Which states & dates of move', profile.other_states_notes||'')
  push('')

  // Dependents
  push('Dependents', 'SSN', 'DOB', 'Relationship')
  const deps = client?.dependents ? (typeof client.dependents==='string' ? JSON.parse(client.dependents||'[]') : client.dependents) : []
  deps.forEach(d => push(d.name||'', d.ssn||'', d.dob||'', d.relationship||''))
  push('')

  // Employment - Taxpayer
  const et1 = profile.employment_taxpayer_1||{}, et2 = profile.employment_taxpayer_2||{}
  push('EMPLOYMENT — TAXPAYER')
  push('Employer 1', et1.employer||'', 'Position', et1.position||'', 'Length of Time', et1.length||'')
  push('Pay Frequency', et1.pay_frequency||'', 'Gross Monthly Salary', n(et1.gross_monthly_salary))
  push('Federal Withheld', n(et1.fed_withheld), 'Med/SS Withheld', n(et1.ss_med_withheld), 'State Withheld', n(et1.state_withheld))
  push('Employer 2', et2.employer||'', 'Position', et2.position||'', 'Length of Time', et2.length||'')
  push('Pay Frequency', et2.pay_frequency||'', 'Gross Monthly Salary', n(et2.gross_monthly_salary))
  push('Federal Withheld', n(et2.fed_withheld), 'Med/SS Withheld', n(et2.ss_med_withheld), 'State Withheld', n(et2.state_withheld))
  push('')

  // Employment - Spouse
  const es1 = profile.employment_spouse_1||{}, es2 = profile.employment_spouse_2||{}
  push('EMPLOYMENT — SPOUSE')
  push('Employer 1', es1.employer||'', 'Position', es1.position||'', 'Length of Time', es1.length||'')
  push('Pay Frequency', es1.pay_frequency||'', 'Gross Monthly Salary', n(es1.gross_monthly_salary))
  push('Federal Withheld', n(es1.fed_withheld), 'Med/SS Withheld', n(es1.ss_med_withheld), 'State Withheld', n(es1.state_withheld))
  push('Employer 2', es2.employer||'', 'Position', es2.position||'', 'Length of Time', es2.length||'')
  push('Pay Frequency', es2.pay_frequency||'', 'Gross Monthly Salary', n(es2.gross_monthly_salary))
  push('Federal Withheld', n(es2.fed_withheld), 'Med/SS Withheld', n(es2.ss_med_withheld), 'State Withheld', n(es2.state_withheld))
  push('')

  // Businesses
  ;[profile.business_1, profile.business_2].forEach((b,i) => {
    b = b || {}
    push(`BUSINESS ${i+1}`)
    push('Name', b.name||'', 'Address', b.address||'', 'EIN', b.ein||'')
    push('Structure', b.structure||'', '% Ownership', b.pct_ownership||'', 'Other Partners', b.other_partners||'')
    push('Date Opened', b.date_opened||'', 'Date Closed', b.date_closed||'', '# Employees', b.num_employees||'')
    push('Payroll Processor', b.payroll_processor||'', 'Current on 941?', b.current_941||'')
    push('Net Income (Monthly)', n(b.net_income), 'K-1 Distribution (Monthly)', n(b.k1_distribution))
    push('Notes', b.notes||'')
    push('')
  })

  // Other income
  push('OTHER INCOME')
  ;(profile.other_income||[]).forEach(r => push(r.source||'', n(r.amount)))
  push('')

  // Real Estate
  push('REAL ESTATE')
  ;(profile.real_estate||[]).forEach((p,i) => {
    push(`Property ${i+1}${i===0?' (Primary Residence)':''}`)
    push('Address', p.address||'')
    if (i===0) {
      push('Monthly Rent Expense', n(p.monthly_rent), '1st Mortgage', n(p.mortgage_1), '2nd Mortgage', n(p.mortgage_2))
    } else {
      push('Rental Income (Gross)', n(p.rental_income), '1st Mortgage', n(p.mortgage_1), '2nd Mortgage', n(p.mortgage_2))
    }
    push('Purchase Year', p.purchase_year||'', 'Purchase Amount', n(p.purchase_amount), 'Refi Year', p.refi_year||'', 'Refi Amount', n(p.refi_amount))
    push('Value (Zillow)', n(p.zillow_value), 'Length of Mortgage', p.mortgage_length||'', 'Balance of Mortgage', n(p.mortgage_balance))
    push('')
  })

  // Vehicles
  push('VEHICLES')
  ;(profile.vehicles||[]).forEach((v,i) => {
    if (!v.make_model && !v.year) return
    push(`Vehicle ${i+1}`, v.make_model||'', 'Year', v.year||'')
    push('Purchase Date', v.purchase_date||'', 'Purchase Amount', n(v.purchase_amount), 'Monthly Payment', n(v.monthly_payment))
    push('Final Payment Date', v.final_payment_date||'', 'Mileage', n(v.mileage), 'Current Value (KBB)', n(v.kbb_value), 'Remaining Balance', n(v.remaining_balance))
  })
  push('')

  // Other secured debt
  const osd = profile.other_secured_debt||{}
  push('OTHER SECURED DEBT (Student Loans)')
  push('Monthly Payment', n(osd.monthly_payment), 'Final Payment Date', osd.final_payment_date||'', 'Remaining Balance', n(osd.remaining_balance))
  push('')

  // IRS/State liability snapshot
  push('IRS / STATE LIABILITY SNAPSHOT')
  push('IRS Personal Liability (1040)', n(profile.irs_personal_liability))
  push('IRS Civil Penalty Liability', n(profile.irs_civil_penalty_liability))
  push('IRS Business 1120s Liability', n(profile.irs_business_1120s_liability))
  push('IRS Business 941 Liability', n(profile.irs_business_941_liability))
  push('IRS Business 940 Liability', n(profile.irs_business_940_liability))
  push('State Personal Liability', n(profile.state_personal_liability))
  push('Recent IRS Notices', profile.recent_irs_notices||'')
  push('')

  // Resolution
  push('RESOLUTION PLAN')
  push('Resolution ETA', profile.resolution_eta||'')
  push('Proposed Resolution', profile.proposed_resolution||'')
  push('Total Recommended Fee', n(profile.total_recommended_fee))
  push('Tax Prep Fee Only', n(profile.tax_prep_fee_only))
  push('Notes', profile.notes||'')

  return rows
}

function buildIE(profile, client, totalHousehold, income, exp) {
  const rows = []
  const push = (...r) => rows.push(r)

  push("Client Name (Primary Taxpayer)", client?.name||'', 'SSN', client?.ssn||'')
  push('# Under 65', profile.household_under_65||0, '# Over 65', profile.household_over_65||0, 'Total Household Size', totalHousehold)
  push('')

  push('INCOME', 'Source', 'Gross Monthly', 'Taxes Withheld')
  push('Wages (Taxpayer)', '', income.wagesT1+income.wagesT2, income.taxesT1+income.taxesT2)
  push('Wages (Spouse)', '', income.wagesS1+income.wagesS2, income.taxesS1+income.taxesS2)
  push('Net Business Income', '', income.netBizIncome, income.seTax)
  push('K-1 Distributions', '', income.k1, '')
  push('Net Rental Income', '', income.rentalIncome, '')
  push('Other Income', '', income.otherIncome, '')
  push('Gross Monthly Income', '', income.grossIncomeTotal, '')
  push('Total Taxes Withheld (incl. SE Tax)', '', '', income.taxesTotal)
  push('Net Monthly Income', '', income.netMonthlyIncome, '')
  push('')

  const e = profile.expenses||{}
  const re0 = profile.real_estate?.[0]||{}
  push('MONTHLY LIVING EXPENSES', 'Actual', 'National Standard')
  push('Food, Clothing and Misc.', exp.foodClothingActual, exp.foodClothingStd)
  push('')
  push('Housing & Utilities')
  push('1st Mortgage Payment', n(re0.mortgage_1))
  push('2nd Mortgage Payment', n(re0.mortgage_2))
  push("Homeowner's Insurance", n(e.homeowners_insurance))
  push('Property Taxes', n(e.property_taxes))
  push('HOA Dues', n(e.hoa_dues))
  push('Rent Payment', n(e.rent))
  push("Renter's Insurance", n(e.renters_insurance))
  push('Electricity', n(e.electricity))
  push('Water/Sewer/Trash', n(e.water_sewer_trash))
  push('Cell Phone', n(e.cell_phone))
  push('Internet', n(e.internet))
  push('Cable/Satellite TV', n(e.cable))
  push('Pest Control', n(e.pest_control))
  push('Lawn', n(e.lawn))
  push('Maintenance/Repairs', n(e.maintenance))
  push('Housing & Utilities Subtotal', exp.housing, exp.housingStd)
  push('')
  push('Vehicle')
  push('Public Transportation', n(e.public_transportation), 217)
  push('Vehicle Payment 1st', exp.vehicle1Payment, 588)
  push('Vehicle Payment 2nd', exp.vehicle2Payment, 588)
  push('Car Misc (Operating Expenses)', n(e.car_misc))
  push('Vehicle Subtotal', exp.vehicleTotal)
  push('')
  push('Health Care')
  push('Major Medical Insurance', n(e.health_major_medical))
  push('Supplemental Medical / HSA', n(e.health_supplemental))
  push('Dental Insurance', n(e.health_dental))
  push('Vision Insurance', n(e.health_vision))
  push('Out of Pocket Expenses', exp.oopHealthActual, exp.oopHealthStd)
  push('Health Care Subtotal', exp.healthTotal)
  push('')
  push('Credit Cards / Lines of Credit')
  push('Credit Card Minimum Monthly Payments', exp.creditTotal)
  push('')
  push('Court Ordered')
  push('Child Support', n(e.child_support))
  push('Court Ordered Judgment', n(e.court_judgment))
  push('Court Ordered Subtotal', exp.courtTotal)
  push('')
  push('Child/Dependent Care (Day Care)', exp.childCare)
  push('')
  push('Other Secured Debt (Student Loans)', exp.otherSecured)
  push('')
  push('Life Insurance')
  push('Term Life Insurance', n(e.life_term))
  push('Whole Life Insurance', n(e.life_whole))
  push('Life Insurance Subtotal', exp.lifeTotal)
  push('')
  push('Taxes')
  push('Income Taxes Withheld from All Sources', income.taxesTotal)
  push('IRS Installment Agreement', n(e.irs_installment))
  push('State Installment Agreement', n(e.state_installment))
  push('Taxes Subtotal', exp.taxesSubtotal)
  push('')
  push('Total Monthly Living Expenses', exp.totalMonthlyExpenses)
  push('Total Net Disposable Income', exp.netDisposableIncome)
  push('')
  push('Home Amount Over National Standard', exp.homeOverNS)
  push('Vehicle 1 Amount Over Standard', exp.vehicle1OverNS)
  push('Vehicle 2 Amount Over Standard', exp.vehicle2OverNS)
  push('OIC NDI (NDI with National Standard Add-Backs)', exp.oicNDI)

  return rows
}

function buildAssetsEquity(profile, client, totalHousehold, assets) {
  const rows = []
  const push = (...r) => rows.push(r)

  push('Client Name (Primary Taxpayer)', client?.name||'', 'SSN', client?.ssn||'')
  push('# Under 65', profile.household_under_65||0, '# Over 65', profile.household_over_65||0)
  push('')

  push('ASSET & EQUITY', 'Description', 'Value', 'OIC Factor', 'Loan Against', 'OIC Amount')
  const typeMeta = {
    bank_account: ['Bank Accounts', 1.0, assets.bankTotal],
    life_insurance: ['Whole Life Policy', 0.7, assets.lifeTotal],
    retirement: ['Retirement Accounts', 0.7, assets.retTotal],
    business_asset: ['Business Assets', 1.0, assets.bizTotal],
    additional_asset: ['Additional Assets', 0.8, assets.addlTotal],
  }
  const allAssets = profile.assets||[]
  Object.entries(typeMeta).forEach(([type,[label,factor,totals]]) => {
    push(label)
    allAssets.filter(a=>a.type===type).forEach(a => {
      push('', a.description||'', n(a.value), factor, n(a.loan_against), Math.max(0, n(a.value)*factor - n(a.loan_against)))
    })
    push(`${label} OIC Amount`, '', totals.value, '', totals.loan, totals.amount)
    push('')
  })

  push('Vehicles (OIC Factor 0.8)')
  ;(profile.vehicles||[]).filter(v=>v.kbb_value).forEach(v => {
    push('', v.make_model||'', n(v.kbb_value), 0.8, n(v.remaining_balance), Math.max(0, n(v.kbb_value)*0.8 - n(v.remaining_balance)))
  })
  push('Vehicles OIC Amount', '', assets.vehicleTotal.value, '', assets.vehicleTotal.loan, assets.vehicleTotal.amount)
  push('')

  push('Real Estate (OIC Factor 0.8)')
  ;(profile.real_estate||[]).filter(p=>p.zillow_value).forEach(p => {
    push('', p.address||'', n(p.zillow_value), 0.8, n(p.mortgage_balance), Math.max(0, n(p.zillow_value)*0.8 - n(p.mortgage_balance)))
  })
  push('Real Estate OIC Amount', '', assets.reTotal.value, '', assets.reTotal.loan, assets.reTotal.amount)
  push('')

  push('Cash on Hand', '', n(profile.cash_on_hand))
  push('')

  push('CREDIT CARDS / LINES OF CREDIT', 'Name', 'Balance', 'Limit', 'Min Payment')
  ;(profile.credit_cards||[]).forEach(c => push('', c.name||'', n(c.balance), n(c.limit), n(c.min_payment)))
  push('Total', '', exp_cc(profile))
  push('')

  push('TOTAL ASSET VALUE', '', assets.grandTotal.value)
  push('TOTAL LOANS AGAINST ASSETS', '', assets.grandTotal.loan)
  push('TOTAL OIC ASSET EQUITY', '', assets.grandTotal.amount)

  return rows
}
function exp_cc(profile){ return (profile.credit_cards||[]).reduce((s,c)=>s+n(c.balance),0) }

function buildOIC(profile, totalHousehold, exp, assets) {
  const rows = []
  const push = (...r) => rows.push(r)

  const futureIncome12 = Math.max(0, exp.oicNDI) * 12
  const futureIncome24 = Math.max(0, exp.oicNDI) * 24
  const assetEquity = assets.grandTotal.amount
  const oic12 = futureIncome12 + assetEquity
  const oicLump = futureIncome12 + assetEquity
  const oic24 = futureIncome24 + assetEquity
  const downPayment12 = oic12/12, downPaymentLump = oicLump/5, downPayment24 = oic24/24
  const payment12 = (oic12-downPayment12)/11, paymentLump = (oicLump-downPaymentLump)/5, payment24 = (oic24-downPayment24)/23

  push('', '12-Month Offer', 'Lump Sum Offer', '24-Month Offer')
  push('Future Income', futureIncome12, futureIncome12, futureIncome24)
  push('Asset Equity', assetEquity, assetEquity, assetEquity)
  push('OIC Amount', oic12, oicLump, oic24)
  push('Down Payment', downPayment12, downPaymentLump, downPayment24)
  push('Remaining Payments', payment12, paymentLump, payment24)
  push('')
  push('Net Disposable Income (Monthly)', exp.oicNDI)
  push('Total Asset Equity', assetEquity)

  return rows
}

const PNL_DEDUCTION_LABELS = {
  advertising:'Advertising', car_truck:'Car & Truck Expense', commissions_fees:'Commissions and Fees',
  contract_labor:'Contract Labor', depletion:'Depletion', depreciation:'Depreciation from Form 4562',
  employee_benefits:'Employee Benefit Programs', insurance:'Insurance', interest:'Interest',
  legal_professional:'Legal and Professional', office_expense:'Office Expense',
  pension_profit:'Pension, Profit-Sharing, etc.', rent_lease:'Rent or Lease',
  repairs_maintenance:'Repairs and Maintenance', supplies:'Supplies', taxes_licenses:'Taxes and Licenses',
  travel_meals:'Travel, Meals, Entertainment', utilities:'Utilities', wages:'Wages',
  internet:'Internet', cell_phone:'Cell Phone', fuel:'Fuel',
}

function buildPnL(profile) {
  const rows = []
  const push = (...r) => rows.push(r)
  const base = profile.pl_base_year || {}
  const income = base.income || {}
  const deductions = base.deductions || {}
  const missingYears = profile.pl_missing_years || []

  const grossReceipts = n(income.gross_receipts)
  const returns = n(income.returns_allowances)
  const totalReceipts = grossReceipts - returns
  const cogs = n(income.cogs)
  const grossProfit = totalReceipts - cogs
  const otherIncome = n(income.other_income)
  const grossIncome = grossProfit + otherIncome
  const totalDeductions = Object.keys(PNL_DEDUCTION_LABELS).reduce((s,k)=>s+n(deductions[k]),0)
  const netProfit = grossIncome - totalDeductions

  push('PROFIT AND LOSS', `Base Year: ${base.year||''}`)
  push('')
  push('Income', 'Yearly', 'Monthly Avg.')
  push('Gross Receipts', grossReceipts, grossReceipts/12)
  push('Returns and Allowances', returns, returns/12)
  push('Total Receipts', totalReceipts, totalReceipts/12)
  push('Cost of Goods Sold', cogs, cogs/12)
  push('Gross Profit', grossProfit, grossProfit/12)
  push('Other Income', otherIncome, otherIncome/12)
  push('Gross Income', grossIncome, grossIncome/12)
  push('')
  push('Deductions', 'Yearly', 'Monthly Avg.')
  Object.entries(PNL_DEDUCTION_LABELS).forEach(([key,label]) => {
    push(label, n(deductions[key]), n(deductions[key])/12)
  })
  push('Total Expenses', totalDeductions, totalDeductions/12)
  push('')
  push('Net Profit', netProfit, netProfit/12)
  push('')

  if (missingYears.length) {
    push('MISSING YEARS (Allocated from Base Year)')
    push('Tax Year', 'Declared Gross Income', 'Ratio to Base', 'Allocated Total Expenses', 'Allocated Net Profit')
    missingYears.forEach(my => {
      const declaredGross = n(my.gross_income)
      const ratio = grossIncome !== 0 ? declaredGross / grossIncome : 0
      const allocExpenses = totalDeductions * ratio
      const allocNetProfit = declaredGross - allocExpenses
      push(my.year||'', declaredGross, ratio, allocExpenses, allocNetProfit)
    })
  }

  return rows
}

function buildComplianceSheet(formType, records, label, isQuarterly) {
  const rows = []
  const push = (...r) => rows.push(r)
  push(label.toUpperCase())
  push('')
  if (isQuarterly) {
    push('Tax Year', 'Quarter', 'Filed Status', 'Amount', 'Credits/Payments', 'Deposits', 'Lien', 'Assessment Date', 'CSED')
  } else {
    push('Tax Year', 'Filed Status', 'Amount', 'Credits', 'Lien', 'Assessment Date', 'CSED')
  }
  const sorted = [...records].sort((a,b) => (a.tax_year-b.tax_year) || ((a.quarter||0)-(b.quarter||0)))
  sorted.forEach(r => {
    if (isQuarterly) {
      push(r.tax_year, r.quarter||'', r.filed_status||'', n(r.amount), n(r.credits), n(r.deposit), r.lien||'', r.assessment_date||'', r.csed||'')
    } else {
      push(r.tax_year, r.filed_status||'', n(r.amount), n(r.credits), r.lien||'', r.assessment_date||'', r.csed||'')
    }
  })
  push('')
  const totalAmount = records.reduce((s,r)=>s+n(r.amount),0)
  const totalCredits = records.reduce((s,r)=>s+n(r.credits),0)
  push('Total', '', totalAmount, totalCredits)
  return rows
}

function build433F(profile, client, totalHousehold, income, exp, assets) {
  const rows = []
  const push = (...r) => rows.push(r)
  const extra = profile.f433_extra || {}
  const deps = client?.dependents ? (typeof client.dependents==='string' ? JSON.parse(client.dependents||'[]') : client.dependents) : []
  const re0 = profile.real_estate?.[0]||{}
  const vehicles = (profile.vehicles||[]).filter(v=>v.make_model)

  push('FORM 433-F — COLLECTION INFORMATION STATEMENT (SUMMARY)')
  push('')
  push('Client Name', client?.name||'', 'SSN', client?.ssn||'', 'DOB', profile.dob||'')
  push('Address', client?.street||'', 'County', profile.county||'')
  push('Filing Status', profile.filing_status||'', 'Phone', client?.phone||'')
  push('')

  push('DEPENDENTS', 'Relationship', 'DOB')
  deps.forEach(d => push(d.name||'', d.relationship||'', d.dob||''))
  push('Everyone Claimed Had Health Ins. All 12 Months?', extra.health_insurance_12mo||'', 'If No, # Months', extra.health_insurance_months||'')
  push('Total Household Size', totalHousehold)
  push('')

  push('BUSINESS')
  push('Business Name', profile.business_1?.name||'', 'EIN', extra.business_ein||profile.business_1?.ein||'')
  push('Type of Business', extra.business_type||'', '# Employees (Not Counting Owner)', extra.num_employees||profile.business_1?.num_employees||'')
  push('')

  push('BANK ACCOUNTS & ASSETS')
  push('Total Bank Account Value', assets.bankTotal.value)
  push('Cash on Hand', n(profile.cash_on_hand))
  push('Total OIC Asset Equity', assets.grandTotal.amount)
  push('')

  push('REAL ESTATE (Primary Residence)')
  push('Address', re0.address||'')
  push('Monthly Mortgage Expense', n(re0.mortgage_1)+n(re0.mortgage_2))
  push('Purchase Date / Amount', re0.purchase_year||'', n(re0.purchase_amount))
  push('Refinance Date / Amount', re0.refi_year||'', n(re0.refi_amount))
  push('Value of Home (Zillow)', n(re0.zillow_value))
  push('Length of Mortgage', re0.mortgage_length||'')
  push('Balance of Mortgage', n(re0.mortgage_balance))
  push('')

  push('VEHICLES')
  vehicles.forEach((v,i) => {
    push(`Vehicle ${i+1}`, v.make_model||'', v.year||'')
    push('Purchase', v.purchase_date||'', n(v.purchase_amount))
    push('Monthly Payment / Final Payment Date', n(v.monthly_payment), v.final_payment_date||'')
    push('Mileage', n(v.mileage))
    push('Current Value (KBB) / Remaining Balance', n(v.kbb_value), n(v.remaining_balance))
  })
  push('')

  push('CREDIT CARDS / UNSECURED DEBT')
  push('Total Minimum Monthly Payments', exp.ccTotal)
  push('')

  push('EMPLOYMENT & INCOME')
  push('Employer (Taxpayer)', profile.employment_taxpayer_1?.employer||'')
  push('Length of Time at Employer', profile.employment_taxpayer_1?.length||'')
  push('Net Income from Business', n(profile.business_1?.net_income))
  push('Pay Frequency / Gross Pay', profile.employment_taxpayer_1?.pay_frequency||'', n(profile.employment_taxpayer_1?.gross_monthly_salary))
  push('Federal Taxes Withheld', n(profile.employment_taxpayer_1?.fed_withheld))
  push('State Taxes Withheld', n(profile.employment_taxpayer_1?.state_withheld))
  push('Spouse Employer', profile.employment_spouse_1?.employer||'')
  push('Spouse Length of Time at Employer', profile.employment_spouse_1?.length||'')
  push('Spouse Pay Frequency / Gross Pay', profile.employment_spouse_1?.pay_frequency||'', n(profile.employment_spouse_1?.gross_monthly_salary))
  push('Spouse Federal Taxes Withheld', n(profile.employment_spouse_1?.fed_withheld))
  push('Spouse State Taxes Withheld', n(profile.employment_spouse_1?.state_withheld))
  push('')

  push('OTHER INCOME SOURCES')
  push('Net Rental Income', income.rentalIncome)
  push('K-1 Distributions', income.k1)
  push('Other Income', income.otherIncome)
  push('Total Gross Monthly Income', income.grossIncomeTotal)
  push('')

  push('MONTHLY EXPENSES')
  push('Food, Clothing and Misc.', exp.foodClothingActual)
  push('Housing & Utilities Total', exp.housing)
  push('Vehicle Total', exp.vehicleTotal)
  push('Health Care Total', exp.healthTotal)
  push('Credit Card Minimum Payments', exp.creditTotal)
  push('Child/Dependent Care', exp.childCare)
  push('Court Ordered', exp.courtTotal)
  push('Other Secured Debt', exp.otherSecured)
  push('Life Insurance Total', exp.lifeTotal)
  push('Taxes (Withholding + Installments)', exp.taxesSubtotal)
  push('Total Monthly Expenses', exp.totalMonthlyExpenses)
  push('Net Disposable Income', exp.netDisposableIncome)
  push('')

  push('ADDITIONAL 433-F FIELDS')
  push('Union Dues (Monthly)', n(extra.union_dues))
  push('Court Ordered Alimony (Monthly)', n(extra.court_ordered_alimony))
  push('Other Expense — Specify 1', extra.other_expense_specify_1||'')
  push('Other Expense — Specify 2', extra.other_expense_specify_2||'')
  push('Other Expense — Specify 3', extra.other_expense_specify_3||'')
  push('Other Expense — Specify 4', extra.other_expense_specify_4||'')

  return rows
}

// ─── Main export entry point ───────────────────────────────────────────────
export function exportFinancialProfileToExcel(profile, client, complianceRecords) {
  const totalHousehold = n(profile.household_under_65) + n(profile.household_over_65)
  const income = calcIncome(profile)
  const exp = calcExpenses(profile, totalHousehold)
  const assets = calcAssets(profile)

  const wb = XLSX.utils.book_new()

  const addSheet = (name, rows) => {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    // reasonable default column widths
    ws['!cols'] = Array.from({length: 12}, () => ({ wch: 22 }))
    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  addSheet('TO Worksheet', buildToWorksheet(profile, client, totalHousehold))
  addSheet('I&E', buildIE(profile, client, totalHousehold, income, exp))
  addSheet('Assets&Equity', buildAssetsEquity(profile, client, totalHousehold, assets))
  addSheet('OIC Calculator', buildOIC(profile, totalHousehold, exp, assets))
  addSheet('P&L', buildPnL(profile))

  const recs = complianceRecords || []
  addSheet('Pers Fed Tax Prac', buildComplianceSheet('1040', recs.filter(r=>r.form_type==='1040'), 'Personal Federal (1040)', false))
  addSheet('Pers State Tax Prac', buildComplianceSheet('STATE', recs.filter(r=>r.form_type==='STATE'), 'Personal State', false))
  addSheet('CP Fed Tax Prac', buildComplianceSheet('CP', recs.filter(r=>r.form_type==='CP'), 'Business CP (Federal)', true))
  addSheet('Biz 940 Tax Prac Sheet', buildComplianceSheet('940', recs.filter(r=>r.form_type==='940'), 'Business 940 (FUTA)', false))
  addSheet('Biz 941 Tax Prac Sheet', buildComplianceSheet('941', recs.filter(r=>r.form_type==='941'), 'Business 941 (Payroll)', true))
  addSheet('Biz 1120s Tax Prac Sheet', buildComplianceSheet('1120S', recs.filter(r=>r.form_type==='1120S'), 'Business 1120-S', false))

  addSheet('433F', build433F(profile, client, totalHousehold, income, exp, assets))

  const safeName = (client?.name || 'client').replace(/[^a-z0-9]+/gi, '_')
  XLSX.writeFile(wb, `${safeName}_Financial_Profile.xlsx`)
}
