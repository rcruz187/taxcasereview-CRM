import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useLocation } from 'react-router-dom'

// Floating AI assistant panel — available on every page.
// Sends user message + current page context to the ai-chat edge function.
// Uses Gemini Flash via server-side key — no key exposed to frontend.

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
  'What features should I prioritize next for the platform?',
]

function getPageContext() {
  // Pull visible text from the current page as context
  const main = document.querySelector('.page-content') || document.querySelector('main') || document.body
  const text = main?.innerText || ''
  // Limit to 3000 chars to avoid token overflow
  return text.slice(0, 3000)
}

export default function AIAssistant({ adminMode = false }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const location = useLocation()

  // Reset chat on page navigation (optional — remove if you want persistent history)
  // useEffect(() => { setMessages([]) }, [location.pathname])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [open, messages])

  async function send(text) {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput('')

    const userMsg = { role: 'user', content: msg }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setLoading(true)

    try {
      const context = getPageContext()
      const history = newMessages.slice(-10) // last 10 messages for context window

      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL || 'https://mpxgxfqdbquzkrvvejkh.supabase.co'}/functions/v1/ai-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ message: msg, context, history: history.slice(0, -1) })
        }
      )

      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || 'Sorry, something went wrong.' }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }])
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

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="AI Assistant"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 10000,
          width: 52, height: 52, borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(99,102,241,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, transition: 'transform 0.2s',
          transform: open ? 'rotate(45deg)' : 'none',
        }}
      >
        {open ? '✕' : '🤖'}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 88, right: 24, zIndex: 9999,
          width: 420, height: 560, maxHeight: 'calc(100vh - 120px)',
          background: '#0f172a', border: '1px solid #334155',
          borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid #1e293b',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))',
            display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          }}>
            <span style={{ fontSize: 20 }}>🤖</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{adminMode ? 'Platform AI Assistant' : 'TaxRes AI Assistant'}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{adminMode ? 'Powered by Groq · Platform & business strategy' : 'Powered by Groq · Tax resolution expert'}</div>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                style={{ marginLeft: 'auto', fontSize: 11, color: '#475569', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 && (
              <div>
                <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 14px' }}>
                  {adminMode
                    ? 'Ask me anything about the platform, offices, billing, or business strategy. I can see what\'s on your screen.'
                    : 'Ask me anything about this client, case, or tax resolution strategy. I can see what\'s on your screen.'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(adminMode ? ADMIN_SUGGESTED : SUGGESTED).map((s, i) => (
                    <button
                      key={i}
                      onClick={() => send(s)}
                      style={{
                        textAlign: 'left', background: 'rgba(99,102,241,0.08)',
                        border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8,
                        padding: '7px 10px', fontSize: 12, color: '#94a3b8',
                        cursor: 'pointer', lineHeight: 1.4,
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{
                display: 'flex', flexDirection: 'column',
                alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '88%', padding: '9px 12px', borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  background: m.role === 'user' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#1e293b',
                  color: m.role === 'user' ? '#fff' : '#e2e8f0',
                  fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                  border: m.role === 'assistant' ? '1px solid #334155' : 'none',
                }}>
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <div style={{
                  background: '#1e293b', border: '1px solid #334155',
                  borderRadius: '12px 12px 12px 2px', padding: '10px 14px',
                  fontSize: 13, color: '#64748b',
                }}>
                  Thinking<span style={{ animation: 'blink 1s infinite' }}>...</span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '10px 12px', borderTop: '1px solid #1e293b', flexShrink: 0,
            display: 'flex', gap: 8, alignItems: 'flex-end',
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything... (Enter to send)"
              rows={1}
              style={{
                flex: 1, background: '#1e293b', border: '1px solid #334155',
                borderRadius: 10, padding: '8px 12px', color: '#f1f5f9',
                fontSize: 13, resize: 'none', outline: 'none', lineHeight: 1.5,
                fontFamily: 'inherit', maxHeight: 80, overflowY: 'auto',
              }}
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              style={{
                width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer',
                background: input.trim() ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#1e293b',
                color: input.trim() ? '#fff' : '#475569', fontSize: 16, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.2s',
              }}
            >
              ↑
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>
    </>
  )
}
