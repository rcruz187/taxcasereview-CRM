import fs from 'node:fs'
const p='src/pages/StateForms.jsx'
let s=fs.readFileSync(p,'utf8')
let changed=false
const old=`      // Fetch the PDF bytes from the state form URL
      const pdfRes = await fetch(form.url)
      if (!pdfRes.ok) throw new Error('Could not load state form PDF')
      const pdfBlob = await pdfRes.blob()

      // Upload to Supabase storage
      const safeName = (selectedClient.name || 'client').replace(/[^a-zA-Z0-9]+/g, '-')
      const path = \`docs/\${safeName}/state-poa/\${form.state}_POA_\${Date.now()}.pdf\`
      const { error: upErr } = await supabase.storage.from('documents')
        .upload(path, pdfBlob, { upsert: true, contentType: 'application/pdf' })`
const neu=`      // Fetch the PDF bytes and run the exact same prefill generator used by
      // the Download button. E-sign must never upload the untouched blank state PDF.
      const pdfRes = await fetch(form.url)
      if (!pdfRes.ok) throw new Error('Could not load state form PDF')
      const rawBytes = new Uint8Array(await pdfRes.arrayBuffer())
      const { generateStatePOAWithCover } = await import('../lib/irsFormUtils')
      const mergedBytes = await generateStatePOAWithCover(selectedClient, rawBytes)
      const pdfBlob = new Blob([mergedBytes], { type: 'application/pdf' })

      // Upload the same prefilled artifact the staff member can preview/download.
      const safeName = (selectedClient.name || 'client').replace(/[^a-zA-Z0-9]+/g, '-')
      const path = \`docs/\${safeName}/state-poa/\${form.state}_POA_\${Date.now()}.pdf\`
      const { error: upErr } = await supabase.storage.from('documents')
        .upload(path, pdfBlob, { upsert: true, contentType: 'application/pdf' })`
if(s.includes(old)){s=s.replace(old,neu);changed=true}
if(!s.includes("const mergedBytes = await generateStatePOAWithCover(selectedClient, rawBytes)")) throw new Error('State e-sign prefill guard missing')
if(changed) fs.writeFileSync(p,s)
console.log(`State e-sign prefill ${changed?'patched':'already current'}.`)
