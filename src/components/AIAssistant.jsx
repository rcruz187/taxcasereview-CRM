import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const SUGGESTED = [
  'What resolution options work best for this client?',
  'What IRS forms do I need for this case?',
  'How do I calculate the CSED for this taxpayer?',
  'Draft a client update email for this case',
  'What are the OIC acceptance criteria?',
  'How do I request a Collection Due Process hearing?',
]

const ADMIN_SUGGESTED = [
  'Summarize the platform stats on this page',
  'Which offices are closest to renewal or at risk of churn?',
  'Draft a follow-up email to a prospect after a demo',
  'What should I price a 30-seat firm at?',
  'Help me write onboarding instructions for a new office',
  'Summarize my calendar today and flag anything urgent',
  'What emails need my attention right now?',
  'Draft a reply to the last email on screen',
]

function getPageContext() {
  const main = document.querySelector('.page-content') || document.querySelector('main') || document.body
  let text = main?.innerText || ''

  const emailRows = document.querySelectorAll('[data-email-row]')
  if (emailRows.length) {
    const emailCtx = Array.from(emailRows).slice(0, 10).map(r => r.innerText?.trim()).filter(Boolean).join('\n')
    text = `INBOX EMAILS:\n${emailCtx}\n\n${text}`
  }

  const calEvents = document.querySelectorAll('[data-cal-event]')
  if (calEvents.length) {
    const calCtx = Array.from(calEvents).slice(0, 15).map(r => r.innerText?.trim()).filter(Boolean).join('\n')
    text = `CALENDAR EVENTS:\n${calCtx}\n\n${text}`
  }

  return text.slice(0, 3000)
}

function safeError(data, status) {
  const raw = data?.error || data?.message || data?.detail || ''
  if (status === 401 || status === 403) return 'Your session expired or is not authorized. Please sign in again and retry.'
  if (status === 429) return 'The AI service is busy right now. Please wait a moment and retry.'
  if (status >= 500) return raw ? `AI service error: ${String(raw).slice(0, 220)}` : 'The AI service is temporarily unavailable. Please retry.'
  return raw ? String(raw).slice(0, 220) : `AI request failed (${status}). Please retry.`
}

export default function AIAssistant({ adminMode = false }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastError, setLastError] = useState('')
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => inputRef.current?.focus(), 100)
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    return () => clearTimeout(t)
  }, [open, messages, loading])

  async function send(text) {
    const msg = (text || input).trim()
    if (!msg || loading) return

    setInput('')
    setLastError('')
    const userMsg = { role: 'user', content: msg }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Your session is no longer active. Please sign in again.')

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL || 'https://mpxgxfqdbquzkrvvejkh.supabase.co'}/functions/v1/ai-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: msg,
            context: getPageContext(),
            history: nextMessages.slice(-10, -1),
          }),
        }
      )

      const raw = await res.text()
      let data = {}
      try { data = raw ? JSON.parse(raw) : {} } catch { data = { error: raw } }

      if (!res.ok) throw new Error(safeError(data, res.status))
      if (!data?.reply?.trim()) throw new Error('The AI service returned an empty response. Please retry.')

      setMessages(prev => [...prev, { role: 'assistant', content: data.reply.trim() }])
    } catch (err) {
      const message = err?.message || 'Connection error. Please try again.'
      setLastError(message)
      setMessages(prev => [...prev, { role: 'assistant', content: message, error: true }])
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const suggestions = adminMode ? ADMIN_SUGGESTED : SUGGESTED

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title={open ? 'Close AI Assistant' : 'Open AI Assistant'}
        aria-label={open ? 'Close AI Assistant' : 'Open AI Assistant'}
        style={{
          position:'fixed', right:24, bottom:80, zIndex:10000,
          width:56, height:56, borderRadius:18, border:'1px solid rgba(255,255,255,.16)',
          background: open ? '#111827' : 'linear-gradient(135deg,#4f46e5,#7c3aed 62%,#9333ea)',
          color:'#fff', cursor:'pointer', boxShadow:'0 14px 38px rgba(79,70,229,.38)',
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:22,
          transition:'transform .18s ease, box-shadow .18s ease, background .18s ease',
          transform: open ? 'scale(.96)' : 'scale(1)',
        }}
      >
        {open ? '×' : '✦'}
      </button>

      {open && (
        <div style={{
          position:'fixed', right:24, bottom:148, zIndex:9999,
          width:'min(430px, calc(100vw - 32px))', height:'min(610px, calc(100vh - 180px))',
          background:'linear-gradient(180deg,#0b1220 0%,#0f172a 100%)',
          border:'1px solid rgba(148,163,184,.2)', borderRadius:20,
          boxShadow:'0 28px 80px rgba(2,6,23,.72)', overflow:'hidden',
          display:'flex', flexDirection:'column', backdropFilter:'blur(16px)',
        }}>
          <div style={{
            padding:'16px 17px', borderBottom:'1px solid rgba(148,163,184,.14)',
            background:'linear-gradient(135deg,rgba(79,70,229,.2),rgba(124,58,237,.08))',
            display:'flex', alignItems:'center', gap:12,
          }}>
            <div style={{
              width:38, height:38, borderRadius:12,
              background:'linear-gradient(135deg,#4f46e5,#8b5cf6)',
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:'0 8px 24px rgba(79,70,229,.35)', fontSize:18,
            }}>✦</div>
            <div style={{ minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ fontSize:14, fontWeight:800, color:'#f8fafc' }}>
                  {adminMode ? 'Platform AI' : 'TaxRes AI'}
                </div>
                <span style={{ fontSize:10, fontWeight:800, letterSpacing:'.04em', color:'#86efac', background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.22)', padding:'2px 7px', borderRadius:999 }}>
                  LIVE
                </span>
              </div>
              <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>
                {adminMode ? 'Platform strategy and operations assistant' : 'Tax resolution copilot with page context'}
              </div>
            </div>
            {messages.length > 0 && (
              <button onClick={() => { setMessages([]); setLastError('') }} style={{ marginLeft:'auto', border:0, background:'transparent', color:'#64748b', cursor:'pointer', fontSize:11, padding:6 }}>
                Clear
              </button>
            )}
          </div>

          <div style={{ flex:1, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:12 }}>
            {messages.length === 0 && (
              <div>
                <div style={{
                  padding:'16px', borderRadius:14,
                  background:'rgba(79,70,229,.08)', border:'1px solid rgba(99,102,241,.16)', marginBottom:14,
                }}>
                  <div style={{ fontSize:13, fontWeight:800, color:'#e2e8f0', marginBottom:5 }}>
                    {adminMode ? 'What can I help you run today?' : 'What can I help you solve today?'}
                  </div>
                  <div style={{ fontSize:12, color:'#94a3b8', lineHeight:1.55 }}>
                    {adminMode
                      ? 'Ask about operations, platform data, onboarding, pricing, or anything visible on this screen.'
                      : 'Ask about the current client, case strategy, IRS procedures, forms, deadlines, or draft communications.'}
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {suggestions.slice(0, 6).map((s, i) => (
                    <button key={i} onClick={() => send(s)} style={{
                      textAlign:'left', minHeight:66, padding:'10px 11px', borderRadius:11,
                      background:'rgba(15,23,42,.72)', border:'1px solid rgba(148,163,184,.14)',
                      color:'#cbd5e1', cursor:'pointer', fontSize:11.5, lineHeight:1.45,
                    }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{ display:'flex', justifyContent:m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth:'88%', padding:'10px 12px',
                  borderRadius:m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background:m.role === 'user'
                    ? 'linear-gradient(135deg,#4f46e5,#7c3aed)'
                    : m.error ? 'rgba(127,29,29,.28)' : 'rgba(30,41,59,.86)',
                  border:m.role === 'assistant' ? `1px solid ${m.error ? 'rgba(248,113,113,.28)' : 'rgba(148,163,184,.13)'}` : 'none',
                  color:m.error ? '#fecaca' : '#e2e8f0',
                  fontSize:13, lineHeight:1.6, whiteSpace:'pre-wrap',
                  boxShadow:m.role === 'user' ? '0 8px 22px rgba(79,70,229,.2)' : 'none',
                }}>
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display:'flex', alignItems:'center', gap:8, color:'#64748b', fontSize:12 }}>
                <div style={{ width:28, height:28, borderRadius:9, background:'rgba(79,70,229,.12)', display:'flex', alignItems:'center', justifyContent:'center', color:'#a5b4fc' }}>✦</div>
                <span>Analyzing<span style={{ animation:'aiPulse 1.2s infinite' }}>•••</span></span>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <div style={{ padding:'11px 12px 12px', borderTop:'1px solid rgba(148,163,184,.12)', background:'rgba(2,6,23,.28)' }}>
            {lastError && (
              <div style={{ fontSize:10.5, color:'#fca5a5', margin:'0 3px 7px' }}>
                Last request failed — you can edit your prompt or retry.
              </div>
            )}
            <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask TaxRes AI…"
                rows={1}
                style={{
                  flex:1, minHeight:40, maxHeight:100, resize:'none', overflowY:'auto',
                  background:'rgba(15,23,42,.9)', color:'#f8fafc', border:'1px solid rgba(148,163,184,.18)',
                  borderRadius:12, padding:'10px 12px', outline:'none', fontFamily:'inherit', fontSize:13, lineHeight:1.45,
                }}
              />
              <button
                onClick={() => send()}
                disabled={loading || !input.trim()}
                aria-label="Send message"
                style={{
                  width:40, height:40, borderRadius:12, border:0,
                  cursor:loading || !input.trim() ? 'default' : 'pointer',
                  background:input.trim() && !loading ? 'linear-gradient(135deg,#4f46e5,#7c3aed)' : '#1e293b',
                  color:input.trim() && !loading ? '#fff' : '#475569', fontSize:17,
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}
              >
                ↑
              </button>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:7, padding:'0 3px', fontSize:10, color:'#475569' }}>
              <span>Enter to send · Shift+Enter for a new line</span>
              <span>Powered by Groq</span>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes aiPulse { 0%,100%{opacity:.35} 50%{opacity:1} }
        @media (max-width: 640px) {
          textarea[placeholder="Ask TaxRes AI…"] { font-size: 16px !important; }
        }
      `}</style>
    </>
  )
}
