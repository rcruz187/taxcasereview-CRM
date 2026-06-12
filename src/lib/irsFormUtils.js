import { PDFDocument, StandardFonts } from 'pdf-lib';

// ─── Field maps per form type ────────────────────────────────────────────────
// Only the taxpayer section fields are filled — rep info, tax matters, etc.
// are already pre-populated in the blank templates.

export const FIELD_MAPS = {
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
export const TEMPLATE_PATHS = {
  '2848_personal': '2848_Pers_RC.pdf',
  '2848_business': '2848_RC_Biz.pdf',
  '8821_personal': '8821_Pers_RC.pdf',
  '8821_business': '8821_Biz_RC.pdf',
};

// Human-readable labels for each form type
export const FORM_LABELS = {
  '2848_personal': 'Form 2848 — Power of Attorney (Personal)',
  '2848_business': 'Form 2848 — Power of Attorney (Business)',
  '8821_personal': 'Form 8821 — Tax Information Authorization (Personal)',
  '8821_business': 'Form 8821 — Tax Information Authorization (Business)',
};

// Which forms go in the "Full Package" based on client type
export const PACKAGE_FORMS_BY_TYPE = {
  'Individual':       ['2848_personal', '8821_personal'],
  'Business':         ['2848_business', '8821_business'],
  'Individual & Biz': ['2848_personal', '8821_personal', '2848_business', '8821_business'],
};

// Whether a form type uses the EIN (vs SSN) as the taxpayer ID
export const FORM_USES_EIN = {
  '2848_personal': false,
  '2848_business': true,
  '8821_personal': false,
  '8821_business': true,
};

// ─── Signature placement ──────────────────────────────────────────────────────
// IRS forms don't expose the taxpayer's actual "Signature" line as a fillable
// AcroForm field (it's a blank line on the printed form). These coordinates
// place the taxpayer's typed/drawn signature + date directly on that line.
// page = 0-indexed page number. Coordinates are in PDF points, origin at
// bottom-left of the page (standard PDF coordinate space).
export const SIGNATURE_POSITIONS = {
  '2848_personal': { page: 1, sigX: 40,  sigY: 555, dateX: 305, dateY: 555, size: 12 },
  '2848_business': { page: 1, sigX: 40,  sigY: 555, dateX: 305, dateY: 555, size: 12 },
  '8821_personal': { page: 0, sigX: 60,  sigY: 138, dateX: 438, dateY: 138, size: 12 },
  '8821_business': { page: 0, sigX: 60,  sigY: 138, dateX: 438, dateY: 138, size: 12 },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

export function formatDate(d) {
  if (!d) return new Date().toLocaleDateString('en-US');
  return new Date(d).toLocaleDateString('en-US');
}

export function buildNameAddress(client) {
  const name = client.name || client.business_name || '';
  const parts = [
    client.address || client.street,
    client.city && client.state
      ? `${client.city} ${client.state}${client.zip ? ' ' + client.zip : ''}`
      : client.city || client.state || '',
  ].filter(Boolean);
  return name + (parts.length ? '\r' + parts.join('\r') : '');
}

export async function fetchTemplate(filename) {
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

// Fills the taxpayer fields on a blank IRS form template and returns the
// resulting PDF bytes (Uint8Array). Does NOT touch the signature line.
export async function fillForm(formType, client, useEin = false) {
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
      client.address || client.street,
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

// Stamps a taxpayer signature + date onto the blank signature line of an
// already-filled IRS form PDF. Returns new PDF bytes (Uint8Array).
export async function stampSignature(pdfBytes, formType, signatureText, dateText) {
  const pos = SIGNATURE_POSITIONS[formType];
  if (!pos) return pdfBytes; // unknown form type — return unchanged

  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const page = pages[pos.page] || pages[0];

  const sigFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const dateFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  if (signatureText) {
    page.drawText(signatureText, { x: pos.sigX, y: pos.sigY, size: pos.size, font: sigFont });
  }
  if (dateText) {
    page.drawText(dateText, { x: pos.dateX, y: pos.dateY, size: (pos.size || 12) - 2, font: dateFont });
  }

  return pdfDoc.save();
}

// Returns the ordered list of form types that belong in the "Full Package"
// for a given client, based on their client type.
export function getPackageFormTypes(clientType) {
  return PACKAGE_FORMS_BY_TYPE[clientType] || PACKAGE_FORMS_BY_TYPE['Individual'];
}
