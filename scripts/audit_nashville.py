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
        return {'error': r.stdout[:200]}

# 1. Count all tenant-scoped tables in both TCR and Nashville
tables = [
    'clients','cases','leads','tasks','calevents','payments','payment_transactions',
    'invoices','esigns','documents','client_notes','lead_notes','case_notes',
    'sms_messages','fax_logs','call_logs','call_recordings','voicemails',
    'employees','timeentries','time_off_requests','payrollruns',
    'workflow_templates','workflow_statuses','workflow_status_categories',
    'billing_time_entries','billing_activity_types',
    'poa_records','transcript_analyses','state_form_tracker','irsforms',
    'financial_intake_responses','client_financial_profiles',
    'client_compliance_records','tax_organizer_responses','tax_returns',
    'tax_doc_uploads','deadlines','chat_messages','chat_channels',
    'email_accounts','employee_gmail_accounts','employee_m365_accounts',
    'accounting_connections','corporations','formacorp','cseds',
    'bookkeeping','estimates','activity_log'
]

print("TABLE | TCR | NASHVILLE | MATCH")
print("-" * 60)

mismatches = []
missing_tables = []

for t in tables:
    tcr_r = q(TCR, f"SELECT COUNT(*) as cnt FROM {t} WHERE tenant_id='{NASH}'")
    nas_r = q(NAS, f"SELECT COUNT(*) as cnt FROM {t} WHERE tenant_id='{NASH}'")
    
    tcr_cnt = tcr_r[0]['cnt'] if isinstance(tcr_r, list) and tcr_r else 'ERR'
    nas_cnt = nas_r[0]['cnt'] if isinstance(nas_r, list) and nas_r else 'MISSING'
    
    match = '✅' if str(tcr_cnt) == str(nas_cnt) else '❌'
    print(f"{t:<40} {str(tcr_cnt):<8} {str(nas_cnt):<12} {match}")
    
    if 'MISSING' in str(nas_cnt):
        missing_tables.append(t)
    elif str(tcr_cnt) != str(nas_cnt) and int(str(tcr_cnt)) > 0:
        mismatches.append((t, tcr_cnt, nas_cnt))

print("\n=== MISSING TABLES IN NASHVILLE ===")
for t in missing_tables:
    print(f"  {t}")

print("\n=== DATA MISMATCHES (TCR has data, Nashville doesn't) ===")
for t, tcr_cnt, nas_cnt in mismatches:
    print(f"  {t}: TCR={tcr_cnt} NAS={nas_cnt}")
