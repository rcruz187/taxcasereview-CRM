import { useState } from 'react'
import Esign from './Esign'
import UniversalOfficeESign from '../components/admin/UniversalOfficeESign'
import { supabase } from '../lib/supabase'
import { FIRM } from '../lib/firmBranding'

export default function TaxOfficeEsign(){
  const [mode,setMode]=useState('tax')
  const tenantId=FIRM.tenantId
  const firmName=FIRM.name||'Tax Office'

  return (
    <div>
      <div style={{padding:'16px 24px 0',maxWidth:1100,margin:'0 auto'}}>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',padding:6,border:'1px solid var(--br)',borderRadius:10,background:'var(--s2)',width:'fit-content'}}>
          <button className={`btn ${mode==='tax'?'pri':'sec'}`} onClick={()=>setMode('tax')} style={{fontWeight:800}}>Tax Forms & Agreements</button>
          <button className={`btn ${mode==='pdf'?'pri':'sec'}`} onClick={()=>setMode('pdf')} style={{fontWeight:800}}>Upload Contract / PDF</button>
        </div>
        <div style={{fontSize:12,color:'var(--t3)',marginTop:8,lineHeight:1.5}}>
          Use the existing tax-specific e-sign workflow, or upload any PDF contract and place signature fields DocuSign-style.
        </div>
      </div>

      {mode==='tax' ? <Esign /> : (
        <div style={{padding:'20px 24px',maxWidth:1100,margin:'0 auto'}}>
          {!tenantId ? (
            <div className="card" style={{padding:18,color:'var(--bad)'}}>Office identity is still loading. Refresh this page once the office branding has loaded.</div>
          ) : (
            <UniversalOfficeESign
              key={`taxres_crm:${tenantId}`}
              supabase={supabase}
              productKey="taxres_crm"
              externalOfficeId={tenantId}
              firmName={firmName}
              contactEmail={FIRM.email||''}
              contactPhone={FIRM.phone||''}
            />
          )}
        </div>
      )}
    </div>
  )
}
