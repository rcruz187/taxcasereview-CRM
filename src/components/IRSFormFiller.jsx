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

  const btnClass = (key) =>
    `flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all border ${
      loading === key
        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
        : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">IRS Form Pre-Fill</h2>
            <p className="text-sm text-gray-500 mt-0.5">{clientName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl font-light w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          {/* Info pill */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-xs text-blue-700">
            Fills taxpayer name, address, tax ID, phone, and today's date only.
            All rep info and tax matters stay exactly as pre-set on your templates.
          </div>

          {/* Form 2848 */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Form 2848 — Power of Attorney
            </p>
            <div className="space-y-2">
              {(
                <button
                  className={btnClass('2848_personal')}
                  disabled={!!loading}
                  onClick={() => handleFill('2848_personal', false)}
                >
                  {loading === '2848_personal' ? (
                    <span className="animate-spin">⏳</span>
                  ) : (
                    <span>📄</span>
                  )}
                  Personal (SSN) — 2848
                </button>
              )}
              {isBiz && (
                <button
                  className={btnClass('2848_business_ein')}
                  disabled={!!loading}
                  onClick={() => handleFill('2848_business', true)}
                >
                  {loading === '2848_business_ein' ? (
                    <span className="animate-spin">⏳</span>
                  ) : (
                    <span>🏢</span>
                  )}
                  Business (EIN) — 2848
                </button>
              )}
              {!hasSsn && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-2">
                  No SSN on file yet — the SSN field will be left blank for the client to fill in.
                </p>
              )}
            </div>
          </div>

          {/* Form 8821 */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Form 8821 — Tax Information Authorization
            </p>
            <div className="space-y-2">
              {(
                <button
                  className={btnClass('8821_personal')}
                  disabled={!!loading}
                  onClick={() => handleFill('8821_personal', false)}
                >
                  {loading === '8821_personal' ? (
                    <span className="animate-spin">⏳</span>
                  ) : (
                    <span>📄</span>
                  )}
                  Personal (SSN) — 8821
                </button>
              )}
              {isBiz && (
                <button
                  className={btnClass('8821_business_ein')}
                  disabled={!!loading}
                  onClick={() => handleFill('8821_business', true)}
                >
                  {loading === '8821_business_ein' ? (
                    <span className="animate-spin">⏳</span>
                  ) : (
                    <span>🏢</span>
                  )}
                  Business (EIN) — 8821
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
