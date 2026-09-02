from pathlib import Path


def replace_block(path, start_marker, end_marker, new_block):
    p = Path(path)
    s = p.read_text()
    start = s.index(start_marker)
    end = s.index(end_marker, start)
    s = s[:start] + new_block + s[end:]
    p.write_text(s)

lead_send = '''  async function send() {
    const rawDigits = toNum.replace(/\\D/g,'')
    const faxDigits = rawDigits.length === 11 && rawDigits.startsWith('1') ? rawDigits.slice(1) : rawDigits
    if (faxDigits.length !== 10) { alert('Enter a valid 10-digit fax number.'); return }
    if (!file) { alert('Attach a document before sending the fax.'); return }
    set3(true)
    let fileUrl = null
    const toFull = '+1' + faxDigits
    try {
      const path = `fax/${lead?.id || 'lead'}/${Date.now()}_${file.name.replace(/[^A-Za-z0-9._-]/g,'_')}`
      const { error: uploadErr } = await supabase.storage.from('documents').upload(path, file, { upsert:false, contentType:file.type || 'application/pdf' })
      if (uploadErr) throw uploadErr
      const { data:u, error: signErr } = await supabase.storage.from('documents').createSignedUrl(path, 3600)
      if (signErr || !u?.signedUrl) throw signErr || new Error('Could not create secure fax document URL')
      fileUrl = u.signedUrl

      const { data: resData, error: invokeErr } = await supabase.functions.invoke('send-fax', {
        body: { to: toFull, document_url: fileUrl }
      })
      if (invokeErr) throw invokeErr
      if (!resData?.success) throw new Error(resData?.error || 'Fax provider rejected the send')

      await supabase.from('fax_logs').insert([{
        to_number:toFull, client_name:lead?.name, subject, file_url:fileUrl,
        file_name:file?.name||null, status:'Sent', provider_sid:resData?.sid || null,
        sent_at:new Date().toISOString(), created_at:new Date().toISOString()
      }])

      const { data: { user } } = await supabase.auth.getUser()
      const actor = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Staff'
      const noteContent = `📠 Fax sent to ${toFull}${subject?' — '+subject:''}${file?.name?' (' + file.name + ')':''}`
      await supabase.from('lead_notes').insert([{ lead_id: lead.id, lead_name: lead?.name, text: noteContent, type:'System', author: actor, created_at: new Date().toISOString() }])

      onLogged?.(); onClose()
    } catch (e) {
      console.error('[LeadInlineFax] send failed:', e)
      alert('Fax failed: ' + (e?.message || 'Unknown provider error'))
    } finally {
      set3(false)
    }
  }
'''
replace_block('src/pages/Leads.jsx', '  async function send() {\n', '  return <div style={{padding:', lead_send)

client_send = '''  async function send() {
    const rawDigits = toNum.replace(/\\D/g,'')
    const faxDigits = rawDigits.length === 11 && rawDigits.startsWith('1') ? rawDigits.slice(1) : rawDigits
    if (faxDigits.length !== 10) { showToast('Enter a valid 10-digit fax number.','err'); return }
    if (!file) { showToast('Attach a document before sending the fax.','err'); return }
    setSending(true)
    let fileUrl = null
    const toFull = '+1' + faxDigits
    try {
      const path = `fax/${client?.id || 'client'}/${Date.now()}_${file.name.replace(/[^A-Za-z0-9._-]/g,'_')}`
      const { error: uploadErr } = await supabase.storage.from('documents').upload(path, file, {upsert:false, contentType:file.type || 'application/pdf'})
      if (uploadErr) throw uploadErr
      const { data:u, error: signErr } = await supabase.storage.from('documents').createSignedUrl(path, 3600)
      if (signErr || !u?.signedUrl) throw signErr || new Error('Could not create secure fax document URL')
      fileUrl = u.signedUrl

      const { data: resData, error: invokeErr } = await supabase.functions.invoke('send-fax', {
        body: { to:toFull, document_url:fileUrl }
      })
      if (invokeErr) throw invokeErr
      if (!resData?.success) throw new Error(resData?.error || 'Fax provider rejected the send')

      await supabase.from('fax_logs').insert([{
        to_number:toFull, client_name:client?.name, subject, notes,
        file_name:file?.name||null, file_url:fileUrl, status:'Sent',
        provider_sid:resData?.sid || null, sent_at:new Date().toISOString(), created_at:new Date().toISOString()
      }])

      const { data: { user } } = await supabase.auth.getUser()
      const actor = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Staff'
      const noteContent = `📠 Fax sent to ${toFull}${subject?' — '+subject:''}${file?.name?' ('+file.name+')':''}${notes?' — '+notes:''}`
      const { error: noteErr } = await supabase.from('client_notes').insert([{
        clientname: client?.name, text: noteContent, author: actor, visible_to_client:false, created_at:new Date().toISOString()
      }])
      if (noteErr) console.error('[client_notes] insert failed (InlineFaxForm):', noteErr)

      showToast('📠 Fax sent!')
      onLogged?.(); onClose()
    } catch (e) {
      console.error('[InlineFaxForm] send failed:', e)
      showToast('Fax failed: ' + (e?.message || 'Unknown provider error'),'err')
    } finally {
      setSending(false)
    }
  }
'''
replace_block('src/pages/Clients.jsx', '  async function send() {\n', '  return (\n    <div style={{padding:', client_send)
