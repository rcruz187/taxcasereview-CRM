import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { PDFDocument } from 'pdf-lib';

// ─── Field maps per form type ────────────────────────────────────────────────
// Only the taxpayer section fields are filled — rep info, tax matters, etc.
// are already pre-populated in your blank templates.

const FIELD_MAPS = {
  // 2848 Personal (Text24/25/26 + Text23 for date on pg2)
  '2848_personal': {
    nameAddress: 'Text24',   // "First Last\r123 Street\rCity ST Zip"
    ssn:         'Text25',   // SSN or EIN
    phone:       'Text26',   // daytime phone
    date:        'Text23',   // signature date (page 2)
    idType:      'ssn',
  },
  // 2848 Business (named fields)
  '2848_business': {
    name:        'topmostSubform[0].Page1[0].TaxpayerName[0]',
    address:     'topmostSubform[0].Page1[0].TaxpayerAddress[0]',
    ssn:         'topmostSubform[0].Page1[0].TaxpayerIDSSN[0]',
    ein:         'topmostSubform[0].Page1[0].TaxpayerIDEIN[0]',
    phone:       'topmostSubform[0].Page1[0].TaxpayerTelephone[0]',
    // no date field in blank (already signed on template)
    idType:      'split',   // name + address separate
  },
  // 8821 Personal (f1_6/f1_7/f1_8 + f1_32 print name + f1_33 date)
  '8821_personal': {
    nameAddress: 'topmostSubform[0].Page1[0].f1_6[0]',
    ssn:         'topmostSubform[0].Page1[0].f1_7[0]',
    phone:       'topmostSubform[0].Page1[0].f1_8[0]',
    printName:   'topmostSubform[0].Page1[0].f1_32[0]',
    date:        'topmostSubform[0].Page1[0].f1_33[0]',
    idType:      'ssn',
  },
  // 8821 Business (Text1/Text2/Text14/Text3/Text10)
  '8821_business': {
    nameAddress: 'Text1',   // "Name\rAddress"
    ein:         'Text2',   // EIN
    phone:       'Text14',  // daytime phone
    printName:   'Text10',  // print name
    date:        'Text3',   // date
    idType:      'ein',
  },
};

// Map form type → which blank template filename to fetch
const TEMPLATE_PATHS = {
  '2848_personal': '2848_Pers_RC.pdf',
  '2848_business': '2848_RC_Biz.pdf',
  '8821_personal': '8821_Pers_RC.pdf',
  '8821_business': '8821_Biz_RC.pdf',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(d) {
  if (!d) return new Date().toLocaleDateString('en-US');
  return new Date(d).toLocaleDateString('en-US');
}

function buildNameAddress(client) {
  const name = client.name || client.business_name || '';
  const parts = [
    client.address,
    client.city && client.state
      ? `${client.city} ${client.state}${client.zip ? ' ' + client.zip : ''}`
      : client.city || client.state || '',
  ].filter(Boolean);
  return name + (parts.length ? '\r' + parts.join('\r') : '');
}

async function fetchTemplate(filename) {
  // Try relative path first (works when deployed), then raw GitHub fallback
  const paths = [
    `/taxcasereview-CRM/templates/${filename}`,
    `https://raw.githubusercontent.com/taxresolutioncrm/taxcasereview-CRM/gh-pages/templates/${filename}`,
  ];
  for (const url of paths) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.arrayBuffer();
    } catch (_) {}
  }
  throw new Error(`Template not found: ${filename}`);
}

async function fillForm(formType, client, useEin = false) {
  const map = FIELD_MAPS[formType];
  const templateBytes = await fetchTemplate(TEMPLATE_PATHS[formType]);
  const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();

  const today = formatDate(new Date());
  const nameAddr = buildNameAddress(client);
  const taxId = useEin ? (client.ein || '') : (client.ssn || client.tin || '');

  // Helper: safely set a text field (skip if field doesn't exist in this template)
  const setText = (fieldName, value) => {
    try {
      const field = form.getTextField(fieldName);
      field.setText(value || '');
    } catch (_) {
      // field not present in this variant — skip
    }
  };

  if (formType === '2848_personal') {
    setText(map.nameAddress, nameAddr);
    setText(map.ssn, taxId);
    setText(map.phone, client.phone || '');
    setText(map.date, today);
  }

  else if (formType === '2848_business') {
    setText(map.name, client.business_name || client.name || '');
    const addrParts = [
      client.address,
      client.city && client.state
        ? `${client.city} ${client.state}${client.zip ? ' ' + client.zip : ''}`
        : '',
    ].filter(Boolean).join('\r');
    setText(map.address, addrParts);
    if (useEin) {
      setText(map.ein, client.ein || '');
    } else {
      setText(map.ssn, client.ssn || client.tin || '');
    }
    setText(map.phone, client.phone || '');
  }

  else if (formType === '8821_personal') {
    setText(map.nameAddress, nameAddr);
    setText(map.ssn, taxId);
    setText(map.phone, client.phone || '');
    setText(map.printName, client.name || '');
    setText(map.date, today);
  }

  else if (formType === '8821_business') {
    setText(map.nameAddress, nameAddr);
    setText(map.ein, client.ein || '');
    setText(map.phone, client.phone || '');
    setText(map.printName, client.name || client.business_name || '');
    setText(map.date, today);
  }

  const filledBytes = await pdfDoc.save();
  return filledBytes;
}

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
