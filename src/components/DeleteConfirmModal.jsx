// Shared delete confirmation modal — used everywhere in the CRM for destructive deletes.
// Usage:
//   const [confirmDel, setConfirmDel] = useState(null)
//   <DeleteConfirmModal
//     open={!!confirmDel}
//     label="payment"           // what's being deleted — shown as "Delete this payment?"
//     onConfirm={() => { doDelete(confirmDel); setConfirmDel(null) }}
//     onCancel={() => setConfirmDel(null)}
//   />

export default function DeleteConfirmModal({ open, label = 'item', onConfirm, onCancel }) {
  if (!open) return null
  return (
    <div className="modal-bg open" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ width: 340, textAlign: 'center', padding: '32px 28px' }}>
        <div style={{ fontSize: 36, marginBottom: 16 }}>🗑</div>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 10, color: 'var(--t1)' }}>
          Delete this {label}?
        </div>
        <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 24, lineHeight: 1.6 }}>
          This permanently removes the {label} and all associated data. Cannot be undone.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn sec"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="btn del"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
