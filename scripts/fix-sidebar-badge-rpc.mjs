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
      const { data, error } = await supabase.rpc('get_sidebar_badge_counts')
      if (error) {
        // Badge refreshes can be aborted during rapid route changes. Preserve the
        // last known counts and keep navigation clean; the visibility/poll/realtime
        // refresh paths will retry automatically.
        console.warn('[badge] sidebar count refresh skipped:', error.message)
        return
      }
      const b = data || {}
      setNewLeads(Number(b.leads) || 0)
      setNewClients(Number(b.clients) || 0)
      setOpenCases(Number(b.cases) || 0)
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

if (!s.includes("supabase.rpc('get_sidebar_badge_counts')")) {
  throw new Error('sidebar badge RPC patch did not land')
}

if (s !== original) fs.writeFileSync(path, s)
console.log(`Sidebar badge RPC ${s !== original ? 'patched' : 'already current'}.`)
