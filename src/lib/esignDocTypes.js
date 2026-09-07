// Every signable document type — shared by Leads and Clients so any standard
// doc can be sent for signature from either. Kept in its own module (not on a
// page) to avoid a Leads<->Clients circular import. Custom Document reveals a
// text box + PDF upload.
export const ESIGN_DOC_TYPES = [
  'Tax Service Agreement',
  'Form 2848 — Power of Attorney',
  'Form 8821 — Tax Info Auth',
  'Fee Agreement Addendum',
  '9465 Installment Agreement',
  'OIC Application (656)',
  'Custom Document',
]
