-- ─────────────────────────────────────────────────────────────────────────────
-- TAXRES CRM DEMO TENANT — RESET & RESEED
-- Demo tenant ID: a0000000-0000-0000-0000-000000000001
--
-- SAFETY GUARD: This script will abort if the target tenant is not exactly
-- the demo sentinel UUID. It cannot be run against TCR production or Nashville.
--
-- Usage:
--   Run via GitHub Actions workflow: .github/workflows/reset-demo.yml
--   Or paste directly into Supabase SQL Editor (still checks the guard).
--
-- What it wipes:
--   leads, clients, cases, tasks, deadlines, calevents, invoices, payments,
--   bookkeeping, client_notes, lead_notes, esigns, documents, sms_messages,
--   calllog, emails (all scoped to the demo tenant_id only)
--
-- What it preserves:
--   employees (keeps the 5 demo staff)
--   settings (keeps TaxRes CRM branding)
--   TCR production data (never touched)
--   Nashville data (never touched)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_tenant  uuid := 'a0000000-0000-0000-0000-000000000001';
  v_tcr     uuid := '61a89aef-0e7e-4ea2-b222-44ab2024655a';
  v_nash    uuid := '489ace07-1a6b-4864-833a-4f8420568b40';
  today     date := current_date;

  -- Fixed UUIDs for stable cross-run references
  c_chen    uuid := 'b1000001-0000-0000-0000-000000000001';
  c_morales uuid := 'b1000002-0000-0000-0000-000000000001';
  c_patel   uuid := 'b1000003-0000-0000-0000-000000000001';
  l_hoffman uuid := 'b2000001-0000-0000-0000-000000000001';
  l_deluca  uuid := 'b2000002-0000-0000-0000-000000000001';
  l_park    uuid := 'b2000003-0000-0000-0000-000000000001';
  l_adams   uuid := 'b2000004-0000-0000-0000-000000000001';
  l_nguyen  uuid := 'b2000005-0000-0000-0000-000000000001';
BEGIN

  -- ── SAFETY GUARD ─────────────────────────────────────────────────────────
  IF v_tenant = v_tcr THEN
    RAISE EXCEPTION 'ABORT: Tenant is TCR production. This script must not touch production data.';
  END IF;
  IF v_tenant = v_nash THEN
    RAISE EXCEPTION 'ABORT: Tenant is Nashville. This script must not touch customer data.';
  END IF;
  IF v_tenant::text NOT LIKE 'a0000000%' THEN
    RAISE EXCEPTION 'ABORT: Unrecognized tenant ID %. Expected the TaxRes CRM demo tenant.', v_tenant;
  END IF;

  RAISE NOTICE 'Guard passed. Resetting demo tenant: %', v_tenant;

  -- ── WIPE DEMO TENANT DATA ─────────────────────────────────────────────────
  DELETE FROM lead_notes      WHERE tenant_id = v_tenant;
  DELETE FROM client_notes    WHERE tenant_id = v_tenant;
  DELETE FROM case_notes      WHERE tenant_id = v_tenant;
  DELETE FROM leads           WHERE tenant_id = v_tenant;
  DELETE FROM clients         WHERE tenant_id = v_tenant;
  DELETE FROM cases           WHERE tenant_id = v_tenant;
  DELETE FROM tasks           WHERE tenant_id = v_tenant;
  DELETE FROM deadlines       WHERE tenant_id = v_tenant;
  DELETE FROM calevents       WHERE tenant_id = v_tenant;
  DELETE FROM invoices        WHERE tenant_id = v_tenant;
  DELETE FROM payments        WHERE tenant_id = v_tenant;
  DELETE FROM bookkeeping     WHERE tenant_id = v_tenant;
  DELETE FROM esigns          WHERE tenant_id = v_tenant;
  DELETE FROM documents       WHERE tenant_id = v_tenant;
  DELETE FROM sms_messages    WHERE tenant_id = v_tenant;
  DELETE FROM calllog         WHERE tenant_id = v_tenant;
  DELETE FROM emails          WHERE tenant_id = v_tenant;
  DELETE FROM calevents       WHERE tenant_id = v_tenant;

  -- Restore demo employees (keep if already exist)
  INSERT INTO employees (id, name, email, role, access, tenant_id, created_at)
  VALUES
    ('c0000001-0000-0000-0000-000000000001', 'Sarah Whitfield EA',
     'sarah@taxrescrm.demo', 'Tax Associate', 'Staff', v_tenant, now() - interval '180 days'),
    ('c0000002-0000-0000-0000-000000000001', 'Marcus Doyle',
     'marcus@taxrescrm.demo', 'Sales Rep', 'Staff', v_tenant, now() - interval '90 days')
  ON CONFLICT (email) DO NOTHING;

  -- ── LEADS ────────────────────────────────────────────────────────────────

  INSERT INTO leads (id, name, first, last, "clientType", phone, email, status, source,
    "taxAssociate", "assignedTo", "salesRep", "irsBalance", "stateBalance",
    "issueType", "irsOrState", "taxYears", "taxFee", "contractFee", services, notes,
    tenant_id, created_at)
  VALUES
    (l_hoffman,'James Hoffman','James','Hoffman','Individual',
     '(305) 555-0192','jhoffman@demomail.example',
     'IRS Facts Received','Referral',
     'Sarah Whitfield EA','Sarah Whitfield EA','Marcus Doyle',
     '148500','0','OIC','IRS Federal','2020, 2021, 2022','3500','9800','["oic"]',
     'Investigation complete. Transcripts in. $148,500 balance. OIC candidate. Ready for Addendum.',
     v_tenant, now() - interval '62 days'),

    (l_deluca,'Maria De Luca','Maria','De Luca','Individual',
     '(786) 555-0347','mdeluca@demomail.example',
     'Tax Investigation Active','Google',
     'Sarah Whitfield EA','Sarah Whitfield EA','Marcus Doyle',
     '62000','8400','Installment Agreement','Both','2021, 2022, 2023','2800','6500',NULL,
     'IRS and FL state balance. Investigation active.',
     v_tenant, now() - interval '35 days'),

    (l_park,'Kevin Park','Kevin','Park','Individual',
     '(954) 555-0821','kpark@demomail.example',
     'Consultation Scheduled','Website',
     'Sarah Whitfield EA','Marcus Doyle',NULL,
     '37500','0','CNC','IRS Federal','2022, 2023','2200',NULL,NULL,
     'Retired, fixed income. CNC candidate. Consultation booked.',
     v_tenant, now() - interval '8 days'),

    (l_adams,'Sandra Adams','Sandra','Adams','Individual',
     '(561) 555-0234','sadams@demomail.example',
     'New Lead','Facebook',
     NULL,'Marcus Doyle',NULL,
     '89000','12000','OIC','Both','2019, 2020, 2021, 2022',NULL,NULL,NULL,
     'Active levy notice. URGENT.',
     v_tenant, now() - interval '1 day'),

    (l_nguyen,'David Nguyen','David','Nguyen','Individual',
     '(305) 555-0675','dnguyen@demomail.example',
     'Contacted','Referral',
     NULL,'Marcus Doyle',NULL,
     '28000','0','Penalty Abatement','IRS Federal','2023',NULL,NULL,NULL,
     'First-time filer. Strong FTA candidate.',
     v_tenant, now() - interval '4 days');

  -- ── CLIENTS ──────────────────────────────────────────────────────────────

  INSERT INTO clients (id, "clientType", name, first, last, phone, email, ssn,
    "irsBalance", "stateBalance", "issueType", "irsOrState", "taxYears",
    "pipelineStage", status, source, "assignedTo", "taxAssociate", "salesRep",
    "contractFee", services, street, city, state, zip, "clientSince", notes,
    tenant_id, created_at)
  VALUES
    (c_chen,'Individual','Robert Chen','Robert','Chen',
     '(305) 555-0411','rchen@demomail.example','XXX-XX-1234',
     '214000','0','OIC','IRS Federal','2019, 2020, 2021, 2022',
     'resolution','Active','Referral',
     'Sarah Whitfield EA','Sarah Whitfield EA','Marcus Doyle',
     '14500',ARRAY['oic'],
     '742 Coral Way','Miami','FL','33134', today - 120,
     'OIC filed 3/15. IRS acknowledged. 30-day letter received — responding.',
     v_tenant, now() - interval '120 days'),

    (c_morales,'Individual','Teresa Morales','Teresa','Morales',
     '(786) 555-0512','tmorales@demomail.example','XXX-XX-5678',
     '44200','0','Installment Agreement','IRS Federal','2020, 2021',
     'resolution','Active','TV Ad',
     'Sarah Whitfield EA','Sarah Whitfield EA','Marcus Doyle',
     '5800',ARRAY['ia'],
     '1899 Brickell Ave','Miami','FL','33129', today - 60,
     'IA $387/month. Paying on time. CSED 2030.',
     v_tenant, now() - interval '60 days'),

    (c_patel,'Individual','Alan Patel','Alan','Patel',
     '(561) 555-0789','apatel@demomail.example','XXX-XX-9012',
     '8200','0','Penalty Abatement','IRS Federal','2022',
     'completed','Active','Google',
     'Sarah Whitfield EA','Sarah Whitfield EA',NULL,
     '2400',ARRAY['abatement'],
     '300 Sunny Isles Blvd','Sunny Isles Beach','FL','33160', today - 180,
     'FTA granted. $3,100 penalties abated. Case closed.',
     v_tenant, now() - interval '180 days');

  -- ── CASES ────────────────────────────────────────────────────────────────

  INSERT INTO cases (id, "clientName", clientid, "caseType", "irsBalance", status,
    "taxYears", "assignedTo", "taxAssociate", notes, tenant_id, created_at)
  VALUES
    ('c-demo-chen','Robert Chen',c_chen,'OIC','214000','Active',
     '2019, 2020, 2021, 2022','Sarah Whitfield EA','Sarah Whitfield EA',
     'OIC filed. IRS acknowledged. Awaiting RO assignment.',
     v_tenant, now() - interval '118 days'),
    ('c-demo-morales','Teresa Morales',c_morales,'Installment Agreement','44200','Active',
     '2020, 2021','Sarah Whitfield EA','Sarah Whitfield EA',
     'IA active. $387/mo. Client paying on time.',
     v_tenant, now() - interval '58 days'),
    ('c-demo-patel','Alan Patel',c_patel,'Penalty Abatement','8200','Completed',
     '2022','Sarah Whitfield EA','Sarah Whitfield EA',
     'FTA granted. $3,100 abated. Case closed.',
     v_tenant, now() - interval '178 days');

  -- ── TASKS ────────────────────────────────────────────────────────────────

  INSERT INTO tasks (title, "clientName", "assignedTo", priority, "dueDate", done, notes, tenant_id, created_at)
  VALUES
    ('Call IRS — Robert Chen OIC status','Robert Chen','Sarah Whitfield EA',
     'High', today+1, false,'Check OIC assignment. Respond to 30-day letter.',v_tenant,now()),
    ('Review transcripts — James Hoffman','James Hoffman','Sarah Whitfield EA',
     'High', today, false,'Transcripts in. Build strategy. Draft Addendum.',v_tenant,now()),
    ('Contact Sandra Adams — levy','Sandra Adams','Marcus Doyle',
     'High', today, false,'URGENT: Active levy. Call before EOD.',v_tenant,now()),
    ('Follow up — Kevin Park consult','Kevin Park','Marcus Doyle',
     'Normal', today+1, false,'Confirm consult. Prepare CNC summary.',v_tenant,now()),
    ('Email IRS POA — Maria De Luca','Maria De Luca','Sarah Whitfield EA',
     'High', today-1, false,'POA accepted. Pull transcripts.',v_tenant,now()),
    ('Verify IA payment — Teresa Morales','Teresa Morales','Sarah Whitfield EA',
     'Normal', today+5, false,'Confirm payment posted.',v_tenant,now()),
    ('David Nguyen — intake call','David Nguyen','Marcus Doyle',
     'Normal', today+2, false,'Gather info for FTA request.',v_tenant,now());

  -- ── DEADLINES ────────────────────────────────────────────────────────────

  INSERT INTO deadlines (title,"clientName",type,"dueDate",status,notes,tenant_id)
  VALUES
    ('IRS 30-Day Letter Response','Robert Chen','IRS Response',(today+18)::text,
     'Active','Respond or request extension.',v_tenant);
  INSERT INTO deadlines (title,"clientName",type,"dueDate",status,notes,tenant_id)
  VALUES
    ('OIC Supporting Documents Due','Robert Chen','IRS Submission',(today+45)::text,
     'Active','IRS requested additional financials.',v_tenant);
  INSERT INTO deadlines (title,"clientName",type,"dueDate",status,notes,tenant_id)
  VALUES
    ('CSED Watch — Teresa Morales','Teresa Morales','CSED','2030-06-15',
     'Active','Collection Statute Expiry. Monitor IA compliance.',v_tenant);
  INSERT INTO deadlines (title,"clientName",type,"dueDate",status,notes,tenant_id)
  VALUES
    ('Q3 Estimated Tax — Alan Patel','Alan Patel','Tax Filing',(today+22)::text,
     'Active','Q3 estimated tax payment due.',v_tenant);

  -- ── CALENDAR ─────────────────────────────────────────────────────────────

  INSERT INTO calevents (title,"clientName","assignedTo",date,time,"endTime",
    "eventType",color,status,notes,tenant_id,created_at)
  VALUES
    ('Consultation — Kevin Park','Kevin Park','Sarah Whitfield EA',
     today+2,'10:00','11:00','Consultation Call','bb','scheduled',
     'CNC review. Retired, fixed income.',v_tenant,now()),
    ('IRS Call — Robert Chen','Robert Chen','Sarah Whitfield EA',
     today+1,'14:00','15:00','IRS Call','bg','scheduled',
     'OIC status + 30-day letter.',v_tenant,now()),
    ('Team Pipeline Review',NULL,'Sarah Whitfield EA',
     today+3,'09:00','09:30','Client Meeting','ba','scheduled',
     'Weekly pipeline check-in.',v_tenant,now()),
    ('Consultation — Sandra Adams','Sandra Adams','Sarah Whitfield EA',
     today+4,'11:00','12:00','Consultation Call','bb','scheduled',
     'Levy situation. Urgent.',v_tenant,now());

  -- ── INVOICES ─────────────────────────────────────────────────────────────

  INSERT INTO invoices (id,"clientName","invNum",description,total,paid,status,"dueDate",tenant_id,created_at)
  VALUES
    ('inv-demo-0041','Robert Chen','INV-0041','OIC Investigation & Representation',
     '14500','14500','Paid',today-90,v_tenant,now()-interval'100 days'),
    ('inv-demo-0042','Teresa Morales','INV-0042','Installment Agreement Representation',
     '5800','2900','Partial',today-40,v_tenant,now()-interval'58 days'),
    ('inv-demo-0043','Alan Patel','INV-0043','Penalty Abatement Service',
     '2400','2400','Paid',today-150,v_tenant,now()-interval'175 days'),
    ('inv-demo-0044','Maria De Luca','INV-0044','Tax Investigation Fee',
     '2800','2800','Paid',today-28,v_tenant,now()-interval'33 days');

  -- ── PAYMENTS ─────────────────────────────────────────────────────────────

  INSERT INTO payments (id,"clientName",amount,status,source,notes,date,tenant_id,created_at)
  VALUES
    ('pay-demo-001','Robert Chen','14500','Cleared','Credit Card',
     'OIC full fee',(today-90)::text,v_tenant,now()-interval'100 days'),
    ('pay-demo-002','Teresa Morales','2900','Cleared','Credit Card',
     'IA 50% deposit',(today-55)::text,v_tenant,now()-interval'58 days'),
    ('pay-demo-003','Alan Patel','2400','Cleared','Check',
     'Penalty abatement fee',(today-170)::text,v_tenant,now()-interval'175 days'),
    ('pay-demo-004','Maria De Luca','2800','Cleared','Credit Card',
     'Investigation fee',(today-30)::text,v_tenant,now()-interval'33 days');

  -- ── CLIENT NOTES — Robert Chen full engagement timeline ──────────────────

  INSERT INTO client_notes ("clientname",text,author,created_at,tenant_id)
  VALUES
    ('Robert Chen','🔄 Converted from lead. Service Agreement signed + investigation fee paid.',
     'System',now()-interval'120 days',v_tenant),
    ('Robert Chen','📬 Forms 2848 & 8821 filed with IRS CAF.',
     'Sarah Whitfield EA',now()-interval'115 days',v_tenant),
    ('Robert Chen','✅ POA accepted by IRS. Authorized to represent.',
     'Sarah Whitfield EA',now()-interval'108 days',v_tenant),
    ('Robert Chen','📋 Full transcripts pulled — 2019–2022. Total $214,000. No lien.',
     'Sarah Whitfield EA',now()-interval'100 days',v_tenant),
    ('Robert Chen','📊 RCP analysis complete. Reasonable Collection Potential: $8,800. OIC viable.',
     'Sarah Whitfield EA',now()-interval'85 days',v_tenant),
    ('Robert Chen','📝 Service Addendum signed. OIC resolution fee ($14,500) authorized.',
     'System (E-Sign)',now()-interval'80 days',v_tenant),
    ('Robert Chen','💳 Resolution fee paid in full via credit card.',
     'System',now()-interval'79 days',v_tenant),
    ('Robert Chen','📨 Form 656 + 433-A OIC package filed via certified mail.',
     'Sarah Whitfield EA',now()-interval'60 days',v_tenant),
    ('Robert Chen','📧 IRS acknowledgment received. Case #240331-OIC assigned. Review clock started.',
     'Sarah Whitfield EA',now()-interval'45 days',v_tenant),
    ('Robert Chen','[Connected, 18 min] IRS ACS — OIC pending RO assignment. No enforcement while pending.',
     'Sarah Whitfield EA',now()-interval'20 days',v_tenant),
    ('Robert Chen','📋 30-day letter received. IRS requesting additional bank statements. Responding by deadline.',
     'Sarah Whitfield EA',now()-interval'5 days',v_tenant),
    ('Teresa Morales','🔄 Converted from lead. IA engagement signed.',
     'System',now()-interval'60 days',v_tenant),
    ('Teresa Morales','✅ IA established — $387/month for 60 months.',
     'Sarah Whitfield EA',now()-interval'50 days',v_tenant),
    ('Teresa Morales','💳 July payment confirmed. IA in good standing.',
     'Sarah Whitfield EA',now()-interval'10 days',v_tenant),
    ('Alan Patel','🔄 Converted from lead. Abatement engagement signed.',
     'System',now()-interval'180 days',v_tenant),
    ('Alan Patel','📨 Penalty abatement request (FTA) filed with IRS.',
     'Sarah Whitfield EA',now()-interval'165 days',v_tenant),
    ('Alan Patel','✅ IRS approved FTA. $3,100 penalties removed. Balance reduced to $5,100.',
     'Sarah Whitfield EA',now()-interval'120 days',v_tenant),
    ('Alan Patel','✓ Case closed. Client notified. File archived.',
     'Sarah Whitfield EA',now()-interval'115 days',v_tenant);

  -- ── LEAD NOTES — James Hoffman full progression ───────────────────────────

  INSERT INTO lead_notes (lead_id,lead_name,text,type,author,created_at,tenant_id)
  VALUES
    (l_hoffman,'James Hoffman','📞 Inbound referral. Levy notice received. Scheduled free consultation.',
     'Call','Marcus Doyle',now()-interval'62 days',v_tenant),
    (l_hoffman,'James Hoffman','🤝 Consultation complete. $148,500 IRS balance (2020–2022). W-2 employee, modest assets. Strong OIC candidate. Full Package sent.',
     'Note','Marcus Doyle',now()-interval'55 days',v_tenant),
    (l_hoffman,'James Hoffman','✍️ Tax Service Agreement signed electronically. Investigation fee ($3,500) paid via Stripe.',
     'System','System (E-Sign)',now()-interval'50 days',v_tenant),
    (l_hoffman,'James Hoffman','📬 Forms 2848 & 8821 filed with IRS CAF.',
     'Note','Sarah Whitfield EA',now()-interval'45 days',v_tenant),
    (l_hoffman,'James Hoffman','✅ POA accepted by IRS. Pulling account transcripts.',
     'Note','Sarah Whitfield EA',now()-interval'38 days',v_tenant),
    (l_hoffman,'James Hoffman','📋 IRS Facts Received — transcripts complete. $148,500 confirmed across 3 years. No lien filed. RCP calculation in progress. Ready to send Addendum.',
     'Note','Sarah Whitfield EA',now()-interval'5 days',v_tenant);

  -- ── BOOKKEEPING ──────────────────────────────────────────────────────────
  -- Note: bookkeeping.id is TEXT NOT NULL with no default — must supply UUID.

  INSERT INTO bookkeeping (id,date,data,client_name,account,tenant_id)
  VALUES
    (gen_random_uuid()::text,(today-170)::text,
     '{"description":"Alan Patel — Penalty Abatement Fee","amount":2400,"type":"Income","category":"Revenue","reconciled":true}'::jsonb,
     'Alan Patel','Checking',v_tenant),
    (gen_random_uuid()::text,(today-120)::text,
     '{"description":"Office Rent — July","amount":1800,"type":"Expense","category":"Rent","reconciled":true}'::jsonb,
     NULL,'Checking',v_tenant),
    (gen_random_uuid()::text,(today-100)::text,
     '{"description":"Robert Chen — OIC Rep Fee","amount":14500,"type":"Income","category":"Revenue","reconciled":true}'::jsonb,
     'Robert Chen','Checking',v_tenant),
    (gen_random_uuid()::text,(today-90)::text,
     '{"description":"Office Rent — August","amount":1800,"type":"Expense","category":"Rent","reconciled":true}'::jsonb,
     NULL,'Checking',v_tenant),
    (gen_random_uuid()::text,(today-58)::text,
     '{"description":"Teresa Morales — IA 50% Deposit","amount":2900,"type":"Income","category":"Revenue","reconciled":true}'::jsonb,
     'Teresa Morales','Checking',v_tenant),
    (gen_random_uuid()::text,(today-60)::text,
     '{"description":"CRM Software Subscription","amount":299,"type":"Expense","category":"Software","reconciled":true}'::jsonb,
     NULL,'Checking',v_tenant),
    (gen_random_uuid()::text,(today-33)::text,
     '{"description":"Maria De Luca — Investigation Fee","amount":2800,"type":"Income","category":"Revenue","reconciled":true}'::jsonb,
     'Maria De Luca','Checking',v_tenant),
    (gen_random_uuid()::text,(today-30)::text,
     '{"description":"Office Rent — September","amount":1800,"type":"Expense","category":"Rent","reconciled":true}'::jsonb,
     NULL,'Checking',v_tenant),
    (gen_random_uuid()::text,(today-15)::text,
     '{"description":"Postage and IRS Certified Mail","amount":87,"type":"Expense","category":"Office","reconciled":true}'::jsonb,
     NULL,'Checking',v_tenant),
    (gen_random_uuid()::text,today::text,
     '{"description":"E and O Insurance Premium","amount":450,"type":"Expense","category":"Insurance","reconciled":false}'::jsonb,
     NULL,'Checking',v_tenant);

  RAISE NOTICE 'Demo tenant reset complete. Tenant: %', v_tenant;

END $$;
