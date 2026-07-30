-- Cross-CRM data migration support (Romy: "the ability to pull any data from
-- any other CRM... Canopy's full API to transfer over 853 files for Chris").
-- No universal API exists across platforms, so the practical shape is: a
-- generic import PIPELINE (this) + a thin per-source adapter that maps that
-- platform's export into the shape these RPCs expect. Canopy, Soraban, Xero,
-- whatever comes next all feed the same pipeline instead of a new import
-- system each time.
--
-- Two RPCs: import_clients_bulk (records, no files) and
-- import_client_documents_bulk (attach previously-uploaded document rows to
-- matched clients by name — the actual file bytes go through a storage
-- upload the frontend does directly, same private-bucket pattern as
-- office-agreements). Both platform-admin gated (Romy specifically) since a
-- bulk migration into any office's data is exactly the kind of action that
-- shouldn't be casually available.

CREATE OR REPLACE FUNCTION public.import_clients_bulk(
  p_tenant_id uuid,
  p_records jsonb  -- array of {name, first, last, email, phone, ssn, ein, street, city, state, zip, filingstatus, notes, source, external_id, ...}
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_rec jsonb;
  v_id text;
  v_inserted int := 0;
  v_skipped int := 0;
  v_errors jsonb := '[]'::jsonb;
BEGIN
  IF NOT public._is_platform_admin() THEN RAISE EXCEPTION 'Not authorized.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'Unknown tenant.';
  END IF;

  FOR v_rec IN SELECT * FROM jsonb_array_elements(p_records)
  LOOP
    BEGIN
      IF coalesce(trim(v_rec->>'name'), '') = '' THEN
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_object('record', v_rec, 'error', 'Missing name');
        CONTINUE;
      END IF;

      v_id := 'imp' || extract(epoch from clock_timestamp())::bigint::text || floor(random()*1000)::text;

      INSERT INTO clients (
        id, name, first, last, email, phone, phone2,
        street, city, state, zip, ssn, ein, "filingStatus",
        notes, source, status, "clientSince", tenant_id, created_at
      ) VALUES (
        v_id,
        trim(v_rec->>'name'),
        nullif(trim(v_rec->>'first'), ''),
        nullif(trim(v_rec->>'last'), ''),
        nullif(trim(lower(v_rec->>'email')), ''),
        nullif(trim(v_rec->>'phone'), ''),
        nullif(trim(v_rec->>'phone2'), ''),
        nullif(trim(v_rec->>'street'), ''),
        nullif(trim(v_rec->>'city'), ''),
        nullif(trim(v_rec->>'state'), ''),
        nullif(trim(v_rec->>'zip'), ''),
        nullif(trim(v_rec->>'ssn'), ''),
        nullif(trim(v_rec->>'ein'), ''),
        nullif(trim(v_rec->>'filingstatus'), ''),
        nullif(trim(v_rec->>'notes'), ''),
        coalesce(nullif(trim(v_rec->>'source'), ''), 'Import'),
        coalesce(nullif(trim(v_rec->>'status'), ''), 'Active'),
        to_char(now(), 'YYYY-MM-DD'),
        p_tenant_id,
        now()
      );
      v_inserted := v_inserted + 1;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object('record', v_rec, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted, 'skipped', v_skipped, 'errors', v_errors);
END $function$;

-- Attach document metadata rows to already-uploaded files, matched to
-- clients by NAME within the target tenant (the frontend uploads the actual
-- bytes to the documents storage bucket first, same as any normal upload,
-- then calls this to create the linking rows in bulk).
CREATE OR REPLACE FUNCTION public.import_client_documents_bulk(
  p_tenant_id uuid,
  p_records jsonb  -- array of {client_name, file_name, file_url, file_size, doc_type, notes}
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_rec jsonb;
  v_client_name text;
  v_id text;
  v_inserted int := 0;
  v_skipped int := 0;
  v_errors jsonb := '[]'::jsonb;
BEGIN
  IF NOT public._is_platform_admin() THEN RAISE EXCEPTION 'Not authorized.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'Unknown tenant.';
  END IF;

  FOR v_rec IN SELECT * FROM jsonb_array_elements(p_records)
  LOOP
    BEGIN
      v_client_name := trim(v_rec->>'client_name');
      IF v_client_name = '' OR v_client_name IS NULL THEN
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_object('record', v_rec, 'error', 'Missing client_name');
        CONTINUE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM clients WHERE tenant_id = p_tenant_id AND name = v_client_name) THEN
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_object('record', v_rec, 'error', 'No matching client: ' || v_client_name);
        CONTINUE;
      END IF;

      v_id := 'impdoc' || extract(epoch from clock_timestamp())::bigint::text || floor(random()*1000)::text;

      INSERT INTO documents (
        id, name, client, "docType", file_url, file_name, file_size, notes, source, tenant_id, created_at
      ) VALUES (
        v_id,
        coalesce(nullif(trim(v_rec->>'file_name'), ''), 'Imported document'),
        v_client_name,
        nullif(trim(v_rec->>'doc_type'), ''),
        v_rec->>'file_url',
        v_rec->>'file_name',
        nullif(v_rec->>'file_size','')::bigint,
        nullif(trim(v_rec->>'notes'), ''),
        'Import',
        p_tenant_id,
        now()
      );
      v_inserted := v_inserted + 1;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object('record', v_rec, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted, 'skipped', v_skipped, 'errors', v_errors);
END $function$;
