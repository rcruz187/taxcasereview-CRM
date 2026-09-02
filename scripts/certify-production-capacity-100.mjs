import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Reuse the canonical production certification logic, but lift the concurrency
// ceiling to a real 25 -> 50 -> 75 -> 100 simultaneous-session ladder.
const sourcePath = path.resolve('scripts/certify-production-capacity.mjs')
let source = fs.readFileSync(sourcePath, 'utf8')

function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error(`100-user certification transform missing: ${label}`)
  source = source.replace(from, to)
}

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
