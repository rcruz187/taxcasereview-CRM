// ── Shared SMS templates ──
// Standalone module (not on a page) to avoid circular imports. {name} is
// replaced with the recipient's first name when applied.
export const SMS_TEMPLATES = [
  { label: 'Intro / follow-up', body: "Hi {name}, this is Tax Case Review following up on your tax matter. Do you have a few minutes to connect?" },
  { label: 'Docs needed', body: "Hi {name}, we still need a few documents to move your case forward. Please reply or call us at your earliest convenience." },
  { label: 'POA reminder', body: "Hi {name}, please sign and return the POA we sent so we can begin working with the IRS on your behalf. Let us know if you have questions." },
  { label: 'Appointment reminder', body: "Hi {name}, this is a reminder about your upcoming appointment with Tax Case Review. Reply here if you need to reschedule." },
  { label: 'Payment reminder', body: "Hi {name}, this is a friendly reminder that a payment on your account is coming due. Please reach out if you'd like to discuss options." },
  { label: 'Case update', body: "Hi {name}, we have an update on your case. Please give us a call when you get a chance." },
  { label: 'Left a voicemail', body: "Hi {name}, we just left you a voicemail regarding your tax case. Call us back when you can — we're here to help." },
]

export function applySmsTemplate(tpl, fullName) {
  const first = (fullName || '').trim().split(' ')[0] || 'there'
  return tpl.body.replace(/\{name\}/g, first)
}
