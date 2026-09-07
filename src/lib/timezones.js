// ── Timezone display helpers ──
// Appointments are stored as Eastern wall time (the firm's clock). Visitors
// see slots converted to THEIR timezone, Calendly-style; the stored value
// never changes.

const ET = 'America/New_York'

export function visitorZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ET } catch { return ET }
}

export function zoneShort(zone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }).formatToParts(new Date())
    return parts.find(p => p.type === 'timeZoneName')?.value || zone
  } catch { return zone }
}

// UTC instant whose America/New_York wall clock equals dateStr + timeStr.
// Iterative offset correction handles EST/EDT transparently.
export function etInstant(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  const target = Date.UTC(y, m - 1, d, hh, mm)
  let t = target
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(t))
    const g = {}; parts.forEach(p => { g[p.type] = p.value })
    const wall = Date.UTC(+g.year, +g.month - 1, +g.day, (+g.hour) % 24, +g.minute)
    if (wall === target) break
    t += target - wall
  }
  return new Date(t)
}

// "10:30 AM" rendered in the given zone for an ET slot.
export function etLabelInZone(dateStr, timeStr, zone) {
  try {
    return etInstant(dateStr, timeStr).toLocaleTimeString('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' })
  } catch {
    const [h, mn] = timeStr.split(':').map(Number)
    return `${((h + 11) % 12) + 1}:${String(mn).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
  }
}
