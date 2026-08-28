import fs from 'node:fs'
const p='src/pages/StateForms.jsx'
let s=fs.readFileSync(p,'utf8')
let changed=false

// Only Florida DR-835 currently has a field/coordinate mapping that has been
// verified against its exact official PDF. Never reuse those coordinates on a
// different state's form.
const dlAnchor=`  async function downloadPrefilledStatePOA(form) {\n    if (!selectedClient) { showToast('Select a client first'); return }`
const dlSafe=`  async function downloadPrefilledStatePOA(form) {\n    if (!selectedClient) { showToast('Select a client first'); return }\n    if (form.state !== 'FL') { showToast(\`Autofill for \${form.state} is disabled until that exact state form mapping is verified. Open the official PDF instead.\`); return }`
if(s.includes(dlAnchor)){s=s.replace(dlAnchor,dlSafe);changed=true}

const sendAnchor=`  async function sendStatePOA(form) {\n    if (!selectedClient) { showToast('Select a client first'); return }\n    if (!form) { showToast('No state form available for this client\\'s state'); return }`
const sendSafe=`  async function sendStatePOA(form) {\n    if (!selectedClient) { showToast('Select a client first'); return }\n    if (!form) { showToast('No state form available for this client\\'s state'); return }\n    if (form.state !== 'FL') { showToast(\`E-sign autofill for \${form.state} is disabled until that exact state form mapping is verified. This prevents sending client data in the wrong fields.\`); return }`
if(s.includes(sendAnchor)){s=s.replace(sendAnchor,sendSafe);changed=true}

// The source version may still upload the untouched PDF. For the verified
// Florida path, e-sign must upload the exact same prefilled artifact staff can
// preview/download.
const old=`      // Fetch the PDF bytes from the state form URL\n      const pdfRes = await fetch(form.url)\n      if (!pdfRes.ok) throw new Error('Could not load state form PDF')\n      const pdfBlob = await pdfRes.blob()\n\n      // Upload to Supabase storage\n      const safeName = (selectedClient.name || 'client').replace(/[^a-zA-Z0-9]+/g, '-')\n      const path = \`docs/\${safeName}/state-poa/\${form.state}_POA_\${Date.now()}.pdf\`\n      const { error: upErr } = await supabase.storage.from('documents')\n        .upload(path, pdfBlob, { upsert: true, contentType: 'application/pdf' })`
const neu=`      // Fetch the verified Florida PDF and run the exact same prefill generator\n      // used by the Download button. E-sign must never upload an untouched blank PDF.\n      const pdfRes = await fetch(form.url)\n      if (!pdfRes.ok) throw new Error('Could not load state form PDF')\n      const rawBytes = new Uint8Array(await pdfRes.arrayBuffer())\n      const { generateStatePOAWithCover } = await import('../lib/irsFormUtils')\n      const mergedBytes = await generateStatePOAWithCover(selectedClient, rawBytes)\n      const pdfBlob = new Blob([mergedBytes], { type: 'application/pdf' })\n\n      const safeName = (selectedClient.name || 'client').replace(/[^a-zA-Z0-9]+/g, '-')\n      const path = \`docs/\${safeName}/state-poa/\${form.state}_POA_\${Date.now()}.pdf\`\n      const { error: upErr } = await supabase.storage.from('documents')\n        .upload(path, pdfBlob, { upsert: true, contentType: 'application/pdf' })`
if(s.includes(old)){s=s.replace(old,neu);changed=true}

if(!s.includes("if (form.state !== 'FL')")) throw new Error('State form safety guard missing')
if(!s.includes("const mergedBytes = await generateStatePOAWithCover(selectedClient, rawBytes)")) throw new Error('Verified Florida e-sign prefill guard missing')
if(changed) fs.writeFileSync(p,s)
console.log(`State e-sign safety ${changed?'patched':'already current'}: FL verified path only; unverified state autofill blocked.`)
