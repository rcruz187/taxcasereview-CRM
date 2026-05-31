import { useState, useEffect } from 'react'
import { api } from '../hooks/useApi'
import { Badge, Empty, Spinner } from '../components/ui'
import { useApp } from '../context/AppContext'

export default function Transcripts() {
  const { showToast, openModal, closeModal } = useApp()
  const [rows, setRows]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])
  async function load() {
    try {
      const endpoint = 'Transcripts'.toLowerCase().replace('irsforms','irsforms').replace('timeclock','timeclock')
      const r = await api.get(`/api/data/${endpoint}`)
      setRows(r.data || r.rows || r || [])
    } catch { setRows([]) } finally { setLoading(false) }
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Transcripts</span>
        <button className="btn pri" onClick={() => showToast('Form coming soon!')}>+ New</button>
      </div>
      {loading ? <Spinner /> : rows.length === 0
        ? <Empty icon="📂" message="No records yet" action={() => showToast('Form coming soon!')} actionLabel="Add Record" />
        : <div className="ovx"><table><thead><tr><th>ID</th><th>Details</th><th>Status</th></tr></thead><tbody>
          {rows.map((r,i) => <tr key={r.id||i}><td className="mono">{r.id||i+1}</td><td>{r.name||r.title||r.description||JSON.stringify(r).slice(0,60)}</td><td><Badge status={r.status||'Active'}/></td></tr>)}
        </tbody></table></div>
      }
    </div>
  )
}
