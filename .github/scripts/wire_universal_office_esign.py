from pathlib import Path
p=Path('src/pages/AdminPortal.jsx')
s=p.read_text()
imp="import UniversalOfficeESign from '../components/admin/UniversalOfficeESign'\n"
anchor="import CredentialVault from '../components/admin/CredentialVault'\n"
if imp not in s:
    if anchor not in s: raise SystemExit('import anchor missing')
    s=s.replace(anchor,anchor+imp,1)
old_arc="""      <div style={{...S.card,padding:'20px 22px'}}>
        <div style={{fontSize:13,fontWeight:800,color:'#e2e8f0',marginBottom:8}}>Office Workspace</div>
        <div style={{fontSize:12,color:'#64748b',lineHeight:1.6}}>This is the isolated RomyLabs office view for this Arcvena tenant. It no longer redirects to the generic Arcvena app when you click the office.</div>
      </div>"""
new_arc="""      <UniversalOfficeESign
        supabase={supabase}
        productKey=\"arcvena\"
        externalOfficeId={office.id}
        firmName={office.name||'Arcvena Office'}
        contactName=\"\"
        contactEmail=\"\"
        seats={null}
        monthlyAmount={null}
      />"""
if old_arc in s:
    s=s.replace(old_arc,new_arc,1)
elif 'productKey="arcvena"' not in s:
    raise SystemExit('Arcvena workspace anchor missing')
doc_anchor="""      {tab==='documents' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>"""
doc_new="""      {tab==='documents' && (
        <div>
          <div style={{marginBottom:18}}>
            <UniversalOfficeESign
              supabase={supabase}
              productKey=\"taxres_crm\"
              externalOfficeId={t.id}
              firmName={t.firm_name||'Office'}
              contactName={t.primary_contact_name||''}
              contactEmail={t.primary_contact_email||''}
              contactPhone={t.firm_phone||''}
              seats={t.billing_seats||employees.length||null}
              monthlyAmount={t.monthly_rate||null}
            />
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>"""
if doc_anchor in s:
    s=s.replace(doc_anchor,doc_new,1)
elif 'productKey="taxres_crm"' not in s:
    raise SystemExit('documents tab anchor missing')
p.write_text(s)
