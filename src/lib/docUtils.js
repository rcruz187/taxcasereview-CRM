// ─── Shared document utilities — Tax Case Review CRM ─────────────────────────

const LOGO_URL = 'https://mpxgxfqdbquzkrvvejkh.supabase.co/storage/v1/object/public/firm-assets/logo'

function printHeader(title) {
  return `
    <div style="text-align:center;margin-bottom:24px;border-bottom:2px solid #1A7FD4;padding-bottom:16px">
      <img src="${LOGO_URL}" style="height:48px;margin-bottom:8px" onerror="this.style.display='none'"/>
      <div style="font-size:20px;font-weight:700;color:#1A7FD4">Tax Case Review</div>
      <div style="font-size:11px;color:#666">238 Evergreen Dr, Lake Park, FL 33403 · info@taxcasereview.com</div>
      <div style="font-size:16px;font-weight:700;margin-top:10px;color:#111">${title}</div>
    </div>`
}

function sigBlock(label1 = 'Client Signature', label2 = 'Authorized Representative') {
  return `
    <div style="display:flex;gap:40px;margin-top:32px">
      <div style="flex:1;border-top:1px solid #333;padding-top:6px;font-size:11px;color:#555">
        ${label1}<br/>Date: ___________________
      </div>
      <div style="flex:1;border-top:1px solid #333;padding-top:6px;font-size:11px;color:#555">
        ${label2} — Tax Case Review<br/>Date: ___________________
      </div>
    </div>`
}

export function printBase(title, body) {
  const w = window.open('', '_blank', 'width=860,height=1000')
  w.document.write(`<!DOCTYPE html><html><head>
    <title>${title}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:40px 48px;max-width:800px;margin:0 auto}
      h3{color:#1A7FD4;margin:18px 0 6px}
      p{margin:6px 0;line-height:1.6}
      ul{margin:6px 0;padding-left:20px;line-height:1.7}
      .fee-box{border:2px solid #1A7FD4;border-radius:6px;padding:12px 16px;margin:16px 0;background:#f0f7ff}
      .fee-box b{font-size:14px}
      .client-box{border:1px solid #ddd;border-radius:6px;padding:10px 14px;margin:0 0 20px;background:#f9f9f9;font-size:11px}
      .client-box b{font-size:13px;display:block;margin-bottom:4px}
      @media print{body{padding:24px}}
    </style>
  </head><body>
    ${printHeader(title)}
    ${body}
  </body></html>`)
  w.document.close()
  setTimeout(() => w.print(), 400)
}

// ─── Client info block ────────────────────────────────────────────────────────
function clientBlock(lead) {
  if (!lead) return ''
  const name = lead.name || `${lead.first || ''} ${lead.last || ''}`.trim() || '___________________'
  const phone = lead.phone || '___________________'
  const email = lead.email || '___________________'
  const address = [lead.street, lead.city, lead.state, lead.zip].filter(Boolean).join(', ') || '___________________'
  const balance = lead.irsBalance || '___________________'
  const fee = lead.taxFee ? `$${lead.taxFee}` : '$___________'
  return `
    <div class="client-box">
      <b>Client: ${name}</b>
      Phone: ${phone} &nbsp;|&nbsp; Email: ${email}<br/>
      Address: ${address}<br/>
      Est. IRS Balance: ${balance} &nbsp;|&nbsp; Investigation Fee: ${fee}
    </div>`
}

// ─── Service Agreement ────────────────────────────────────────────────────────
export function generateServiceAgreement(lead = null) {
  const fee = lead?.taxFee ? `$${lead.taxFee}` : '$___________'
  printBase('Tax Investigation Service Agreement', `
    ${clientBlock(lead)}
    <p>This Tax Investigation Service Agreement ("Agreement") is entered into between <b>Tax Case Review</b> ("Company") and the undersigned client ("Client") as of the date signed below.</p>

    <h3>1. Scope of Services</h3>
    <p>The Company agrees to perform an initial tax investigation, which includes review of tax transcripts, identification of IRS or state tax liabilities, evaluation of available resolution programs, and preparation of a written summary of findings and recommended resolution strategy.</p>

    <h3>2. Company Obligations</h3>
    <ul>
      <li>Obtain IRS transcripts via Form 2848 or 8821</li>
      <li>Analyze outstanding tax liabilities and compliance history</li>
      <li>Identify applicable IRS resolution programs (OIC, CNC, IA, Abatement, etc.)</li>
      <li>Deliver a written resolution recommendation within 21 business days of full access being granted</li>
      <li>Assign a dedicated case representative to the Client</li>
    </ul>

    <h3>3. Client Obligations</h3>
    <ul>
      <li>Provide accurate and complete personal, financial, and tax information</li>
      <li>Execute IRS authorization forms (2848 / 8821) promptly</li>
      <li>Respond to company requests for documents within 5 business days</li>
      <li>Pay the investigation fee in full prior to commencement of services</li>
    </ul>

    <h3>4. Tax Investigation Fee</h3>
    <div class="fee-box">
      <b>Investigation Fee: ${fee}</b><br/>
      <span style="font-size:11px;color:#555">(Standard fee: $499 – $699. Manager-approved rates may vary.)</span><br/>
      <span style="font-size:11px">This fee is non-refundable once transcript review has commenced.</span>
    </div>

    <h3>5. Not a Law Firm</h3>
    <p>Tax Case Review is a tax resolution consulting firm and is <b>not a law firm</b>. No attorney-client relationship is created by this agreement. The Company does not provide legal advice. Enrolled Agents and/or licensed tax professionals perform all representation services.</p>

    <h3>6. No Guarantee of Outcome</h3>
    <p>The Company makes no guarantee as to the specific outcome of any IRS or state tax resolution matter. Acceptance into any IRS program (including Offer in Compromise) is solely at the discretion of the IRS.</p>

    <h3>7. Termination</h3>
    <p>Either party may terminate this Agreement with 5 business days written notice. Investigation fees already paid are non-refundable once services have commenced. The Company may terminate immediately for non-cooperation or material misrepresentation by the Client.</p>

    <h3>8. Dispute Resolution / Arbitration</h3>
    <p>Any dispute arising from this Agreement shall be resolved by binding arbitration under the rules of the American Arbitration Association in Palm Beach County, Florida. Both parties waive their right to a jury trial.</p>

    <h3>9. Governing Law</h3>
    <p>This Agreement is governed by the laws of the State of Florida.</p>

    ${sigBlock('Client Signature', 'Authorized Representative — Tax Case Review')}
    <p style="font-size:10px;color:#888;margin-top:20px;text-align:center">
      Tax Case Review · 238 Evergreen Dr, Lake Park, FL 33403 · info@taxcasereview.com · Not a law firm
    </p>
  `)
}

// ─── Addendum ────────────────────────────────────────────────────────────────
export function generateAddendum(lead = null) {
  printBase('Service Addendum — Additional Services Agreement', `
    ${clientBlock(lead)}
    <p>This Addendum ("Addendum") supplements the Tax Investigation Service Agreement previously executed between <b>Tax Case Review</b> ("Company") and the undersigned client ("Client") and is incorporated therein by reference.</p>

    <h3>1. Additional Services Authorized</h3>
    <p>Client authorizes the Company to proceed with the following additional resolution services beyond the initial tax investigation:</p>
    <ul>
      <li>Full IRS / State representation and negotiation</li>
      <li>Preparation and submission of resolution application (as applicable)</li>
      <li>Power of Attorney representation before the IRS and/or state tax authorities</li>
      <li>Filing of any delinquent returns required for resolution eligibility</li>
      <li>Ongoing case management through resolution acceptance or closure</li>
    </ul>

    <h3>2. Additional Service Fee</h3>
    <div class="fee-box">
      <b>Additional Service Fee: $___________</b><br/>
      <span style="font-size:11px;color:#555">Payment plan: $___________ /month · Starting: ___________</span><br/>
      <span style="font-size:11px">Fees for additional services are separate from and in addition to the investigation fee.</span>
    </div>

    <h3>3. Conditions</h3>
    <p>Services under this Addendum are contingent upon: (a) Client remaining current on any required tax filings; (b) Client maintaining compliance with any IRS or state payment agreements during representation; (c) Timely payment of fees as agreed.</p>

    <h3>4. Incorporation</h3>
    <p>All terms of the original Tax Investigation Service Agreement remain in full force and effect and are incorporated herein. In the event of conflict, this Addendum controls.</p>

    ${sigBlock('Client Signature', 'Authorized Representative — Tax Case Review')}
    <p style="font-size:10px;color:#888;margin-top:20px;text-align:center">
      Tax Case Review · 238 Evergreen Dr, Lake Park, FL 33403 · info@taxcasereview.com · Not a law firm
    </p>
  `)
}

// ─── Engagement Letter ────────────────────────────────────────────────────────
export function generateEngagementLetter(lead = null) {
  const name = lead ? (lead.name || `${lead.first || ''} ${lead.last || ''}`.trim()) : 'Client'
  printBase('Engagement Letter', `
    ${clientBlock(lead)}
    <p>Dear ${name},</p>
    <p>Thank you for choosing <b>Tax Case Review</b>. We are pleased to confirm our engagement to assist you with your federal and/or state tax resolution matter.</p>

    <h3>Services to Be Performed</h3>
    <ul>
      <li>Review your tax transcripts and compliance history with the IRS and/or applicable state taxing authority</li>
      <li>Identify all outstanding liabilities and unfiled returns</li>
      <li>Evaluate eligibility for IRS resolution programs including Installment Agreement, Currently Not Collectible status, Offer in Compromise, Penalty Abatement, and/or Innocent Spouse relief</li>
      <li>Represent you before the IRS and/or state tax authority through resolution</li>
    </ul>

    <h3>Your Responsibilities</h3>
    <ul>
      <li>Provide complete and accurate financial and tax information</li>
      <li>Execute all necessary authorization forms promptly</li>
      <li>Notify us immediately of any IRS or state contacts, notices, or levies received</li>
      <li>Respond to requests for information within 5 business days</li>
    </ul>

    <h3>Our Commitment</h3>
    <p>We are committed to providing professional, ethical, and effective representation. A dedicated case representative will be assigned to your file and will keep you informed of all significant developments.</p>

    ${sigBlock('Client Acknowledgment', 'Authorized Representative — Tax Case Review')}
    <p style="font-size:10px;color:#888;margin-top:20px;text-align:center">
      Tax Case Review · 238 Evergreen Dr, Lake Park, FL 33403 · info@taxcasereview.com · Not a law firm
    </p>
  `)
}

// ─── POA Cover Letter ─────────────────────────────────────────────────────────
export function generatePOACoverLetter(lead = null) {
  const name = lead ? (lead.name || `${lead.first || ''} ${lead.last || ''}`.trim()) : '___________________'
  printBase('Power of Attorney Cover Letter', `
    ${clientBlock(lead)}
    <p>Date: ___________________</p>
    <p>Internal Revenue Service<br/>
    [IRS Campus Address]</p>
    <br/>
    <p>Re: Power of Attorney — Taxpayer: <b>${name}</b><br/>
    SSN/EIN: ___________________<br/>
    Tax Periods: ___________________</p>
    <br/>
    <p>To Whom It May Concern,</p>
    <p>Enclosed please find a completed Form 2848 (Power of Attorney and Declaration of Representative) authorizing Tax Case Review to represent the above-named taxpayer in connection with the tax matters and periods specified therein.</p>
    <p>Please update your records to reflect this authorization and direct all future correspondence regarding the above-referenced matter to our office at the address below.</p>
    <p>If you have any questions or require additional information, please do not hesitate to contact our office.</p>
    <br/>
    <p>Respectfully,</p>
    <br/>
    <p>___________________<br/>
    Authorized Representative<br/>
    Tax Case Review<br/>
    238 Evergreen Dr, Lake Park, FL 33403<br/>
    info@taxcasereview.com</p>
  `)
}
