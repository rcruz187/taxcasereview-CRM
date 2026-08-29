-- Fail closed: never silently route an unscoped write into the TCR tenant.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema='public'
      AND column_name='tenant_id'
      AND column_default ILIKE '%61a89aef-0e7e-4ea2-b222-44ab2024655a%'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT public.current_tenant_id()',
      r.table_schema, r.table_name, r.column_name
    );
  END LOOP;
END $$;

-- Project-wide storage is a platform metric, not a tenant-admin metric.
CREATE OR REPLACE FUNCTION public.get_project_storage_usage()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'storage', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public._is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized to view project storage usage';
  END IF;

  WITH bucket_usage AS (
    SELECT bucket_id,
           count(*)::bigint AS objects,
           coalesce(sum(coalesce(nullif(metadata->>'size','')::bigint,0)),0)::bigint AS bytes
    FROM storage.objects
    GROUP BY bucket_id
  )
  SELECT jsonb_build_object(
    'total_bytes', coalesce(sum(bytes),0),
    'total_objects', coalesce(sum(objects),0),
    'buckets', coalesce(
      jsonb_agg(
        jsonb_build_object('bucket_id',bucket_id,'objects',objects,'bytes',bytes)
        ORDER BY bytes DESC
      ),
      '[]'::jsonb
    ),
    'measured_at', now()
  ) INTO v_result
  FROM bucket_usage;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_project_storage_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_project_storage_usage() TO authenticated, service_role;
