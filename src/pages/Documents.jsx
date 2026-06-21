import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useLocation } from 'react-router-dom'
import { DOC_FOLDERS as ROOT_FOLDERS } from './Clients'

const FILE_ICONS = { pdf:'📄', doc:'📝', docx:'📝', xls:'📊', xlsx:'📊', jpg:'🖼️', jpeg:'🖼️', png:'🖼️', default:'📎' }
function fileIcon(name='') { const ext=(name.split('.').pop()||'').toLowerCase(); return FILE_ICONS[ext]||FILE_ICONS.default }
function fmtSize(b) { if(!b)return ''; if(b<1024)return b+'B'; if(b<1048576)return (b/1024).toFixed(1)+'KB'; return (b/1048576).toFixed(1)+'MB' }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '' }

export default function Documents() {
  const location = useLocation()
  const clientParam = new URLSearchParams(location.search).get('client') || ''

  const [docs,       setDocs]       = useState([])
  const [clients,    setClients]    = useState([])
  const [folder,     setFolder]     = useState('All')
  const [clientFilter,setClientFilter] = useState(clientParam)
  const [search,     setSearch]     = useState('')
  const [modal,      setModal]      = useState(false)
  const [form,       setForm]       = useState({ name:'', client:'', docType:'IRS Docs', notes:'' })
  const [file,       setFile]       = useState(null)
  const [saving,     setSaving]     = useState(false)
  const [toast,      setToast]      = useState('')
  const [confirmDel, setConfirmDel] = useState(null)
  const [viewDoc,    setViewDoc]    = useState(null)
  const [expanded,   setExpanded]   = useState({})
  const fileRef = useRef(null)

  useEffect(() => { load() }, [clientFilter, folder])

  async function load() {
    let q = supabase.from('documents').select('*').order('created_at', { ascending: false })
    if (clientFilter) q = q.ilike('client', `%${clientFilter}%`)
    if (folder !== 'All') q = q.eq('docType', folder)
    const { data } = await q
    setDocs(data || [])
    const { data: cl } = await supabase.from('clients').select('name').order('name')
    setClients(cl || [])
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }

  async function upload() {
    if (!form.name || !form.docType) { showToast('Name and folder required'); return }
    setSaving(true)
    let fileUrl = null, fileName = null, fileSize = null
    if (file) {
      const path = `docs/${Date.now()}_${file.name}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
      if (upErr) { showToast('Upload error: '+upErr.message); setSaving(false); return }
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
      fileUrl = urlData.publicUrl; fileName = file.name; fileSize = file.size
    }
    const { error } = await supabase.from('documents').insert([{
      ...form, file_url: fileUrl, file_name: fileName, file_size: fileSize,
      created_at: new Date().toISOString()
    }])
    setSaving(false)
    if (error) { showToast('Error: '+error.message); return }
    showToast('✅ Document saved!'); setModal(false); setForm({ name:'', client:'', docType:'IRS Docs', notes:'' }); setFile(null); load()
  }

  async function del(doc) {
    if (doc.file_name) {
      const path = doc.file_url?.split('/documents/')[1]
      if (path) await supabase.storage.from('documents').remove([path]).catch(()=>{})
    }
    await supabase.from('documents').delete().eq('id', doc.id)
    setConfirmDel(null); showToast('Deleted'); load()
  }

  // Group docs by folder for the tree view
  const byFolder = {}
  ROOT_FOLDERS.forEach(f => { byFolder[f] = [] })
  byFolder['Other'] = byFolder['Other'] || []
  docs.forEach(d => {
    const f = d.docType || 'Other'
    if (!byFolder[f]) byFolder[f] = []
    byFolder[f].push(d)
  })

  const filtered = docs.filter(d => {
    const q = search.toLowerCase()
    return !q || d.name?.toLowerCase().includes(q) || d.client?.toLowerCase().includes(q) || d.file_name?.toLowerCase().includes(q)
  })

  const totalSize = docs.reduce((s,d) => s+(d.file_size||0), 0)

  return (
    <div style={{height:'calc(100vh - 60px)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {toast && <div className="toast show">{toast}</div>}

      {/* Header bar */}
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'0 0 12px',flexWrap:'wrap'}}>
        <div>
          <h2 style={{fontSize:16,fontWeight:800,margin:0}}>📁 Documents</h2>
          <div style={{fontSize:11,color:'var(--t3)',marginTop:2}}>{docs.length} files · {fmtSize(totalSize)}</div>
        </div>
        <div style={{flex:1,maxWidth:320}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search documents…"
            style={{width:'100%',padding:'7px 12px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:12}}/>
        </div>
        <div style={{position:'relative'}}>
          <input list="doc-clients-filter" value={clientFilter} onChange={e=>setClientFilter(e.target.value)}
            placeholder="Filter by client…"
            style={{padding:'7px 28px 7px 10px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:12,width:180}}/>
          <datalist id="doc-clients-filter">{clients.map(c=><option key={c.name} value={c.name}/>)}</datalist>
          {clientFilter && (
            <button onClick={()=>setClientFilter('')} title="Clear client filter"
              style={{position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'var(--t3)',cursor:'pointer',fontSize:14,lineHeight:1}}>×</button>
          )}
        </div>
        <button className="btn pri" onClick={()=>setModal(true)}>+ Upload Document</button>
      </div>

      {/* Main 2-pane layout */}
      <div style={{flex:1,display:'flex',gap:0,minHeight:0,border:'1px solid var(--br)',borderRadius:10,overflow:'hidden'}}>

        {/* LEFT: Folder tree */}
        <div style={{width:220,flexShrink:0,background:'var(--s2)',borderRight:'1px solid var(--br)',overflowY:'auto',padding:'8px 0'}}>
          <div
            onClick={()=>setFolder('All')}
            style={{padding:'7px 14px',cursor:'pointer',fontSize:13,fontWeight:folder==='All'?700:400,
              background:folder==='All'?'var(--blt)':'transparent',color:folder==='All'?'var(--b2)':'var(--tx)',
              display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span>🗂️ All Files</span>
            <span style={{fontSize:11,color:'var(--t3)',background:'var(--s3)',borderRadius:20,padding:'1px 7px'}}>{docs.length}</span>
          </div>

          <div style={{padding:'8px 14px 4px',fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em'}}>Folders</div>

          {ROOT_FOLDERS.map(f => {
            const count = byFolder[f]?.length || 0
            const isActive = folder === f
            return (
              <div key={f}>
                <div onClick={()=>{setFolder(isActive?'All':f);setExpanded(e=>({...e,[f]:!e[f]}))}}
                  style={{padding:'6px 14px',cursor:'pointer',fontSize:13,fontWeight:isActive?700:400,
                    background:isActive?'var(--blt)':'transparent',color:isActive?'var(--b2)':'var(--tx)',
                    display:'flex',alignItems:'center',gap:6,justifyContent:'space-between'}}>
                  <span>📂 {f}</span>
                  {count > 0 && <span style={{fontSize:11,color:isActive?'var(--b2)':'var(--t3)',background:'var(--s3)',borderRadius:20,padding:'1px 7px'}}>{count}</span>}
                </div>
              </div>
            )
          })}
        </div>

        {/* RIGHT: File grid/list */}
        <div style={{flex:1,overflowY:'auto',padding:16}}>
          {/* Breadcrumb */}
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:12,fontSize:12,color:'var(--t3)'}}>
            <span style={{cursor:'pointer',color:'var(--blue)'}} onClick={()=>setFolder('All')}>All Files</span>
            {folder !== 'All' && <><span>›</span><span style={{color:'var(--tx)',fontWeight:600}}>{folder}</span></>}
            {clientFilter && <><span>›</span><span style={{color:'var(--tx)',fontWeight:600}}>{clientFilter}</span></>}
          </div>

          {filtered.length === 0 ? (
            <div style={{textAlign:'center',padding:'60px 20px',color:'var(--t3)'}}>
              <div style={{fontSize:48,marginBottom:12}}>📁</div>
              <div style={{fontWeight:700,fontSize:15,color:'var(--tx)',marginBottom:6}}>No documents yet</div>
              <div style={{fontSize:13}}>Upload files using the "+ Upload Document" button.</div>
            </div>
          ) : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:10}}>
              {filtered.map(doc => (
                <div key={doc.id}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--blue)';e.currentTarget.style.transform='translateY(-2px)'}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--br)';e.currentTarget.style.transform=''}}
                  style={{border:'1px solid var(--br)',borderRadius:10,padding:'12px 10px',cursor:'pointer',
                    background:'var(--sf)',transition:'all .15s',position:'relative'}}>

                  {/* File icon */}
                  <div style={{fontSize:36,textAlign:'center',marginBottom:8}}>{fileIcon(doc.file_name||doc.name)}</div>

                  {/* Name */}
                  <div style={{fontSize:12,fontWeight:600,lineHeight:1.3,marginBottom:4,overflow:'hidden',textOverflow:'ellipsis',
                    display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>
                    {doc.name}
                  </div>

                  {/* Meta */}
                  <div style={{fontSize:10,color:'var(--t3)',lineHeight:1.6}}>
                    {doc.client && <div>👤 {doc.client}</div>}
                    <div>📂 {doc.docType||'Other'}</div>
                    {doc.file_size && <div>{fmtSize(doc.file_size)}</div>}
                    <div>{fmtDate(doc.created_at)}</div>
                  </div>

                  {/* Actions on hover */}
                  <div style={{display:'flex',gap:4,marginTop:8}}>
                    {doc.file_url && (
                      <a href={doc.file_url} target="_blank" rel="noreferrer"
                        style={{flex:1,padding:'4px 0',background:'var(--blue)',color:'#fff',borderRadius:6,
                          fontSize:10,fontWeight:700,textAlign:'center',textDecoration:'none'}}>
                        View
                      </a>
                    )}
                    <button onClick={e=>{e.stopPropagation();setConfirmDel(doc)}}
                      style={{padding:'4px 8px',background:'var(--bad)',color:'#fff',border:'none',
                        borderRadius:6,cursor:'pointer',fontSize:10,fontWeight:700}}>
                      Del
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirm */}
      {confirmDel && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setConfirmDel(null)}>
          <div className="modal" style={{maxWidth:360,textAlign:'center'}}>
            <div style={{fontSize:36,marginBottom:12}}>🗑</div>
            <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>Delete "{confirmDel.name}"?</div>
            <div style={{fontSize:13,color:'var(--t3)',marginBottom:20}}>This cannot be undone.</div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn sec" style={{flex:1,justifyContent:'center'}} onClick={()=>setConfirmDel(null)}>Cancel</button>
              <button className="btn del" style={{flex:1,justifyContent:'center'}} onClick={()=>del(confirmDel)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {modal && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal" style={{width:480}}>
            <div className="mh">
              <span className="mt">📎 Upload Document</span>
              <button className="xbtn" onClick={()=>setModal(false)}>&times;</button>
            </div>
            <div className="field"><label>Document Name *</label>
              <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. IRS Notice CP2000"/>
            </div>
            <div className="field"><label>Client</label>
              <input list="doc-clients" value={form.client} onChange={e=>setForm(f=>({...f,client:e.target.value}))} placeholder="Search client…"/>
              <datalist id="doc-clients">{clients.map(c=><option key={c.name} value={c.name}/>)}</datalist>
            </div>
            <div className="field"><label>Folder *</label>
              <select value={form.docType} onChange={e=>setForm(f=>({...f,docType:e.target.value}))}>
                {ROOT_FOLDERS.map(f=><option key={f}>{f}</option>)}
              </select>
            </div>
            <div className="field"><label>File</label>
              <div style={{border:'2px dashed var(--br)',borderRadius:8,padding:'16px',textAlign:'center',cursor:'pointer',background:file?'rgba(34,197,94,.06)':'var(--s2)'}}
                onClick={()=>fileRef.current?.click()}
                onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor='var(--blue)'}}
                onDragLeave={e=>e.currentTarget.style.borderColor='var(--br)'}
                onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)setFile(f);e.currentTarget.style.borderColor='var(--br)'}}>
                {file ? (
                  <div style={{display:'flex',alignItems:'center',gap:8,justifyContent:'center'}}>
                    <span style={{fontSize:20}}>{fileIcon(file.name)}</span>
                    <span style={{fontSize:13,fontWeight:600,color:'var(--ok)'}}>{file.name}</span>
                    <button onClick={e=>{e.stopPropagation();setFile(null)}} style={{background:'none',border:'none',color:'var(--bad)',cursor:'pointer',fontSize:16}}>×</button>
                  </div>
                ) : (
                  <div>
                    <div style={{fontSize:24,marginBottom:6}}>📎</div>
                    <div style={{fontSize:12,color:'var(--t2)'}}>Drop file here or click to browse</div>
                  </div>
                )}
                <input ref={fileRef} type="file" style={{display:'none'}} onChange={e=>setFile(e.target.files[0])}/>
              </div>
            </div>
            <div className="field"><label>Notes</label>
              <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2}
                style={{width:'100%',resize:'none',padding:'8px 12px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:6,color:'var(--tx)',fontSize:13,fontFamily:'inherit'}}/>
            </div>
            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:10}} onClick={upload} disabled={saving}>
              {saving?'Uploading…':'📎 Upload Document'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
