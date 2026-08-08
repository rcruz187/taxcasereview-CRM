-- Microsoft 365 / Azure AD integration
-- Per-tenant Azure app config (admin sets once)
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS m365_client_id      text,
  ADD COLUMN IF NOT EXISTS m365_client_secret  text,
  ADD COLUMN IF NOT EXISTS m365_tenant_id      text DEFAULT 'common'; -- 'common' for multi-tenant, or their Azure tenant ID

-- Per-employee M365 tokens (mirrors employee_gmail_accounts structure)
CREATE TABLE IF NOT EXISTS employee_m365_accounts (
  employee_email        text PRIMARY KEY,
  tenant_id             uuid REFERENCES tenants(id) ON DELETE CASCADE,
  m365_user_id          text,          -- Graph API user object ID
  m365_email            text,          -- the connected M365 email address
  m365_access_token     text,
  m365_refresh_token    text,
  m365_token_expiry     timestamptz,
  m365_last_sync_at     timestamptz,
  m365_last_error       text,
  m365_calendar_sync    boolean DEFAULT true,
  m365_email_sync       boolean DEFAULT true,
  created_at            timestamptz DEFAULT now()
);

ALTER TABLE employee_m365_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS tenant_isolation ON employee_m365_accounts
  USING (tenant_id = current_tenant_id());
