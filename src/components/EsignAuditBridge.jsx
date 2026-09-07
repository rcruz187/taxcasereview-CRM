import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

function makeSessionId() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID()
  } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export default function EsignAuditBridge() {
  useEffect(() => {
    const match = window.location.pathname.match(/^\/sign\/([^/?#]+)/i)
    if (!match) return

    const esignId = decodeURIComponent(match[1])
    const mountKey = `__taxres_esign_audit_${esignId}`
    if (window[mountKey]) return
    window[mountKey] = true

    const sessionKey = `taxres_esign_session_${esignId}`
    let sessionId = sessionStorage.getItem(sessionKey)
    if (!sessionId) {
      sessionId = makeSessionId()
      sessionStorage.setItem(sessionKey, sessionId)
    }

    const sent = new Set()
    const track = (eventType, progress = null, step = null, metadata = {}) => {
      const dedupe = `${eventType}:${progress ?? ''}:${step ?? ''}`
      if (eventType !== 'opened' && sent.has(dedupe)) return
      sent.add(dedupe)
      supabase.rpc('esign_track_event', {
        p_id: esignId,
        p_event_type: eventType,
        p_progress: progress,
        p_step: step,
        p_session_id: sessionId,
        p_metadata: metadata,
      }).catch(() => {})
    }

    track('opened', 0, 'opened', {
      referrer: document.referrer ? document.referrer.slice(0, 300) : null,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    })

    const scrollMarks = [25, 50, 75, 90]
    const onScroll = () => {
      const doc = document.documentElement
      const max = Math.max(1, doc.scrollHeight - window.innerHeight)
      const pct = Math.max(0, Math.min(100, Math.round((window.scrollY / max) * 100)))
      for (const mark of scrollMarks) {
        if (pct >= mark) track(`view_${mark}`, mark, `view_${mark}`)
      }
    }

    const onInput = e => {
      const el = e.target
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return
      const hint = `${el.name || ''} ${el.id || ''} ${el.placeholder || ''}`.toLowerCase()
      if (hint.includes('sign')) track('signature_started', 85, 'signature_started')
      else track('identity_started', 75, 'identity_started')
    }

    const onPointer = e => {
      if (e.target instanceof HTMLCanvasElement) track('signature_started', 85, 'signature_started')
    }

    const onClick = e => {
      const btn = e.target?.closest?.('button')
      if (!btn) return
      const text = (btn.textContent || '').trim().toLowerCase()
      if (text.includes('sign') && !text.includes('signed')) track('signing_started', 95, 'signing_started')
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('input', onInput, true)
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('click', onClick, true)
    onScroll()

    return () => {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('input', onInput, true)
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('click', onClick, true)
      try { delete window[mountKey] } catch {}
    }
  }, [])

  return null
}
