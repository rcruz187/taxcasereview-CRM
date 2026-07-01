import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { fillForm, FORM_LABELS } from '../lib/irsFormUtils';

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
  const [loading, setLoading] = useState(null); // which download button is loading
  const [sending, setSending] = useState(null); // which send button is loading
  const [sendVia, setSendVia] = useState('email');
  const [sentMsg, setSentMsg] = useState('');
  const [error, setError] = useState('');

  if (!client) return null;

  const clientName = client.business_name || client.name || 'Client';
  const hasEin = !!(client.ein);
  const hasSsn = !!(client.ssn || client.tin);
  const isBiz  = hasEin || !!client.business_name || client.clientType === 'Business' || client.clientType === 'Individual & Biz';
  const hasAddress = !!(client.address || client.street || client.city);
  const hasPhone = !!client.phone;
  const hasEmail = !!client.email;
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

  // Sends a single pre-filled IRS form for e-signature — same pattern used for
  // State POAs (build PDF, upload to storage, create esigns row, email/text the
  // signing link). Lets IRS Forms mirror the State Forms tab's send flow.
  const handleSend = async (formType, useEin = false) => {
    const key = formType + (useEin ? '_ein' : '');
    setSending(key);
    setError('');
    setSentMsg('');
    try {
      if (sendVia !== 'sms' && !hasEmail) throw new Error('Client has no email on file');
      if (sendVia !== 'email' && !hasPhone) throw new Error('Client has no phone on file');

      const bytes = await fillForm(formType, client, useEin);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const safeName = clientName.replace(/[^a-zA-Z0-9]+/g, '-');
      const path = `docs/${safeName}/irs-forms/${formType}_${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage.from('documents')
        .upload(path, blob, { upsert: true, contentType: 'application/pdf' });
      if (upErr) throw new Error(upErr.message);
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);

      const label = FORM_LABELS[formType] || formType;
      const { data: esign, error: esignErr } = await supabase.from('esigns').insert([{
        doc_type: label,
        client_name: clientName,
        client_email: client.email || '',
        client_phone: client.phone || '',
        message: `Please review and sign your ${label}. This authorizes Tax Case Review to represent you before the IRS.`,
        pdf_attachments: [{ formType, label, url: urlData.publicUrl }],
        priority: 'Normal',
        status: 'Awaiting',
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }]).select().single();
      if (esignErr) throw new Error(esignErr.message);

      const sigUrl = `${window.location.origin}/taxcasereview-CRM/sign/${esign.id}`;
      await navigator.clipboard.writeText(sigUrl).catch(() => {});

      let emailSent = false, smsSent = false;
      if ((sendVia === 'email' || sendVia === 'both') && client.email) {
        const { error: eErr } = await supabase.functions.invoke('send-email', {
          body: {
            to: client.email,
            subject: `Action Required: Sign Your ${label} — Tax Case Review`,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px"><div style="text-align:center;margin-bottom:20px"><img src="https://mpxgxfqdbquzkrvvejkh.supabase.co/storage/v1/object/public/firm-assets/logo" alt="Tax Case Review" style="max-height:56px;max-width:190px;object-fit:contain;display:block;margin:0 auto 8px" onerror="this.style.display='none'"/><div style="font-size:12px;font-weight:800;color:#1d4ed8;letter-spacing:.1em;text-transform:uppercase;margin-top:6px">Tax Case Review</div></div><p>Dear <strong>${clientName}</strong>,</p><p>Your <strong>${label}</strong> is ready for your review and signature.</p><p style="text-align:center;margin:24px 0"><a href="${sigUrl}" style="background:#1d4ed8;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">Review &amp; Sign →</a></p><p style="font-size:12px;color:#64748b">${sigUrl}</p><p style="font-size:11px;color:#94a3b8;margin-top:24px">Tax Case Review · 631 US Highway One Ste 304, North Palm Beach, FL 33408<br/>📞 (888) 334-5052</p></div>`
          }
        });
        emailSent = !eErr;
      }
      if ((sendVia === 'sms' || sendVia === 'both') && client.phone) {
        const { data: cfg } = await supabase.from('settings').select('signalwire_backend').limit(1).maybeSingle();
        if (cfg?.signalwire_backend) {
          try {
            await fetch(cfg.signalwire_backend + '/sms/send', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to: client.phone, body: `Tax Case Review: please review and sign your ${label} here: ${sigUrl}` })
            });
            smsSent = true;
          } catch (_) {}
        }
      }
      setSentMsg(emailSent || smsSent ? `✅ Sent for signature!` : '✅ Signing link copied to clipboard');
      setTimeout(() => setSentMsg(''), 4000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(null);
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

          {sentMsg && (
            <div style={{ background: 'rgba(37,162,90,.12)', border: '1px solid var(--good)', color: 'var(--good)', fontSize: 12, borderRadius: 8, padding: '10px 12px' }}>
              {sentMsg}
            </div>
          )}

          {/* Send Via — applies to the Send buttons below */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Send Via</label>
            <select value={sendVia} onChange={e => setSendVia(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bd)', fontSize: 12, background: 'var(--s2)', color: 'var(--tx)' }}>
              <option value="email">Email</option>
              <option value="sms">Text Message</option>
              <option value="both">Email + Text</option>
            </select>
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
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn sec" disabled={!!loading || !!sending} onClick={() => handleFill('2848_personal', false)} style={{ flex: 1, justifyContent: 'flex-start', padding: '10px 14px' }}>
                  {loading === '2848_personal' ? '⏳' : '📄'}&nbsp; Personal (SSN) — 2848
                </button>
                <button className="btn pri" disabled={!!loading || !!sending} onClick={() => handleSend('2848_personal', false)} style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                  {sending === '2848_personal' ? '⏳' : '✍️'}&nbsp; Send
                </button>
              </div>
              {isBiz && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn sec" disabled={!!loading || !!sending} onClick={() => handleFill('2848_business', true)} style={{ flex: 1, justifyContent: 'flex-start', padding: '10px 14px' }}>
                    {loading === '2848_business_ein' ? '⏳' : '🏢'}&nbsp; Business (EIN) — 2848
                  </button>
                  <button className="btn pri" disabled={!!loading || !!sending} onClick={() => handleSend('2848_business', true)} style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    {sending === '2848_business_ein' ? '⏳' : '✍️'}&nbsp; Send
                  </button>
                </div>
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
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn sec" disabled={!!loading || !!sending} onClick={() => handleFill('8821_personal', false)} style={{ flex: 1, justifyContent: 'flex-start', padding: '10px 14px' }}>
                  {loading === '8821_personal' ? '⏳' : '📄'}&nbsp; Personal (SSN) — 8821
                </button>
                <button className="btn pri" disabled={!!loading || !!sending} onClick={() => handleSend('8821_personal', false)} style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                  {sending === '8821_personal' ? '⏳' : '✍️'}&nbsp; Send
                </button>
              </div>
              {isBiz && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn sec" disabled={!!loading || !!sending} onClick={() => handleFill('8821_business', true)} style={{ flex: 1, justifyContent: 'flex-start', padding: '10px 14px' }}>
                    {loading === '8821_business_ein' ? '⏳' : '🏢'}&nbsp; Business (EIN) — 8821
                  </button>
                  <button className="btn pri" disabled={!!loading || !!sending} onClick={() => handleSend('8821_business', true)} style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    {sending === '8821_business_ein' ? '⏳' : '✍️'}&nbsp; Send
                  </button>
                </div>
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
