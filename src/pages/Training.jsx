// Training — screen-share / training session page.
// All session state lives in ScreenShareContext (mounted in Shell/App.jsx)
// so navigating away and back does NOT kill the session.

import { useState, useEffect, useRef } from 'react'
import { useScreenShare } from '../context/ScreenShareContext'
import { useApp }         from '../context/AppContext'
import { supabase }       from '../lib/supabase'
import { FIRM, firmFooterLine } from '../lib/firmBranding'

const BASE = '/'

function ScreenPreview({ stream }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null }, [stream])
  return (
    <video ref={ref} autoPlay playsInline muted
      style={{ width: '100%', maxHeight: 360, objectFit: 'contain',
               display: 'block', background: '#0d1526', borderRadius: '10px 10px 0 0' }} />
  )
}


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

function ManualPage({ tabBar }) {
  const [selected, setSelected] = useState('overview')
  const [search, setSearch] = useState('')

  const filtered = search
    ? MANUAL_SECTIONS.filter(s => s.label.toLowerCase().includes(search.toLowerCase()) || s.title.toLowerCase().includes(search.toLowerCase()))
    : MANUAL_SECTIONS

  const sec = MANUAL_SECTIONS.find(s => s.id === selected) || MANUAL_SECTIONS[0]

  const S = {
    sidebar: { width: 200, flexShrink: 0, borderRight: '1px solid var(--br)', display: 'flex', flexDirection: 'column', overflowY: 'auto', background: 'var(--sf)', height: 'calc(100vh - 120px)' },
    navItem: (active) => ({ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: active ? 700 : 400, color: active ? '#a5b4fc' : 'var(--t2)', background: active ? 'rgba(99,102,241,.18)' : 'transparent', marginBottom: 1, transition: 'all .1s' }),
    content: { flex: 1, overflowY: 'auto', padding: '0 28px 40px', height: 'calc(100vh - 120px)' },
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

export default function Training() {
  const ss  = useScreenShare()
  const { employeeName, showToast } = useApp()
  const myName = employeeName || 'Me'

  const [starting, setStarting] = useState(false)
  const [copied,   setCopied]   = useState(false)
  const [tab, setTab] = useState('training') // 'training' | 'manual'

  // Capture FIRM into React state on mount — FIRM is a mutable module object that
  // may not be set yet as a plain const. Reading it in useEffect guarantees we get
  // the branding that AdminTraining loaded before rendering this component.
  const [firmName,     setFirmName]     = useState(() => FIRM.name || '')
  const [firmLogo,     setFirmLogo]     = useState(() => FIRM.logoUrl || '')
  const [firmTenantId, setFirmTenantId] = useState(() => FIRM.tenantId || '')
  const [firmEmail,    setFirmEmail]    = useState(() => FIRM.email || '')
  useEffect(() => {
    // AdminTraining awaits set_admin_tenant_override + loadFirmBranding before
    // rendering us, but FIRM may still be mid-load. Poll briefly to capture it.
    const apply = () => {
      if (FIRM.name) {
        setFirmName(FIRM.name)
        setFirmLogo(FIRM.logoUrl || '')
        setFirmTenantId(FIRM.tenantId || '')
        setFirmEmail(FIRM.email || '')
      }
    }
    apply()
    const t = setTimeout(apply, 300)
    const t2 = setTimeout(apply, 800)
    return () => { clearTimeout(t); clearTimeout(t2) }
  }, [])

  // Email the invite link straight from this page
  const [emailOpen,   setEmailOpen]   = useState(false)
  const [emailTo,     setEmailTo]     = useState('')
  const [emailSending,setEmailSending]= useState(false)

  // Screen label (Entire screen / Window / Browser tab)
  const [screenLabel, setScreenLabel] = useState('')
  useEffect(() => {
    if (!ss.sharingScreen || !ss.screenStream) { setScreenLabel(''); return }
    const track   = ss.screenStream.getVideoTracks()[0]
    const surface = track?._surface || track?.getSettings?.()?.displaySurface
    setScreenLabel(
      surface === 'monitor' ? 'Entire screen' :
      surface === 'window'  ? 'Window' :
      surface === 'browser' ? 'Browser tab' :
      track?.label?.slice(0, 40) || 'Screen'
    )
  }, [ss.sharingScreen, ss.screenStream])

  async function startSession() {
    setStarting(true)
    const result = await ss.startSession(myName)
    setStarting(false)
    if (!result.ok) { showToast(result.reason || 'Could not start session'); return }
    const sResult = await ss.startScreenShare(myName)
    if (!sResult.ok) showToast(sResult.reason || 'Use the Share screen button below')
  }

  function copyLink() {
    const firmParam = (FIRM.name || firmName) ? `&firm=${encodeURIComponent(FIRM.name || firmName)}` : ''
    const _logo = FIRM.logoUrl?.startsWith('https://') ? FIRM.logoUrl : FIRM.logoUrl ? `${window.location.origin}${FIRM.logoUrl}` : safeLogo; const logoParam = _logo ? `&logo=${encodeURIComponent(_logo)}` : ''
    const tParam = (FIRM.tenantId || firmTenantId) ? `&t=${encodeURIComponent(FIRM.tenantId || firmTenantId)}` : ''
    const url = `${window.location.origin}${BASE}/screenshare?room=${ss.roomId}${firmParam}${logoParam}${tParam}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  // Email the join link to one or more people, using the same send-email
  // edge function every other transactional email in the CRM goes through.
  // Only pass logo to join URL if it's an absolute https URL (Supabase storage).
  // Relative paths like /nashville-logo.png are now deleted
  // except for the TaxRes CRM logo which lives in gh-pages assets — build absolute URL.
  const safeLogo = firmLogo?.startsWith('https://')
    ? firmLogo
    : firmLogo
      ? `${window.location.origin}${firmLogo}`
      : `${window.location.origin}/assets/taxrescrm-logo.png`

  async function sendInviteEmail() {
    const raw = emailTo.split(',').map(v => v.trim()).filter(Boolean)
    if (!raw.length) return
    const bad = raw.filter(v => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
    if (bad.length) { showToast?.(`Not a valid email: ${bad[0]}`, 'error'); return }

    const firmParam2 = (FIRM.name || firmName) ? `&firm=${encodeURIComponent(FIRM.name || firmName)}` : ''
    const _logo2 = FIRM.logoUrl?.startsWith('https://') ? FIRM.logoUrl : FIRM.logoUrl ? `${window.location.origin}${FIRM.logoUrl}` : safeLogo; const logoParam2 = _logo2 ? `&logo=${encodeURIComponent(_logo2)}` : ''
    const tParam2 = (FIRM.tenantId || firmTenantId) ? `&t=${encodeURIComponent(FIRM.tenantId || firmTenantId)}` : ''
    const url  = `${window.location.origin}${BASE}/screenshare?room=${ss.roomId}${firmParam2}${logoParam2}${tParam2}`
    const firm = firmName || 'TaxRes CRM'
    setEmailSending(true)
    try {
      for (const to of raw) {
        const { error } = await supabase.functions.invoke('send-email', {
          body: {
            tenant_id: firmTenantId || undefined,
            from_name: firm,
            from_email: firmEmail || undefined,
            to,
            subject: `Join the training session — ${firm}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
<div style="text-align:center;margin-bottom:20px">
${safeLogo ? `<img src="${safeLogo}" alt="${firm}" style="max-height:56px;max-width:190px;object-fit:contain;display:block;margin:0 auto 8px" onerror="this.style.display='none'"/>` : ''}
<div style="font-size:12px;font-weight:800;color:#1d4ed8;letter-spacing:.1em;text-transform:uppercase;margin-top:6px">${firm}</div>
</div>
<p>You've been invited to a live training session with <strong>${myName}</strong>.</p>
<p style="text-align:center;margin:24px 0">
<a href="${url}" style="background:#7c3aed;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">Join session &rarr;</a>
</p>
<p style="font-size:13px;color:#475569">No account or download needed — the link opens straight in your browser. Room code <strong>${ss.roomId}</strong>.</p>
<p style="font-size:12px;color:#64748b">${url}</p>
<p style="font-size:11px;color:#94a3b8;margin-top:24px">${firmFooterLine()}</p>
</div>`
          }
        })
        if (error) throw error
      }
      showToast?.(`Invite sent to ${raw.length} recipient${raw.length > 1 ? 's' : ''}`, 'success')
      setEmailTo(''); setEmailOpen(false)
    } catch (e) {
      // Offices with no email connected fall back to the copy button.
      navigator.clipboard.writeText(url).catch(() => {})
      showToast?.('Could not send email — link copied to clipboard instead', 'error')
    } finally {
      setEmailSending(false)
    }
  }

  function openPopout() {
    const hostFirmParam = (FIRM.name || firmName) ? `&firm=${encodeURIComponent(FIRM.name || firmName)}` : ''
    const _hostLogo = FIRM.logoUrl?.startsWith('https://') ? FIRM.logoUrl : FIRM.logoUrl ? `${window.location.origin}${FIRM.logoUrl}` : safeLogo; const hostLogoParam = _hostLogo ? `&logo=${encodeURIComponent(_hostLogo)}` : ''
    const hostTParam = (FIRM.tenantId || firmTenantId) ? `&t=${encodeURIComponent(FIRM.tenantId || firmTenantId)}` : ''
    const url  = `${window.location.origin}${BASE}/screenshare-host?room=${ss.roomId}&name=${encodeURIComponent(myName)}${hostFirmParam}${hostLogoParam}${hostTParam}`
    const w = 960, h = 680
    const left = Math.max(0, window.screen.width - w - 20)
    const top  = Math.max(0, window.screen.height - h - 60)
    window.open(url, `tcr-training-${ss.roomId}`, `width=${w},height=${h},left=${left},top=${top},resizable=yes`)
  }

  const joinFirmParam = (FIRM.name || firmName) ? `&firm=${encodeURIComponent(FIRM.name || firmName)}` : ''
  const _joinLogo = FIRM.logoUrl?.startsWith('https://') ? FIRM.logoUrl : FIRM.logoUrl ? `${window.location.origin}${FIRM.logoUrl}` : safeLogo; const joinLogoParam = _joinLogo ? `&logo=${encodeURIComponent(_joinLogo)}` : ''
  const joinTParam = (FIRM.tenantId || firmTenantId) ? `&t=${encodeURIComponent(FIRM.tenantId || firmTenantId)}` : ''
  const joinUrl      = `${window.location.origin}${BASE}/screenshare?room=${ss.roomId}${joinFirmParam}${joinLogoParam}${joinTParam}`
  const participants = ss.webrtc.members.filter(n => !n.endsWith('(view)') && n !== myName).length

  // ── Not started ──────────────────────────────────────────────────────────
  const TabBar = () => (
    <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid var(--br)', paddingBottom: 0 }}>
      {[
        { key: 'training', label: '🖥️ Live Training' },
        { key: 'manual',   label: '📋 CRM Manual' },
      ].map(t => (
        <button key={t.key} onClick={() => setTab(t.key)} style={{
          padding: '8px 20px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: tab === t.key ? 700 : 400, marginBottom: -1,
          background: tab === t.key ? 'rgba(99,102,241,.12)' : 'transparent',
          color: tab === t.key ? '#a5b4fc' : 'var(--t2)',
          borderBottom: tab === t.key ? '2px solid #6366f1' : '2px solid transparent',
        }}>{t.label}</button>
      ))}
    </div>
  )

  if (tab === 'manual') {
    return <ManualPage tabBar={<TabBar/>} />
  }

  if (!ss.active) {
    return (
      <div style={{ padding: '28px 32px', maxWidth: 780 }}>
        <TabBar/>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--tx)', marginBottom: 4 }}>🖥️ Training Sessions</div>
          <div style={{ fontSize: 13, color: 'var(--t3)' }}>
            Start a live screen-share session with client firms. Participants join via a link — no install required.
          </div>
        </div>
        <div style={{ background: 'var(--s1)', border: '1px solid var(--br)', borderRadius: 12, padding: 32,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 48, lineHeight: 1 }}>📺</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx)' }}>Ready to train</div>
          <div style={{ fontSize: 13, color: 'var(--t3)', maxWidth: 400, lineHeight: 1.6 }}>
            Start a session, share your screen, then copy the invite link and send it to the firm\'s staff.
            You can navigate anywhere in the CRM while the session stays live.
          </div>
          <button onClick={startSession} disabled={starting}
            style={{ background: '#2563eb', border: 'none', borderRadius: 10, padding: '12px 28px',
                     color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
                     opacity: starting ? .6 : 1, marginTop: 8 }}>
            {starting ? 'Starting…' : '📺 Start training session'}
          </button>
        </div>
      </div>
    )
  }

  // ── Active session ────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '28px 32px', maxWidth: 780 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--tx)', marginBottom: 4 }}>🖥️ Training Sessions</div>
      </div>
      <TabBar/>

      {/* Session header bar */}
      <div style={{ background: '#1e3a8a', borderRadius: 12, padding: '14px 20px',
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }}/>
        <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: 15 }}>
          {ss.sharingScreen ? `Sharing: ${screenLabel}` : 'Session live — not sharing yet'}
        </span>
        <span style={{ fontSize: 12, color: '#93c5fd', fontFamily: 'monospace', letterSpacing: 2 }}>{ss.roomId}</span>
        <span style={{ fontSize: 12, color: '#86efac' }}>· {participants} participant{participants !== 1 ? 's' : ''}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={openPopout}
            style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)',
                     borderRadius: 7, padding: '6px 14px', color: '#e2e8f0',
                     cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>⧉ Pop out</button>
          <button onClick={() => ss.endSession(myName)}
            style={{ background: '#dc2626', border: 'none', borderRadius: 7,
                     padding: '6px 14px', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
            End session
          </button>
        </div>
      </div>

      {/* Screen preview */}
      <div style={{ border: '1px solid var(--br)', borderRadius: 12, overflow: 'hidden',
                    background: '#0d1526', minHeight: 200, marginBottom: 16 }}>
        {ss.sharingScreen && ss.screenStream
          ? <ScreenPreview stream={ss.screenStream} />
          : (
            <div style={{ minHeight: 200, display: 'flex', alignItems: 'center',
                          justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: 36, opacity: .3 }}>🖥️</span>
              <span style={{ color: 'var(--t3)', fontSize: 13 }}>
                {participants > 0 ? 'Start sharing your screen below' : 'Waiting for participants — share the invite link'}
              </span>
            </div>
          )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {!ss.sharingScreen
          ? <button onClick={() => ss.startScreenShare(myName)}
              style={{ background: '#2563eb', border: 'none', borderRadius: 8,
                       padding: '10px 20px', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              🖥️ Share screen
            </button>
          : <button onClick={() => ss.stopScreenShare(myName)}
              style={{ background: '#7c3aed', border: 'none', borderRadius: 8,
                       padding: '10px 20px', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              ⏹ Stop sharing
            </button>
        }
      </div>

      {/* Invite link */}
      <div style={{ background: 'var(--s1)', border: '1px solid var(--br)', borderRadius: 10,
                    padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase',
                      letterSpacing: '.05em', marginBottom: 8 }}>Participant invite link</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, fontSize: 12, color: 'var(--t2)', fontFamily: 'monospace',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        background: 'var(--bg)', border: '1px solid var(--br)',
                        borderRadius: 6, padding: '8px 10px' }}>
            {joinUrl}
          </div>
          <button onClick={copyLink}
            style={{ background: copied ? '#16a34a' : '#2563eb', border: 'none', borderRadius: 8,
                     padding: '8px 16px', color: '#fff', fontWeight: 700, fontSize: 13,
                     cursor: 'pointer', flexShrink: 0, transition: 'background .2s' }}>
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>
          <button onClick={() => setEmailOpen(o => !o)}
            style={{ background: emailOpen ? 'var(--s3)' : '#7c3aed', border: 'none', borderRadius: 8,
                     padding: '8px 16px', color: '#fff', fontWeight: 700, fontSize: 13,
                     cursor: 'pointer', flexShrink: 0 }}>
            ✉️ Email
          </button>
        </div>

        {emailOpen && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="email"
              value={emailTo}
              onChange={e => setEmailTo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendInviteEmail() }}
              placeholder="name@firm.com — separate multiple with commas"
              style={{ flex: 1, fontSize: 13, padding: '9px 11px', borderRadius: 6,
                       border: '1px solid var(--br)', background: 'var(--bg)', color: 'var(--tx)' }} />
            <button onClick={sendInviteEmail} disabled={emailSending || !emailTo.trim()}
              style={{ background: '#16a34a', border: 'none', borderRadius: 8, padding: '9px 18px',
                       color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0,
                       cursor: emailSending || !emailTo.trim() ? 'not-allowed' : 'pointer',
                       opacity: emailSending || !emailTo.trim() ? .55 : 1 }}>
              {emailSending ? 'Sending…' : 'Send invite'}
            </button>
          </div>
        )}

        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--t3)' }}>
          Share in Chat, email, or SMS. Anyone who clicks joins instantly — no account needed.
        </div>
      </div>

      {/* Participant list */}
      <div style={{ background: 'var(--s1)', border: '1px solid var(--br)', borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase',
                      letterSpacing: '.05em', marginBottom: 10 }}>
          Connected participants ({participants})
        </div>
        {participants === 0
          ? <div style={{ color: 'var(--t3)', fontSize: 13 }}>No one has joined yet.</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ss.webrtc.members.filter(n => !n.endsWith('(view)') && n !== myName).map(n => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--tx)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }}/>
                  {n}
                </div>
              ))}
            </div>
        }
      </div>
    </div>
  )
}
