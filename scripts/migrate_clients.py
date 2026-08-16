import json, subprocess, os, sys

TCR = "mpxgxfqdbquzkrvvejkh"
NAS = "ydrvncdedgjtcprczwpu"
NASH = "489ace07-1a6b-4864-833a-4f8420568b40"
TOKEN = os.environ['SUPABASE_ACCESS_TOKEN']

COLS = ['id','name','first','last','phone','phone2','email','street','city','state',
        'zip','county','ssn','ein','status','clientsince','assignedto','notes',
        'custnum','dnd','created_at','source','pipelinestage','business_name',
        'archived','tenant_id','internal_note','autopay_enabled','irsbalance',
        'issuetype','irsorstate','taxyears','filingstatus','dependents','spousename',
        'spousessn']

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
        print(f"Parse error: {r.stdout[:100]}", file=sys.stderr)
        return None

def val(v):
    if v is None: return 'NULL'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, (dict, list)): return "'" + json.dumps(v).replace("'","''") + "'"
    s = str(v).replace("'","''")
    return f"'{s}'"

col_sql = ','.join(f'"{c}"' for c in COLS)
total = 0
offset = 0
batch = 50

while True:
    rows = q(TCR, f"SELECT {col_sql} FROM clients WHERE tenant_id='{NASH}' ORDER BY id LIMIT {batch} OFFSET {offset}")
    if not rows or not isinstance(rows, list) or len(rows) == 0:
        print(f"Done at offset {offset}, total={total}")
        break

    # Build VALUES list
    value_rows = []
    for row in rows:
        vals = ','.join(val(row.get(c)) for c in COLS)
        value_rows.append(f'({vals})')

    sql = f"INSERT INTO clients ({col_sql}) VALUES {','.join(value_rows)} ON CONFLICT (id) DO NOTHING"
    result = q(NAS, sql)

    if isinstance(result, dict) and result.get('message'):
        print(f"Error at offset {offset}: {result['message'][:150]}")
        # Try one by one
        for row in rows:
            vals = ','.join(val(row.get(c)) for c in COLS)
            single = f"INSERT INTO clients ({col_sql}) VALUES ({vals}) ON CONFLICT (id) DO NOTHING"
            r2 = q(NAS, single)
            if isinstance(r2, dict) and r2.get('message'):
                pass  # skip problem rows
            else:
                total += 1
    else:
        total += len(rows)
        print(f"Offset {offset}: inserted {len(rows)} (total {total})")

    offset += batch
    if len(rows) < batch:
        break

# Final count
count = q(NAS, f"SELECT COUNT(*) as cnt FROM clients WHERE tenant_id='{NASH}'")
print(f"Final Nashville clients count: {count}")
