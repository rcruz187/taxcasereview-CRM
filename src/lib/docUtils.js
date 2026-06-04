// ─── Shared document utilities — Tax Case Review CRM ─────────────────────────

const LOGO_URL = 'https://mpxgxfqdbquzkrvvejkh.supabase.co/storage/v1/object/public/firm-assets/logo'

function printHeader(title) {
  return `
    <div style="text-align:center;margin-bottom:28px;padding-bottom:18px;border-bottom:3px solid #1A7FD4">
      <img src="${LOGO_URL}" style="height:52px;margin-bottom:10px;display:block;margin-left:auto;margin-right:auto" onerror="this.style.display='none'"/>
      <div style="font-size:22px;font-weight:800;color:#1A7FD4;letter-spacing:-.3px">Tax Case Review</div>
      <div style="font-size:11px;color:#666;margin-top:3px">238 Evergreen Dr, Lake Park, FL 33403 &nbsp;·&nbsp; info@taxcasereview.com &nbsp;·&nbsp; (850) 459-9039</div>
      <div style="font-size:15px;font-weight:700;margin-top:14px;color:#111;text-transform:uppercase;letter-spacing:.5px">${title}</div>
    </div>`
}

function footer() {
  return `
    <div style="margin-top:48px;padding-top:16px;border-top:1px solid #ddd;text-align:center;font-size:10px;color:#999;line-height:1.8">
      Tax Case Review &nbsp;·&nbsp; 238 Evergreen Dr, Lake Park, FL 33403 &nbsp;·&nbsp; info@taxcasereview.com &nbsp;·&nbsp; (850) 459-9039<br/>
      <em>Tax Case Review is a tax resolution consulting firm and is not a law firm. No attorney-client relationship is created by this agreement.</em>
    </div>`
}

function sigBlock(label1 = 'Client Signature', label2 = 'Authorized Representative') {
  return `
    <div style="margin-top:48px;padding-top:0">
      <div style="display:flex;gap:48px;">
        <div style="flex:1">
          <div style="border-top:1.5px solid #333;padding-top:8px;margin-top:0">
            <div style="font-size:12px;font-weight:700;color:#222;margin-bottom:4px">${label1}</div>
            <div style="font-size:11px;color:#555">Print Name: ___________________________________</div>
            <div style="font-size:11px;color:#555;margin-top:6px">Date: _______________________</div>
          </div>
        </div>
        <div style="flex:1">
          <div style="border-top:1.5px solid #333;padding-top:8px;margin-top:0">
            <div style="font-size:12px;font-weight:700;color:#222;margin-bottom:4px">${label2} — Tax Case Review</div>
            <div style="font-size:11px;color:#555">Name: ___________________________________</div>
            <div style="font-size:11px;color:#555;margin-top:6px">Date: _______________________</div>
          </div>
        </div>
      </div>
    </div>`
}

export function printBase(title, body) {
  const w = window.open('', '_blank', 'width=880,height=1100')
  w.document.write(`<!DOCTYPE html><html><head>
    <title>${title} — Tax Case Review</title>
    <style>
      *{box-sizing:border-box}
      body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:12.5px;color:#111;padding:48px 56px;max-width:820px;margin:0 auto;line-height:1.6}
      h3{color:#1A7FD4;margin:22px 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e0eef9;padding-bottom:4px}
      p{margin:8px 0;line-height:1.7}
      ul{margin:8px 0 14px;padding-left:22px;line-height:1.9}
      li{margin-bottom:2px}
      .fee-box{border:2px solid #1A7FD4;border-radius:8px;padding:16px 20px;margin:16px 0;background:#f0f7ff}
      .fee-box .fee-main{font-size:16px;font-weight:800;color:#1A7FD4;margin-bottom:6px}
      .fee-box .fee-sub{font-size:11px;color:#555;line-height:1.7}
      .client-box{border:1px solid #c8daea;border-radius:8px;padding:14px 18px;margin:0 0 24px;background:#f5f9fd}
      .client-box .cb-name{font-size:14px;font-weight:800;color:#111;margin-bottom:6px}
      .client-box .cb-row{font-size:11.5px;color:#444;margin-top:3px}
      .notice{background:#fffbea;border:1px solid #f0c040;border-radius:6px;padding:10px 14px;font-size:11px;color:#7a5c00;margin:14px 0}
      @media print{
        body{padding:24px 32px}
        button{display:none}
      }
    </style>
  </head><body>
    ${printHeader(title)}
    ${body}
    ${footer()}
  </body></html>`)
  w.document.close()
  setTimeout(() => w.print(), 500)
}

// ─── Client info block ────────────────────────────────────────────────────────
function clientBlock(c) {
  if (!c) return ''
  const name    = c.name || `${c.first||''} ${c.last||''}`.trim() || '___________________'
  const phone   = c.phone || '___________________'
  const email   = c.email || '___________________'
  const address = [c.street, c.city, c.state, c.zip].filter(Boolean).join(', ') || '___________________'
  const balance = c.irsBalance ? (isNaN(Number(c.irsBalance)) ? c.irsBalance : '$'+Number(c.irsBalance).toLocaleString()) : '___________________'
  const fee     = c.taxFee ? `$${Number(c.taxFee).toLocaleString()}` : (c.investigationFee ? `$${c.investigationFee}` : '$___________')
  const years   = c.taxYears || '___________________'
  const issue   = c.issueType || '___________________'
  return `
    <div class="client-box">
      <div class="cb-name">${name}</div>
      <div class="cb-row">📞 ${phone} &nbsp;&nbsp; ✉️ ${email}</div>
      <div class="cb-row">📍 ${address}</div>
      <div class="cb-row" style="margin-top:8px;padding-top:8px;border-top:1px solid #d0dde8">
        <b>Est. IRS Balance:</b> ${balance} &nbsp;&nbsp;
        <b>Issue:</b> ${issue} &nbsp;&nbsp;
        <b>Tax Years:</b> ${years} &nbsp;&nbsp;
        <b>Investigation Fee:</b> ${fee}
      </div>
    </div>`
}

// ─── Service Agreement ────────────────────────────────────────────────────────
export function generateServiceAgreement(c = null) {
  const fee  = c?.taxFee ? `$${Number(c.taxFee).toLocaleString()}` : (c?.investigationFee ? `$${c.investigationFee}` : '$___________')
  const date = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})
  printBase('Tax Investigation Service Agreement', `
    <p style="text-align:right;font-size:11px;color:#666;margin-bottom:4px">Date: ${date}</p>
    ${clientBlock(c)}

    <p>This Tax Investigation Service Agreement (<b>"Agreement"</b>) is entered into between <b>Tax Case Review</b> ("Company") and the undersigned client ("Client") as of the date signed below.</p>

    <h3>1. Scope of Services</h3>
    <p>The Company agrees to perform an initial tax investigation, which includes:</p>
    <ul>
      <li>Review of IRS and/or state tax transcripts</li>
      <li>Identification of outstanding tax liabilities</li>
      <li>Evaluation of available resolution programs</li>
      <li>Preparation of a written summary and recommended resolution strategy</li>
    </ul>

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
      <li>Execute IRS authorization forms (Form 2848 / 8821) promptly</li>
      <li>Respond to company requests for documents within 5 business days</li>
      <li>Pay the investigation fee in full prior to commencement of services</li>
    </ul>

    <h3>4. Tax Investigation Fee</h3>
    <div class="fee-box">
      <div class="fee-main">Investigation Fee: ${fee}</div>
      <div class="fee-sub">
        This fee is non-refundable once transcript review has commenced.<br/>
        Standard range: $499 – $699. Manager-approved rates may vary.
      </div>
    </div>

    <h3>5. Not a Law Firm</h3>
    <p>Tax Case Review is a tax resolution consulting firm and is <b>not a law firm</b>. No attorney-client relationship is created by this Agreement. Enrolled Agents and/or licensed tax professionals perform all representation services.</p>

    <h3>6. No Guarantee of Outcome</h3>
    <p>The Company makes no guarantee as to the specific outcome of any IRS or state tax resolution matter. Acceptance into any IRS program (including Offer in Compromise) is solely at the discretion of the IRS.</p>

    <h3>7. Termination</h3>
    <p>Either party may terminate this Agreement with 5 business days written notice. Investigation fees already paid are non-refundable once services have commenced. The Company may terminate immediately for non-cooperation or material misrepresentation.</p>

    <h3>8. Dispute Resolution</h3>
    <p>Any dispute arising from this Agreement shall be resolved by binding arbitration under the rules of the American Arbitration Association in Palm Beach County, Florida. Both parties waive their right to a jury trial.</p>

    <h3>9. Governing Law</h3>
    <p>This Agreement is governed by the laws of the State of Florida.</p>

    ${sigBlock('Client Signature', 'Authorized Representative')}
  `)
}

// ─── Addendum — called with pre-filled fee/scope from modal ──────────────────
export function generateAddendum(c = null, opts = {}) {
  const {
    resolutionFee   = '',
    paymentPlan     = '',
    startDate       = '',
    workScope       = [],
    notes           = '',
  } = opts

  const feeDisplay  = resolutionFee ? `$${Number(resolutionFee).toLocaleString()}` : '$___________'
  const planDisplay = paymentPlan   ? `$${Number(paymentPlan).toLocaleString()} /month` : '$___________ /month'
  const startDisp   = startDate     || '___________'

  const defaultScope = [
    'Full IRS / State representation and negotiation',
    'Preparation and submission of resolution application (OIC, IA, CNC, Abatement, or applicable program)',
    'Power of Attorney representation before the IRS and/or state tax authorities',
    'Filing of any delinquent returns required for resolution eligibility',
    'Ongoing case management through resolution acceptance or closure',
  ]
  const scopeItems = workScope.length > 0 ? workScope : defaultScope

  const date = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})

  printBase('Service Addendum — Additional Services Agreement', `
    <p style="text-align:right;font-size:11px;color:#666;margin-bottom:4px">Date: ${date}</p>
    ${clientBlock(c)}

    <p>This Addendum (<b>"Addendum"</b>) supplements the Tax Investigation Service Agreement previously executed between <b>Tax Case Review</b> ("Company") and the undersigned client ("Client") and is incorporated therein by reference.</p>

    <h3>1. Additional Services Authorized</h3>
    <p>Client authorizes the Company to proceed with the following resolution services beyond the initial tax investigation:</p>
    <ul>
      ${scopeItems.map(s=>`<li>${s}</li>`).join('\n      ')}
    </ul>
    ${notes ? `<p><b>Additional Scope Notes:</b> ${notes}</p>` : ''}

    <h3>2. Resolution Service Fee</h3>
    <div class="fee-box">
      <div class="fee-main">Resolution Service Fee: ${feeDisplay}</div>
      <div class="fee-sub">
        Payment Plan: ${planDisplay} · Starting: ${startDisp}<br/>
        Fees for resolution services are separate from and in addition to the investigation fee.<br/>
        Payments are due on the agreed start date and monthly thereafter until paid in full.
      </div>
    </div>

    <h3>3. Conditions</h3>
    <p>Services under this Addendum are contingent upon: (a) Client remaining current on any required tax filings; (b) Client maintaining compliance with any IRS or state payment agreements during representation; (c) Timely payment of fees as agreed upon above.</p>

    <h3>4. Incorporation &amp; Entire Agreement</h3>
    <p>All terms of the original Tax Investigation Service Agreement remain in full force and effect and are incorporated herein. In the event of conflict between this Addendum and the original Agreement, this Addendum controls.</p>

    <h3>5. Client Acknowledgment</h3>
    <p>By signing below, Client confirms they have read, understand, and agree to the terms of this Addendum and authorize Tax Case Review to proceed with the resolution services described herein.</p>

    ${sigBlock('Client Signature', 'Authorized Representative')}
  `)
}

// ─── Engagement Letter ────────────────────────────────────────────────────────
export function generateEngagementLetter(c = null) {
  const name    = c ? (c.name || `${c.first||''} ${c.last||''}`.trim()) : 'Valued Client'
  const fee     = c?.taxFee ? `$${Number(c.taxFee).toLocaleString()}` : (c?.investigationFee ? `$${c.investigationFee}` : '$___________')
  const issue   = c?.issueType || 'tax resolution matter'
  const years   = c?.taxYears  || '___________________'
  const rep     = c?.assignedTo || '___________________'
  const date    = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})

  printBase('Engagement Letter', `
    <p style="text-align:right;font-size:11px;color:#666;margin-bottom:16px">${date}</p>
    ${clientBlock(c)}

    <p>Dear <b>${name}</b>,</p>
    <p>Thank you for choosing <b>Tax Case Review</b>. We are pleased to confirm our engagement to assist you with your ${issue} matter${years !== '___________________' ? ` for tax year(s) ${years}` : ''}. Your dedicated case representative is <b>${rep}</b>.</p>

    <h3>Services to Be Performed</h3>
    <ul>
      <li>Review your tax transcripts and compliance history with the IRS and/or applicable state taxing authority</li>
      <li>Identify all outstanding liabilities and unfiled returns</li>
      <li>Evaluate eligibility for IRS resolution programs including Installment Agreement, Currently Not Collectible (CNC), Offer in Compromise, Penalty Abatement, and/or Innocent Spouse relief</li>
      <li>Represent you before the IRS and/or state tax authority through resolution</li>
    </ul>

    <h3>Investigation Fee</h3>
    <div class="fee-box">
      <div class="fee-main">Investigation Fee: ${fee}</div>
      <div class="fee-sub">
        This fee covers the initial tax investigation, transcript retrieval, and delivery of a written resolution strategy.<br/>
        This fee is non-refundable once transcript review has commenced.
      </div>
    </div>

    <h3>Your Responsibilities</h3>
    <ul>
      <li>Provide complete and accurate financial and tax information</li>
      <li>Execute all necessary authorization forms (Form 2848 / 8821) promptly</li>
      <li>Notify us immediately of any IRS or state contacts, notices, or levies received</li>
      <li>Respond to requests for information within 5 business days</li>
    </ul>

    <h3>Our Commitment to You</h3>
    <p>We are committed to providing professional, ethical, and effective representation. Your assigned representative will keep you informed of all significant developments in your case. We are available Monday through Friday to answer your questions.</p>

    <div class="notice">
      <b>Important:</b> Tax Case Review is a tax resolution consulting firm and is not a law firm. No attorney-client relationship is created by this engagement. All representation is performed by Enrolled Agents and/or licensed tax professionals.
    </div>

    ${sigBlock('Client Acknowledgment', 'Authorized Representative')}
  `)
}

// ─── POA Cover Letter ─────────────────────────────────────────────────────────
export function generatePOACoverLetter(c = null) {
  const name  = c ? (c.name || `${c.first||''} ${c.last||''}`.trim()) : '___________________'
  const ssn   = c?.ssn ? `***-**-${c.ssn.replace(/-/g,'').slice(-4)}` : '___-__-____'
  const years = c?.taxYears || '___________________'
  const date  = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})

  printBase('Power of Attorney Cover Letter — Form 2848', `
    <p style="margin-bottom:24px;font-size:11px;color:#666">${date}</p>

    <p>Internal Revenue Service<br/>
    [IRS Campus — See Form 2848 Instructions for Applicable Address]</p>

    <p style="margin-top:20px"><b>Re: Power of Attorney — Form 2848</b><br/>
    <b>Taxpayer:</b> ${name}<br/>
    <b>SSN/EIN:</b> ${ssn}<br/>
    <b>Tax Periods:</b> ${years}</p>

    <p style="margin-top:20px">To Whom It May Concern,</p>

    <p>Enclosed please find a completed Form 2848 (Power of Attorney and Declaration of Representative) authorizing <b>Tax Case Review</b> to represent the above-named taxpayer in connection with the tax matters and periods specified therein.</p>

    <p>Please update your records to reflect this authorization and direct all future correspondence regarding the above-referenced matter to our office at the address below. We respectfully request that all notices, letters, and communications be sent to our office rather than directly to the taxpayer.</p>

    <p>If you have any questions or require additional information, please do not hesitate to contact our office.</p>

    <p style="margin-top:28px">Respectfully submitted,</p>

    <div style="margin-top:32px;padding-top:8px;border-top:1.5px solid #333;display:inline-block;min-width:260px">
      <div style="font-size:12px;font-weight:700">Authorized Representative</div>
      <div style="font-size:11.5px;margin-top:4px">Tax Case Review</div>
      <div style="font-size:11px;color:#555;margin-top:2px">238 Evergreen Dr, Lake Park, FL 33403</div>
      <div style="font-size:11px;color:#555">info@taxcasereview.com &nbsp;·&nbsp; (850) 459-9039</div>
      <div style="font-size:11px;color:#888;margin-top:6px">Date: _______________________</div>
    </div>
  `)
}

// ─── Combined Client Package (Service Agreement + Engagement Letter) ──────────
export function generateClientPackage(c = null) {
  const fee  = c?.taxFee ? `$${Number(c.taxFee).toLocaleString()}` : (c?.investigationFee ? `$${c.investigationFee}` : '$___________')
  const name = c ? (c.name || `${c.first||''} ${c.last||''}`.trim()) : 'Valued Client'
  const issue = c?.issueType || 'tax resolution matter'
  const years = c?.taxYears || '___________________'
  const rep   = c?.assignedTo || '___________________'
  const date  = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})

  printBase('Tax Investigation Service Agreement & Engagement Letter', `
    <p style="text-align:right;font-size:11px;color:#666;margin-bottom:4px">Date: ${date}</p>
    ${clientBlock(c)}

    <p>Dear <b>${name}</b>,</p>
    <p>Thank you for choosing <b>Tax Case Review</b>. This document serves as both your <b>Tax Investigation Service Agreement</b> and <b>Engagement Letter</b> confirming our engagement to assist you with your ${issue} matter${years !== '___________________' ? ` for tax year(s) ${years}` : ''}.</p>

    <h3>1. Scope of Services</h3>
    <p>Tax Case Review agrees to perform an initial tax investigation, including:</p>
    <ul>
      <li>Review of IRS and/or state tax transcripts</li>
      <li>Identification of outstanding tax liabilities and unfiled returns</li>
      <li>Evaluation of eligibility for IRS resolution programs (OIC, CNC, IA, Penalty Abatement, etc.)</li>
      <li>Preparation and delivery of a written resolution strategy within 21 business days of full access being granted</li>
      <li>Full IRS/state representation through a dedicated case representative: <b>${rep}</b></li>
    </ul>

    <h3>2. Authorization</h3>
    <p>Client authorizes Tax Case Review to obtain IRS transcripts via Form 2848 (Power of Attorney) or Form 8821 (Tax Information Authorization) and to represent the Client before the IRS and/or applicable state tax authority throughout the resolution process.</p>

    <h3>3. Investigation Fee</h3>
    <div class="fee-box">
      <div class="fee-main">Investigation Fee: ${fee}</div>
      <div class="fee-sub">
        Non-refundable once transcript review has commenced. Standard range: $499–$699.<br/>
        Full payment due prior to commencement of services.
      </div>
    </div>

    <h3>4. Client Responsibilities</h3>
    <ul>
      <li>Provide accurate and complete financial and tax information</li>
      <li>Execute IRS authorization forms (Form 2848 / 8821) promptly</li>
      <li>Respond to requests for documents within 5 business days</li>
      <li>Notify us immediately of any IRS notices, levies, or contacts received</li>
    </ul>

    <h3>5. Our Commitment</h3>
    <p>We are committed to professional, ethical, and effective representation. Your representative will keep you informed of all significant developments. We are available Monday through Friday.</p>

    <h3>6. No Guarantee of Outcome</h3>
    <p>Tax Case Review makes no guarantee as to any specific outcome. Acceptance into any IRS program is solely at the discretion of the IRS.</p>

    <h3>7. Not a Law Firm</h3>
    <p>Tax Case Review is a tax resolution consulting firm and is <b>not a law firm</b>. No attorney-client relationship is created. All representation is performed by Enrolled Agents and/or licensed tax professionals.</p>

    <h3>8. Termination</h3>
    <p>Either party may terminate with 5 business days written notice. Investigation fees already paid are non-refundable once services have commenced.</p>

    <h3>9. Governing Law</h3>
    <p>This Agreement is governed by the laws of the State of Florida. Disputes shall be resolved by binding arbitration in Palm Beach County, Florida.</p>

    ${sigBlock('Client Signature & Acknowledgment', 'Authorized Representative — Tax Case Review')}
  `)
}

// ─── Form 8821 — Tax Information Authorization ────────────────────────────────
export function generateForm8821(c = null) {
  const name    = c ? (c.name || `${c.first||''} ${c.last||''}`.trim()) : '___________________'
  const address = c ? ([c.street, c.city, c.state, c.zip].filter(Boolean).join(', ') || '___________________') : '___________________'
  const ssn     = c?.ssn ? `XXX-XX-${c.ssn.replace(/-/g,'').slice(-4)}` : '___-__-____'
  const phone   = c?.phone || '___________________'
  const years   = c?.taxYears || '___________________'
  const date    = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})

  printBase('Form 8821 — Tax Information Authorization', `
    <div class="notice" style="margin-bottom:20px">
      <b>Note:</b> This is a pre-filled draft for review. The taxpayer must sign the official IRS Form 8821.
      Download the official form at <a href="https://www.irs.gov/pub/irs-pdf/f8821.pdf" target="_blank">irs.gov/pub/irs-pdf/f8821.pdf</a>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px">
      <tr><td colspan="2" style="background:#1A7FD4;color:#fff;font-weight:700;padding:8px 12px;font-size:13px">Section 1 — Taxpayer Information</td></tr>
      <tr>
        <td style="border:1px solid #ccc;padding:10px 12px;width:50%">
          <div style="font-size:10px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:4px">Taxpayer Name</div>
          <div style="font-size:14px;font-weight:700">${name}</div>
        </td>
        <td style="border:1px solid #ccc;padding:10px 12px">
          <div style="font-size:10px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:4px">SSN / EIN</div>
          <div style="font-size:14px;font-weight:700">${ssn}</div>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="border:1px solid #ccc;padding:10px 12px">
          <div style="font-size:10px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:4px">Address</div>
          <div style="font-size:13px">${address}</div>
        </td>
      </tr>
      <tr>
        <td style="border:1px solid #ccc;padding:10px 12px">
          <div style="font-size:10px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:4px">Phone Number</div>
          <div style="font-size:13px">${phone}</div>
        </td>
        <td style="border:1px solid #ccc;padding:10px 12px">
          <div style="font-size:10px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:4px">Date</div>
          <div style="font-size:13px">${date}</div>
        </td>
      </tr>
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px">
      <tr><td colspan="2" style="background:#1A7FD4;color:#fff;font-weight:700;padding:8px 12px;font-size:13px">Section 2 — Appointee (Tax Case Review)</td></tr>
      <tr>
        <td style="border:1px solid #ccc;padding:10px 12px;width:50%">
          <div style="font-size:10px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:4px">Name</div>
          <div style="font-size:13px">Tax Case Review</div>
        </td>
        <td style="border:1px solid #ccc;padding:10px 12px">
          <div style="font-size:10px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:4px">CAF Number</div>
          <div style="font-size:13px">___________________</div>
        </td>
      </tr>
      <tr>
        <td style="border:1px solid #ccc;padding:10px 12px">
          <div style="font-size:10px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:4px">Address</div>
          <div style="font-size:13px">238 Evergreen Dr, Lake Park, FL 33403</div>
        </td>
        <td style="border:1px solid #ccc;padding:10px 12px">
          <div style="font-size:10px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:4px">Phone</div>
          <div style="font-size:13px">(850) 459-9039</div>
        </td>
      </tr>
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px">
      <tr><td style="background:#1A7FD4;color:#fff;font-weight:700;padding:8px 12px;font-size:13px">Section 3 — Tax Matters</td></tr>
      <tr><td style="border:1px solid #ccc;padding:10px 12px">
        <div style="font-size:10px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:8px">Type of Tax / Tax Form Number / Tax Years or Periods</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <tr style="background:#f5f5f5">
            <th style="border:1px solid #ddd;padding:6px 10px;text-align:left">Type of Tax</th>
            <th style="border:1px solid #ddd;padding:6px 10px;text-align:left">Form Number</th>
            <th style="border:1px solid #ddd;padding:6px 10px;text-align:left">Tax Year(s) / Period(s)</th>
          </tr>
          <tr>
            <td style="border:1px solid #ddd;padding:8px 10px">Income</td>
            <td style="border:1px solid #ddd;padding:8px 10px">1040</td>
            <td style="border:1px solid #ddd;padding:8px 10px">${years}</td>
          </tr>
          <tr>
            <td style="border:1px solid #ddd;padding:8px 10px">Penalty</td>
            <td style="border:1px solid #ddd;padding:8px 10px">All</td>
            <td style="border:1px solid #ddd;padding:8px 10px">${years}</td>
          </tr>
        </table>
      </td></tr>
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px">
      <tr><td style="background:#1A7FD4;color:#fff;font-weight:700;padding:8px 12px;font-size:13px">Section 6 — Taxpayer Signature</td></tr>
      <tr><td style="border:1px solid #ccc;padding:16px 12px">
        <div style="display:flex;gap:48px">
          <div style="flex:2">
            <div style="border-top:1.5px solid #333;padding-top:8px;margin-top:24px">
              <div style="font-size:11px;font-weight:700">Taxpayer Signature</div>
              <div style="font-size:11px;color:#555;margin-top:4px">Print Name: ${name}</div>
            </div>
          </div>
          <div style="flex:1">
            <div style="border-top:1.5px solid #333;padding-top:8px;margin-top:24px">
              <div style="font-size:11px;font-weight:700">Date</div>
              <div style="font-size:11px;color:#555;margin-top:4px">${date}</div>
            </div>
          </div>
        </div>
      </td></tr>
    </table>
  `)
}

// ─── Form 2848 — Power of Attorney ───────────────────────────────────────────
export function generateForm2848(c = null) {
  const name    = c ? (c.name || `${c.first||''} ${c.last||''}`.trim()) : '___________________'
  const address = c ? ([c.street, c.city, c.state, c.zip].filter(Boolean).join(', ') || '___________________') : '___________________'
  const ssn     = c?.ssn ? `XXX-XX-${c.ssn.replace(/-/g,'').slice(-4)}` : '___-__-____'
  const phone   = c?.phone || '___________________'
  const years   = c?.taxYears || '___________________'
  const date    = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})

  printBase('Form 2848 — Power of Attorney and Declaration of Representative', `
    <div class="notice" style="margin-bottom:20px">
      <b>Note:</b> This is a pre-filled draft for review. The taxpayer must sign the official IRS Form 2848.
      Download at <a href="https://www.irs.gov/pub/irs-pdf/f2848.pdf" target="_blank">irs.gov/pub/irs-pdf/f2848.pdf</a>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px">
      <tr><td colspan="2" style="background:#1A7FD4;color:#fff;font-weight:700;padding:8px 12px;font-size:13px">Part I — Power of Attorney</td></tr>
      <tr><td colspan="2" style="background:#eaf2fb;padding:6px 12px;font-size:11px;color:#1A7FD4;font-weight:600">Section 1 — Taxpayer Information</td></tr>
      <tr>
        <td style="border:1px solid #ccc;padding:10px 12px;width:50%">
          <div style="font-size:10px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:4px">Taxpayer Name</div>
          <div style="font-size:14px;font-weight:700">${name}</div>
        </td>
        <td style="border:1px solid #ccc;padding:10px 12px">
          <div style="font-size:10px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:4px">SSN / EIN</div>
          <div style="font-size:14px;font-weight:700">${ssn}</div>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="border:1px solid #ccc;padding:10px 12px">
          <div style="font-size:10px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:4px">Address</div>
          <div style="font-size:13px">${address}</div>
        </td>
      </tr>
      <tr>
        <td style="border:1px solid #ccc;padding:10px 12px">
          <div style="font-size:10px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:4px">Phone</div>
          <div style="font-size:13px">${phone}</div>
        </td>
        <td style="border:1px solid #ccc;padding:10px 12px">
          <div style="font-size:10px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:4px">Date</div>
          <div style="font-size:13px">${date}</div>
        </td>
      </tr>
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px">
      <tr><td colspan="2" style="background:#eaf2fb;padding:6px 12px;font-size:11px;color:#1A7FD4;font-weight:600">Section 2 — Representative (Appointee)</td></tr>
      <tr>
        <td style="border:1px solid #ccc;padding:10px 12px;width:50%">
          <div style="font-size:10px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:4px">Name</div>
          <div style="font-size:13px">Tax Case Review</div>
        </td>
        <td style="border:1px solid #ccc;padding:10px 12px">
          <div style="font-size:10px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:4px">CAF Number</div>
          <div style="font-size:13px">___________________</div>
        </td>
      </tr>
      <tr>
        <td style="border:1px solid #ccc;padding:10px 12px">
          <div style="font-size:10px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:4px">Address</div>
          <div style="font-size:13px">238 Evergreen Dr, Lake Park, FL 33403</div>
        </td>
        <td style="border:1px solid #ccc;padding:10px 12px">
          <div style="font-size:10px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:4px">Designation (ea/cpa/etc)</div>
          <div style="font-size:13px">Enrolled Agent</div>
        </td>
      </tr>
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px">
      <tr><td style="background:#eaf2fb;padding:6px 12px;font-size:11px;color:#1A7FD4;font-weight:600">Section 3 — Tax Matters</td></tr>
      <tr><td style="border:1px solid #ccc;padding:10px 12px">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <tr style="background:#f5f5f5">
            <th style="border:1px solid #ddd;padding:6px 10px;text-align:left">Type of Tax</th>
            <th style="border:1px solid #ddd;padding:6px 10px;text-align:left">Form Number</th>
            <th style="border:1px solid #ddd;padding:6px 10px;text-align:left">Tax Year(s)</th>
            <th style="border:1px solid #ddd;padding:6px 10px;text-align:left">Specific Tax Matters</th>
          </tr>
          <tr>
            <td style="border:1px solid #ddd;padding:8px 10px">Income</td>
            <td style="border:1px solid #ddd;padding:8px 10px">1040</td>
            <td style="border:1px solid #ddd;padding:8px 10px">${years}</td>
            <td style="border:1px solid #ddd;padding:8px 10px">All matters</td>
          </tr>
          <tr>
            <td style="border:1px solid #ddd;padding:8px 10px">Penalty</td>
            <td style="border:1px solid #ddd;padding:8px 10px">All</td>
            <td style="border:1px solid #ddd;padding:8px 10px">${years}</td>
            <td style="border:1px solid #ddd;padding:8px 10px">Abatement / Waiver</td>
          </tr>
        </table>
      </td></tr>
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px">
      <tr><td style="background:#eaf2fb;padding:6px 12px;font-size:11px;color:#1A7FD4;font-weight:600">Section 5 — Acts Authorized</td></tr>
      <tr><td style="border:1px solid #ccc;padding:10px 12px;font-size:11px;line-height:1.8">
        The representative is authorized to receive and inspect confidential tax information and to perform any and all acts that the taxpayer can perform with respect to the tax matters described in Section 3, including:
        receiving notices and communications, executing waivers, executing closing agreements, representing the taxpayer before IRS Appeals, and any other tax matter listed above.
      </td></tr>
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px">
      <tr><td colspan="2" style="background:#eaf2fb;padding:6px 12px;font-size:11px;color:#1A7FD4;font-weight:600">Section 9 — Taxpayer Signature</td></tr>
      <tr><td colspan="2" style="border:1px solid #ccc;padding:16px 12px">
        <p style="font-size:11px;color:#555;margin-bottom:16px">
          Under penalties of perjury, I declare that I am the taxpayer referenced above and that the information on this document is true, correct, and complete.
        </p>
        <div style="display:flex;gap:48px">
          <div style="flex:2">
            <div style="border-top:1.5px solid #333;padding-top:8px;margin-top:24px">
              <div style="font-size:11px;font-weight:700">Taxpayer Signature</div>
              <div style="font-size:11px;color:#555;margin-top:4px">Print Name: ${name}</div>
            </div>
          </div>
          <div style="flex:1">
            <div style="border-top:1.5px solid #333;padding-top:8px;margin-top:24px">
              <div style="font-size:11px;font-weight:700">Date</div>
              <div style="font-size:11px;color:#555;margin-top:4px">${date}</div>
            </div>
          </div>
        </div>
      </td></tr>
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <tr><td colspan="2" style="background:#1A7FD4;color:#fff;font-weight:700;padding:8px 12px;font-size:13px">Part II — Declaration of Representative</td></tr>
      <tr><td colspan="2" style="border:1px solid #ccc;padding:10px 12px;font-size:11px;line-height:1.8">
        Under penalties of perjury, I declare that I am not currently under suspension or disbarment from practice before the IRS; that I am aware of the regulations in Circular 230; and that I am authorized to represent the taxpayer identified in Part I.
      </td></tr>
      <tr>
        <td style="border:1px solid #ccc;padding:10px 12px">
          <div style="font-size:10px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:4px">Representative Signature</div>
          <div style="border-top:1.5px solid #333;padding-top:8px;margin-top:24px">
            <div style="font-size:11px;color:#555">Tax Case Review — Authorized Representative</div>
          </div>
        </td>
        <td style="border:1px solid #ccc;padding:10px 12px">
          <div style="font-size:10px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:4px">Date</div>
          <div style="border-top:1.5px solid #333;padding-top:8px;margin-top:24px">
            <div style="font-size:11px;color:#555">${date}</div>
          </div>
        </td>
      </tr>
    </table>
  `)
}
