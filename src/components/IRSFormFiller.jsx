import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { fillForm } from '../lib/irsFormUtils';

function downloadPdf(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function IRSFormFiller({ client, onClose }) {
  const [loading, setLoading] = useState(null); // which button is loading
  const [error, setError] = useState('');

  if (!client) return null;

  const clientName = client.business_name || client.name || 'Client';
  const hasEin = !!(client.ein);
  const hasSsn = !!(client.ssn || client.tin);
  const isBiz  = hasEin || !!client.business_name || client.clientType === 'Business' || client.clientType === 'Individual & Biz';
  const hasAddress = !!(client.address || client.street || client.city);
  const hasPhone = !!client.phone;
  // Always allow generating Personal forms even if SSN isn't on file yet (e.g. for leads) —
  // the field will just be left blank for the client to fill in by hand.

  const handleFill = async (formType, useEin = false) => {
    setLoading(formType + (useEin ? '_ein' : ''));
    setError('');
    try {
      const bytes = await fillForm(formType, client, useEin);
      const label = formType.replace('_', '-').toUpperCase();
      const idLabel = useEin ? 'EIN' : 'SSN';
      downloadPdf(bytes, `${label}_${clientName.replace(/\s+/g, '_')}_${idLabel}.pdf`);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="modal-bg open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 460, maxHeight: '90vh', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="mh" style={{ padding: '14px 18px', borderBottom: '1px solid var(--br)', flexShrink: 0 }}>
          <div>
            <span className="mt">IRS Form Pre-Fill</span>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>{clientName}</div>
          </div>
          <button className="xbtn" onClick={onClose}>&times;</button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 18px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{ background: 'rgba(192,32,47,.12)', border: '1px solid var(--bad)', color: 'var(--bad)', fontSize: 12, borderRadius: 8, padding: '10px 12px' }}>
              {error}
            </div>
          )}

          {/* Info pill */}
          <div style={{ background: 'var(--blt)', border: '1px solid var(--blue)', color: 'var(--b2)', fontSize: 12, borderRadius: 8, padding: '10px 12px', lineHeight: 1.5 }}>
            Fills taxpayer name, address, tax ID, phone, and today's date only.
            All rep info and tax matters stay exactly as pre-set on your templates.
          </div>

          {/* Data preview — shows exactly what will be written into the PDF */}
          <div style={{ border: '1px solid var(--br)', borderRadius: 8, padding: '10px 12px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontWeight: 700, color: 'var(--t2)', marginBottom: 2 }}>Data that will be filled in:</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span style={{ color: 'var(--t3)' }}>Name</span><span style={{ color: client.name ? 'var(--tx)' : 'var(--bad)', fontWeight: 600, textAlign: 'right' }}>{client.name || 'Missing!'}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span style={{ color: 'var(--t3)' }}>Address</span><span style={{ color: hasAddress ? 'var(--tx)' : 'var(--warn)', fontWeight: 600, textAlign: 'right' }}>{hasAddress ? [client.address || client.street, client.city, client.state, client.zip].filter(Boolean).join(', ') : 'Blank — not on file'}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span style={{ color: 'var(--t3)' }}>SSN</span><span style={{ color: hasSsn ? 'var(--tx)' : 'var(--warn)', fontWeight: 600, textAlign: 'right' }}>{hasSsn ? (client.ssn || client.tin) : 'Blank — not on file'}</span></div>
            {isBiz && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span style={{ color: 'var(--t3)' }}>EIN</span><span style={{ color: hasEin ? 'var(--tx)' : 'var(--warn)', fontWeight: 600, textAlign: 'right' }}>{hasEin ? client.ein : 'Blank — not on file'}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span style={{ color: 'var(--t3)' }}>Phone</span><span style={{ color: hasPhone ? 'var(--tx)' : 'var(--warn)', fontWeight: 600, textAlign: 'right' }}>{hasPhone ? client.phone : 'Blank — not on file'}</span></div>
          </div>

          {/* Form 2848 */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
              Form 2848 — Power of Attorney
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn sec" disabled={!!loading} onClick={() => handleFill('2848_personal', false)} style={{ justifyContent: 'flex-start', padding: '10px 14px' }}>
                {loading === '2848_personal' ? '⏳' : '📄'}&nbsp; Personal (SSN) — 2848
              </button>
              {isBiz && (
                <button className="btn sec" disabled={!!loading} onClick={() => handleFill('2848_business', true)} style={{ justifyContent: 'flex-start', padding: '10px 14px' }}>
                  {loading === '2848_business_ein' ? '⏳' : '🏢'}&nbsp; Business (EIN) — 2848
                </button>
              )}
              {!hasSsn && (
                <div style={{ fontSize: 11, color: 'var(--warn)', background: 'rgba(212,147,10,.15)', borderRadius: 6, padding: '8px 10px' }}>
                  No SSN on file yet — the SSN field will be left blank for the client to fill in.
                </div>
              )}
            </div>
          </div>

          {/* Form 8821 */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
              Form 8821 — Tax Information Authorization
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn sec" disabled={!!loading} onClick={() => handleFill('8821_personal', false)} style={{ justifyContent: 'flex-start', padding: '10px 14px' }}>
                {loading === '8821_personal' ? '⏳' : '📄'}&nbsp; Personal (SSN) — 8821
              </button>
              {isBiz && (
                <button className="btn sec" disabled={!!loading} onClick={() => handleFill('8821_business', true)} style={{ justifyContent: 'flex-start', padding: '10px 14px' }}>
                  {loading === '8821_business_ein' ? '⏳' : '🏢'}&nbsp; Business (EIN) — 8821
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--br)', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
