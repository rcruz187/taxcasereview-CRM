import json, subprocess, os, sys

TCR = "mpxgxfqdbquzkrvvejkh"
NAS = "ydrvncdedgjtcprczwpu"
NASH = "489ace07-1a6b-4864-833a-4f8420568b40"
TOKEN = os.environ['SUPABASE_ACCESS_TOKEN']

def q(ref, sql):
    r = subprocess.run([
        'curl','-s','-X','POST',
        f'https://api.supabase.com/v1/projects/{ref}/database/query',
        '-H', f'Authorization: Bearer {TOKEN}',
        '-H', 'Content-Type: application/json',
        '-d', json.dumps({'query': sql})
    ], capture_output=True, text=True, timeout=60)
    try:
        return json.loads(r.stdout)
    except:
        print(f"Error: {r.stdout[:150]}")
        return None

def val(v):
    if v is None: return 'NULL'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, (dict, list)): return "'" + json.dumps(v).replace("'","''") + "'"
    return "'" + str(v).replace("'","''") + "'"

def migrate_table(table, where=None, batch=100):
    where_clause = f"WHERE tenant_id='{NASH}'" if where is None else where
    total_q = q(TCR, f"SELECT COUNT(*) as cnt FROM {table} {where_clause}")
    if not total_q or not isinstance(total_q, list):
        print(f"  {table}: Can't get count")
        return
    total = int(total_q[0]['cnt'])
    if total == 0:
        print(f"  {table}: 0 rows, skip")
        return
    
    print(f"  {table}: migrating {total} rows...")
    offset = 0
    migrated = 0
    
    while offset < total:
        rows = q(TCR, f"SELECT * FROM {table} {where_clause} ORDER BY created_at LIMIT {batch} OFFSET {offset}")
        if not rows or not isinstance(rows, list) or len(rows) == 0:
            break
        
        cols = list(rows[0].keys())
        col_str = ','.join(f'"{c}"' for c in cols)
        value_rows = [f"({','.join(val(row.get(c)) for c in cols)})" for row in rows]
        
        sql = f"INSERT INTO {table} ({col_str}) VALUES {','.join(value_rows)} ON CONFLICT DO NOTHING"
        result = q(NAS, sql)
        
        if isinstance(result, dict) and result.get('message'):
            print(f"    Error offset {offset}: {result['message'][:100]}")
        else:
            migrated += len(rows)
        
        offset += batch
        if len(rows) < batch:
            break
    
    count = q(NAS, f"SELECT COUNT(*) as cnt FROM {table} {where_clause}")
    cnt = count[0]['cnt'] if isinstance(count, list) and count else '?'
    print(f"  {table}: Nashville now has {cnt} rows")

# 1. Create missing tables
print("=== Creating missing tables ===")

q(NAS, """CREATE TABLE IF NOT EXISTS call_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    direction text NOT NULL DEFAULT 'outbound',
    from_number text, to_number text,
    duration_sec integer DEFAULT 0,
    status text DEFAULT 'completed',
    recording_url text, notes text,
    lead_id text, client_id text, user_id text,
    read boolean DEFAULT false,
    tenant_id uuid,
    PRIMARY KEY (id)
)""")
print("  call_logs: created")

q(NAS, """CREATE TABLE IF NOT EXISTS employee_gmail_accounts (
    employee_email text NOT NULL,
    gmail_connected_email text,
    gmail_access_token text, gmail_refresh_token text,
    gmail_token_expiry timestamptz,
    gmail_backfill_phase text DEFAULT 'inbox',
    gmail_backfill_page_token text,
    gmail_last_sync_at timestamptz,
    gmail_last_cleanup_at timestamptz,
    gmail_last_error text,
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (employee_email)
)""")
print("  employee_gmail_accounts: created")

# 2. Migrate missing data tables
print("\n=== Migrating missing data ===")
migrate_table('billing_activity_types')
migrate_table('financial_intake_responses')
migrate_table('client_compliance_records')
migrate_table('tax_organizer_responses')
migrate_table('chat_channels')
migrate_table('accounting_connections')

# 3. Fix payments gap (missing 84 rows)
print("\n=== Fixing payments gap ===")
migrate_table('payments', batch=200)

# 4. Fix payment_transactions gap (missing 559 rows)
print("\n=== Fixing payment_transactions gap ===")
migrate_table('payment_transactions', batch=200)

# 5. Fix cases gap (missing 2)
print("\n=== Fixing cases gap ===")
migrate_table('cases', batch=200)

print("\n=== Done ===")
