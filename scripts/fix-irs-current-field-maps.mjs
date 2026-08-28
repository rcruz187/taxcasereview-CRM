import fs from 'node:fs'

const p='src/lib/irsFormUtils.js'
let s=fs.readFileSync(p,'utf8')
let changed=false

function replaceBetween(startMarker,endMarker,replacement){
  const a=s.indexOf(startMarker)
  if(a<0) throw new Error(`Missing start marker: ${startMarker}`)
  const b=s.indexOf(endMarker,a+startMarker.length)
  if(b<0) throw new Error(`Missing end marker: ${endMarker}`)
  const old=s.slice(a,b)
  if(old===replacement) return
  s=s.slice(0,a)+replacement+s.slice(b)
  changed=true
}

// Current IRS PDFs periodically rename AcroForm fields. These mappings were
// verified against the PDFs fetched from irs.gov by scripts/audit-tax-forms.mjs.
replaceBetween("  // ─── Form 8822-B", "  // ─── Form 4506-T", `  // ─── Form 8822-B (Change of Address — Business) ───────────────────────────\n  '8822b': {\n    bizName:      'topmostSubform[0].Page1[0].Line4aReadOrder[0].f1_1[0]',\n    ein:          'topmostSubform[0].Page1[0].Line4bReadOrder[0].f1_2[0]',\n    newStreet:    'topmostSubform[0].Page1[0].f1_9[0]',\n    newCityState: 'topmostSubform[0].Page1[0].f1_10[0]',\n    newZip:       'topmostSubform[0].Page1[0].f1_11[0]',\n    idType:       'ein',\n  },\n\n`)

replaceBetween("  // ─── Form 4506-T", "  // ─── Form 12153", `  // ─── Form 4506-T (Request for Transcript) ────────────────────────────────\n  // Current revision uses one combined field for line 3 current address.\n  '4506t': {\n    name:    'topmostSubform[0].Page1[0].f1_1[0]',\n    ssn:     'topmostSubform[0].Page1[0].f1_2[0]',\n    currentAddress: 'topmostSubform[0].Page1[0].f1_5[0]',\n    phone:   'topmostSubform[0].Page1[0].f1_20[0]',\n    idType:  'ssn',\n  },\n\n`)

replaceBetween("  // ─── Form 12153", "  // ─── Form 656 (", `  // ─── Form 12153 (CDP Hearing Request) ────────────────────────────────────\n  '12153': {\n    name:   'topmostSubform[0].Page1[0].TaxpayerName1[0]',\n    tin:    'topmostSubform[0].Page1[0].TIN_1[0]',\n    street: 'topmostSubform[0].Page1[0].CurrentAddress1[0]',\n    city:   'topmostSubform[0].Page1[0].City1[0]',\n    state:  'topmostSubform[0].Page1[0].State1[0]',\n    zip:    'topmostSubform[0].Page1[0].ZIPCode1[0]',\n    phone:  'topmostSubform[0].Page1[0].TelephoneNumberBestTime1[0].TelephoneNumber[0]',\n    idType: 'ssn',\n  },\n\n`)

replaceBetween("  // ─── Form 656 (", "  // ─── Form 4549", `  // ─── Form 656 (Offer in Compromise) ──────────────────────────────────────\n  '656': {\n    name:    'topmostSubform[0].F656_Page1[0].Your_First_Middle_Last_Name[0]',\n    ssn:     'topmostSubform[0].F656_Page1[0].YourSocialSecurityNumber[0]',\n    street:  'topmostSubform[0].F656_Page1[0].Your_Home_Address[0]',\n    bizName: 'topmostSubform[0].F656_Page2[0].Business_Name[0]',\n    bizAddr: 'topmostSubform[0].F656_Page2[0].BusinessPhysicalAddress[0]',\n    ein:     'topmostSubform[0].F656_Page2[0].BusinessEIN[0]',\n    contact: 'topmostSubform[0].F656_Page2[0].Name_Title_Primary_Contact[0]',\n    phone:   'topmostSubform[0].F656_Page2[0].BusinessPhone[0]',\n    idType:  'ssn',\n  },\n\n`)

replaceBetween("  // ─── Form 8832", "  // ─── Form 911", `  // ─── Form 8832 (Entity Classification) ───────────────────────────────────\n  '8832': {\n    bizName: 'topmostSubform[0].Page1[0].p1-t1[0]',\n    ein:     'topmostSubform[0].Page1[0].p1-t2[0]',\n    street:  'topmostSubform[0].Page1[0].p1-t4[0]',\n    cityStateZip: 'topmostSubform[0].Page1[0].p1-t5[0]',\n    idType:  'ein',\n  },\n\n`)

replaceBetween("  // ─── Form 911", "  // ─── Form SS-4", `  // ─── Form 911 (Taxpayer Advocate) ────────────────────────────────────────\n  '911': {\n    name:   'topmostSubform[0].page1[0].taxpayerName[0]',\n    ssn:    'topmostSubform[0].page1[0].taxpayerTIN[0]',\n    street: 'topmostSubform[0].page1[0].taxpayerAddressStreet[0]',\n    city:   'topmostSubform[0].page1[0].taxpayerAddressCity[0]',\n    state:  'topmostSubform[0].page1[0].taxpayerAddressState[0]',\n    zip:    'topmostSubform[0].page1[0].taxpayerAddressZIPCode[0]',\n    phone:  'topmostSubform[0].page1[0].taxpayerDaytimePhone[0]',\n    idType: 'ssn',\n  },\n\n`)

replaceBetween("  // ─── Form SS-4", "  // ─── Form 2553", `  // ─── Form SS-4 (Apply for EIN) ────────────────────────────────────────────\n  // Current Dec. 2025 revision. Fill only identity/address fields whose\n  // semantics are unambiguous; entity-type details remain staff-completed.\n  'ss4': {\n    bizName:  'topmostSubform[0].Page1[0].PgHeader[0].f1_1[0]',\n    tradeName:'topmostSubform[0].Page1[0].f1_2[0]',\n    careOf:   'topmostSubform[0].Page1[0].f1_3[0]',\n    street:   'topmostSubform[0].Page1[0].Line4ReadOrder[0].f1_5[0]',\n    cityStateZip: 'topmostSubform[0].Page1[0].Line4ReadOrder[0].f1_6[0]',\n    idType:   'ein',\n  },\n\n`)

replaceBetween("  // ─── Form 2553", "  // ─── Form 12661", `  // ─── Form 2553 (S-Corp Election) ─────────────────────────────────────────\n  '2553': {\n    bizName: 'topmostSubform[0].Page1[0].NameAddress[0].f1_01[0]',\n    street:  'topmostSubform[0].Page1[0].NameAddress[0].f1_02[0]',\n    cityStateZip: 'topmostSubform[0].Page1[0].NameAddress[0].f1_03[0]',\n    ein:     'topmostSubform[0].Page1[0].f1_04[0]',\n    idType:  'ein',\n  },\n\n`)

replaceBetween("  // ─── Form 12661", "  // ─── Form 1128", `  // ─── Form 12661 (Disputed Issue Verification) ─────────────────────────────\n  '12661': {\n    name: 'form1[0].page_1[0].taxpayer_name[0]',\n    ssn:  'form1[0].page_1[0].social_security[0]',\n    idType: 'ssn',\n  },\n\n`)

replaceBetween("  // ─── Form 1128", "};\n\n// Map form type", `  // ─── Form 1128 (Adopt/Change Tax Year) ───────────────────────────────────\n  '1128': {\n    bizName: 'topmostSubform[0].Page1[0].p1-01[0]',\n    ein:     'topmostSubform[0].Page1[0].p1-02[0]',\n    street:  'topmostSubform[0].Page1[0].p1-03[0]',\n    cityStateZip: 'topmostSubform[0].Page1[0].p1-05[0]',\n    idType:  'ein',\n  },\n`)

if(!s.includes("export const MANUAL_ONLY_FORM_TYPES")){
  const anchor="// Map form type → which blank template filename to fetch"
  const i=s.indexOf(anchor)
  if(i<0) throw new Error('TEMPLATE_PATHS anchor missing')
  s=s.slice(0,i)+`// IRS Form 4549 is an examination report prepared by the IRS. IRS.gov does\n// not publish a current standalone f4549.pdf, so generating one from a dead\n// URL is unsafe. Keep it visible as a manual attachment workflow only.\nexport const MANUAL_ONLY_FORM_TYPES = ['4549'];\n\n`+s.slice(i)
  changed=true
}

// Fail closed before trying a dead/unverified public template.
const fetchLine="  const map = FIELD_MAPS[formType];\n  const templateBytes = await fetchTemplate(TEMPLATE_PATHS[formType]);"
const guarded=`  const map = FIELD_MAPS[formType];\n  if (MANUAL_ONLY_FORM_TYPES.includes(formType)) {\n    throw new Error('Form 4549 is an IRS-generated examination report and has no current public standalone IRS PDF. Attach the official examiner-provided Form 4549 manually instead.');\n  }\n  const templateBytes = await fetchTemplate(TEMPLATE_PATHS[formType]);`
if(s.includes(fetchLine)){s=s.replace(fetchLine,guarded);changed=true}

function replaceFill(startMarker,endMarker,replacement){replaceBetween(startMarker,endMarker,replacement)}

replaceFill("  // ─── Form 4506-T", "  // ─── Form 12153", `  // ─── Form 4506-T (Request for Transcript) ────────────────────────────────\n  else if (formType === '4506t') {\n    const m = FIELD_MAPS['4506t'];\n    setText(m.name, client.name || '');\n    setText(m.ssn, client.ssn || client.tin || client.ein || '');\n    const address = [client.address || client.street, [client.city,client.state].filter(Boolean).join(', '), client.zip].filter(Boolean).join('  ');\n    setText(m.currentAddress, address);\n    setText(m.phone, client.phone || '');\n  }\n\n`)

replaceFill("  // ─── Form 12153", "  // ─── Form 656 (", `  // ─── Form 12153 (CDP Hearing Request) ────────────────────────────────────\n  else if (formType === '12153') {\n    const m = FIELD_MAPS['12153'];\n    setText(m.name, client.name || client.business_name || '');\n    setText(m.tin, client.ssn || client.tin || client.ein || '');\n    setText(m.street, client.address || client.street || '');\n    setText(m.city, client.city || '');\n    setText(m.state, client.state || '');\n    setText(m.zip, client.zip || '');\n    setText(m.phone, client.phone || '');\n  }\n\n`)

replaceFill("  // ─── Form 656 (", "  // ─── Form 4549", `  // ─── Form 656 (Offer in Compromise) ──────────────────────────────────────\n  else if (formType === '656') {\n    const m = FIELD_MAPS['656'];\n    setText(m.name, client.name || '');\n    setText(m.ssn, client.ssn || client.tin || '');\n    setText(m.street, [client.address||client.street, client.city, client.state, client.zip].filter(Boolean).join(', '));\n    if (client.business_name || client.ein) {\n      setText(m.bizName, client.business_name || client.name || '');\n      setText(m.bizAddr, [client.biz_street||client.address||client.street, client.biz_city||client.city, client.biz_state||client.state, client.biz_zip||client.zip].filter(Boolean).join(', '));\n      setText(m.ein, client.ein || '');\n      setText(m.contact, client.name || '');\n      setText(m.phone, client.phone || '');\n    }\n  }\n\n`)

replaceFill("  // ─── Form 911", "  // ─── Form SS-4", `  // ─── Form 911 (Taxpayer Advocate) ────────────────────────────────────────\n  else if (formType === '911') {\n    const m = FIELD_MAPS['911'];\n    setText(m.name, client.name || '');\n    setText(m.ssn, client.ssn || client.tin || client.ein || '');\n    setText(m.street, client.address || client.street || '');\n    setText(m.city, client.city || '');\n    setText(m.state, client.state || '');\n    setText(m.zip, client.zip || '');\n    setText(m.phone, client.phone || '');\n  }\n\n`)

replaceFill("  // ─── Form SS-4", "  // ─── Form 2553", `  // ─── Form SS-4 (Apply for EIN) ────────────────────────────────────────────\n  else if (formType === 'ss4') {\n    const m = FIELD_MAPS['ss4'];\n    setText(m.bizName, client.business_name || client.name || '');\n    setText(m.tradeName, client.trade_name || client.dba || '');\n    setText(m.careOf, client.name || '');\n    setText(m.street, client.biz_street || client.address || client.street || '');\n    const csz=[client.biz_city||client.city,client.biz_state||client.state].filter(Boolean).join(', ')+(client.biz_zip||client.zip ? ' '+(client.biz_zip||client.zip) : '');\n    setText(m.cityStateZip, csz);\n  }\n\n`)

replaceFill("  // ─── Form 2553", "  // ─── Form 12661", `  // ─── Form 2553 (S-Corp Election) ─────────────────────────────────────────\n  else if (formType === '2553') {\n    const m = FIELD_MAPS['2553'];\n    setText(m.bizName, client.business_name || client.name || '');\n    setText(m.street, client.biz_street || client.address || client.street || '');\n    const csz=[client.biz_city||client.city,client.biz_state||client.state].filter(Boolean).join(', ')+(client.biz_zip||client.zip ? ' '+(client.biz_zip||client.zip) : '');\n    setText(m.cityStateZip, csz);\n    setText(m.ein, client.ein || '');\n  }\n\n`)

replaceFill("  // ─── Form 12661", "  // ─── Form 1128", `  // ─── Form 12661 (Disputed Issue Verification) ─────────────────────────────\n  else if (formType === '12661') {\n    const m = FIELD_MAPS['12661'];\n    setText(m.name, client.name || '');\n    setText(m.ssn, client.ssn || client.tin || '');\n  }\n\n`)

// 8832 and 1128 fill logic already matches the retained semantic keys.

if(changed) fs.writeFileSync(p,s)
console.log(`IRS current-field safety ${changed?'patched':'already current'}: stale mappings aligned; Form 4549 manual-only.`)
