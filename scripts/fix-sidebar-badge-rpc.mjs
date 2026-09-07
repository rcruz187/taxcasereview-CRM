import fs from 'node:fs'

const path = 'src/components/layout/Sidebar.jsx'
let s = fs.readFileSync(path, 'utf8')
const original = s

function replaceFunctionBody(source, fnName, replacement) {
  const marker = `    async function ${fnName}() {`
  const start = source.indexOf(marker)
  if (start < 0) throw new Error(`${fnName}: function anchor missing`)
  let i = start + marker.length
  let depth = 1
  for (; i < source.length; i++) {
    const ch = source[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) break
    }
  }
  if (depth !== 0) throw new Error(`${fnName}: unmatched braces`)
  return source.slice(0, start) + replacement + source.slice(i + 1)
}

const loadCounts = `    async function loadCounts() {
      const seenAt = section => localStorage.getItem(\`tcr_sidebar_seen_\${section}\`) || new Date(0).toISOString()
      const [summaryRes, leadsRes, clientsRes, casesRes] = await Promise.all([
        supabase.rpc('get_sidebar_badge_counts'),
        supabase.from('leads').select('id', { count: 'exact', head: true }).gt('created_at', seenAt('leads')),
        supabase.from('clients').select('id', { count: 'exact', head: true }).gt('created_at', seenAt('clients')),
        supabase.from('cases').select('id', { count: 'exact', head: true }).gt('created_at', seenAt('cases')),
      ])

      if (summaryRes.error) console.warn('[badge] sidebar summary refresh skipped:', summaryRes.error.message)
      if (leadsRes.error) console.warn('[badge] unseen leads refresh skipped:', leadsRes.error.message)
      if (clientsRes.error) console.warn('[badge] unseen clients refresh skipped:', clientsRes.error.message)
      if (casesRes.error) console.warn('[badge] unseen cases refresh skipped:', casesRes.error.message)

      const path = window.location.pathname
      const viewing = section => path === \`/\${section}\` || path.startsWith(\`/\${section}/\`)

      // Entity badges are notifications, not KPIs: only records created since
      // that user last opened the section should light up the sidebar.
      setNewLeads(viewing('leads') ? 0 : (leadsRes.count || 0))
      setNewClients(viewing('clients') ? 0 : (clientsRes.count || 0))
      setOpenCases(viewing('cases') ? 0 : (casesRes.count || 0))

      const b = summaryRes.data || {}
      // Deadlines remain an action alert because an older deadline can become
      // urgent as its due date approaches; it is intentionally not a record total.
      setDueSoonDeadlines(Number(b.deadlines) || 0)
    }`

const loadEmailTaskCounts = `    async function loadEmailTaskCounts() {
      if (!user?.email) return
      const { data, error } = await supabase.rpc('get_sidebar_badge_counts')
      if (error) {
        // A navigation-aborted fetch is not an application error. Keep the last
        // successful badge values and let the next realtime/poll/visibility pass retry.
        console.warn('[badge] email/task count refresh skipped:', error.message)
        return
      }
      const b = data || {}
      setUnreadInbox(Number(b.email) || 0)
      setOpenTasks(Number(b.tasks) || 0)
      setEmailActionNeeded(0)
      setEmailWaiting(0)
    }`

s = replaceFunctionBody(s, 'loadCounts', loadCounts)
s = replaceFunctionBody(s, 'loadEmailTaskCounts', loadEmailTaskCounts)

const ackMarker = '  // SIDEBAR_UNSEEN_ACK_V1\n'
if (!s.includes(ackMarker)) {
  const anchor = '  const BADGE_COUNTS = { leads: newLeads, clients: newClients, cases: openCases, deadlines: dueSoonDeadlines, fax: unreadFax, sms: unreadSms, voicemails: unreadVoicemails, esign: pendingEsign, email: unreadInbox, tasks: openTasks, chat: unreadChat, calendar: upcomingEvents }\n'
  if (!s.includes(anchor)) throw new Error('sidebar badge acknowledgement anchor missing')
  const ackEffect = `${anchor}\n${ackMarker}  useEffect(() => {\n    const path = location.pathname\n    const section = path === '/leads' || path.startsWith('/leads/') ? 'leads'\n      : path === '/clients' || path.startsWith('/clients/') ? 'clients'\n      : path === '/cases' || path.startsWith('/cases/') ? 'cases'\n      : null\n    if (!section) return\n\n    localStorage.setItem(\`tcr_sidebar_seen_\${section}\`, new Date().toISOString())\n    if (section === 'leads') setNewLeads(0)\n    if (section === 'clients') setNewClients(0)\n    if (section === 'cases') setOpenCases(0)\n  }, [location.pathname])\n`
  s = s.replace(anchor, ackEffect)
}

if (!s.includes("supabase.rpc('get_sidebar_badge_counts')")) {
  throw new Error('sidebar badge RPC patch did not land')
}
if (!s.includes('SIDEBAR_UNSEEN_ACK_V1')) {
  throw new Error('sidebar unseen acknowledgement patch did not land')
}
if (!s.includes("gt('created_at', seenAt('leads'))")) {
  throw new Error('sidebar unseen lead query did not land')
}

if (s !== original) fs.writeFileSync(path, s)
console.log(`Sidebar badge semantics ${s !== original ? 'patched' : 'already current'}: Leads/Clients/Cases are unseen-only.`)
