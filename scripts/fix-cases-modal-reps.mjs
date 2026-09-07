import fs from 'node:fs'

const path = 'src/pages/Cases.jsx'
const before = fs.readFileSync(path, 'utf8')
const broken = "{employees.map(e=><option key={e.id||e.name} value={e.name}>{e.name}</option>)}"
const fixed = "{reps.map(r=><option key={r} value={r}>{r}</option>)}"

if (!before.includes(broken) && !before.includes(fixed)) {
  throw new Error('Cases modal rep selector anchor not found')
}

const after = before.replace(broken, fixed)
if (after !== before) {
  fs.writeFileSync(path, after)
  console.log('cases: modal Para selector now uses scoped reps prop')
} else {
  console.log('cases: modal Para selector already scoped correctly')
}

const verify = fs.readFileSync(path, 'utf8')
const modalStart = verify.indexOf('function CaseModal(')
if (modalStart < 0) throw new Error('CaseModal missing')
const modalSource = verify.slice(modalStart)
if (/\bemployees\b/.test(modalSource)) throw new Error('CaseModal still references out-of-scope employees')
if (!modalSource.includes('{reps.map(')) throw new Error('CaseModal reps selector missing')
console.log('cases: modal scope verification passed')
