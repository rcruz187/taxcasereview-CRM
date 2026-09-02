import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Reuse the canonical production certification logic, but lift the concurrency
// ceiling to a real 25 -> 50 -> 75 -> 100 simultaneous-session ladder.
// Supabase Auth deliberately limits /auth/v1/token bursts by IP, so authenticate
// QA employees in bounded waves first, then hold all 100 authenticated sessions
// simultaneously for the actual capacity phases.
const sourcePath = path.resolve('scripts/certify-production-capacity.mjs')
let source = fs.readFileSync(sourcePath, 'utf8')

function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error(`100-user certification transform missing: ${label}`)
  source = source.replace(from, to)
}

replaceOnce(
  '  await Promise.all(sessions.map(loginSession))',
  "  const AUTH_BATCH=20\n  const AUTH_REFILL_MS=42000\n  for(let start=0;start<sessions.length;start+=AUTH_BATCH){\n    const batch=sessions.slice(start,start+AUTH_BATCH)\n    console.log(`Authenticating QA employees ${start+1}-${start+batch.length}/${sessions.length}`)\n    await Promise.all(batch.map(loginSession))\n    for(const s of batch){\n      const {data:{session:active}}=await s.client.auth.getSession()\n      if(!active?.access_token) throw new Error(`QA auth session missing after staged login for ${s.role.key} #${s.idx}`)\n    }\n    if(start+AUTH_BATCH<sessions.length) await sleep(AUTH_REFILL_MS)\n  }",
  'staged auth login'
)

replaceOnce(
  "  await runPhase('10-user phase',sessions.slice(0,10),PHASE10_MS)\n  await runPhase('20-user phase',sessions.slice(0,Math.min(20,sessions.length)),PHASE20_MS)",
  "  if(sessions.length<100) throw new Error(`100-user certification requires 100 sessions; created ${sessions.length}`)\n  const phase25=Number(process.env.CERT_PHASE25_MS||60000)\n  const phase50=Number(process.env.CERT_PHASE50_MS||60000)\n  const phase75=Number(process.env.CERT_PHASE75_MS||90000)\n  const phase100=Number(process.env.CERT_PHASE100_MS||180000)\n  await runPhase('25-user phase',sessions.slice(0,25),phase25)\n  await runPhase('50-user phase',sessions.slice(0,50),phase50)\n  await runPhase('75-user phase',sessions.slice(0,75),phase75)\n  await runPhase('100-user phase',sessions.slice(0,100),phase100)",
  'capacity ladder'
)

const generatedPath = path.resolve('scripts/.certify-production-capacity-100.generated.mjs')
fs.writeFileSync(generatedPath, source)
try {
  await import(`${pathToFileURL(generatedPath).href}?run=${Date.now()}`)
} finally {
  fs.rmSync(generatedPath, { force: true })
}
