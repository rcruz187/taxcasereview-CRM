import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { exchangeCodeForTokens } from '../lib/gmailUtils'

export default function AuthCallback() {
  const [status, setStatus] = useState('working') // working | success | error
  const [message, setMessage] = useState('Connecting your Gmail account…')

  useEffect(() => {
    async function run() {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const errorParam = params.get('error')

      if (errorParam) {
        setStatus('error')
        setMessage(`Google returned an error: ${errorParam}`)
        return
      }
      if (!code) {
        setStatus('error')
        setMessage('No authorization code found in the URL.')
        return
      }

      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.email) throw new Error('You must be logged into the CRM to connect your Gmail account.')
        await exchangeCodeForTokens(supabase, code, user.email)
        setStatus('success')
        setMessage('Gmail connected successfully! You can close this window.')
        setTimeout(() => { try { window.close() } catch (_) {} }, 2000)
      } catch (e) {
        setStatus('error')
        setMessage(e.message || 'Something went wrong connecting Gmail.')
      }
    }
    run()
  }, [])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0f172a', color: '#f1f5f9', fontFamily: 'Arial,sans-serif', padding: 24,
    }}>
      <div style={{
        background: '#1e293b', borderRadius: 14, padding: 32, maxWidth: 420, width: '100%',
        textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,.3)',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>
          {status === 'working' && '⏳'}
          {status === 'success' && '✅'}
          {status === 'error' && '⚠️'}
        </div>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>
          {status === 'working' && 'Connecting Gmail…'}
          {status === 'success' && 'Gmail Connected!'}
          {status === 'error' && 'Connection Failed'}
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>{message}</div>
      </div>
    </div>
  )
}
