import { useState } from 'react'

// ── CRM Manual embedded in Training tab ────────────────────────────────────
const MANUAL_SECTIONS = [
  {
    id: 'overview', icon: '🏠', label: 'Overview', category: 'Getting Started',
    title: 'What TaxRes CRM does',
    content: [
      { type: 'lead', text: 'TaxRes CRM is a complete operating system for tax resolution firms. It replaces Canopy, Calendly, and your phone system with one integrated platform.' },
      { type: 'flow', items: ['New Lead', 'Financial Intake', 'Send Full Package', 'Client Signs ⭐', 'Active Client', 'Resolution ✓'] },
      { type: 'tip', text: 'Every action — call, email, text, fax, document sent — is automatically logged as a note on the file. Nothing is silently lost.' },
      { type: 'cards', items: [
        { icon: '🎯', title: 'Lead Pipeline', body: 'Capture leads, send investigation packages, collect e-signatures, and convert to active clients automatically.' },
        { icon: '📄', title: 'IRS Form Generation', body: 'Pre-fill 2848, 8821, state POAs, and tax organizers from the client record. Print-ready in one click.' },
        { icon: '📞', title: 'Built-In Phone System', body: 'Inbound call routing, IVR extensions, transfer, hold music, voicemail, and AI call summaries.' },
        { icon: '💳', title: 'Payments & AR', body: 'Charge cards, set up installment plans, track AR, and send payment links — all from the client file.' },
        { icon: '⚡', title: 'Automated Workflows', body: 'When a client signs, tasks auto-assign to the right rep and associate based on role.' },
        { icon: '🔐', title: 'Client Portal', body: 'Clients sign docs, pay invoices, and upload files. Employees clock in and see their assigned cases.' },
      ]},
    ]
  },
  {
    id: 'roles', icon: '👥', label: 'Roles & Access', category: 'Getting Started',
    title: 'Roles & access levels',
    content: [
      { type: 'lead', text: 'Every employee has one of four access levels. The CRM shows or hides features based on role.' },
      { type: 'table', headers: ['Role', 'Who it\'s for', 'What they can do'], rows: [
        ['Super Admin', 'Firm owner / lead EA', 'Everything — settings, all clients, billing, employee management'],
        ['Admin', 'Office manager', 'All clients and leads, tasks, payments, calendar, reports — no firm settings'],
        ['Tax Advisor / Associate', 'EAs, CPAs, preparers', 'Assigned clients and leads, tasks, documents, IRS forms, communications'],
        ['Read Only', 'Support staff', 'View only — no edits, no payments, no sending'],
      ]},
      { type: 'info', text: 'Nashville Tax Solutions uses the labels Associate (Tax Advisor) and Para (Tax Associate). Same roles — renamed to match your firm.' },
    ]
  },
  {
    id: 'leads', icon: '🎯', label: 'Leads', category: 'Client Pipeline',
    title: 'Working with leads',
    content: [
      { type: 'lead', text: 'A lead is anyone who has not yet signed an investigation agreement. Every new inquiry starts here.' },
      { type: 'steps', items: [
        { title: 'Go to Leads → + New Lead', desc: 'Fill in name, phone, email, and client type (Individual, Business, or Individual & Business).' },
        { title: 'Set the tax issue and fee', desc: 'Enter issue type, estimated tax owed, and the investigation fee. This populates MTD 1st Trades on your dashboard.' },
        { title: 'Assign a rep and associate', desc: 'Assigned To = Tax Advisor who owns the lead. Tax Associate = the para who supports it. Both get notified.' },
        { title: 'Save — the lead is in the pipeline', desc: 'The lead appears on the Leads page, dashboard, and the assigned rep\'s task list.' },
      ]},
      { type: 'h3', text: 'Quick actions on a lead' },
      { type: 'cards', items: [
        { icon: '📦', title: 'Send Full Package', body: 'Sends Tax Service Agreement + 2848 + 8821 + State POA in one e-sign envelope.' },
        { icon: '📋', title: 'Send Financial Intake', body: 'Sends the 433-F financial intake form link. Client fills it online.' },
        { icon: '✍️', title: 'E-Signature', body: 'Send any single document for e-signature.' },
        { icon: '💰', title: 'Send Payment Link', body: 'Secure Stripe payment link via email or SMS for the investigation fee.' },
        { icon: '📅', title: 'Send Booking Link', body: 'Online scheduling so the client picks their own consultation time.' },
        { icon: '📠', title: 'Send Fax', body: 'Fax a document directly. Confirmation logged as a note.' },
      ]},
    ]
  },
  {
    id: 'esign', icon: '✍️', label: 'E-Signatures', category: 'Documents',
    title: 'E-Signatures',
    content: [
      { type: 'lead', text: 'Send documents for electronic signature directly from the client or lead file. No DocuSign needed.' },
      { type: 'steps', items: [
        { title: 'Open client/lead → E-Signatures tab or Quick Action', desc: 'Or use the quick action "E-Signature" from the overview.' },
        { title: 'Choose document type and add a message', desc: 'Options: Tax Service Agreement, Form 2848, Form 8821, Fee Agreement Addendum, 9465, OIC Application, or Custom.' },
        { title: 'Send — client receives a secure email link', desc: 'They click the link, review the document, and sign with a typed signature. No account needed.' },
        { title: 'Signature is logged automatically', desc: 'Signed document filed under Documents. Note created on the file. Workflow tasks triggered if it\'s the Full Package.' },
      ]},
      { type: 'tip', text: 'Unsigned documents get automatic email reminders on Day 1, Day 3, and Day 7 at 9 AM ET. You don\'t need to chase clients manually.' },
      { type: 'h3', text: 'What fires when the Full Package is signed' },
      { type: 'flow', items: ['Client Signs', 'Status → Signed', 'Pipeline advances', 'Workflow tasks created', 'Note logged ✓'] },
    ]
  },
  {
    id: 'workflows', icon: '⚡', label: 'Workflow Templates', category: 'Tasks & Workflows',
    title: 'Workflow templates',
    content: [
      { type: 'lead', text: 'Workflow templates are pre-built checklists that fire automatically when a triggering event happens — like a client signing an agreement.' },
      { type: 'h3', text: 'The 6-step Tax Investigation workflow' },
      { type: 'steps', items: [
        { title: 'Download signed POA & file', desc: 'Retrieve the signed 2848/8821 from Documents and save to your files.' },
        { title: 'Fax to IRS', desc: 'Fax the signed POA to the appropriate IRS fax number and log the confirmation.' },
        { title: 'Contact IRS', desc: 'Call Practitioner Priority Service to confirm receipt and pull the case history.' },
        { title: 'Request transcripts & records', desc: 'Pull IMFOL, BMFOL, and ACSS records. Upload to the IRS Portal tab.' },
        { title: 'Update info & notify Tax Advisor', desc: 'Update the case with findings. Notify the advisor so they can review.' },
        { title: 'Review financial intake & build resolution plan', desc: 'Tax Advisor reviews the financial profile and determines the resolution path (OIC, IA, CNC, etc.). Due in 7 days.' },
      ]},
      { type: 'warn', text: 'Editing a template does not update tasks already created from it. To use new steps, delete the old tasks and re-apply the template after a fresh signature.' },
    ]
  },
  {
    id: 'calling', icon: '📞', label: 'Calling', category: 'Communications',
    title: 'Calling',
    content: [
      { type: 'lead', text: 'The CRM includes a full phone system. Make and receive calls directly in the browser — no desk phone needed.' },
      { type: 'steps', items: [
        { title: 'Click any phone number in the CRM', desc: 'Phone numbers on leads, clients, and the directory are clickable. Click to dial.' },
        { title: 'The Active Call Bar appears at the bottom', desc: 'Shows the number dialing, elapsed time, and call controls.' },
        { title: 'Use call controls while connected', desc: 'Mute, hold, transfer to another rep by extension, or add a third caller.' },
        { title: 'Hang up — call is logged automatically', desc: 'A note with call duration and outcome is added to the client\'s Notes & Activity.' },
      ]},
      { type: 'h3', text: 'Inbound call flow' },
      { type: 'flow', items: ['Client calls main #', 'IVR answers', 'Client presses ext', 'Rep\'s browser rings', 'Connected ✓'] },
      { type: 'h3', text: 'AI Call Summaries' },
      { type: 'cards', items: [
        { icon: '📝', title: 'Full transcript', body: 'Word-for-word transcription of the call via Groq Whisper.' },
        { icon: '🤖', title: 'AI summary', body: 'Key points, client concerns, and next steps extracted automatically.' },
        { icon: '✅', title: 'Action items', body: 'Tasks the AI identified — auto-created on the client file.' },
      ]},
    ]
  },
  {
    id: 'payments', icon: '💳', label: 'Payments', category: 'Money',
    title: 'Payments',
    content: [
      { type: 'lead', text: 'Collect payments by card, set up installment plans, and track all payment history from the client file.' },
      { type: 'steps', items: [
        { title: 'Open client → Payments tab → Charge', desc: 'Or use the "Charge Resolution Fee" quick action from the overview.' },
        { title: 'Enter amount and select saved card', desc: 'Saved cards show here. Or enter a new card manually.' },
        { title: 'Confirm — payment processes via Stripe', desc: 'A receipt is sent to the client. Payment appears in the Payments page and on the client file.' },
      ]},
      { type: 'tip', text: 'Use Quick Actions → Send Payment Link to email or text a secure checkout link. Client pays on their own device. Payment captured and logged automatically.' },
      { type: 'h3', text: 'Installment plans' },
      { type: 'info', text: 'When the Fee Agreement Addendum is signed, 3 scheduled payment installments are automatically created from the contract amounts.' },
    ]
  },
  {
    id: 'portal', icon: '🔐', label: 'Client Portal', category: 'Portals',
    title: 'Client Portal',
    content: [
      { type: 'lead', text: 'The Client Portal gives clients a secure, private view of their case — no account creation needed beyond a magic link.' },
      { type: 'cards', items: [
        { icon: '📄', title: 'View documents', body: 'See all signed agreements, POAs, and uploaded files.' },
        { icon: '💳', title: 'Pay invoices', body: 'View their balance and pay with the card on file or a new card.' },
        { icon: '📤', title: 'Upload documents', body: 'Upload W-2s, 1099s, bank statements, or anything you request.' },
        { icon: '💬', title: 'Send messages', body: 'Message the office directly. Replies logged on the client file.' },
      ]},
      { type: 'steps', items: [
        { title: 'Client visits taxrescrm.app/portal', desc: 'They enter their email address.' },
        { title: 'A magic link is sent', desc: 'No password needed. The link is valid for 15 minutes.' },
        { title: 'Client accesses their file', desc: 'They see only their own documents, invoices, and messages.' },
      ]},
    ]
  },
  {
    id: 'ai', icon: '🤖', label: 'AI Assistant', category: 'Tools',
    title: 'AI Assistant',
    content: [
      { type: 'lead', text: 'The 🤖 button in the bottom-right corner is your AI assistant. It reads what\'s on your screen and answers questions about it.' },
      { type: 'cards', items: [
        { icon: '⚖️', title: 'Resolution strategy', body: '"What resolution options work best for this client?" — it sees the financial profile on screen.' },
        { icon: '📅', title: 'CSED calculation', body: '"How do I calculate the CSED for this taxpayer?" with assessment dates visible.' },
        { icon: '📧', title: 'Draft emails', body: '"Draft a client update email for this case" — it includes case details from the page.' },
        { icon: '📜', title: 'IRS guidance', body: '"What are the OIC acceptance criteria?" or "How do I request a CDP hearing?"' },
      ]},
      { type: 'tip', text: 'Click "Clear" to start a fresh conversation. The AI retains context for your current session so you can ask follow-up questions without repeating yourself.' },
    ]
  },
,
  {
    id: 'training', icon: '🖥️', label: 'Training & Manual', category: 'Tools',
    title: 'Training sessions & this manual',
    content: [
      { type: 'lead', text: 'The Training tab has two sections: Live Training for running screen-share sessions with your team, and this CRM Manual for on-demand reference.' },
      { type: 'h3', text: 'Live Training sessions' },
      { type: 'cards', items: [
        { icon: '📺', title: 'Start a session', body: 'Click "Start training session" to launch a live screen-share. You can navigate anywhere in the CRM while the session stays live.' },
        { icon: '🔗', title: 'Invite participants', body: 'Copy the invite link and send it to staff. They join in their browser — no install required. Works on any device.' },
        { icon: '✉️', title: 'Email invite', body: 'Click the email button to send branded invitations directly to team members with a one-click join button.' },
        { icon: '⧉', title: 'Pop out', body: 'Pop the session controls into a separate window so you can present the full CRM without the training panel in the way.' },
      ]},
      { type: 'steps', items: [
        { title: 'Click "Start training session"', desc: 'A unique room code is generated. The session is live immediately.' },
        { title: 'Share your screen', desc: 'Click "Share screen" and choose your window or the full screen. Participants see everything you see.' },
        { title: 'Send the invite link', desc: 'Copy the link or use the Email Invite button. Staff click the link and join instantly.' },
        { title: 'Navigate the CRM normally', desc: 'You can click through leads, clients, settings — anything. The session follows you.' },
        { title: 'End the session when done', desc: 'Click "End session." All participants are disconnected automatically.' },
      ]},
      { type: 'h3', text: 'During a session' },
      { type: 'table', headers: ['Control', 'What it does'], rows: [
        ['Share screen', 'Broadcasts your screen to all participants in real time'],
        ['Stop sharing', 'Pauses the screen share but keeps the session open'],
        ['Pop out', 'Opens the host controls in a separate window — present the full CRM unobstructed'],
        ['End session', 'Closes the room and disconnects all participants'],
        ['Room code', 'The 5-character code shown in the session bar — participants need this to join manually'],
      ]},
      { type: 'h3', text: 'CRM Manual (this tab)' },
      { type: 'info', text: 'The CRM Manual lives here permanently. Any team member can open Training → CRM Manual at any time to look up how a feature works, without leaving the CRM or asking a colleague.' },
      { type: 'tip', text: 'Use the search box in the manual sidebar to find any topic instantly. Use the Prev / Next buttons at the bottom of each section to read through in order.' },
    ]
  }
]

const CATEGORIES = ['Getting Started', 'Client Pipeline', 'Documents', 'Tasks & Workflows', 'Communications', 'Money', 'Portals', 'Tools']

function ManualPage({ tabBar, standalone }) {
  const [selected, setSelected] = useState('overview')
  const [search, setSearch] = useState('')

  const filtered = search
    ? MANUAL_SECTIONS.filter(s => s.label.toLowerCase().includes(search.toLowerCase()) || s.title.toLowerCase().includes(search.toLowerCase()))
    : MANUAL_SECTIONS

  const sec = MANUAL_SECTIONS.find(s => s.id === selected) || MANUAL_SECTIONS[0]

  const S = {
    sidebar: { width: 200, flexShrink: 0, borderRight: '1px solid var(--br)', display: 'flex', flexDirection: 'column', overflowY: 'auto', background: 'var(--sf)', height: standalone ? '100vh' : 'calc(100vh - 120px)' },
    navItem: (active) => ({ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: active ? 700 : 400, color: active ? '#a5b4fc' : 'var(--t2)', background: active ? 'rgba(99,102,241,.18)' : 'transparent', marginBottom: 1, transition: 'all .1s' }),
    content: { flex: 1, overflowY: 'auto', padding: standalone ? '28px 40px 40px' : '0 28px 40px', height: standalone ? '100vh' : 'calc(100vh - 120px)' },
    lead: { fontSize: 14, color: 'var(--t2)', lineHeight: 1.7, marginBottom: 20 },
    h3: { fontSize: 15, fontWeight: 700, color: 'var(--tx)', margin: '22px 0 10px' },
    card: { background: 'var(--s1)', border: '1px solid var(--br)', borderRadius: 10, padding: '13px 15px', flex: '1 1 200px' },
    stepNum: { width: 26, height: 26, borderRadius: '50%', background: 'rgba(99,102,241,.18)', border: '1px solid rgba(99,102,241,.35)', color: '#a5b4fc', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
    flowBox: (special) => ({ background: special ? 'rgba(16,185,129,.12)' : 'rgba(99,102,241,.12)', border: `1px solid ${special ? 'rgba(16,185,129,.3)' : 'rgba(99,102,241,.25)'}`, borderRadius: 7, padding: '6px 12px', fontSize: 11, fontWeight: 700, color: special ? '#6ee7b7' : '#a5b4fc', whiteSpace: 'nowrap' }),
    th: { textAlign: 'left', padding: '7px 10px', background: 'rgba(99,102,241,.1)', color: '#818cf8', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--br)' },
    td: { padding: '8px 10px', borderBottom: '1px solid rgba(99,102,241,.06)', fontSize: 12, color: 'var(--t2)', verticalAlign: 'top' },
    callout: (type) => ({
      borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, lineHeight: 1.55, display: 'flex', gap: 8, alignItems: 'flex-start',
      ...(type === 'tip'  ? { background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.25)', color: '#6ee7b7' } : {}),
      ...(type === 'warn' ? { background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.25)', color: '#fde68a' } : {}),
      ...(type === 'info' ? { background: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.25)', color: '#c7d2fe' } : {}),
    }),
  }

  function renderBlock(block, i) {
    switch (block.type) {
      case 'lead': return <p key={i} style={S.lead}>{block.text}</p>
      case 'h3':   return <div key={i} style={S.h3}>{block.text}</div>
      case 'tip':  return <div key={i} style={S.callout('tip')}><span>💡</span><span>{block.text}</span></div>
      case 'warn': return <div key={i} style={S.callout('warn')}><span>⚠️</span><span>{block.text}</span></div>
      case 'info': return <div key={i} style={S.callout('info')}><span>ℹ️</span><span>{block.text}</span></div>
      case 'flow': return (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap', margin: '14px 0 20px' }}>
          {block.items.map((item, j) => [
            <div key={j} style={S.flowBox(item.includes('✓') || item.includes('⭐'))}>{item}</div>,
            j < block.items.length - 1 && <span key={'a'+j} style={{ color: 'var(--t3)', fontSize: 14, margin: '0 5px' }}>→</span>
          ])}
        </div>
      )
      case 'cards': return (
        <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '12px 0 20px' }}>
          {block.items.map((c, j) => (
            <div key={j} style={S.card}>
              <div style={{ fontSize: 18, marginBottom: 6 }}>{c.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)', marginBottom: 3 }}>{c.title}</div>
              <div style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.5 }}>{c.body}</div>
            </div>
          ))}
        </div>
      )
      case 'steps': return (
        <div key={i} style={{ margin: '12px 0 20px' }}>
          {block.items.map((step, j) => (
            <div key={j} style={{ display: 'flex', gap: 14, padding: '11px 0', borderBottom: j < block.items.length - 1 ? '1px solid rgba(99,102,241,.07)' : 'none' }}>
              <div style={S.stepNum}>{j + 1}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)', marginBottom: 3 }}>{step.title}</div>
                <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.55 }}>{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )
      case 'table': return (
        <table key={i} style={{ width: '100%', borderCollapse: 'collapse', margin: '12px 0 20px', fontSize: 12 }}>
          <thead><tr>{block.headers.map((h, j) => <th key={j} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>{block.rows.map((row, j) => (
            <tr key={j}>{row.map((cell, k) => <td key={k} style={{ ...S.td, ...(k === 0 ? { fontWeight: 600, color: 'var(--tx)' } : {}) }}>{cell}</td>)}</tr>
          ))}</tbody>
        </table>
      )
      default: return null
    }
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 80px)', overflow: 'hidden', margin: '0 -32px', padding: '0 0 0 32px' }}>
      {/* Sidebar */}
      <div style={S.sidebar}>
        <div style={{ padding: '10px 10px 6px' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--t3)' }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 7, padding: '5px 8px 5px 24px', color: 'var(--tx)', fontSize: 11, outline: 'none', boxSizing: 'border-box' }}/>
          </div>
        </div>
        <div style={{ padding: '4px 6px 12px', overflowY: 'auto', flex: 1 }}>
          {search ? (
            filtered.map(s => (
              <div key={s.id} onClick={() => { setSelected(s.id); setSearch('') }} style={S.navItem(selected === s.id)}>
                <span style={{ fontSize: 13 }}>{s.icon}</span>{s.label}
              </div>
            ))
          ) : (
            CATEGORIES.map(cat => {
              const items = MANUAL_SECTIONS.filter(s => s.category === cat)
              if (!items.length) return null
              return (
                <div key={cat}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', padding: '10px 8px 4px' }}>{cat}</div>
                  {items.map(s => (
                    <div key={s.id} onClick={() => setSelected(s.id)} style={S.navItem(selected === s.id)}>
                      <span style={{ fontSize: 13 }}>{s.icon}</span>{s.label}
                    </div>
                  ))}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Content */}
      <div style={S.content}>
        <div style={{ paddingTop: 4, marginBottom: 18 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--tx)', marginBottom: 4 }}>{sec.title}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent, #6366f1)', textTransform: 'uppercase', letterSpacing: '.07em' }}>{sec.category}</div>
        </div>
        {sec.content.map((block, i) => renderBlock(block, i))}
        <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid var(--br)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>TaxRes CRM Manual · {new Date().getFullYear()}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {(() => {
              const idx = MANUAL_SECTIONS.findIndex(s => s.id === selected)
              return [
                idx > 0 && <button key='prev' onClick={() => setSelected(MANUAL_SECTIONS[idx-1].id)} style={{ background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 7, padding: '5px 12px', color: 'var(--t2)', cursor: 'pointer', fontSize: 11 }}>← {MANUAL_SECTIONS[idx-1].label}</button>,
                idx < MANUAL_SECTIONS.length - 1 && <button key='next' onClick={() => setSelected(MANUAL_SECTIONS[idx+1].id)} style={{ background: 'rgba(99,102,241,.12)', border: '1px solid rgba(99,102,241,.25)', borderRadius: 7, padding: '5px 12px', color: '#a5b4fc', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>{MANUAL_SECTIONS[idx+1].label} →</button>
              ]
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Manual() {
  return (
    <div style={{ height: '100%', overflow: 'hidden' }}>
      <ManualPage tabBar={null} standalone />
    </div>
  )
}
