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
  // Multiline JSX opening tags only; skip tags that are obviously submit/reset,
  // disabled-only display affordances, or carry another pointer/key handler.
  const re=/<button\b([\s\S]*?)>/g
  let m
  while((m=re.exec(s))) {
    const attrs=m[1]
    const line=s.slice(0,m.index).split('\n').length
    const interactive=/\bonClick\s*=|\bonMouseDown\s*=|\bonPointerDown\s*=|\bonKeyDown\s*=|\bformAction\s*=/.test(attrs)
    const submit=/\btype\s*=\s*["'](?:submit|reset)["']/.test(attrs)
    if (!interactive && !submit) {
      const tag=m[0].replace(/\s+/g,' ').slice(0,240)
      findings.push({file,line,tag})
    }
  }
}

// Known intentional exclusions can be made explicit here. Keeping this list
// empty means every ordinary button must prove it performs an action.
const actionable=findings.filter(f => !/disabled\s*=\s*\{?true\}?/.test(f.tag))
console.log(`UI control audit scanned ${files.length} JSX/TSX files; ${actionable.length} potentially inert buttons.`)
for (const f of actionable) console.log(`${f.file}:${f.line} ${f.tag}`)
if (actionable.length) process.exit(2)
