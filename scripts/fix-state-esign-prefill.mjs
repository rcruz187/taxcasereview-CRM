import fs from 'node:fs'
const p='src/pages/StateForms.jsx'
let s=fs.readFileSync(p,'utf8')
let changed=false

// Alabama's former local asset was missing. Keep the registry usable by pointing
// to the official Alabama Department of Revenue Form 2848A. Alabama remains
// manual-only until its exact PDF mapping is separately verified.
const oldAl="url: `${BASE}/state-forms/AL_POA.pdf`"
const newAl="url: 'https://www.revenue.alabama.gov/wp-content/uploads/2018/09/Form_2848A_rev918.pdf'"
if (s.includes(oldAl)) { s=s.replace(oldAl,newAl); changed=true }

// Only Florida DR-835 currently has a field/coordinate mapping that has been
// verified against its exact official PDF. Never reuse those coordinates on a
// different state's form.
function insertGuard(functionName, guard) {
  const start = s.indexOf(`  async function ${functionName}(form) {`)
  if (start < 0) throw new Error(`${functionName} function missing`)
  const nextFn = s.indexOf('\n  async function ', start + 10)
  const end = nextFn < 0 ? s.length : nextFn
  const block = s.slice(start, end)
  if (block.includes("form.state !== 'FL'")) return
  const selected = `    if (!selectedClient) { showToast('Select a client first'); return }`
  const pos = s.indexOf(selected, start)
  if (pos < 0 || pos >= end) throw new Error(`${functionName} selected-client guard missing`)
  const after = pos + selected.length
  s = s.slice(0, after) + `\n    ${guard}` + s.slice(after)
  changed=true
}

insertGuard('downloadPrefilledStatePOA', `if (form.state !== 'FL') { showToast(\`Autofill for \${form.state} is disabled until that exact state form mapping is verified. Open the official PDF instead.\`); return }`)
insertGuard('sendStatePOA', `if (form.state !== 'FL') { showToast(\`E-sign autofill for \${form.state} is disabled until that exact state form mapping is verified. This prevents sending client data in the wrong fields.\`); return }`)

// For the verified Florida path, e-sign must upload the exact same prefilled
// artifact staff can preview/download. Match the current fetch/upload sequence
// rather than depending on comments that may change over time.
const sendStart=s.indexOf('  async function sendStatePOA(form) {')
const sendEnd=s.indexOf('\n  async function ', sendStart+10)
const effectiveEnd=sendEnd<0?s.length:sendEnd
let block=s.slice(sendStart,effectiveEnd)
if(!block.includes('const mergedBytes = await generateStatePOAWithCover(selectedClient, rawBytes)')) {
  const old=`      const pdfRes = await fetch(form.url)\n      if (!pdfRes.ok) throw new Error('Could not load state form PDF')\n      const pdfBlob = await pdfRes.blob()`
  const neu=`      const pdfRes = await fetch(form.url)\n      if (!pdfRes.ok) throw new Error('Could not load state form PDF')\n      const rawBytes = new Uint8Array(await pdfRes.arrayBuffer())\n      const { generateStatePOAWithCover } = await import('../lib/irsFormUtils')\n      const mergedBytes = await generateStatePOAWithCover(selectedClient, rawBytes)\n      const pdfBlob = new Blob([mergedBytes], { type: 'application/pdf' })`
  if(!block.includes(old)) throw new Error('sendStatePOA PDF fetch/upload sequence missing')
  block=block.replace(old,neu)
  s=s.slice(0,sendStart)+block+s.slice(effectiveEnd)
  changed=true
}

// Validate each function independently; one guard elsewhere in the file must
// never satisfy this safety check accidentally.
for (const fn of ['downloadPrefilledStatePOA','sendStatePOA']) {
  const a=s.indexOf(`  async function ${fn}(form) {`)
  const b=s.indexOf('\n  async function ',a+10)
  const part=s.slice(a,b<0?s.length:b)
  if(!part.includes("form.state !== 'FL'")) throw new Error(`${fn} state form safety guard missing`)
}
if(!s.includes("const mergedBytes = await generateStatePOAWithCover(selectedClient, rawBytes)")) throw new Error('Verified Florida e-sign prefill guard missing')
if(!s.includes('https://www.revenue.alabama.gov/wp-content/uploads/2018/09/Form_2848A_rev918.pdf')) throw new Error('Official Alabama POA URL missing')
if(changed) fs.writeFileSync(p,s)
console.log(`State e-sign safety ${changed?'patched':'already current'}: FL verified path only; unverified state autofill blocked; Alabama official POA wired.`)
