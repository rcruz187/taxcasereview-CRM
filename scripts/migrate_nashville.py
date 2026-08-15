import json, sys, subprocess, os, time

TABLE = os.environ['TABLE']
NAS = os.environ['NAS']
TOKEN = os.environ['SUPABASE_ACCESS_TOKEN']
NASH = os.environ['NASH']
TCR = os.environ['TCR']

def api_query(project_ref, sql):
    result = subprocess.run([
        'curl', '-s', '-X', 'POST',
        f'https://api.supabase.com/v1/projects/{project_ref}/database/query',
        '-H', f'Authorization: Bearer {TOKEN}',
        '-H', 'Content-Type: application/json',
        '-d', json.dumps({'query': sql})
    ], capture_output=True, text=True, timeout=30)
    try:
        return json.loads(result.stdout)
    except:
        print(f"  API error: {result.stdout[:100]}")
        return []

def val(v):
    if v is None: return 'NULL'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, (dict, list)): return "'" + json.dumps(v).replace("'", "''") + "'"
    return "'" + str(v).replace("'", "''") + "'"

print(f"Migrating {TABLE}...")
offset = 0
batch_size = 100
total = 0

while True:
    rows = api_query(TCR, f"SELECT * FROM {TABLE} WHERE tenant_id='{NASH}' ORDER BY created_at LIMIT {batch_size} OFFSET {offset}")
    if not rows or not isinstance(rows, list) or len(rows) == 0:
        break

    print(f"  Batch offset={offset} rows={len(rows)}")
    
    # Build one big INSERT with all rows (VALUES clause)
    cols = list(rows[0].keys())
    col_str = ','.join(f'"{c}"' for c in cols)
    value_groups = []
    for row in rows:
        value_groups.append(f"({','.join(val(row[c]) for c in cols)})")
    
    sql = f"INSERT INTO {TABLE} ({col_str}) VALUES {','.join(value_groups)} ON CONFLICT DO NOTHING"
    
    result = api_query(NAS, sql)
    if isinstance(result, dict) and result.get('message'):
        print(f"  Error: {result['message'][:150]}")
        # Try row by row on error
        for row in rows:
            single_sql = f"INSERT INTO {TABLE} ({col_str}) VALUES ({','.join(val(row[c]) for c in cols)}) ON CONFLICT DO NOTHING"
            api_query(NAS, single_sql)

    total += len(rows)
    offset += batch_size
    if len(rows) < batch_size:
        break

print(f"Done: {total} rows migrated")
count = api_query(NAS, f"SELECT COUNT(*) as cnt FROM {TABLE} WHERE tenant_id='{NASH}'")
if count and isinstance(count, list):
    print(f"Nashville {TABLE} count: {count[0].get('cnt','?')}")
