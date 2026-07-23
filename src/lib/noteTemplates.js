// ─── Note templates ──────────────────────────────────────────────────────────
// Written to match the house style of the system-generated notes: an emoji, a
// short title, an em dash, then the detail flowing as a complete sentence.
//
// These read as finished notes on their own. Anything the rep should swap out
// sits in <angle brackets> so it stands out inline without leaving the note
// looking like a blank form — a template left half-edited still reads as
// English rather than a row of underscores.
//
// `type` pre-selects the matching note type so the activity log stays
// filterable.

export const NOTE_TEMPLATES = [
  {
    group: 'Calls',
    items: [
      { label: 'Left voicemail', type: 'Voicemail',
        text: '📞 Left voicemail — introduced myself, explained we can pull their IRS account and see exactly what is owed, and asked for a callback. Will try again in two days.' },
      { label: 'No answer', type: 'Call',
        text: '📞 No answer — line rang out, no voicemail box. Will try again tomorrow at a different time of day.' },
      { label: 'Discovery call', type: 'Call',
        text: '📋 Discovery call — owes roughly <$amount> for tax years <years>. <Filed through 2024 / has unfiled returns>. <No enforcement yet / received a notice / wages being garnished>. Currently <employed / self-employed> and says they can put <$amount> toward this monthly. Walked through how the investigation works and what transcripts will tell us.' },
      { label: 'Follow-up call', type: 'Call',
        text: '📞 Follow-up call — checked in on <what we were waiting for>. <Client confirmed they will send it by Friday.> Nothing else outstanding on their end.' },
      { label: 'Client called in', type: 'Call',
        text: '📞 Client called in about <reason>. Answered their questions and confirmed <what happens next>. No further action needed right now.' },
      { label: 'Reassurance call', type: 'Call',
        text: '📞 Spoke with client — they were anxious about <the notice / the deadline>. Explained where their case stands, what we have already filed, and the realistic timeline. They are comfortable with the plan.' },
    ],
  },
  {
    group: 'IRS / State',
    items: [
      { label: 'Called IRS — PPS', type: 'Call',
        text: '☎️ Called IRS Practitioner Priority Service — spoke with <rep name, ID #> after a <20>-minute hold. Account shows <$amount> across <years>. <All returns filed / missing 2022 and 2023>. Collection status is <notice status / ACS / assigned to a revenue officer>. Earliest CSED is <date>. Requested transcripts by fax.' },
      { label: 'Called State DOR', type: 'Call',
        text: '☎️ Called the <FL> Department of Revenue — spoke with <rep name, ID #>. Balance is <$amount> for periods <periods>. <No active enforcement / lien filed on date>. Requested account records by fax.' },
      { label: 'POA faxed', type: 'Note',
        text: '📠 Faxed Form 2848 and 8821 to the IRS CAF unit — transmission confirmed. Expect CAF posting in five to seven business days, then transcripts can be pulled.' },
      { label: 'POA posted to CAF', type: 'Note',
        text: '✅ POA posted to CAF — authorization is live on the account, so we can pull transcripts and speak with the IRS directly from here.' },
      { label: 'Transcripts received', type: 'Note',
        text: '📄 Transcripts received for <years> — total balance is <$amount>, of which roughly <$amount> is penalties and interest. <All returns filed / 2022 and 2023 still unfiled>. Earliest CSED is <date>. Preliminary read: <installment agreement / CNC / offer in compromise> looks like the right path, pending the financials.' },
      { label: 'Notice received', type: 'Note',
        text: '⚠️ Client forwarded a <CP504> notice dated <date> — <final notice before levy>, response due by <date>. <Filing a CDP request / calling PPS to hold collections> today.' },
      { label: 'Enforcement action', type: 'Note',
        text: '🚨 <Levy / garnishment / lien> in place — <employer began withholding on date / lien filed in county>. Contacting the IRS to request a release based on <hardship / pending resolution>.' },
    ],
  },
  {
    group: 'Case Work',
    items: [
      { label: 'Documents requested', type: 'Email',
        text: '📧 Emailed a document request — asked for <two months of pay stubs, three months of bank statements, and the current mortgage statement>. Due back by <date> so we can finish the financial analysis.' },
      { label: 'Documents received', type: 'Note',
        text: '📁 Received <pay stubs and bank statements> from the client and filed them to the client folder. Still waiting on <the mortgage statement>.' },
      { label: 'Financial intake reviewed', type: 'Note',
        text: '💰 Reviewed the submitted financial intake — <$amount> monthly income against <$amount> in allowable expenses, leaving roughly <$amount> disposable. Equity in assets is <$amount>. On these numbers <an installment agreement at $X / CNC status / an offer> is the realistic path.' },
      { label: 'Resolution plan reviewed', type: 'Meeting',
        text: '📊 Reviewed the resolution plan with the client — recommended <an installment agreement at $X per month> based on the transcripts and their financials. Client is on board and understands <the fee and what happens next>.' },
      { label: 'Resolution submitted', type: 'Note',
        text: '📤 Submitted <Form 433-A and the installment agreement request> to the IRS. Expect a response in <30 to 60> days. Advised the client to keep making <$amount> voluntary payments in the meantime.' },
      { label: 'Compliance check', type: 'Note',
        text: '✅ Compliance check — client is current on <filings and estimated payments>. <Nothing outstanding / the 2024 return still needs to be filed before we can submit a resolution>.' },
    ],
  },
  {
    group: 'Admin',
    items: [
      { label: 'Fee discussion', type: 'Call',
        text: '💳 Discussed fees — <$amount> for the resolution work, <paid in full / split across three monthly payments starting date>. Client confirmed and we <ran the card / sent the agreement>.' },
      { label: 'Payment received', type: 'Note',
        text: '💵 Payment of <$amount> received by <card>. Remaining balance is <$amount>.' },
      { label: 'Client unresponsive', type: 'Note',
        text: '🔇 No response after <three> attempts by phone, email and text since <date>. Sending a final follow-up before moving this to <inactive>.' },
      { label: 'Case closed', type: 'Note',
        text: '🏁 Case closed — <installment agreement accepted at $X per month / offer accepted / balance paid in full>. Client notified and advised to stay current on filings so the agreement is not defaulted.' },
    ],
  },
]
