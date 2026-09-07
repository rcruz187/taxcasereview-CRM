-- ================================================================
-- TAX RES CRM — DEMO TENANT RESET BLOCK
-- Tenant: DEMO-001 (518808b4-10dd-47fd-900e-6c3fc1ff2e7e)
-- Login:  demo@taxrescrm.com / TaxResDemo2026!
-- Usage:  Edit the 8 vars at the top, then run the whole block.
--         Wipes ALL demo data and rebuilds settings for the prospect.
--         Idempotent — safe to run multiple times.
-- ================================================================

DO $$
DECLARE
  -- ── EDIT THESE 8 VARS FOR EACH PROSPECT ──────────────────────
  v_prospect_name    text := 'Nashville Tax Solutions';
  v_prospect_phone   text := '(615) 502-2250';
  v_prospect_email   text := 'info@nashvilletaxsolutions.com';
  v_prospect_address text := '500 S. Australian Ave Suite 705';
  v_prospect_city    text := 'West Palm Beach';
  v_prospect_state   text := 'FL';
  v_prospect_zip     text := '33401';
  v_prospect_website text := 'nashvilletaxsolutions.com';
  -- ─────────────────────────────────────────────────────────────

  v_tid uuid := '518808b4-10dd-47fd-900e-6c3fc1ff2e7e'; -- DEMO-001 tenant_id
BEGIN

  -- ── WIPE (children before parents) ───────────────────────────
  DELETE FROM workflow_steps        WHERE template_id IN (SELECT id FROM workflow_templates WHERE tenant_id = v_tid);
  DELETE FROM workflow_templates    WHERE tenant_id = v_tid;
  DELETE FROM workflow_statuses     WHERE tenant_id = v_tid;
  DELETE FROM workflow_status_categories WHERE tenant_id = v_tid;
  DELETE FROM tasks                 WHERE tenant_id = v_tid;
  DELETE FROM lead_notes            WHERE tenant_id = v_tid;
  DELETE FROM client_notes          WHERE tenant_id = v_tid;
  DELETE FROM case_notes            WHERE tenant_id = v_tid;
  DELETE FROM chat_messages         WHERE tenant_id = v_tid;
  DELETE FROM chat_conv_prefs       WHERE tenant_id = v_tid;
  DELETE FROM chat_rep_prefs        WHERE tenant_id = v_tid;
  DELETE FROM documents             WHERE tenant_id = v_tid;
  DELETE FROM esigns                WHERE tenant_id = v_tid;
  DELETE FROM irsforms              WHERE tenant_id = v_tid;
  DELETE FROM poa_records           WHERE tenant_id = v_tid;
  DELETE FROM poas                  WHERE tenant_id = v_tid;
  DELETE FROM state_form_tracker    WHERE tenant_id = v_tid;
  DELETE FROM invoices              WHERE tenant_id = v_tid;
  DELETE FROM payments              WHERE tenant_id = v_tid;
  DELETE FROM payment_methods       WHERE tenant_id = v_tid;
  DELETE FROM billing_time_entries  WHERE tenant_id = v_tid;
  DELETE FROM billing_activity_types WHERE tenant_id = v_tid;
  DELETE FROM calevents             WHERE tenant_id = v_tid;
  DELETE FROM calllog               WHERE tenant_id = v_tid;
  DELETE FROM call_recordings       WHERE tenant_id = v_tid;
  DELETE FROM call_dial_locks       WHERE tenant_id = v_tid;
  DELETE FROM incoming_calls        WHERE tenant_id = v_tid;
  DELETE FROM outbound_calls        WHERE tenant_id = v_tid;
  DELETE FROM voicemails            WHERE tenant_id = v_tid;
  DELETE FROM sms_messages          WHERE tenant_id = v_tid;
  DELETE FROM fax_logs              WHERE tenant_id = v_tid;
  DELETE FROM emails                WHERE tenant_id = v_tid;
  DELETE FROM email_sync_log        WHERE tenant_id = v_tid;
  DELETE FROM email_accounts        WHERE tenant_id = v_tid;
  DELETE FROM activity_log          WHERE tenant_id = v_tid;
  DELETE FROM transcript_analyses   WHERE tenant_id = v_tid;
  DELETE FROM transcripts           WHERE tenant_id = v_tid;
  DELETE FROM tax_doc_uploads       WHERE tenant_id = v_tid;
  DELETE FROM tax_organizer_responses WHERE tenant_id = v_tid;
  DELETE FROM tax_returns           WHERE tenant_id = v_tid;
  DELETE FROM financial_intake_responses WHERE tenant_id = v_tid;
  DELETE FROM client_financial_profiles WHERE tenant_id = v_tid;
  DELETE FROM client_compliance_records WHERE tenant_id = v_tid;
  DELETE FROM cseds                 WHERE tenant_id = v_tid;
  DELETE FROM deadlines             WHERE tenant_id = v_tid;
  DELETE FROM estimates             WHERE tenant_id = v_tid;
  DELETE FROM formacorp             WHERE tenant_id = v_tid;
  DELETE FROM corporations          WHERE tenant_id = v_tid;
  DELETE FROM bookkeeping           WHERE tenant_id = v_tid;
  DELETE FROM accounting_connections WHERE tenant_id = v_tid;
  DELETE FROM payrollruns           WHERE tenant_id = v_tid;
  DELETE FROM timeentries           WHERE tenant_id = v_tid;
  DELETE FROM time_off_requests     WHERE tenant_id = v_tid;
  DELETE FROM support_tickets       WHERE tenant_id = v_tid;
  DELETE FROM cases                 WHERE tenant_id = v_tid;
  DELETE FROM leads                 WHERE tenant_id = v_tid;
  DELETE FROM clients               WHERE tenant_id = v_tid;

  -- ── REBUILD SETTINGS ─────────────────────────────────────────
  DELETE FROM settings WHERE tenant_id = v_tid;

  INSERT INTO settings (
    tenant_id,
    firmname, name, phone, email, website,
    address, city, state, zip,
    -- copy booking config from TCR so /book page works
    booking_config,
    -- clear all integration keys — demo has no live integrations
    stripe_publishable_key, stripe_secret_key,
    signalwire_project_id, signalwire_auth_token, signalwire_phone_number,
    gmail_client_id, gmail_client_secret,
    email_signature_logo_url  -- keep null so it falls back to logourl
  )
  SELECT
    v_tid,
    v_prospect_name, v_prospect_name, v_prospect_phone,
    'info@' || lower(regexp_replace(v_prospect_name, '[^a-zA-Z0-9]', '', 'g')) || '.com',
    v_prospect_website,
    v_prospect_address, v_prospect_city, v_prospect_state, v_prospect_zip,
    booking_config,  -- cloned from TCR
    null, null, null, null, null, null, null, null
  FROM settings WHERE tenant_id = '61a89aef-0e7e-4ea2-b222-44ab2024655a' LIMIT 1;

  -- ── CLONE WORKFLOWS FROM TCR ──────────────────────────────────
  -- Categories
  INSERT INTO workflow_status_categories (name, color, sort_order, tenant_id)
  SELECT name, color, sort_order, v_tid
  FROM workflow_status_categories
  WHERE tenant_id = '61a89aef-0e7e-4ea2-b222-44ab2024655a';

  -- Statuses
  INSERT INTO workflow_statuses (name, category_id, sort_order, tenant_id)
  SELECT ws.name,
    (SELECT id FROM workflow_status_categories
     WHERE tenant_id = v_tid AND name = wsc.name LIMIT 1),
    ws.sort_order, v_tid
  FROM workflow_statuses ws
  JOIN workflow_status_categories wsc ON wsc.id = ws.category_id
  WHERE ws.tenant_id = '61a89aef-0e7e-4ea2-b222-44ab2024655a';

  -- Templates + Steps
  WITH tmpl AS (
    INSERT INTO workflow_templates (name, description, entity_type, active, trigger_event, trigger_value, tenant_id, created_at)
    SELECT name, description, entity_type, active, trigger_event, trigger_value, v_tid, now()
    FROM workflow_templates
    WHERE tenant_id = '61a89aef-0e7e-4ea2-b222-44ab2024655a'
    RETURNING id, name
  )
  INSERT INTO workflow_steps (template_id, title, notes, due_in_days, sort_order, section_title)
  SELECT tmpl.id, ws.title, ws.notes, ws.due_in_days, ws.sort_order, ws.section_title
  FROM workflow_steps ws
  JOIN workflow_templates wt ON wt.id = ws.template_id
  JOIN tmpl ON tmpl.name = wt.name
  WHERE wt.tenant_id = '61a89aef-0e7e-4ea2-b222-44ab2024655a';

  RAISE NOTICE 'Demo reset complete for: %', v_prospect_name;
END;
$$;
