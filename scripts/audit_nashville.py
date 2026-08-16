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

print("TABLE | TCR | NASHVILLE | STATUS", flush=True)
print("-" * 65, flush=True)

mismatches = []
missing = []

for t in tables:
    tcr_r = q(TCR, f"SELECT COUNT(*) as cnt FROM {t} WHERE tenant_id='{NASH}'")
    nas_r = q(NAS, f"SELECT COUNT(*) as cnt FROM {t} WHERE tenant_id='{NASH}'")
    
    if isinstance(tcr_r, list) and tcr_r:
        tcr_cnt = int(tcr_r[0]['cnt'])
    else:
        tcr_cnt = -1
    
    if isinstance(nas_r, list) and nas_r:
        nas_cnt = int(nas_r[0]['cnt'])
        status = '✅' if tcr_cnt == nas_cnt else ('⚠️ DIFF' if tcr_cnt > 0 else '✅')
    else:
        nas_cnt = -1
        status = '❌ MISSING TABLE'
        missing.append(t)
    
    if tcr_cnt != nas_cnt and tcr_cnt > 0 and nas_cnt >= 0:
        status = f'❌ TCR={tcr_cnt} NAS={nas_cnt}'
        mismatches.append((t, tcr_cnt, nas_cnt))
    
    print(f"{t:<42} {str(tcr_cnt):<6} {str(nas_cnt):<8} {status}", flush=True)

print(f"\n=== SUMMARY ===", flush=True)
print(f"Missing tables: {missing}", flush=True)
print(f"Data gaps: {[(t,a,b) for t,a,b in mismatches]}", flush=True)
