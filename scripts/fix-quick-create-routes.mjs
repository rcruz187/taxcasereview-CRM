import fs from 'node:fs'

function patch(path, mutate) {
  const before = fs.readFileSync(path, 'utf8')
  const after = mutate(before)
  if (after === before) {
    console.log(`quick-create: ${path} already patched or no-op`)
  } else {
    fs.writeFileSync(path, after)
    console.log(`quick-create: patched ${path}`)
  }
}

patch('src/components/layout/TopBar.jsx', s => {
  const oldSet = "const MODAL_PATHS = new Set(['/leads','/clients','/cases','/tasks','/invoices','/payments','/documents','/calendar','/email','/esign','/fax'])"
  const newSet = "const MODAL_PATHS = new Set(['/leads','/clients','/cases','/tasks','/invoices','/payments','/documents','/calendar','/email','/esign','/fax','/formacorp','/books','/transcripts'])"
  return s.includes(oldSet) ? s.replace(oldSet, newSet) : s
})

patch('src/pages/Fax.jsx', s => {
  if (s.includes("qp.get('new') === '1'")) return s
  const marker = "  useEffect(() => {\n    load()"
  if (!s.includes(marker)) throw new Error('Fax quick-create marker not found')
  const inject = "  useEffect(() => {\n    if (qp.get('new') === '1') {\n      setForm(prev => ({ ...BLANK, from_number: prev.from_number || '', client_name: qp.get('client') || '', to_number: (qp.get('phone') || '').replace(/\\D/g,'') }))\n      setFile(null)\n      setModal(true)\n    }\n  }, [location.search])\n\n"
  return s.replace(marker, inject + marker)
})

patch('src/pages/Transcripts.jsx', s => {
  if (!s.includes("from 'react-router-dom'")) {
    s = s.replace("import { useState, useEffect } from 'react'\n", "import { useState, useEffect } from 'react'\nimport { useLocation } from 'react-router-dom'\n")
  }
  if (!s.includes('const location = useLocation()')) {
    s = s.replace('export default function Transcripts() {\n', 'export default function Transcripts() {\n  const location = useLocation()\n')
  }
  if (!s.includes("new URLSearchParams(location.search).get('new') === '1'")) {
    const marker = '  useEffect(() => { load() }, [])'
    if (!s.includes(marker)) throw new Error('Transcripts quick-create marker not found')
    s = s.replace(marker, "  useEffect(() => {\n    if (new URLSearchParams(location.search).get('new') === '1') {\n      setForm(BLANK)\n      setEditId(null)\n      setModal(true)\n    }\n  }, [location.search])\n\n" + marker)
  }
  return s
})

patch('src/pages/Books.jsx', s => {
  if (s.includes("params.get('new') === '1'")) return s
  const marker = '  useEffect(() => { loadAll() }, [year, clientFilter])'
  if (!s.includes(marker)) throw new Error('Books quick-create marker not found')
  return s.replace(marker, "  useEffect(() => {\n    if (params.get('new') === '1') setShowForm(true)\n  }, [location.search])\n\n" + marker)
})

patch('src/pages/FormaCorp.jsx', s => {
  if (!s.includes("from 'react-router-dom'")) {
    s = s.replace("import { useState, useEffect, useRef } from 'react'\n", "import { useState, useEffect, useRef } from 'react'\nimport { useLocation } from 'react-router-dom'\n")
  }
  if (!s.includes('const location = useLocation()')) {
    s = s.replace('export default function FormaCorp() {\n  const { showToast } = useApp()\n', 'export default function FormaCorp() {\n  const { showToast } = useApp()\n  const location = useLocation()\n')
  }
  if (!s.includes("new URLSearchParams(location.search).get('new') === '1'")) {
    const marker = '  useEffect(() => { load() }, [])'
    if (!s.includes(marker)) throw new Error('FormaCorp quick-create marker not found')
    s = s.replace(marker, "  useEffect(() => {\n    if (new URLSearchParams(location.search).get('new') === '1') {\n      setDetail(null)\n      setForm(BLANK)\n      setModal('new')\n    }\n  }, [location.search])\n\n" + marker)
  }
  return s
})

const assertions = [
  ['src/components/layout/TopBar.jsx', "'/formacorp','/books','/transcripts'"],
  ['src/pages/Fax.jsx', "qp.get('new') === '1'"],
  ['src/pages/Transcripts.jsx', "get('new') === '1'"],
  ['src/pages/Books.jsx', "params.get('new') === '1'"],
  ['src/pages/FormaCorp.jsx', "get('new') === '1'"],
]
for (const [path, needle] of assertions) {
  if (!fs.readFileSync(path, 'utf8').includes(needle)) throw new Error(`quick-create verification failed: ${path}`)
}
console.log('quick-create: all global New routes verified')
