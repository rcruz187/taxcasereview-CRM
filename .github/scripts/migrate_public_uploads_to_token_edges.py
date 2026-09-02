from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def replace_once(rel, old, new):
    p = ROOT / rel
    s = p.read_text()
    if new in s:
        print(f'{rel}: already patched')
        return
    if old not in s:
        raise SystemExit(f'{rel}: expected upload block not found')
    p.write_text(s.replace(old, new, 1))
    print(f'{rel}: patched')

portal_old = '''    try {
      const path = `docs/${client.name.replace(/\\s+/g, '-')}/${Date.now()}_${file.name}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: urlData } = await supabase.storage.from('documents').createSignedUrl(path, 94608000)
      const { error } = await supabase.rpc('portal_action_upload_document', {
        p_token: portalToken, p_file_name: file.name, p_doc_type: uploadFolder,
        p_file_url: urlData?.signedUrl || '', p_file_size: file.size,
      })
      if (error) throw error
      const { data } = await supabase.rpc('portal_get_data', { p_token: portalToken })
      setDocs(data?.documents || [])
      if (fileRef.current) fileRef.current.value = ''
'''
portal_new = '''    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(reader.error || new Error('Could not read file'))
        reader.onload = () => resolve(String(reader.result || ''))
        reader.readAsDataURL(file)
      })
      const fileBase64 = String(dataUrl).split(',')[1] || ''
      const { data, error } = await supabase.functions.invoke('portal-action', {
        body: {
          type: 'upload_document', token: portalToken,
          fileName: file.name, fileType: file.type || 'application/octet-stream',
          fileBase64, docType: uploadFolder,
        },
      })
      if (error || !data?.ok) throw new Error(data?.error || error?.message || 'Upload failed')
      setDocs(data.documents || [])
      if (fileRef.current) fileRef.current.value = ''
'''
replace_once('src/pages/ClientPortal.jsx', portal_old, portal_new)

org_old = '''    try {
      const path = `organizer-docs/${organizerId}/${Date.now()}_${file.name}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: urlData } = await supabase.storage.from('documents').createSignedUrl(path, 94608000)
      if (entryIdx !== null) {
        updateEntry(questionId, entryIdx, '_uploadUrl', urlData?.signedUrl || '')
      } else {
        setAnswer(questionId, urlData?.signedUrl || '')
      }
'''
org_new = '''    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(reader.error || new Error('Could not read file'))
        reader.onload = () => resolve(String(reader.result || ''))
        reader.readAsDataURL(file)
      })
      const fileBase64 = String(dataUrl).split(',')[1] || ''
      const { data, error: uploadErr } = await supabase.functions.invoke('organizer-action', {
        body: {
          type: 'upload_document', organizerId,
          fileName: file.name, fileType: file.type || 'application/octet-stream', fileBase64,
        },
      })
      if (uploadErr || !data?.ok) throw new Error(data?.error || uploadErr?.message || 'Upload failed')
      if (entryIdx !== null) {
        updateEntry(questionId, entryIdx, '_uploadUrl', data.url || '')
      } else {
        setAnswer(questionId, data.url || '')
      }
'''
replace_once('src/components/OrganizerWizard.jsx', org_old, org_new)
