#!/usr/bin/env node
/**
 * check-polling-intervals.js
 *
 * Guardrail against the kind of bug that caused the Supabase Cached Egress
 * overage on 2026-06-30: a setInterval polling Supabase every 2 seconds,
 * unconditionally, for every logged-in user, all day — silently racking up
 * gigabytes of egress with no warning until the project got rate-limited.
 *
 * This script scans the src/ tree for every setInterval(...) call, and for
 * any one whose callback touches `supabase.` (a query, RPC, or function
 * invoke), flags it if the interval is tighter than the safe threshold
 * below. It does NOT try to be clever about whether the interval is scoped
 * to "only while a call is active" vs "runs all day" — any hit should be
 * manually reviewed, since that distinction is exactly what caused this
 * incident to slip through review the first time.
 *
 * Run manually:        node scripts/check-polling-intervals.js
 * Wire into deploy:     add `node scripts/check-polling-intervals.js || exit 1`
 *                       to your pre-build step if you want it to hard-block.
 *
 * Exit code 0 = clean. Exit code 1 = at least one tight Supabase poll found.
 */

const fs = require('fs')
const path = require('path')

const SRC_DIR = path.join(__dirname, '..', 'src')
const SAFE_MS_THRESHOLD = 3000 // anything tighter than 3s polling Supabase gets flagged
const FILE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx'])

/** Walk a directory recursively, yielding file paths. */
function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full)
    } else if (FILE_EXTENSIONS.has(path.extname(entry.name))) {
      yield full
    }
  }
}

/**
 * Finds every `setInterval(` call in the source text, extracts its trailing
 * numeric ms argument (if literal), and grabs a window of surrounding text
 * to check for a `supabase.` reference inside the callback.
 */
function findIntervalCalls(source) {
  const results = []
  const callRegex = /setInterval\s*\(/g
  let match
  while ((match = callRegex.exec(source)) !== null) {
    const startIdx = match.index
    // Walk forward to find the matching closing paren of this setInterval(...) call,
    // tracking nested parens so we capture the whole call including the callback body.
    let depth = 0
    let i = startIdx + match[0].length - 1 // position of the opening "("
    let endIdx = -1
    for (; i < source.length; i++) {
      if (source[i] === '(') depth++
      else if (source[i] === ')') {
        depth--
        if (depth === 0) { endIdx = i; break }
      }
    }
    if (endIdx === -1) continue // malformed / truncated, skip

    const fullCall = source.slice(startIdx, endIdx + 1)
    const lineNumber = source.slice(0, startIdx).split('\n').length

    // Trailing numeric literal = the ms argument, e.g. "}, 2000)"
    const msMatch = fullCall.match(/,\s*(\d+)\s*\)\s*$/)
    const ms = msMatch ? parseInt(msMatch[1], 10) : null

    const touchesSupabase = /supabase\s*[.[]/.test(fullCall)

    results.push({ lineNumber, ms, touchesSupabase, snippet: fullCall.slice(0, 120).replace(/\s+/g, ' ') })
  }
  return results
}

function main() {
  const offenders = []
  let totalIntervalsScanned = 0

  for (const file of walk(SRC_DIR)) {
    const source = fs.readFileSync(file, 'utf8')
    if (!source.includes('setInterval')) continue

    const calls = findIntervalCalls(source)
    for (const call of calls) {
      totalIntervalsScanned++
      if (call.touchesSupabase && (call.ms === null || call.ms < SAFE_MS_THRESHOLD)) {
        offenders.push({ file: path.relative(process.cwd(), file), ...call })
      }
    }
  }

  console.log(`Scanned ${totalIntervalsScanned} setInterval call(s) across src/.\n`)

  if (offenders.length === 0) {
    console.log('✅ No tight Supabase polling loops found. Clean.')
    process.exit(0)
  }

  console.log(`🚨 Found ${offenders.length} polling loop(s) that hit Supabase tighter than ${SAFE_MS_THRESHOLD}ms (or with a non-literal interval that needs manual review):\n`)
  for (const o of offenders) {
    console.log(`  ${o.file}:${o.lineNumber}`)
    console.log(`    interval: ${o.ms === null ? 'non-literal / dynamic — review manually' : o.ms + 'ms'}`)
    console.log(`    snippet:  ${o.snippet}`)
    console.log('')
  }
  console.log('Before merging/deploying any of these, confirm:')
  console.log('  1. Is this poll scoped to only run while something specific is active')
  console.log('     (e.g. during a live call), or does it run unconditionally all day')
  console.log('     for every logged-in user?')
  console.log('  2. Could this be a Supabase Realtime subscription instead of a poll?')
  console.log('     (Realtime only transmits on actual change — vastly cheaper than')
  console.log('     asking "did anything change?" every few seconds.)')
  console.log('  3. If polling is genuinely required, is the interval as wide as the')
  console.log(`     use case allows? (current threshold: ${SAFE_MS_THRESHOLD}ms)\n`)

  process.exit(1)
}

main()
