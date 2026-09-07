-- Persistent chat channels per tenant
CREATE TABLE IF NOT EXISTS chat_channels (
  id          text    NOT NULL,
  tenant_id   uuid    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label       text    NOT NULL,
  description text    DEFAULT '',
  position    integer DEFAULT 99,
  created_at  timestamptz DEFAULT now(),
  PRIMARY KEY (id, tenant_id)
);

ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON chat_channels;
CREATE POLICY tenant_isolation ON chat_channels
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

GRANT ALL ON chat_channels TO authenticated;

-- Seed default channels for all existing tenants
INSERT INTO chat_channels (id, tenant_id, label, description, position)
SELECT v.id, t.id, v.label, v.description, v.position
FROM tenants t
CROSS JOIN (VALUES
  ('general', 'general',  'All staff announcements', 1),
  ('cases',   'cases',    'Case updates and notes',  2),
  ('billing', 'billing',  'Invoices, payments, collections', 3),
  ('irs',     'irs',      'IRS notices and resolutions', 4),
  ('hr',      'hr',       'HR and internal ops',     5)
) AS v(id, label, description, position)
ON CONFLICT (id, tenant_id) DO NOTHING;
