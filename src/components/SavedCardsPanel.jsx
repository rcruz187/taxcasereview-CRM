import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import StripePaymentMethodModal from './StripePaymentMethodModal'

const BRAND_LABEL = b => b ? b.charAt(0).toUpperCase() + b.slice(1) : 'Card'

// Lists every saved card/bank account on file for a lead or client, with
// enough safe info to verify a caller (brand, last4, expiry, cardholder
// name — Stripe never exposes more than last4, by design). Lets the rep
// add another card, switch which one is the default, or remove one.
export default function SavedCardsPanel({ record, recordType, showToast, onChanged }) {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [addingCard, setAddingCard] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [confirmRemove, setConfirmRemove] = useState(null)

  useEffect(() => { load() }, [record?.id])

  async function load() {
    if (!record?.id) return
    setLoading(true)
    const { data } = await supabase.from('payment_methods').select('*')
      .eq('record_type', recordType).eq('record_id', record.id)
      .order('created_at', { ascending: true })
    setCards(data || [])
    setLoading(false)
  }

  async function setDefault(card) {
    setBusyId(card.id)
    const { data, error } = await supabase.functions.invoke('stripe-set-default-payment-method', {
      body: { recordType, recordId: record.id, paymentMethodRowId: card.id }
    })
    setBusyId(null)
    if (error || data?.error) { showToast?.('❌ ' + (data?.error || error.message)); return }
    showToast?.('✅ Default card updated')
    load(); onChanged?.()
  }

  async function remove(card) {
    setBusyId(card.id)
    const { data, error } = await supabase.functions.invoke('stripe-remove-payment-method', {
      body: { recordType, recordId: record.id, paymentMethodRowId: card.id }
    })
    setBusyId(null); setConfirmRemove(null)
    if (error || data?.error) { showToast?.('❌ ' + (data?.error || error.message)); return }
    showToast?.('Card removed')
    load(); onChanged?.()
  }

  return (
    <div className="card">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
        <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)'}}>💳 Saved Cards</div>
        <button className="btn" style={{padding:'4px 10px',fontSize:11}} onClick={()=>setAddingCard(true)}>+ Add Card</button>
      </div>

      {loading ? (
        <div style={{fontSize:12,color:'var(--t3)',padding:'8px 0'}}>Loading…</div>
      ) : cards.length === 0 ? (
        <div style={{fontSize:12,color:'var(--t3)',padding:'8px 0'}}>None on file yet.</div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {cards.map(c => (
            <div key={c.id} style={{display:'flex',alignItems:'center',gap:8,background:'var(--s2)',border:'1px solid var(--br)',borderRadius:8,padding:'8px 12px'}}>
              <span style={{fontSize:16}}>{c.type==='us_bank_account' ? '🏦' : '💳'}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,color:'var(--tx)',fontWeight:600}}>
                  {BRAND_LABEL(c.brand)} •••• {c.last4}
                  {c.exp_month && c.exp_year && <span style={{color:'var(--t3)',fontWeight:400}}> · exp {String(c.exp_month).padStart(2,'0')}/{String(c.exp_year).slice(-2)}</span>}
                </div>
                {c.cardholder_name && <div style={{fontSize:11,color:'var(--t3)'}}>{c.cardholder_name}</div>}
              </div>
              {c.is_default ? (
                <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:20,background:'rgba(34,197,94,.12)',color:'var(--ok)',flexShrink:0}}>Default</span>
              ) : (
                <button className="btn" style={{fontSize:10,padding:'3px 9px',flexShrink:0}} disabled={busyId===c.id} onClick={()=>setDefault(c)}>
                  {busyId===c.id ? '…' : 'Set Default'}
                </button>
              )}
              {confirmRemove===c.id ? (
                <div style={{display:'flex',gap:4,flexShrink:0}}>
                  <button className="btn del" style={{fontSize:10,padding:'3px 9px'}} disabled={busyId===c.id} onClick={()=>remove(c)}>{busyId===c.id?'…':'Confirm'}</button>
                  <button className="btn" style={{fontSize:10,padding:'3px 9px'}} onClick={()=>setConfirmRemove(null)}>Cancel</button>
                </div>
              ) : (
                <button className="btn del" style={{fontSize:10,padding:'3px 9px',flexShrink:0}} onClick={()=>setConfirmRemove(c.id)}>Remove</button>
              )}
            </div>
          ))}
        </div>
      )}

      {addingCard && (
        <StripePaymentMethodModal
          client={record}
          recordType={recordType}
          showToast={showToast}
          onClose={()=>setAddingCard(false)}
          onSaved={()=>{ load(); onChanged?.() }}
        />
      )}
    </div>
  )
}
