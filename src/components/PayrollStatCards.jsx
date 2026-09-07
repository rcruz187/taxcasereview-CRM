import { STAT_CARD_DEFS, periodStats } from '../lib/payrollUtils'

// Colored stat-card row shared by TimeClock + Payroll pages.
// Renders: Employees / Total Hrs / Overtime Hrs / Gross Payroll / Net Payroll / Employer Taxes
export default function PayrollStatCards({ employees, timeEntries }) {
  const stats = periodStats(employees, timeEntries)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
      {STAT_CARD_DEFS.map(({ key, label, color, fmt }) => (
        <div key={key} className="card" style={{ padding: '12px 14px', borderTop: `3px solid ${color}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
            {label}
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color }}>
            {fmt(stats[key])}
          </div>
        </div>
      ))}
    </div>
  )
}
