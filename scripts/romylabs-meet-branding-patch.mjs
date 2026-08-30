import fs from 'node:fs'

const file = 'src/pages/MeetingRoom.jsx'
let src = fs.readFileSync(file, 'utf8')
const from = `  useEffect(() => {\n    // Meeting links generated inside the app carry ?t=<tenant uuid> so the\n    // public join screen renders the sender firm's logo + name. Absent → the\n    // RPC falls back to the legacy first-row (TCR), same as before.\n    const t = (params.get('t') || '').trim()\n    loadFirmBrandingPublic(t || undefined).finally(() => setBrandingReady(true))\n  }, [params])`
const to = `  useEffect(() => {\n    // Meetings launched from the RomyLabs Admin Portal always use the platform\n    // identity. Product/tenant meeting links continue to load their own branding.\n    if (window.location.hostname.toLowerCase() === 'admin.romylabs.com') {\n      FIRM.name = 'RomyLabs'\n      FIRM.logoUrl = '/romylabs-logo.png'\n      FIRM.email = 'info@romylabs.com'\n      FIRM.tenantId = 'a0000000-0000-0000-0000-000000000001'\n      FIRM.loaded = true\n      setBrandingReady(true)\n      return\n    }\n\n    // Meeting links generated inside a product carry ?t=<tenant uuid> so the\n    // public join screen renders the sender firm's logo + name.\n    const t = (params.get('t') || '').trim()\n    loadFirmBrandingPublic(t || undefined).finally(() => setBrandingReady(true))\n  }, [params])`

if (!src.includes(from) && !src.includes("window.location.hostname.toLowerCase() === 'admin.romylabs.com'")) {
  throw new Error('Meeting branding anchor not found; refusing to modify file')
}
src = src.replace(from, to)
fs.writeFileSync(file, src)
console.log('RomyLabs meeting branding patch applied.')
