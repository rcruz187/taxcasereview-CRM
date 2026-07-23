// ─── Note templates ──────────────────────────────────────────────────────────
// Canned openers for the lead/client activity log. Picking one drops the text
// into the note box for the rep to finish — it never posts on its own, because
// a note that nobody edited is worse than no note at all.
//
// `type` pre-selects the matching note type (Call, Email, ...) so the log stays
// filterable. Blanks are written as ____ so an unfinished note is obvious at a
// glance when someone reads the file later.

export const NOTE_TEMPLATES = [
  {
    group: 'Calls',
    items: [
      { label: 'Left voicemail', type: 'Voicemail',
        text: 'Called and left a voicemail. Asked them to call back at their convenience. Next attempt: ____.' },
      { label: 'No answer', type: 'Call',
        text: 'Called — no answer, no voicemail left. Next attempt: ____.' },
      { label: 'Discovery call', type: 'Call',
        text: 'Discovery call.\nTax problem: ____\nYears involved: ____\nApprox. balance: ____\nCurrently filed/compliant: ____\nEnforcement in play (levy, lien, garnishment): ____\nAbility to pay: ____\nNext step: ____' },
      { label: 'Follow-up call', type: 'Call',
        text: 'Follow-up call. Discussed: ____\nOutstanding items: ____\nNext step: ____' },
      { label: 'Client called in', type: 'Call',
        text: 'Client called in. Reason: ____\nResolved on the call: ____\nFollow-up needed: ____' },
    ],
  },
  {
    group: 'IRS / State',
    items: [
      { label: 'Called IRS — PPS', type: 'Call',
        text: 'Called IRS Practitioner Priority Service.\nRep name/ID: ____\nHold time: ____\nAccount status: ____\nBalances by year: ____\nCSED / assessment dates: ____\nEnforcement status: ____\nNext step: ____' },
      { label: 'Called State DOR', type: 'Call',
        text: 'Called the state Department of Revenue.\nRep name/ID: ____\nAccount status: ____\nBalances by period: ____\nEnforcement status: ____\nNext step: ____' },
      { label: 'POA faxed', type: 'Note',
        text: 'Faxed POA (2848/8821) to ____ at ____. Confirmation received: ____. Will confirm CAF posting in 5-7 business days.' },
      { label: 'Transcripts received', type: 'Note',
        text: 'Transcripts received for years ____.\nTotal balance: ____\nUnfiled years: ____\nNotable transactions: ____\nCSED dates: ____\nRecommended path: ____' },
      { label: 'Notice received', type: 'Note',
        text: 'Client forwarded IRS/state notice.\nNotice number: ____\nDate on notice: ____\nDeadline: ____\nAction required: ____' },
    ],
  },
  {
    group: 'Case Work',
    items: [
      { label: 'Documents requested', type: 'Email',
        text: 'Emailed the client a document request.\nRequested: ____\nDue back by: ____' },
      { label: 'Documents received', type: 'Note',
        text: 'Received from client: ____\nStill outstanding: ____' },
      { label: 'Resolution plan reviewed', type: 'Meeting',
        text: 'Reviewed the resolution plan with the client.\nRecommended path: ____\nClient response: ____\nFee discussed: ____\nNext step: ____' },
      { label: 'Financial intake reviewed', type: 'Note',
        text: 'Reviewed the submitted financial intake.\nMonthly income: ____\nAllowable expenses: ____\nDisposable income: ____\nEquity in assets: ____\nPreliminary read: ____' },
    ],
  },
  {
    group: 'Admin',
    items: [
      { label: 'Payment discussion', type: 'Call',
        text: 'Discussed fees and payment.\nAmount: ____\nMethod: ____\nSchedule: ____\nClient confirmed: ____' },
      { label: 'Client unresponsive', type: 'Note',
        text: 'No response after ____ attempts (call, email, text) between ____ and ____. Moving to ____ until they re-engage.' },
      { label: 'Case closed', type: 'Note',
        text: 'Case closed.\nOutcome: ____\nFinal balance: ____\nClient notified on: ____' },
    ],
  },
]
