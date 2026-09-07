// ─── Note templates ──────────────────────────────────────────────────────────
// Starters for the lead/client activity log, in the same shape as the
// system-generated notes: emoji, short title, em dash, then the detail.
//
// Each one is a complete sentence describing the common case, with no
// placeholders to fill in. The rep picks the closest match and edits or adds
// the specifics — so a note posted as-is still reads properly, and nothing ever
// lands in a client file looking half-finished.
//
// `type` pre-selects the matching note type so the log stays filterable.

export const NOTE_TEMPLATES = [
  {
    group: 'Calls',
    items: [
      { label: 'Left voicemail', type: 'Voicemail',
        text: '📞 Left voicemail — introduced myself, explained we can pull their IRS account and see exactly what is owed, and asked for a callback. Will follow up in two days.' },
      { label: 'No answer', type: 'Call',
        text: '📞 No answer — line rang out. Will try again tomorrow at a different time of day.' },
      { label: 'Discovery call', type: 'Call',
        text: '📋 Discovery call — went through the balance owed, the years involved, filing status, and any collection activity so far. Walked through how the investigation works and what the transcripts will tell us.' },
      { label: 'Follow-up call', type: 'Call',
        text: '📞 Follow-up call — checked in on the outstanding items and confirmed the client knows what happens next.' },
      { label: 'Client called in', type: 'Call',
        text: '📞 Client called in — answered their questions and confirmed where the case stands.' },
      { label: 'Reassurance call', type: 'Call',
        text: '📞 Spoke with client — walked through where their case stands, what has already been filed, and the realistic timeline from here. They are comfortable with the plan.' },
    ],
  },
  {
    group: 'IRS / State',
    items: [
      { label: 'Called IRS — PPS', type: 'Call',
        text: '☎️ Called IRS Practitioner Priority Service — confirmed account status, balances by year, filing compliance, collection status, and CSED dates. Requested transcripts by fax.' },
      { label: 'Called State DOR', type: 'Call',
        text: '☎️ Called the state Department of Revenue — confirmed the balance by period, filing compliance, and any collection activity. Requested account records by fax.' },
      { label: 'POA faxed', type: 'Note',
        text: '📠 Faxed Form 2848 and 8821 to the IRS CAF unit — transmission confirmed. Expect CAF posting in five to seven business days, then transcripts can be pulled.' },
      { label: 'POA posted to CAF', type: 'Note',
        text: '✅ POA posted to CAF — authorization is live on the account, so we can pull transcripts and speak with the IRS directly from here.' },
      { label: 'Transcripts received', type: 'Note',
        text: '📄 Transcripts received — reviewed the total balance, the penalty and interest breakdown, unfiled years, and CSED dates. Working up the recommended resolution path.' },
      { label: 'Notice received', type: 'Note',
        text: '⚠️ Client forwarded an IRS notice — logged the notice number, date and response deadline, and started on the required response.' },
      { label: 'Enforcement action', type: 'Note',
        text: '🚨 Active enforcement on the account — contacting the IRS to request a release based on hardship and the pending resolution.' },
    ],
  },
  {
    group: 'Case Work',
    items: [
      { label: 'Documents requested', type: 'Email',
        text: '📧 Emailed a document request — asked for recent pay stubs, bank statements, and current housing and vehicle statements so we can finish the financial analysis.' },
      { label: 'Documents received', type: 'Note',
        text: '📁 Received documents from the client and filed them to the client folder.' },
      { label: 'Financial intake reviewed', type: 'Note',
        text: '💰 Reviewed the submitted financial intake — compared monthly income against allowable expenses to establish disposable income, and valued equity in assets. This is what the resolution recommendation will be built on.' },
      { label: 'Resolution plan reviewed', type: 'Meeting',
        text: '📊 Reviewed the resolution plan with the client — explained the recommended path based on the transcripts and their financials, along with the fee and what happens next. Client is on board.' },
      { label: 'Resolution submitted', type: 'Note',
        text: '📤 Submitted the resolution package to the IRS. Advised the client on what to expect while it is under review and to keep making voluntary payments in the meantime.' },
      { label: 'Compliance check', type: 'Note',
        text: '✅ Compliance check — reviewed filing and estimated payment status. Everything must be current before a resolution can be submitted.' },
    ],
  },
  {
    group: 'Admin',
    items: [
      { label: 'Fee discussion', type: 'Call',
        text: '💳 Discussed fees — went through the amount, the payment schedule, and what the fee covers. Client confirmed and we moved forward.' },
      { label: 'Payment received', type: 'Note',
        text: '💵 Payment received and applied to the balance.' },
      { label: 'Client unresponsive', type: 'Note',
        text: '🔇 No response after several attempts by phone, email and text. Sending a final follow-up before marking this inactive.' },
      { label: 'Case closed', type: 'Note',
        text: '🏁 Case closed — resolution accepted and the client has been notified. Advised them to stay current on filings and payments so the agreement is not defaulted.' },
    ],
  },
]
