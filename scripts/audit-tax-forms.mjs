import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'

const root = process.cwd()
const read = p => fs.readFileSync(path.join(root,p),'utf8')

function captureObject(src, marker) {
  const i = src.indexOf(marker)
  if (i < 0) throw new Error(`Missing marker ${marker}`)
  const eq = src.indexOf('=', i)
  const start = src.indexOf('{', eq)
  let depth=0, quote=null, esc=false
  for (let j=start;j<src.length;j++) {
    const c=src[j]
    if (quote) {
      if (esc) esc=false
      else if (c==='\\') esc=true
      else if (c===quote) quote=null
      continue
    }
    if (c==='"'||c==="'"||c==='`') { quote=c; continue }
    if (c==='{') depth++
    if (c==='}') { depth--; if (depth===0) return src.slice(start,j+1) }
  }
  throw new Error(`Unclosed object ${marker}`)
}
function captureArray(src, marker) {
  const i = src.indexOf(marker)
  if (i < 0) throw new Error(`Missing marker ${marker}`)
  const eq = src.indexOf('=', i)
  const start = src.indexOf('[', eq)
  let depth=0, quote=null, esc=false
  for (let j=start;j<src.length;j++) {
    const c=src[j]
    if (quote) {
      if (esc) esc=false
      else if (c==='\\') esc=true
      else if (c===quote) quote=null
      continue
    }
    if (c==='"'||c==="'"||c==='`') { quote=c; continue }
    if (c==='[') depth++
    if (c===']') { depth--; if (depth===0) return src.slice(start,j+1) }
  }
  throw new Error(`Unclosed array ${marker}`)
}
const evalLiteral = txt => Function(`"use strict";return (${txt})`)()

const irsSrc = read('src/lib/irsFormUtils.js')
const fieldMaps = evalLiteral(captureObject(irsSrc,'export const FIELD_MAPS'))
const templatePaths = evalLiteral(captureObject(irsSrc,'export const TEMPLATE_PATHS'))

let hardFailures=[]
console.log('=== IRS TEMPLATE / FIELD AUDIT ===')
for (const [type,map] of Object.entries(fieldMaps)) {
  const relRaw = templatePaths[type]
  if (!relRaw) { hardFailures.push(`IRS ${type}: no TEMPLATE_PATHS entry`); continue }
  const rel = String(relRaw).replace(/^\//,'')
  const candidates=[path.join(root,'public',rel),path.join(root,rel)]
  const file=candidates.find(fs.existsSync)
  if (!file) { hardFailures.push(`IRS ${type}: missing template ${relRaw}`); continue }
  try {
    const pdf=await PDFDocument.load(fs.readFileSync(file),{ignoreEncryption:true})
    const names=new Set(pdf.getForm().getFields().map(f=>f.getName()))
    const mapped=Object.entries(map).filter(([k,v])=>k!=='idType' && typeof v==='string')
    const missing=mapped.filter(([,v])=>!names.has(v))
    console.log(`${type}: template=OK fields=${names.size} mapped=${mapped.length} missing=${missing.length}`)
    for (const [k,v] of missing) console.log(`  MISSING ${k} -> ${v}`)
    if (missing.length) hardFailures.push(`IRS ${type}: ${missing.length} mapped PDF fields missing`)
  } catch(e) { hardFailures.push(`IRS ${type}: PDF parse failed: ${e.message}`) }
}

console.log('\n=== STATE FORM ASSET / PREFILL AUDIT ===')
const stateSrc=read('src/pages/StateForms.jsx')
let stateArrayText=captureArray(stateSrc,'const STATE_FORMS')
stateArrayText=stateArrayText.replace(/`\$\{BASE\}([^`]*)`/g,(_,p)=>JSON.stringify(p))
const stateForms=evalLiteral(stateArrayText)
console.log(`registered state forms: ${stateForms.length}`)
let stateNoFields=0
for (const f of stateForms) {
  const rel=String(f.url).replace(/^\//,'')
  const file=path.join(root,'public',rel)
  if (!fs.existsSync(file)) { hardFailures.push(`STATE ${f.num}: missing ${f.url}`); console.log(`${f.num}: MISSING ASSET`); continue }
  try {
    const pdf=await PDFDocument.load(fs.readFileSync(file),{ignoreEncryption:true})
    let count=0
    try { count=pdf.getForm().getFields().length } catch {}
    if (!count) stateNoFields++
    console.log(`${f.num}: asset=OK pages=${pdf.getPageCount()} acroFields=${count}`)
  } catch(e) { hardFailures.push(`STATE ${f.num}: PDF parse failed: ${e.message}`) }
}

const stateSignals = {
  importsPdfLib: /from ['\"]pdf-lib['\"]/.test(stateSrc),
  usesPdfDocument: /PDFDocument/.test(stateSrc),
  writesPdfFields: /getTextField|getCheckBox|getDropdown|setText\s*\(/.test(stateSrc),
  createsEsign: /from\(['\"]esigns['\"]\)|\.from\(['\"]esigns['\"]\)/.test(stateSrc),
  attachesStatePdf: /pdf_attachments/.test(stateSrc),
  selectedClientData: /selectedClient/.test(stateSrc),
}
console.log('StateForms implementation signals:', JSON.stringify(stateSignals,null,2))
console.log(`state PDFs with zero AcroForm fields: ${stateNoFields}/${stateForms.length}`)

console.log('\n=== E-SIGN SIGNING PATH SIGNALS ===')
const signSrc=read('src/pages/SignPage.jsx')
for (const key of ['pdf_attachments','createSignedUrl','documents','signature','signed','certificate']) {
  console.log(`${key}: ${signSrc.includes(key) ? 'YES' : 'NO'}`)
}

if (hardFailures.length) {
  console.error('\nHARD FAILURES:')
  hardFailures.forEach(x=>console.error('- '+x))
  process.exitCode=1
} else {
  console.log('\nNo hard asset/IRS mapped-field failures.')
}

// This audit is intentionally permanent: any future template replacement must
// continue to match the field map used by the e-sign prefill flow.
