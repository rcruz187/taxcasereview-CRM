import json, sys, subprocess, os

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
    ], capture_output=True, text=True)
    try:
        return json.loads(result.stdout)
    except:
        print(f"API error: {result.stdout[:200]}")
        return []

def make_insert(table, row):
    cols = []
    vals = []
    for k, v in row.items():
        cols.append(f'"{k}"')
        if v is None:
            vals.append('NULL')
        elif isinstance(v, bool):
            vals.append('true' if v else 'false')
        elif isinstance(v, (int, float)):
            vals.append(str(v))
        elif isinstance(v, (dict, list)):
            vals.append("'" + json.dumps(v).replace("'", "''") + "'")
        else:
            vals.append("'" + str(v).replace("'", "''") + "'")
    return f"INSERT INTO {table} ({','.join(cols)}) VALUES ({','.join(vals)}) ON CONFLICT DO NOTHING"

print(f"Migrating {TABLE}...")
offset = 0
batch_size = 100
total = 0

while True:
    rows = api_query(TCR, f"SELECT * FROM {TABLE} WHERE tenant_id='{NASH}' ORDER BY created_at LIMIT {batch_size} OFFSET {offset}")
    if not rows or len(rows) == 0:
        break
    
    print(f"  Batch offset={offset} rows={len(rows)}")
    errors = 0
    for row in rows:
        sql = make_insert(TABLE, row)
        result = api_query(NAS, sql)
        if isinstance(result, dict) and result.get('message'):
            errors += 1
            if errors <= 3:
                print(f"    Error: {result['message'][:100]}")
    
    total += len(rows)
    offset += batch_size
    if len(rows) < batch_size:
        break

print(f"Done: {total} rows migrated")

# Verify
count = api_query(NAS, f"SELECT COUNT(*) as cnt FROM {TABLE} WHERE tenant_id='{NASH}'")
if count:
    print(f"Nashville {TABLE} count: {count[0].get('cnt', '?')}")
