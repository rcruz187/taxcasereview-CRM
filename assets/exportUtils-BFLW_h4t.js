function p(n,e){const o=n.map(a=>a.map(r=>`"${String(r??"").replace(/"/g,'""')}"`).join(",")).join(`
`),d=new Blob([o],{type:"text/csv"}),t=document.createElement("a");t.href=URL.createObjectURL(d),t.download=e.endsWith(".csv")?e:e+".csv",t.click()}function c(n,e){const o=window.open("","_blank"),d=new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});o.document.write(`<!DOCTYPE html><html><head><title>${n}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; padding: 32px; color: #1e293b; }
    h1 { font-size: 20px; font-weight: 800; color: #1e3a8a; margin-bottom: 4px; }
    .meta { font-size: 12px; color: #64748b; margin-bottom: 24px; }
    h2 { font-size: 14px; font-weight: 700; margin: 24px 0 8px; color: #1e3a8a; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px; }
    th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; border: 1px solid #e2e8f0; }
    td { padding: 7px 10px; border: 1px solid #e2e8f0; }
    tr:nth-child(even) td { background: #f8fafc; }
    .footer { margin-top: 32px; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
    @media print { body { padding: 16px; } }
  </style></head><body>
  <h1>${n}</h1>
  <div class="meta">Tax Case Review · Generated ${d}</div>
  ${e.map(t=>`
    <h2>${t.heading}</h2>
    <table>
      ${t.headers?`<thead><tr>${t.headers.map(a=>`<th>${a}</th>`).join("")}</tr></thead>`:""}
      <tbody>${t.rows.map(a=>`<tr>${a.map(r=>`<td>${r??"—"}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  `).join("")}
  <div class="footer">Tax Case Review &amp; Resolution Services · North Palm Beach, FL 33408 · taxcasereview.org</div>
  </body></html>`),o.document.close(),setTimeout(()=>o.print(),400)}function l(n,e){const o=`<table>${n.map((a,r)=>`<tr>${a.map(i=>r===0?`<th><b>${i}</b></th>`:`<td>${i??""}</td>`).join("")}</tr>`).join("")}</table>`,d=new Blob([`<html><head><meta charset="UTF-8"></head><body>${o}</body></html>`],{type:"application/vnd.ms-excel"}),t=document.createElement("a");t.href=URL.createObjectURL(d),t.download=e.endsWith(".xls")?e:e+".xls",t.click()}export{l as a,c as b,p as e};
