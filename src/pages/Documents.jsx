import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const DOC_TYPES = ['IRS Notice','IRS Form','Transcript','Agreement','W2 / 1099','Tax Return','Financial Statement','Bank Statement','Correspondence','Engagement Letter','Other']
const BLANK = { name:'', client:'', caseNum:'', docType:'IRS Notice', notes:'' }

function fileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase()
  if (['pdf'].includes(ext)) return '📄'
  if (['doc','docx'].includes(ext)) return '📝'
  if (['xls','xlsx'].includes(ext)) return '📊'
  if (['jpg','jpeg','png','gif','webp'].includes(ext)) return '🖼️'
  return '📁'
}

function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export default function Documents() {
  const [items, setItems]       = useState([])
  const [clients, setClients]   = useState([])
  const [modal, setModal]       = useState(false)
  const [form, setForm]         = useState(BLANK)
  const [sug, setSug]           = useState([])
  const [filter, setFilter]     = useState('All')
  const [search, setSearch]     = useState('')
  const [saving, setSaving]     = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [toast, setToast]       = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: d }, { data: c }] = await Promise.all([
      supabase.from('documents').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('id,name')
    ])
    if (d) setItems(d)
    if (c) setClients(c)
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }
  function fld(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function searchClient(val) {
    fld('client', val)
    if (val.length < 2) { setSug([]); return }
    setSug(clients.filter(c => c.name.toLowerCase().includes(val.toLowerCase())).slice(0, 6))
  }

  async function handleFileSelect(e) {
    const file = e.target.files[0]
    if (!file) return
    setSelectedFile(file)
    if (!form.name) fld('name', file.name.replace(/\.[^.]+$/, ''))
  }

  async function save() {
    if (!form.name) { showToast('Document name required'); return }
    setSaving(true)

    let fileUrl = null
    let fileName = null
    let fileSize = null

    if (selectedFile) {
      setUploading(true)
      const path = `documents/${Date.now()}_${selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, selectedFile, { upsert: true })
      setUploading(false)
      if (upErr) {
        // Bucket may not exist — save record anyway
        showToast('⚠️ File upload failed (check storage bucket), saving record only')
      } else {
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
        fileUrl = urlData.publicUrl
        fileName = selectedFile.name
        fileSize = selectedFile.size
      }
    }

    const { error } = await supabase.from('documents').insert([{
      ...form,
      file_url: fileUrl,
      file_name: fileName,
      file_size: fileSize,
      created_at: new Date().toISOString()
    }])
    setSaving(false)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('✅ Document saved!')
    setModal(false); setForm(BLANK); setSelectedFile(null)
    if (fileRef.current) fileRef.current.value = ''
    load()
  }

  async function deleteDoc(doc) {
    if (!confirm('Delete this document?')) return
    if (doc.file_url) {
      const path = doc.file_url.split('/documents/').pop()
      await supabase.storage.from('documents').remove([path])
    }
    await supabase.from('documents').delete().eq('id', doc.id)
    showToast('Deleted'); load()
  }

  async function download(doc) {
    if (doc.file_url) {
      window.open(doc.file_url, '_blank')
    } else {
      showToast('No file attached to this document')
    }
  }

  const filtered = items.filter(d => {
    if (filter !== 'All' && d.docType !== filter) return false
    if (search && !d.name?.toLowerCase().includes(search.toLowerCase()) && !d.client?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div>
      {toast && <div className="toast show">{toast}</div>}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--tx)' }}>Documents</div>
          <div style={{ fontSize: 13, color: 'var(--t3)' }}>{items.length} files stored</div>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or client…"
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--br)', background: 'var(--s2)', color: 'var(--tx)', fontSize: 13, width: 240, marginLeft: 'auto' }} />
        <button className="btn pri" onClick={() => { setForm(BLANK); setSelectedFile(null); setModal(true) }}>
          + Upload Document
        </button>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {['All', ...DOC_TYPES].map(t => (
          <span key={t} className={`chip${filter === t ? ' on' : ''}`} onClick={() => setFilter(t)} style={{ fontSize: 11 }}>{t}</span>
        ))}
      </div>

      {/* Document grid */}
      {filtered.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--t3)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📁</div>
          <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--tx)', marginBottom: 6 }}>No documents yet</div>
          <div style={{ fontSize: 13 }}>Upload your first document to get started</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {filtered.map(doc => (
            <div key={doc.id} className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ fontSize: 32, flexShrink: 0 }}>{fileIcon(doc.file_name || doc.name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{doc.client || '—'}</div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    <span className="bdg bn" style={{ fontSize: 9 }}>{doc.docType}</span>
                    {doc.file_size && <span className="bdg bn" style={{ fontSize: 9 }}>{fmtSize(doc.file_size)}</span>}
                    {doc.caseNum && <span className="bdg bb" style={{ fontSize: 9 }}>#{doc.caseNum}</span>}
                  </div>
                </div>
              </div>
              {doc.notes && <div style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.5 }}>{doc.notes}</div>}
              <div style={{ fontSize: 10, color: 'var(--t3)' }}>{doc.created_at ? new Date(doc.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                {doc.file_url ? (
                  <button className="btn pri" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }} onClick={() => download(doc)}>⬇ Download</button>
                ) : (
                  <button className="btn sec" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }} disabled>No file</button>
                )}
                <button className="btn del" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => deleteDoc(doc)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {modal && (
        <div className="modal-bg open" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal" style={{ width: 520 }}>
            <div className="mh">
              <span className="mt">📁 Upload Document</span>
              <button className="xbtn" onClick={() => setModal(false)}>&times;</button>
            </div>

            {/* File drop zone */}
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setSelectedFile(f); if (!form.name) fld('name', f.name.replace(/\.[^.]+$/, '')) } }}
              style={{
                border: `2px dashed ${selectedFile ? 'var(--ok)' : 'var(--br)'}`,
                borderRadius: 10, padding: '24px 20px', textAlign: 'center', cursor: 'pointer',
                background: selectedFile ? 'rgba(37,162,90,.08)' : 'var(--s2)', marginBottom: 16,
                transition: 'all .2s'
              }}>
              <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={handleFileSelect} />
              {selectedFile ? (
                <div>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>{fileIcon(selectedFile.name)}</div>
                  <div style={{ fontWeight: 700, color: 'var(--ok)', fontSize: 14 }}>{selectedFile.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>{fmtSize(selectedFile.size)} · Click to change</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>📂</div>
                  <div style={{ fontWeight: 600, color: 'var(--tx)', fontSize: 14 }}>Drop file here or click to browse</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>PDF, Word, Excel, images — up to 50MB</div>
                </div>
              )}
            </div>

            <div className="fg2">
              <div className="field"><label>Document Name *</label>
                <input value={form.name} onChange={e => fld('name', e.target.value)} placeholder="e.g. 2023 Tax Return" />
              </div>
              <div className="field"><label>Document Type</label>
                <select value={form.docType} onChange={e => fld('docType', e.target.value)}>
                  {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div className="field" style={{ position: 'relative' }}>
              <label>Client</label>
              <input value={form.client} onChange={e => searchClient(e.target.value)} placeholder="Search client…" autoComplete="off" onBlur={() => setTimeout(() => setSug([]), 150)} />
              {sug.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--s3)', border: '1px solid var(--br)', borderRadius: 7, zIndex: 100 }}>
                  {sug.map(c => <div key={c.id} onClick={() => { fld('client', c.name); setSug([]) }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}>{c.name}</div>)}
                </div>
              )}
            </div>

            <div className="fg2">
              <div className="field"><label>Case # (optional)</label>
                <input value={form.caseNum} onChange={e => fld('caseNum', e.target.value)} placeholder="Case number" />
              </div>
              <div className="field"><label>Notes</label>
                <input value={form.notes} onChange={e => fld('notes', e.target.value)} placeholder="Brief description" />
              </div>
            </div>

            <button className="btn pri" style={{ width: '100%', justifyContent: 'center', padding: 12 }} onClick={save} disabled={saving || uploading}>
              {uploading ? '⬆ Uploading…' : saving ? 'Saving…' : '💾 Save Document'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
