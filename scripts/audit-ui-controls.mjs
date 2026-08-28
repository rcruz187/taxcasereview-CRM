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

const findings=[]
for (const file of files) {
  const s=fs.readFileSync(file,'utf8')
  const re=/<button\b([\s\S]*?)>/g
  let m
  while((m=re.exec(s))) {
    const attrs=m[1]
    const line=s.slice(0,m.index).split('\n').length

    // JSX actions plus lowercase onclick used inside generated HTML strings.
    const interactive=/\bonClick\s*=|\bonclick\s*=|\bonMouseDown\s*=|\bonPointerDown\s*=|\bonKeyDown\s*=|\bformAction\s*=/.test(attrs)
    const submit=/\btype\s*=\s*["'](?:submit|reset)["']/.test(attrs)

    // A few legacy download controls are buttons nested in an <a href>. That
    // markup should eventually be simplified, but it is not an inert control:
    // the parent anchor performs the navigation. Detect the immediate open
    // anchor so the audit focuses on genuinely dead controls.
    const prefix=s.slice(Math.max(0,m.index-500),m.index)
    const lastOpen=prefix.lastIndexOf('<a ')
    const lastClose=prefix.lastIndexOf('</a>')
    const insideLink=lastOpen > lastClose && /href\s*=/.test(prefix.slice(lastOpen))

    if (!interactive && !submit && !insideLink) {
      const tag=m[0].replace(/\s+/g,' ').slice(0,240)
      findings.push({file,line,tag})
    }
  }
}

const actionable=findings.filter(f => !/disabled\s*=\s*\{?true\}?/.test(f.tag))
console.log(`UI control audit scanned ${files.length} JSX/TSX files; ${actionable.length} potentially inert buttons.`)
for (const f of actionable) console.log(`${f.file}:${f.line} ${f.tag}`)
if (actionable.length) process.exit(2)
console.log('UI control audit passed: no inert ordinary buttons found.')
