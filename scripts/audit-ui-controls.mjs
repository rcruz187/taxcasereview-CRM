import fs from 'node:fs'
import path from 'node:path'

const roots = ['src/pages','src/components']
const files = []
for (const root of roots) {
  const walk = d => {
    for (const ent of fs.readdirSync(d,{withFileTypes:true})) {
      const p = path.join(d,ent.name)
      if (ent.isDirectory()) walk(p)
      else if (/\.(jsx|tsx)$/.test(ent.name)) files.push(p)
    }
  }
  walk(root)
}

// Read a JSX opening tag without treating comparison operators such as
// disabled={page>=pdf.numPages} as the end of the tag. The previous regex
// stopped at the first `>` anywhere in the attribute expression and therefore
// falsely reported perfectly wired pagination buttons as inert.
function buttonOpenTags(source) {
  const out = []
  let pos = 0
  while (true) {
    const start = source.indexOf('<button', pos)
    if (start < 0) break
    const boundary = source[start + 7]
    if (boundary && !/[\s/>]/.test(boundary)) { pos = start + 7; continue }

    let i = start + 7
    let quote = null
    let braceDepth = 0
    let escaped = false
    for (; i < source.length; i += 1) {
      const ch = source[i]
      if (quote) {
        if (escaped) { escaped = false; continue }
        if (ch === '\\') { escaped = true; continue }
        if (ch === quote) quote = null
        continue
      }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue }
      if (ch === '{') { braceDepth += 1; continue }
      if (ch === '}') { if (braceDepth > 0) braceDepth -= 1; continue }
      if (ch === '>' && braceDepth === 0) {
        out.push({ start, end: i + 1, tag: source.slice(start, i + 1), attrs: source.slice(start + 7, i) })
        pos = i + 1
        break
      }
    }
    if (i >= source.length) break
  }
  return out
}

const findings=[]
for (const file of files) {
  const s=fs.readFileSync(file,'utf8')
  for (const m of buttonOpenTags(s)) {
    const attrs=m.attrs
    const line=s.slice(0,m.start).split('\n').length

    // JSX actions plus lowercase onclick used inside generated HTML strings.
    const interactive=/\bonClick\s*=|\bonclick\s*=|\bonMouseDown\s*=|\bonPointerDown\s*=|\bonKeyDown\s*=|\bformAction\s*=/.test(attrs)
    const submit=/\btype\s*=\s*["'](?:submit|reset)["']/.test(attrs)

    // A few legacy download controls are buttons nested in an <a href>. That
    // markup should eventually be simplified, but it is not an inert control:
    // the parent anchor performs the navigation. Detect the immediate open
    // anchor so the audit focuses on genuinely dead controls.
    const prefix=s.slice(Math.max(0,m.start-500),m.start)
    const lastOpen=prefix.lastIndexOf('<a ')
    const lastClose=prefix.lastIndexOf('</a>')
    const insideLink=lastOpen > lastClose && /href\s*=/.test(prefix.slice(lastOpen))

    if (!interactive && !submit && !insideLink) {
      const tag=m.tag.replace(/\s+/g,' ').slice(0,240)
      findings.push({file,line,tag})
    }
  }
}

const actionable=findings.filter(f => !/disabled\s*=\s*\{?true\}?/.test(f.tag))
console.log(`UI control audit scanned ${files.length} JSX/TSX files; ${actionable.length} potentially inert buttons.`)
for (const f of actionable) console.log(`${f.file}:${f.line} ${f.tag}`)
if (actionable.length) process.exit(2)
console.log('UI control audit passed: no inert ordinary buttons found.')
