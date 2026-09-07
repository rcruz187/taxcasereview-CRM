# RomyLabs Mail Router

RomyLabs uses a central multi-brand inbox. Inbound mail preserves the original receiving mailbox and product route. Replies must use the stored route and are sent only through the matching SMTP identity; they must never silently fall back to another brand or employee Gmail account.

Current central inbox owner: `info@romylabs.com`.

Inbound routing metadata is stored on `emails` using `received_mailbox`, `reply_from`, `product_id`, `route_id`, `thread_id`, `in_reply_to`, `references_header`, and `assigned_to`.
