
CREATE OR REPLACE FUNCTION list_all_product_tickets(
  p_product_id text    DEFAULT NULL,
  p_status     text    DEFAULT NULL,
  p_limit      integer DEFAULT 100,
  p_offset     integer DEFAULT 0
)
RETURNS TABLE (
  id                  uuid,
  ticket_number       text,
  product_id          text,
  product_label       text,
  tenant_id           uuid,
  firm_name           text,
  product_tenant_name text,
  display_customer    text,
  submitted_by_name   text,
  submitted_by_email  text,
  category            text,
  priority            text,
  subject             text,
  status              text,
  source              text,
  assigned_to         text,
  created_at          timestamptz,
  updated_at          timestamptz,
  message_count       bigint,
  needs_reply         boolean
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    t.id,
    t.ticket_number,
    t.product_id,
    -- Registry-driven label instead of hardcoded CASE.
    -- COALESCE fallback echoes raw product_id for any ticket
    -- whose product has no support row (matches prior ELSE behavior).
    COALESCE(rps.display_name, t.product_id) AS product_label,
    t.tenant_id,
    ten.firm_name,
    t.product_tenant_name,
    COALESCE(ten.firm_name, t.product_tenant_name) AS display_customer,
    t.submitted_by_name,
    t.submitted_by_email,
    t.category,
    t.priority,
    t.subject,
    t.status,
    t.source,
    t.assigned_to,
    t.created_at,
    t.updated_at,
    COUNT(m.id)::bigint AS message_count,
    CASE
      WHEN COUNT(m.id) = 0 AND t.status != 'Resolved' THEN true
      WHEN (
        SELECT sender FROM support_ticket_messages
        WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1
      ) = 'customer' THEN true
      ELSE false
    END AS needs_reply
  FROM support_tickets t
  LEFT JOIN romylabs_product_support rps ON rps.product_id = t.product_id
  LEFT JOIN tenants ten ON ten.id = t.tenant_id
  LEFT JOIN support_ticket_messages m
    ON m.ticket_id = t.id
    AND COALESCE(m.is_internal, false) = false
  WHERE
    (auth.email() = 'romy@taxcasereview.org'
     OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_admin')
    AND (p_product_id IS NULL OR t.product_id = p_product_id)
    AND (p_status     IS NULL OR t.status     = p_status)
  GROUP BY t.id, rps.display_name, ten.firm_name
  ORDER BY
    (CASE
      WHEN COUNT(m.id) = 0 AND t.status != 'Resolved' THEN true
      WHEN (SELECT sender FROM support_ticket_messages
            WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1
           ) = 'customer' THEN true
      ELSE false
    END) DESC,
    CASE t.priority
      WHEN 'Urgent' THEN 1 WHEN 'High' THEN 2 WHEN 'Normal' THEN 3 ELSE 4
    END,
    t.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;
