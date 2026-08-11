-- ============================================================
-- Link unmatched payment_transactions to Nashville clients
-- Set-based approach — no loops, no sleeps, runs in seconds
-- ============================================================

DO $$
DECLARE
  v_tid uuid := '489ace07-1a6b-4864-833a-4f8420568b40'::uuid;
BEGIN

  -- STEP 1: Create missing clients in one INSERT ... SELECT
  -- Only creates clients that don't already exist by name match
  INSERT INTO clients (
    id, tenant_id, name, first, last,
    clienttype, "clientType", status,
    "assignedTo", assignedto, created_at
  )
  SELECT DISTINCT ON (v_name)
    'c' || lpad(floor(random() * 1e13 + extract(epoch from now()) * 1000)::bigint::text, 13, '0'),
    v_tid,
    v_name,
    v_first,
    v_last,
    'Individual', 'Individual', 'Active',
    coalesce(associate, 'Unassigned'),
    coalesce(associate, 'Unassigned'),
    now()
  FROM (
    SELECT DISTINCT
      trim(lname) AS v_last,
      trim(split_part(split_part(coalesce(
        (SELECT fname FROM payment_transactions pt2
         WHERE pt2.tenant_id = v_tid AND pt2.client_id IS NULL
           AND pt2.lname = pt.lname AND pt2.fname <> ''
         LIMIT 1), ''
      ), '/', 1), ' and ', 1)) AS v_first,
      CASE
        WHEN trim(split_part(split_part(coalesce(
          (SELECT fname FROM payment_transactions pt2
           WHERE pt2.tenant_id = v_tid AND pt2.client_id IS NULL
             AND pt2.lname = pt.lname AND pt2.fname <> ''
           LIMIT 1), ''
        ), '/', 1), ' and ', 1)) <> ''
        THEN trim(split_part(split_part(coalesce(
          (SELECT fname FROM payment_transactions pt2
           WHERE pt2.tenant_id = v_tid AND pt2.client_id IS NULL
             AND pt2.lname = pt.lname AND pt2.fname <> ''
           LIMIT 1), ''
        ), '/', 1), ' and ', 1)) || ' ' || trim(lname)
        ELSE trim(lname)
      END AS v_name,
      associate
    FROM payment_transactions pt
    WHERE tenant_id = v_tid
      AND client_id IS NULL
      AND lname IS NOT NULL
      AND lname <> ''
  ) new_clients
  WHERE NOT EXISTS (
    SELECT 1 FROM clients c
    WHERE c.tenant_id = v_tid
      AND lower(trim(c.name)) = lower(v_name)
  );

  RAISE NOTICE 'Client creation done';

  -- STEP 2: Link all unmatched transactions in one UPDATE
  UPDATE payment_transactions pt
  SET client_id = (
    SELECT c.id
    FROM clients c
    WHERE c.tenant_id = v_tid
      AND lower(trim(c.last)) = lower(trim(pt.lname))
    ORDER BY
      CASE
        WHEN pt.fname <> '' AND lower(trim(c.first)) = lower(trim(split_part(split_part(pt.fname,'/',1),' and ',1)))
        THEN 0 ELSE 1
      END,
      c.created_at
    LIMIT 1
  )
  WHERE pt.tenant_id = v_tid
    AND pt.client_id IS NULL
    AND pt.lname IS NOT NULL
    AND pt.lname <> '';

  RAISE NOTICE 'Transaction linking done';

END $$;

-- STEP 3: Trigger for future auto-link
CREATE OR REPLACE FUNCTION auto_link_payment_transaction()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_client_id text;
  v_first text;
  v_last text;
  v_name text;
BEGIN
  IF NEW.client_id IS NOT NULL OR NEW.lname IS NULL OR NEW.lname = '' THEN
    RETURN NEW;
  END IF;

  v_last  := trim(NEW.lname);
  v_first := trim(coalesce(split_part(split_part(coalesce(NEW.fname,''), '/', 1), ' and ', 1), ''));
  v_name  := CASE WHEN v_first <> '' THEN v_first || ' ' || v_last ELSE v_last END;

  SELECT id INTO v_client_id
  FROM clients
  WHERE tenant_id = NEW.tenant_id
    AND lower(trim(last)) = lower(v_last)
  ORDER BY
    CASE WHEN v_first <> '' AND lower(trim(first)) = lower(v_first) THEN 0 ELSE 1 END,
    created_at
  LIMIT 1;

  IF v_client_id IS NULL THEN
    v_client_id := 'c' || lpad(floor(extract(epoch from now())*1000)::bigint::text, 13, '0');
    INSERT INTO clients (
      id, tenant_id, name, first, last,
      clienttype, "clientType", status,
      "assignedTo", assignedto, created_at
    ) VALUES (
      v_client_id, NEW.tenant_id, v_name, v_first, v_last,
      'Individual', 'Individual', 'Active',
      coalesce(NEW.associate, 'Unassigned'),
      coalesce(NEW.associate, 'Unassigned'),
      now()
    ) ON CONFLICT (id) DO NOTHING;
  END IF;

  NEW.client_id := v_client_id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_link_payment_transaction ON payment_transactions;
CREATE TRIGGER trg_auto_link_payment_transaction
  BEFORE INSERT ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION auto_link_payment_transaction();
