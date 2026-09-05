import fs from 'node:fs'

const bridge = fs.readFileSync('src/components/GlobalUiBridge.jsx','utf8')
const i18n = fs.readFileSync('src/lib/i18n.js','utf8')
const dash = fs.readFileSync('src/pages/Dashboard.jsx','utf8')

const requiredTranslations = [
  "'Active Cases': 'Casos activos'",
  "'Open Tasks': 'Tareas abiertas'",
  "'IRS Deadlines': 'Vencimientos del IRS'",
  "'Recent Leads': 'Prospectos recientes'",
  "'Daily Hint': 'Consejo diario'",
  "'Tax Resolution': 'Resolución tributaria'",
  "'Active': 'Activo'",
  "'Normal': 'Normal'",
]

for (const needle of requiredTranslations) {
  if (!i18n.includes(needle)) throw new Error('Missing dashboard translation contract: ' + needle)
}

if (!bridge.includes("value.endsWith(from)")) throw new Error('Emoji/prefix-aware dashboard translation guard missing')
if (!bridge.includes("const arrow = value.match")) throw new Error('Arrow-suffixed dashboard translation guard missing')
if (!bridge.includes("const ES = { ...EN_ES, ...ES_LOCAL }")) throw new Error('Live bridge is no longer using canonical EN_ES dictionary')

if (!dash.includes("whiteSpace: 'nowrap'")) throw new Error('Dashboard stat values are allowed to wrap again')
if (!dash.includes("gridTemplateColumns: 'repeat(5, minmax(0, 1fr))'")) throw new Error('Dashboard stat grid lost minmax(0,1fr) hardening')

console.log('Tax Case dashboard localization/format contract PASS')
