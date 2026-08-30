// Central RomyLabs email routing contract.
// Inbound messages preserve the original receiving mailbox in the database.
// Routed replies must send through the exact SMTP identity registered for route_id.
export const ROMYLABS_CENTRAL_INBOX_OWNER = 'info@romylabs.com'
export const ROMYLABS_ROUTED_REPLY_FIELDS = Object.freeze([
  'route_id',
  'received_mailbox',
  'reply_from',
  'product_id',
  'thread_id',
  'in_reply_to',
  'references_header',
  'assigned_to',
])
