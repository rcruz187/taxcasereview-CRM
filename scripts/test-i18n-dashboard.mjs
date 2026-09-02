import assert from 'node:assert/strict'
import { translateText } from '../src/lib/i18n.js'

const cases = [
  ['Dashboard', 'Panel'],
  ['Active Cases', 'Casos activos'],
  ['Open Leads', 'Prospectos abiertos'],
  ['MTD 1st Trades', '1ros cobros del mes'],
  ['MTD 2nd Trades', '2dos cobros del mes'],
  ['AR Outstanding', 'Cuentas por cobrar pendientes'],
  ['Unpaid Invoices', 'Facturas sin pagar'],
  ['Open Tasks', 'Tareas abiertas'],
  ['Upcoming DL', 'Próximos vencimientos'],
  ['Recent Cases', 'Casos recientes'],
  ['Recent Leads', 'Prospectos recientes'],
  ['Quick Add', 'Agregar rápido'],
  ['Upcoming Deadlines', 'Próximos vencimientos'],
  ['Taxpayer Advocate Service', 'Servicio del Defensor del Contribuyente'],
  ['Latest updates from TAS', 'Últimas actualizaciones de TAS'],
  ['News & updates', 'Noticias y actualizaciones'],
  ['Good morning, Rommel', 'Buenos días, Rommel'],
  ['0 total', '0 en total'],
  ['0 overdue', '0 vencidas'],
  ['0 unpaid', '0 sin pagar'],
]

for (const [english, spanish] of cases) {
  assert.equal(translateText(english, 'es'), spanish, `${english} should translate to ${spanish}`)
}

console.log(`dashboard Spanish contract PASS (${cases.length} assertions)`)
