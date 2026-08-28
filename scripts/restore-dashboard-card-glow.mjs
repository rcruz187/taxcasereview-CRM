import fs from 'node:fs'

const dashPath = 'src/pages/Dashboard.jsx'
let d = fs.readFileSync(dashPath, 'utf8')
let changed = false

const oldStyle = `        style={{\n          background: 'var(--sf)',\n          border: '1px solid var(--br)',\n          borderTop: 'none',\n          borderRadius: '0 0 12px 12px',\n          padding: '18px 20px',\n          cursor: 'grab',\n          transition: 'transform .15s, box-shadow .15s',\n          position: 'relative',\n          overflow: 'hidden',\n          minHeight: 100,\n          display: 'flex',\n          flexDirection: 'column',\n          justifyContent: 'space-between',\n          userSelect: 'none',\n        }}\n        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = \`0 6px 24px \${borderColor}40\` }}\n        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}`

const newStyle = `        style={{\n          background: \`radial-gradient(circle at 82% -8%, \${borderColor}33 0%, \${borderColor}12 30%, transparent 58%), linear-gradient(180deg, rgba(23,48,75,.97), rgba(13,31,50,.99))\`,\n          border: \`1px solid \${borderColor}58\`,\n          borderTop: 'none',\n          borderRadius: '0 0 12px 12px',\n          padding: '18px 20px',\n          cursor: 'grab',\n          transition: 'transform .16s ease, box-shadow .16s ease, border-color .16s ease, filter .16s ease',\n          position: 'relative',\n          overflow: 'hidden',\n          minHeight: 100,\n          display: 'flex',\n          flexDirection: 'column',\n          justifyContent: 'space-between',\n          userSelect: 'none',\n          boxShadow: \`0 10px 28px rgba(0,0,0,.24), 0 0 28px \${borderColor}2b, inset 0 1px 0 \${borderColor}24\`,\n        }}\n        onMouseEnter={e => {\n          e.currentTarget.style.transform = 'translateY(-3px)'\n          e.currentTarget.style.boxShadow = \`0 16px 38px rgba(0,0,0,.30), 0 0 42px \${borderColor}55, inset 0 1px 0 \${borderColor}40\`\n          e.currentTarget.style.filter = 'brightness(1.06)'\n        }}\n        onMouseLeave={e => {\n          e.currentTarget.style.transform = ''\n          e.currentTarget.style.boxShadow = \`0 10px 28px rgba(0,0,0,.24), 0 0 28px \${borderColor}2b, inset 0 1px 0 \${borderColor}24\`\n          e.currentTarget.style.filter = ''\n        }}`

if (d.includes(oldStyle)) {
  d = d.replace(oldStyle, newStyle)
  changed = true
}

const oldTop = `<div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: borderColor }}/>`
const newTop = `<div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: borderColor, boxShadow: \`0 0 16px \${borderColor}, 0 3px 14px \${borderColor}66\` }}/>`
if (d.includes(oldTop)) { d = d.replace(oldTop, newTop); changed = true }

const oldIcon = `{icon && <div style={{ fontSize: 28, opacity: .15, flexShrink: 0 }}>{icon}</div>}`
const newIcon = `{icon && <div style={{ fontSize: 28, opacity: .28, flexShrink: 0, filter: \`drop-shadow(0 0 8px \${borderColor}55)\` }}>{icon}</div>}`
if (d.includes(oldIcon)) { d = d.replace(oldIcon, newIcon); changed = true }

if (changed) fs.writeFileSync(dashPath, d)

const cssPath = 'src/polish.css'
let c = fs.readFileSync(cssPath, 'utf8')
const originalCss = c
c = c.replace(
  `[data-card-idx] { background:var(--polish-panel-soft) !important;border:1px solid rgba(120,170,220,.18) !important;border-radius:14px !important;min-height:112px !important;padding:20px 20px 17px !important;box-shadow:0 10px 24px rgba(0,0,0,.18) !important; }`,
  `[data-card-idx] { border-radius:14px !important;min-height:112px !important;padding:20px 20px 17px !important; }`
)
c = c.replace(
  `[data-card-idx]:hover { transform:translateY(-4px) !important;border-color:rgba(90,165,235,.42) !important;box-shadow:var(--polish-shadow-hover) !important; }`,
  `[data-card-idx]:hover { transform:translateY(-3px) !important; }`
)
if (c !== originalCss) fs.writeFileSync(cssPath, c)

console.log(`Dashboard card accent glow ${changed ? 'patched' : 'already current'}; CSS override ${c !== originalCss ? 'removed' : 'already current'}.`)
