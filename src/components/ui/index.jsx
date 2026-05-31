import { useApp } from '../../context/AppContext'

/* ═══════════════════════════════
   Badge
   ═══════════════════════════════ */
const STATUS_MAP = {
  // cases / leads
  'new':         'blue',
  'active':      'green',
  'pending':     'amber',
  'closed':      'gray',
  'resolved':    'green',
  'in progress': 'blue',
  'on hold':     'amber',
  'urgent':      'red',
  'high':        'red',
  'normal':      'blue',
  // payments
  'paid':        'green',
  'unpaid':      'amber',
  'overdue':     'red',
  'partial':     'amber',
  // IRS
  'filed':       'green',
  'processing':  'blue',
  'approved':    'green',
  'denied':      'red',
  // general
  'sent':        'blue',
  'signed':      'green',
  'requested':   'amber',
  'complete':    'green',
  'incomplete':  'amber',
  'connected':   'green',
  'disconnected':'red',
}

export function Badge({ status, label, color }) {
  const c = color || STATUS_MAP[(status || '').toLowerCase()] || 'gray'
  return <span className={`bdg ${c}`}>{label || status}</span>
}

export function Avatar({ name = '', color }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const colors   = ['blue', 'green', 'amber', 'red', 'gray']
  const c        = color || colors[name.charCodeAt(0) % colors.length] || 'blue'
  return <span className={`av ${c}`}>{initials}</span>
}

/* ═══════════════════════════════
   Modal
   ═══════════════════════════════ */
export function Modal() {
  const { modal, closeModal } = useApp()
  return (
    <div className={`modal-overlay ${modal.open ? 'open' : ''}`} onClick={e => e.target === e.currentTarget && closeModal()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{modal.title}</span>
          <button className="modal-close" onClick={closeModal}>&times;</button>
        </div>
        <div>{modal.body}</div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════
   Toast
   ═══════════════════════════════ */
export function Toast() {
  const { toast } = useApp()
  return (
    <div className={`toast ${toast.type} ${toast.show ? 'show' : ''}`}>
      {toast.msg}
    </div>
  )
}

/* ═══════════════════════════════
   Empty state
   ═══════════════════════════════ */
export function Empty({ icon = '📂', message = 'No records found', action, actionLabel }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--t3)' }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 13, marginBottom: action ? 14 : 0 }}>{message}</div>
      {action && <button className="btn pri sm" onClick={action}>{actionLabel}</button>}
    </div>
  )
}

/* ═══════════════════════════════
   Spinner
   ═══════════════════════════════ */
export function Spinner({ size = 20 }) {
  return (
    <div style={{
      display: 'inline-block',
      width: size,
      height: size,
      border: `2px solid var(--br)`,
      borderTop: `2px solid var(--blue)`,
      borderRadius: '50%',
      animation: 'spin .7s linear infinite',
    }} />
  )
}

/* ═══════════════════════════════
   Confirm dialog (inside modal)
   ═══════════════════════════════ */
export function Confirm({ message, onConfirm, onCancel }) {
  return (
    <div>
      <p style={{ marginBottom: 18, color: 'var(--t2)', fontSize: 13 }}>{message}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn del" onClick={onConfirm}>Confirm</button>
      </div>
    </div>
  )
}
