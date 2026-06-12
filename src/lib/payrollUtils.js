// Shared payroll/time math — used by TimeClock.jsx and Payroll.jsx
// Keeping this in one place so both pages always agree on hours/gross/tax math.

// Parse "4:29 PM" or "16:29" → minutes from midnight
export function parseTimeToMins(t) {
  if (!t) return null
  t = t.trim()
  const ampm = t.match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (ampm) {
    let h = parseInt(ampm[1]), m = parseInt(ampm[2])
    const p = ampm[3].toUpperCase()
    if (p === 'PM' && h !== 12) h += 12
    if (p === 'AM' && h === 12) h = 0
    return h * 60 + m
  }
  const plain = t.match(/^(\d+):(\d+)$/)
  if (plain) return parseInt(plain[1]) * 60 + parseInt(plain[2])
  return null
}

// Hours for one time entry, handling overnight shifts (clock-out after midnight)
export function hoursFromEntry(e) {
  if (e.hours && parseFloat(e.hours) > 0) return parseFloat(e.hours)
  const inM = parseTimeToMins(e.inTime), outM = parseTimeToMins(e.outTime)
  if (inM === null || outM === null) return 0
  let diffMins = outM - inM
  if (diffMins <= 0) diffMins += 24 * 60 // overnight shift: clock-out is next day
  return diffMins / 60
}

// Default tax rates — keep in one place
export const TAX_RATES = { fed: 0.22, state: 0.06, ss: 0.062, medicare: 0.0145 }

// Build per-employee payroll line items for a date range, including
// regular vs overtime split (>40h/week = OT at 1.5x)
export function buildLineItems(employees, timeEntries, periodStart, periodEnd) {
  return employees.map(emp => {
    const empEntries = timeEntries.filter(t => {
      if ((t.employee || '').trim().toLowerCase() !== (emp.name || '').trim().toLowerCase()) return false
      if (!t.date) return false
      if (periodStart && t.date < periodStart) return false
      if (periodEnd && t.date > periodEnd) return false
      return true
    })

    // Group hours by ISO week (week starting Sunday) to find OT (>40h/week)
    const byWeek = {}
    empEntries.forEach(t => {
      const d = new Date(t.date + 'T00:00:00')
      const weekStart = new Date(d)
      weekStart.setDate(d.getDate() - d.getDay())
      const key = weekStart.toISOString().slice(0, 10)
      byWeek[key] = (byWeek[key] || 0) + hoursFromEntry(t)
    })

    let regularHrs = 0, otHrs = 0
    Object.values(byWeek).forEach(wkHrs => {
      if (wkHrs > 40) { regularHrs += 40; otHrs += (wkHrs - 40) }
      else regularHrs += wkHrs
    })
    const hrs = regularHrs + otHrs

    const isHourly = emp.payType === 'Hourly'
    const rate = parseFloat(emp.hourlyRate || 0)
    const salary = parseFloat(emp.salary || 0)
    const regularPay = isHourly ? rate * regularHrs : (salary / 24) || 0
    const otPay = isHourly ? rate * 1.5 * otHrs : 0
    const gross = regularPay + otPay

    const fedTax = gross * TAX_RATES.fed
    const stateTax = gross * TAX_RATES.state
    const ss = gross * TAX_RATES.ss
    const medicare = gross * TAX_RATES.medicare
    const totalTaxes = fedTax + stateTax + ss + medicare
    const net = Math.max(0, gross - totalTaxes)

    // Employer-side match (SS + Medicare, employer pays equal share) — used for "Employer Taxes" stat
    const employerTaxes = ss + medicare

    return {
      name: emp.name, payType: emp.payType || 'Salary', rate,
      hours: hrs.toFixed(2),
      regularHours: regularHrs.toFixed(2), otHours: otHrs.toFixed(2),
      gross: gross.toFixed(2), fedTax: fedTax.toFixed(2),
      stateTax: stateTax.toFixed(2), ss: ss.toFixed(2),
      medicare: medicare.toFixed(2), totalTaxes: totalTaxes.toFixed(2),
      employerTaxes: employerTaxes.toFixed(2),
      net: net.toFixed(2), payMethod: emp.paymentMethod || 'Direct Deposit',
      entryCount: empEntries.length
    }
  })
}

// Current semi-monthly pay period (1st–15th, or 16th–end of month)
export function currentPeriod(d = new Date()) {
  const isFirstHalf = d.getDate() <= 15
  const start = new Date(d.getFullYear(), d.getMonth(), isFirstHalf ? 1 : 16)
  const end = new Date(d.getFullYear(), d.getMonth(), isFirstHalf ? 15 : new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())
  const fmtD = dt => dt.toISOString().slice(0, 10)
  const label = `${start.toLocaleString('default', { month: 'long' })} ${start.getDate()}–${end.getDate()}, ${d.getFullYear()}`
  return { start: fmtD(start), end: fmtD(end), label }
}

// Top-level payroll stat card values for the current pay period
export function periodStats(employees, timeEntries) {
  const { start, end } = currentPeriod()
  const lines = buildLineItems(employees, timeEntries, start, end)
  return {
    employees: employees.length,
    totalHrs: lines.reduce((s, l) => s + parseFloat(l.hours || 0), 0),
    otHrs: lines.reduce((s, l) => s + parseFloat(l.otHours || 0), 0),
    gross: lines.reduce((s, l) => s + parseFloat(l.gross || 0), 0),
    net: lines.reduce((s, l) => s + parseFloat(l.net || 0), 0),
    employerTaxes: lines.reduce((s, l) => s + parseFloat(l.employerTaxes || 0), 0),
    lines, periodStart: start, periodEnd: end,
  }
}

// Shared colored stat-card row (Employees / Total Hrs / OT Hrs / Gross / Net / Employer Taxes)
export const STAT_CARD_DEFS = [
  { key: 'employees',     label: 'EMPLOYEES',      color: '#3b82f6', fmt: v => v },
  { key: 'totalHrs',      label: 'TOTAL HRS',      color: '#22c55e', fmt: v => v.toFixed(1) + 'h' },
  { key: 'otHrs',         label: 'OVERTIME HRS',   color: '#f59e0b', fmt: v => v.toFixed(1) + 'h' },
  { key: 'gross',         label: 'GROSS PAYROLL',  color: '#8b5cf6', fmt: v => '$' + v.toFixed(2) },
  { key: 'net',           label: 'NET PAYROLL',    color: '#22c55e', fmt: v => '$' + v.toFixed(2) },
  { key: 'employerTaxes', label: 'EMPLOYER TAXES', color: '#ef4444', fmt: v => '$' + v.toFixed(2) },
]
