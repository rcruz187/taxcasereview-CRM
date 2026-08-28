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

async function loadTemplateBytes(rawPath) {
  const raw = String(rawPath || '')
  if (/^https?:\/\//i.test(raw)) {
    const res = await fetch(raw, { redirect:'follow', headers:{'User-Agent':'TaxRes-Forms-Audit/1.0'} })
    if (!res.ok) throw new Error(`remote template HTTP ${res.status}`)
    const type=(res.headers.get('content-type')||'').toLowerCase()
    const bytes=new Uint8Array(await res.arrayBuffer())
    if (!type.includes('pdf') && !(bytes[0]===0x25 && bytes[1]===0x50 && bytes[2]===0x44 && bytes[3]===0x46)) throw new Error(`remote template is not a PDF (${type||'unknown content-type'})`)
    return bytes
  }
  const rel = raw.replace(/^\//,'')
  const candidates = [
    path.join(root,'public',rel),
    path.join(root,'public','templates',path.basename(rel)),
    path.join(root,'public','irs-forms',path.basename(rel)),
    path.join(root,rel),
  ]
  const file = candidates.find(fs.existsSync)
  if (!file) throw new Error(`missing local template ${raw}`)
  return fs.readFileSync(file)
}

const irsSrc = read('src/lib/irsFormUtils.js')
const fieldMaps = evalLiteral(captureObject(irsSrc,'export const FIELD_MAPS'))
const templatePaths = evalLiteral(captureObject(irsSrc,'export const TEMPLATE_PATHS'))

let hardFailures=[]
console.log('=== IRS TEMPLATE / FIELD AUDIT ===')
for (const [type,map] of Object.entries(fieldMaps)) {
  const relRaw = templatePaths[type]
  if (!relRaw) { hardFailures.push(`IRS ${type}: no TEMPLATE_PATHS entry`); continue }
  try {
    const bytes = await loadTemplateBytes(relRaw)
    const pdf=await PDFDocument.load(bytes,{ignoreEncryption:true})
    const actual=pdf.getForm().getFields().map(f=>f.getName())
    const names=new Set(actual)
    const mapped=Object.entries(map).filter(([k,v])=>k!=='idType' && typeof v==='string')
    const missing=mapped.filter(([,v])=>!names.has(v))
    console.log(`${type}: template=OK fields=${names.size} mapped=${mapped.length} missing=${missing.length}`)
    for (const [k,v] of missing) console.log(`  MISSING ${k} -> ${v}`)
    if (missing.length) {
      console.log(`  ACTUAL_FIELDS ${JSON.stringify(actual)}`)
      hardFailures.push(`IRS ${type}: ${missing.length} mapped PDF fields missing`)
    }
  } catch(e) { hardFailures.push(`IRS ${type}: ${e.message}`) }
}

console.log('\n=== STATE FORM ASSET / PREFILL AUDIT ===')
const stateSrc=read('src/pages/StateForms.jsx')
let stateArrayText=captureArray(stateSrc,'const STATE_FORMS')
stateArrayText=stateArrayText.replace(/`\$\{BASE\}([^`]*)`/g,(_,p)=>JSON.stringify(p))
const stateForms=evalLiteral(stateArrayText)
console.log(`registered state forms: ${stateForms.length}`)
let stateNoFields=0, remoteStateForms=0
for (const f of stateForms) {
  try {
    const remote=/^https?:\/\//i.test(String(f.url))
    const bytes=await loadTemplateBytes(f.url)
    if(remote) remoteStateForms++
    const pdf=await PDFDocument.load(bytes,{ignoreEncryption:true})
    let count=0
    try { count=pdf.getForm().getFields().length } catch {}
    if (!count) stateNoFields++
    console.log(`${f.num}: asset=OK source=${remote?'official-remote':'local'} pages=${pdf.getPageCount()} acroFields=${count}`)
  } catch(e) { hardFailures.push(`STATE ${f.num}: ${e.message}`); console.log(`${f.num}: ASSET FAILURE ${e.message}`) }
}

const stateSignals = {
  createsEsign: /from\(['\"]esigns['\"]\)|\.from\(['\"]esigns['\"]\)/.test(stateSrc),
  attachesStatePdf: /pdf_attachments/.test(stateSrc),
  selectedClientData: /selectedClient/.test(stateSrc),
  nonFloridaAutofillGuard: /form\.state !== ['\"]FL['\"]/.test(stateSrc),
  eSignUsesPrefilledBytes: /generateStatePOAWithCover\(selectedClient, rawBytes\)/.test(stateSrc),
  officialAlabama: /revenue\.alabama\.gov\/.+Form_2848A_rev918\.pdf/.test(stateSrc),
}
console.log('StateForms implementation signals:', JSON.stringify(stateSignals,null,2))
console.log(`state PDFs with zero AcroForm fields: ${stateNoFields}/${stateForms.length}`)
console.log(`official remote state PDFs: ${remoteStateForms}/${stateForms.length}`)
if (!stateSignals.nonFloridaAutofillGuard) hardFailures.push('STATE: unverified non-Florida autofill is not blocked')
if (!stateSignals.eSignUsesPrefilledBytes) hardFailures.push('STATE: verified e-sign path does not upload prefilled bytes')
if (!stateSignals.officialAlabama) hardFailures.push('STATE AL-2848A: official Alabama PDF is not wired')

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
  console.log('\nNo hard asset/IRS mapped-field/e-sign safety failures.')
}
