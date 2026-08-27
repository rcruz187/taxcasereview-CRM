import DeleteConfirmModal from '../components/DeleteConfirmModal'
import { logActivity, getActor } from '../lib/activityLog'
import { useState, useEffect, useRef } from 'react'
import { validateFile, maybeCompressImage } from '../lib/uploadUtils'
import { supabase } from '../lib/supabase'
import { triggerWorkflow } from '../lib/triggerWorkflow'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { DOC_FOLDERS as ROOT_FOLDERS } from './Clients'

// Generate a short-lived signed URL for private storage bucket access
async function getDocumentUrl(supabase, storedUrl) {
  if (!storedUrl) return null
  try {
    // Extract the storage path from the stored URL
    const match = storedUrl.match(/\/documents\/(.+)$/)
    if (!match) return storedUrl // Not a storage URL, return as-is
    const path = match[1]
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(path, 3600) // 1 hour expiry
    if (error || !data?.signedUrl) return storedUrl
    return data.signedUrl
  } catch {
    return storedUrl
  }
}

const FILE_ICONS = { pdf:'📄', doc:'📝', docx:'📝', xls:'📊', xlsx:'📊', jpg:'🖼️', jpeg:'🖼️', png:'🖼️', mp3:'🎵', mp4:'🎬', default:'📎' }
function fileIcon(name='') { const ext=(name.split('.').pop()||'').toLowerCase(); return FILE_ICONS[ext]||FILE_ICONS.default }
function fmtSize(b) { if(!b)return ''; if(b<1024)return b+'B'; if(b<1048576)return (b/1024).toFixed(1)+'KB'; return (b/1048576).toFixed(1)+'MB' }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '' }

export default function Documents() {
  const location = useLocation()
  const { role } = useApp()
  const isAdmin = role === 'Admin' || role === 'Super Admin' || role === 'Manager'
  const clientParam = new URLSearchParams(location.search).get('client') || ''

  const [docs,         setDocs]         = useState([])
  const [people,       setPeople]        = useState([]) // clients + leads combined
  const [folder,       setFolder]        = useState('All')
  const [clientFilter, setClientFilter]  = useState(clientParam)
  const [search,       setSearch]        = useState('')
    const [modal,        setModal]         = useState(false)
  const [searchParams] = useSearchParams()
  useEffect(() => { if (searchParams.get('new') === '1') setModal(true) }, [searchParams])
  const [form,         setForm]          = useState({ name:'', client:'', docType:'IRS Docs', notes:'' })
  const [file,         setFile]          = useState(null)
  const [saving,       setSaving]        = useState(false)
  const [toast,        setToast]         = useState('')
  const [confirmDel,   setConfirmDel]    = useState(null)
  const [customFolders,setCustomFolders] = useState([])
  const [addingFolder, setAddingFolder]  = useState(false)
  const [newFolderName,setNewFolderName] = useState('')
  const [viewMode,     setViewMode]      = useState(() => localStorage.getItem('docs_view') || 'grid') // 'grid' | 'list' | 'table'
  const [sortCol,      setSortCol]       = useState('created_at')
  const [sortDir,      setSortDir]       = useState('desc')

  function changeView(v) { setViewMode(v); localStorage.setItem('docs_view', v) }
  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }
  function sortedDocs(arr) {
    return [...arr].sort((a, b) => {
      let av = a[sortCol] || '', bv = b[sortCol] || ''
      if (sortCol === 'file_size') { av = Number(av); bv = Number(bv) }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }
  const fileRef = useRef(null)

  const ALL_FOLDERS = [...ROOT_FOLDERS, ...customFolders]

  useEffect(() => { loadAll() }, [clientFilter, folder])

  async function loadAll() {
    // Load documents
    let q = supabase.from('documents').select('*').order('created_at', { ascending: false })
    if (clientFilter) q = q.ilike('client', `%${clientFilter}%`)
    if (folder !== 'All') q = q.eq('docType', folder)
    const { data: docsData } = await q
    setDocs(docsData || [])

    // Load clients + leads for autocomplete
    const [{ data: cl }, { data: ld }] = await Promise.all([
      supabase.from('clients').select('name').order('name'),
      supabase.from('leads').select('name').order('name'),
    ])
    const names = [...new Set([...(cl||[]).map(c=>c.name), ...(ld||[]).map(l=>l.name)])].sort()
    setPeople(names)

    // Load custom folders from settings
    const { data: s } = await supabase.from('settings').select('custom_doc_folders').limit(1).maybeSingle()
    if (s?.custom_doc_folders) {
      try { setCustomFolders(JSON.parse(s.custom_doc_folders)) } catch {}
    }
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),3000) }

  async function saveCustomFolder() {
    const name = newFolderName.trim()
    if (!name) return
    if (ALL_FOLDERS.includes(name)) { showToast('Folder already exists'); return }
    const updated = [...customFolders, name]
    const { data: s } = await supabase.from('settings').select('id').limit(1).maybeSingle()
    if (s?.id) {
      await supabase.from('settings').update({ custom_doc_folders: JSON.stringify(updated) }).eq('id', s.id)
    }
    setCustomFolders(updated)
    setNewFolderName('')
    setAddingFolder(false)
    showToast(`✅ Folder "${name}" created`)
  }

  async function upload() {
    if (!form.name || !form.docType) { showToast('Name and folder required'); return }
    if (file) { const _v = validateFile(file); if (!_v.ok) { showToast('❌ ' + _v.error); return }; if (_v.warn) showToast('⚠️ ' + _v.warn) }
    setSaving(true)
    let fileUrl = null, fileName = null, fileSize = null
    if (file) {
      const safeName = (form.client||'general').replace(/\s+/g,'-')
      const path = `docs/${safeName}/${Date.now()}_${file.name}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
      if (upErr) { showToast('Upload error: '+upErr.message); setSaving(false); return }
      const { data: signedData } = await supabase.storage.from('documents').createSignedUrl(path, 3600)
      fileUrl = signedData?.signedUrl || null; fileName = file.name; fileSize = file.size
    }
    const { error } = await supabase.from('documents').insert([{
      ...form, file_url: fileUrl, file_name: fileName, file_size: fileSize,
      created_at: new Date().toISOString()
    }])
    setSaving(false)
    if (error) { showToast('Error: '+error.message); return }
    showToast('✅ Document saved!')
    const _du = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Staff'; await triggerWorkflow('document_uploaded', form.clientType || 'client', form.clientName || '', _du).catch(()=>{}); await logActivity(supabase,{employeeName:_du,action:'document_uploaded',category:'document',description:`Uploaded doc: ${form.name} — ${form.clientName||'General'}`,entityName:form.clientName,meta:{docType:form.docType,fileName:form.name}}).catch(()=>{})
    setModal(false)
    setForm({ name:'', client:'', docType:'IRS Docs', notes:'' })
    setFile(null)
    loadAll()
  }

  async function del(doc) {
    if (doc.file_name) {
      const path = doc.file_url?.split('/documents/')[1]
      if (path) await supabase.storage.from('documents').remove([path]).catch(()=>{})
    }
    const { error } = await supabase.from('documents').delete().eq('id', doc.id)
    if (error) { showToast('Error: ' + error.message); setConfirmDel(null); return }
    setDocs(prev => prev.filter(d => d.id !== doc.id))
    setConfirmDel(null); showToast('Deleted'); loadAll()
  }

  // Group by folder
  const byFolder = {}
  ALL_FOLDERS.forEach(f => { byFolder[f] = [] })
  docs.forEach(d => {
    const f = d.docType || 'Other'
    if (!byFolder[f]) byFolder[f] = []
    byFolder[f].push(d)
  })

  const filtered = (() => {
    const q = search.toLowerCase()
    let base = docs
    if (folder !== 'All') base = byFolder[folder] || []
    if (clientFilter) base = base.filter(d => d.client === clientFilter)
    if (q) base = base.filter(d => d.name?.toLowerCase().includes(q) || d.client?.toLowerCase().includes(q) || d.file_name?.toLowerCase().includes(q))
    // Recent Uploads view (All + no filters) → show latest 20 only
    if (folder === 'All' && !clientFilter && !q) base = base.slice(0, 20)
    return base
  })()

  const totalSize = docs.reduce((s,d) => s+(d.file_size||0), 0)

  return (
    <div style={{height:'calc(100vh - 60px)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {toast && <div className="toast show">{toast}</div>}

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'0 0 12px',flexWrap:'wrap'}}>
        <div>
          <h2 style={{fontSize:16,fontWeight:800,margin:0}}>📁 Documents</h2>
          <div style={{fontSize:11,color:'var(--t3)',marginTop:2}}>{docs.length} files · {fmtSize(totalSize)}</div>
        </div>
        <div style={{flex:1,maxWidth:320}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search documents…"
            style={{width:'100%',padding:'8px 12px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:8,color:'var(--tx)',fontSize:13}}/>
        </div>
        <div style={{position:'relative'}}>
          <input list="doc-people-filter" value={clientFilter} onChange={e=>setClientFilter(e.target.value)}
            placeholder="Filter by client…"
            style={{padding:'8px 28px 8px 10px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:8,color:'var(--tx)',fontSize:13,width:200}}/>
          <datalist id="doc-people-filter">{people.map(n=><option key={n} value={n}/>)}</datalist>
          {clientFilter && (
            <button onClick={()=>setClientFilter('')}
              style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'var(--t3)',cursor:'pointer',fontSize:16,lineHeight:1}}>×</button>
          )}
        </div>
        <button className="btn pri" style={{gap:6}} onClick={()=>setModal(true)}>+ Upload Document</button>
        {/* View toggle */}
        <div style={{display:'flex',gap:0,border:'1px solid var(--br)',borderRadius:8,overflow:'hidden',flexShrink:0}}>
          {[['grid','⊞'],['list','≡'],['table','▤']].map(([v,icon])=>(
            <button key={v} onClick={()=>changeView(v)} title={v.charAt(0).toUpperCase()+v.slice(1)+' view'}
              style={{padding:'7px 11px',border:'none',cursor:'pointer',fontSize:15,lineHeight:1,
                background:viewMode===v?'var(--blue)':'var(--s2)',
                color:viewMode===v?'#fff':'var(--t3)',transition:'all .15s'}}>
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* 2-pane layout */}
      <div style={{flex:1,display:'flex',gap:0,minHeight:0,border:'1px solid var(--br)',borderRadius:12,overflow:'hidden'}}>

        {/* LEFT: Folder sidebar */}
        <div style={{width:220,flexShrink:0,background:'var(--s2)',borderRight:'1px solid var(--br)',overflowY:'auto',display:'flex',flexDirection:'column'}}>
          {/* All files */}
          <div onClick={()=>setFolder('All')}
            style={{padding:'10px 14px',cursor:'pointer',fontSize:13,fontWeight:folder==='All'?700:400,
              background:folder==='All'?'rgba(59,130,246,.15)':'transparent',
              color:folder==='All'?'var(--blue)':'var(--tx)',
              borderLeft:folder==='All'?'3px solid var(--blue)':'3px solid transparent',
              display:'flex',alignItems:'center',justifyContent:'space-between',transition:'all .1s'}}>
            <span style={{display:'flex',alignItems:'center',gap:8}}>🕐 Recent Uploads</span>
            <span style={{fontSize:11,background:folder==='All'?'rgba(59,130,246,.2)':'var(--s3)',
              color:folder==='All'?'var(--blue)':'var(--t3)',borderRadius:20,padding:'1px 8px',fontWeight:700}}>{docs.length}</span>
          </div>

          {/* Folders header */}
          <div style={{padding:'10px 14px 4px',fontSize:10,fontWeight:700,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.07em',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span>Folders</span>
            {isAdmin && (
              <button onClick={()=>setAddingFolder(true)} title="Add folder"
                style={{background:'none',border:'none',color:'var(--blue)',cursor:'pointer',fontSize:16,lineHeight:1,padding:0}}>+</button>
            )}
          </div>

          {/* Add folder input */}
          {addingFolder && (
            <div style={{padding:'6px 10px',display:'flex',gap:4}}>
              <input value={newFolderName} onChange={e=>setNewFolderName(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter')saveCustomFolder();if(e.key==='Escape'){setAddingFolder(false);setNewFolderName('')}}}
                placeholder="Folder name…" autoFocus
                style={{flex:1,padding:'5px 8px',fontSize:12,background:'var(--sf)',border:'1px solid var(--blue)',borderRadius:6,color:'var(--tx)'}}/>
              <button onClick={saveCustomFolder} style={{padding:'4px 8px',background:'var(--blue)',border:'none',borderRadius:6,color:'#fff',fontSize:11,cursor:'pointer',fontWeight:700}}>Add</button>
              <button onClick={()=>{setAddingFolder(false);setNewFolderName('')}} style={{padding:'4px 6px',background:'none',border:'none',color:'var(--t3)',cursor:'pointer',fontSize:14}}>×</button>
            </div>
          )}

          {/* Folder list */}
          {ALL_FOLDERS.map(f => {
            const count = byFolder[f]?.length || 0
            const isActive = folder === f
            const isCustom = customFolders.includes(f)
            return (
              <div key={f} onClick={()=>setFolder(isActive?'All':f)}
                style={{padding:'8px 14px',cursor:'pointer',fontSize:13,
                  fontWeight:isActive?700:400,
                  background:isActive?'rgba(59,130,246,.15)':'transparent',
                  color:isActive?'var(--blue)':'var(--tx)',
                  borderLeft:isActive?'3px solid var(--blue)':'3px solid transparent',
                  display:'flex',alignItems:'center',gap:6,justifyContent:'space-between',
                  transition:'all .1s'}}>
                <span style={{display:'flex',alignItems:'center',gap:7}}>
                  <span style={{fontSize:15}}>{isCustom?'🗁':'📂'}</span>
                  <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:120}}>{f}</span>
                </span>
                {count > 0 && (
                  <span style={{fontSize:11,background:isActive?'rgba(59,130,246,.2)':'var(--s3)',
                    color:isActive?'var(--blue)':'var(--t3)',borderRadius:20,padding:'1px 8px',fontWeight:700,flexShrink:0}}>{count}</span>
                )}
              </div>
            )
          })}
        </div>

        {/* RIGHT: Document grid */}
        <div style={{flex:1,overflowY:'auto',padding:16,background:'var(--sf)'}}>
          {/* Breadcrumb */}
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:14,fontSize:12,color:'var(--t3)'}}>
            <span style={{cursor:'pointer',color:'var(--blue)',fontWeight:600}} onClick={()=>{setFolder('All');setClientFilter('')}}>Recent Uploads</span>
            {folder !== 'All' && <><span>›</span><span style={{color:'var(--tx)',fontWeight:600}}>{folder}</span></> }
            {clientFilter && <><span>›</span><span style={{color:'var(--tx)',fontWeight:600}}>{clientFilter}</span>
              <button onClick={()=>setClientFilter('')} style={{marginLeft:2,background:'rgba(239,68,68,.12)',border:'1px solid rgba(239,68,68,.3)',borderRadius:4,color:'var(--bad)',cursor:'pointer',fontSize:10,padding:'1px 6px',fontWeight:700}}>✕ clear</button>
            </>}
          </div>

          {filtered.length === 0 ? (
            <div style={{textAlign:'center',padding:'80px 20px',color:'var(--t3)'}}>
              <div style={{fontSize:56,marginBottom:16,opacity:.4}}>📁</div>
              <div style={{fontWeight:700,fontSize:15,color:'var(--tx)',marginBottom:6}}>No documents found</div>
              <div style={{fontSize:13}}>{clientFilter ? `No files on record for "${clientFilter}"` : folder === 'All' ? 'No documents uploaded yet.' : 'No files in this folder yet.'}</div>
              {clientFilter && <button onClick={()=>setClientFilter('')} className="btn sec" style={{marginTop:12}}>Clear Filter</button>}
            </div>
          ) : viewMode === 'grid' ? (
            // ── GRID VIEW ──────────────────────────────────────────────────
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:12}}>
              {sortedDocs(filtered).map(doc => (
                <div key={doc.id}
                  onMouseEnter={e=>{e.currentTarget.querySelector('.doc-actions').style.opacity='1'}}
                  onMouseLeave={e=>{e.currentTarget.querySelector('.doc-actions').style.opacity='0'}}
                  style={{border:'1px solid var(--br)',borderRadius:12,padding:'14px 12px 12px',
                    background:'var(--s2)',transition:'all .15s',position:'relative',
                    boxShadow:'0 1px 4px rgba(0,0,0,.06)'}}>
                  <div style={{position:'absolute',top:10,right:10,fontSize:10,fontWeight:700,
                    background:'var(--s3)',color:'var(--t3)',borderRadius:4,padding:'2px 5px'}}>
                    {(doc.file_name||doc.name||'').split('.').pop()?.toUpperCase()||'—'}
                  </div>
                  <div style={{fontSize:42,textAlign:'center',marginBottom:10,lineHeight:1}}>{fileIcon(doc.file_name||doc.name)}</div>
                  <div style={{fontSize:12.5,fontWeight:700,lineHeight:1.35,marginBottom:6,
                    overflow:'hidden',textOverflow:'ellipsis',display:'-webkit-box',
                    WebkitLineClamp:2,WebkitBoxOrient:'vertical',minHeight:34}}>{doc.name}</div>
                  <div style={{fontSize:11,color:'var(--t3)',lineHeight:1.7,marginBottom:8}}>
                    {doc.client && (
                      <div style={{display:'flex',alignItems:'center',gap:4,color:'var(--t2)',fontWeight:600}}>
                        <span>👤</span>
                        <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{doc.client}</span>
                      </div>
                    )}
                    <div>📂 {doc.docType||'Other'}</div>
                    <div style={{display:'flex',justifyContent:'space-between'}}>
                      {doc.file_size && <span>{fmtSize(doc.file_size)}</span>}
                      <span>{fmtDate(doc.created_at)}</span>
                    </div>
                  </div>
                  <div className="doc-actions" style={{display:'flex',gap:6,opacity:0,transition:'opacity .15s'}}>
                    {doc.file_url ? (
                      <a href="#" onClick={async e => { e.preventDefault(); const u = await getDocumentUrl(supabase, doc.file_url); if (u) window.open(u, '_blank') }} rel="noreferrer"
                        style={{flex:1,padding:'6px 0',background:'var(--blue)',color:'#fff',borderRadius:7,
                          fontSize:11,fontWeight:700,textAlign:'center',textDecoration:'none'}}>Open</a>
                    ) : <div style={{flex:1}}/>}
                    <button onClick={e=>{e.stopPropagation();setConfirmDel(doc)}}
                      style={{padding:'6px 10px',background:'rgba(239,68,68,.12)',color:'var(--bad)',
                        border:'1px solid rgba(239,68,68,.3)',borderRadius:7,cursor:'pointer',fontSize:11,fontWeight:700}}>Del</button>
                  </div>
                </div>
              ))}
            </div>
          ) : viewMode === 'list' ? (
            // ── LIST VIEW ──────────────────────────────────────────────────
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              {sortedDocs(filtered).map(doc => (
                <div key={doc.id} style={{display:'flex',alignItems:'center',gap:12,padding:'9px 12px',
                  background:'var(--s2)',border:'1px solid var(--br)',borderRadius:9,
                  transition:'background .1s'}}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--s3)'}
                  onMouseLeave={e=>e.currentTarget.style.background='var(--s2)'}>
                  <span style={{fontSize:24,flexShrink:0}}>{fileIcon(doc.file_name||doc.name)}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,color:'var(--tx)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{doc.name}</div>
                    <div style={{fontSize:11,color:'var(--t3)',display:'flex',gap:10,marginTop:2,flexWrap:'wrap'}}>
                      {doc.client && <span>👤 {doc.client}</span>}
                      <span>📂 {doc.docType||'Other'}</span>
                      {doc.file_size && <span>{fmtSize(doc.file_size)}</span>}
                    </div>
                  </div>
                  <span style={{fontSize:11,color:'var(--t3)',flexShrink:0,whiteSpace:'nowrap'}}>{fmtDate(doc.created_at)}</span>
                  <div style={{display:'flex',gap:6,flexShrink:0}}>
                    {doc.file_url && (
                      <a href="#" onClick={async e => { e.preventDefault(); const u = await getDocumentUrl(supabase, doc.file_url); if (u) window.open(u, '_blank') }} rel="noreferrer"
                        style={{padding:'5px 12px',background:'var(--blue)',color:'#fff',borderRadius:6,
                          fontSize:11,fontWeight:700,textDecoration:'none'}}>Open</a>
                    )}
                    <button onClick={e=>{e.stopPropagation();setConfirmDel(doc)}}
                      style={{padding:'5px 10px',background:'rgba(239,68,68,.12)',color:'var(--bad)',
                        border:'1px solid rgba(239,68,68,.3)',borderRadius:6,cursor:'pointer',fontSize:11,fontWeight:700}}>Del</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // ── TABLE VIEW ─────────────────────────────────────────────────
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{background:'var(--s2)'}}>
                    {[['name','Name'],['client','Client'],['docType','Folder'],['file_size','Size'],['created_at','Uploaded']].map(([col,label])=>(
                      <th key={col} onClick={()=>toggleSort(col)}
                        style={{padding:'9px 12px',textAlign:'left',fontWeight:700,fontSize:11,
                          color:sortCol===col?'var(--blue)':'var(--t3)',textTransform:'uppercase',
                          letterSpacing:'.05em',borderBottom:'2px solid var(--br)',
                          cursor:'pointer',whiteSpace:'nowrap',userSelect:'none'}}>
                        {label} {sortCol===col?(sortDir==='asc'?'↑':'↓'):''}
                      </th>
                    ))}
                    <th style={{padding:'9px 12px',borderBottom:'2px solid var(--br)',width:100}}></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDocs(filtered).map((doc,idx) => (
                    <tr key={doc.id}
                      style={{background:idx%2===0?'transparent':'rgba(0,0,0,.02)',transition:'background .1s'}}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--s2)'}
                      onMouseLeave={e=>e.currentTarget.style.background=idx%2===0?'transparent':'rgba(0,0,0,.02)'}>
                      <td style={{padding:'8px 12px',borderBottom:'1px solid var(--br)'}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <span style={{fontSize:18}}>{fileIcon(doc.file_name||doc.name)}</span>
                          <span style={{fontWeight:600,color:'var(--tx)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:220}}>{doc.name}</span>
                        </div>
                      </td>
                      <td style={{padding:'8px 12px',borderBottom:'1px solid var(--br)',color:'var(--t2)',whiteSpace:'nowrap'}}>{doc.client||'—'}</td>
                      <td style={{padding:'8px 12px',borderBottom:'1px solid var(--br)',color:'var(--t3)',whiteSpace:'nowrap'}}>{doc.docType||'Other'}</td>
                      <td style={{padding:'8px 12px',borderBottom:'1px solid var(--br)',color:'var(--t3)',whiteSpace:'nowrap'}}>{doc.file_size?fmtSize(doc.file_size):'—'}</td>
                      <td style={{padding:'8px 12px',borderBottom:'1px solid var(--br)',color:'var(--t3)',whiteSpace:'nowrap'}}>{fmtDate(doc.created_at)}</td>
                      <td style={{padding:'8px 12px',borderBottom:'1px solid var(--br)'}}>
                        <div style={{display:'flex',gap:6,justifyContent:'flex-end'}}>
                          {doc.file_url && (
                            <a href="#" onClick={async e => { e.preventDefault(); const u = await getDocumentUrl(supabase, doc.file_url); if (u) window.open(u, '_blank') }} rel="noreferrer"
                              style={{padding:'4px 10px',background:'var(--blue)',color:'#fff',borderRadius:5,
                                fontSize:11,fontWeight:700,textDecoration:'none'}}>Open</a>
                          )}
                          <button onClick={e=>{e.stopPropagation();setConfirmDel(doc)}}
                            style={{padding:'4px 8px',background:'rgba(239,68,68,.12)',color:'var(--bad)',
                              border:'1px solid rgba(239,68,68,.3)',borderRadius:5,cursor:'pointer',fontSize:11,fontWeight:700}}>Del</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <DeleteConfirmModal open={!!confirmDel} label="document" onConfirm={() => del(confirmDel)} onCancel={() => setConfirmDel(null)} />

      {/* Upload Modal */}
      {modal && (
        <div className="modal-bg open" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal" style={{width:500}}>
            <div className="mh">
              <span className="mt">📎 Upload Document</span>
              <button className="xbtn" onClick={()=>setModal(false)}>&times;</button>
            </div>
            <div className="field"><label>Document Name *</label>
              <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. IRS Notice CP2000"/>
            </div>
            <div className="field"><label>Client / Lead</label>
              <input list="doc-people" value={form.client} onChange={e=>setForm(f=>({...f,client:e.target.value}))} placeholder="Type name…"/>
              <datalist id="doc-people">{people.map(n=><option key={n} value={n}/>)}</datalist>
            </div>
            <div className="field"><label>Folder *</label>
              <select value={form.docType} onChange={e=>setForm(f=>({...f,docType:e.target.value}))}>
                {ALL_FOLDERS.map(f=><option key={f}>{f}</option>)}
              </select>
            </div>
            <div className="field"><label>File</label>
              <div style={{border:'2px dashed var(--br)',borderRadius:10,padding:'20px',textAlign:'center',cursor:'pointer',
                background:file?'rgba(34,197,94,.06)':'var(--s2)',transition:'all .15s'}}
                onClick={()=>fileRef.current?.click()}
                onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor='var(--blue)'}}
                onDragLeave={e=>e.currentTarget.style.borderColor='var(--br)'}
                onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)setFile(f);e.currentTarget.style.borderColor='var(--br)'}}>
                {file ? (
                  <div style={{display:'flex',alignItems:'center',gap:8,justifyContent:'center'}}>
                    <span style={{fontSize:22}}>{fileIcon(file.name)}</span>
                    <span style={{fontSize:13,fontWeight:600,color:'var(--ok)'}}>{file.name}</span>
                    <span style={{fontSize:11,color:'var(--t3)'}}>({fmtSize(file.size)})</span>
                    <button onClick={e=>{e.stopPropagation();setFile(null)}} style={{background:'none',border:'none',color:'var(--bad)',cursor:'pointer',fontSize:18}}>×</button>
                  </div>
                ) : (
                  <div>
                    <div style={{fontSize:28,marginBottom:6}}>📎</div>
                    <div style={{fontSize:13,color:'var(--t2)',fontWeight:600}}>Drop file here or click to browse</div>
                    <div style={{fontSize:11,color:'var(--t3)',marginTop:4}}>PDF, Word, Excel, images supported</div>
                  </div>
                )}
                <input ref={fileRef} type="file" style={{display:'none'}} onChange={e=>setFile(e.target.files[0])}/>
              </div>
            </div>
            <div className="field"><label>Notes</label>
              <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2}
                style={{width:'100%',resize:'none',padding:'8px 12px',background:'var(--s2)',border:'1px solid var(--br)',borderRadius:8,color:'var(--tx)',fontSize:13,fontFamily:'inherit',boxSizing:'border-box'}}/>
            </div>
            <button className="btn pri" style={{width:'100%',justifyContent:'center',padding:12}} onClick={upload} disabled={saving}>
              {saving?'Uploading…':'📎 Upload Document'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

