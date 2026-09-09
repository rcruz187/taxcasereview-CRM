import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    // Internal-only endpoint. The upstream call-recorded function authenticates
    // provider callbacks, then calls this endpoint with the service-role secret.
    const expectedSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const suppliedSecret = req.headers.get('x-internal-call-secret') ?? ''
    if (!expectedSecret || !suppliedSecret || suppliedSecret.length !== expectedSecret.length) {
      return new Response('Unauthorized', { status: 401 })
    }
    let diff = 0
    for (let i = 0; i < expectedSecret.length; i++) diff |= expectedSecret.charCodeAt(i) ^ suppliedSecret.charCodeAt(i)
    if (diff !== 0) return new Response('Unauthorized', { status: 401 })

    const { recording_url, call_sid, from_number, to_number, tenant_id, duration_seconds } = await req.json()
    if (!recording_url || !tenant_id) return new Response(JSON.stringify({ error: 'missing required fields' }), { status: 400 })

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const GROQ_KEY = Deno.env.get('GROQ_API_KEY')!

    const audioRes = await fetch(recording_url)
    if (!audioRes.ok) {
      console.error('call-ai-summary: failed to download audio')
      return new Response('audio download failed', { status: 200 })
    }
    const audioBytes = await audioRes.arrayBuffer()
    const blob = new Blob([audioBytes], { type: 'audio/mp3' })
    const formData = new FormData()
    formData.append('file', blob, 'recording.mp3')
    formData.append('model', 'whisper-large-v3')
    formData.append('response_format', 'text')

    const transcribeRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', headers: { 'Authorization': `Bearer ${GROQ_KEY}` }, body: formData
    })
    let transcript = ''
    if (transcribeRes.ok) transcript = await transcribeRes.text()
    else console.error('call-ai-summary: Whisper error', await transcribeRes.text())

    const isRomyLabs = String(tenant_id) === 'a0000000-0000-0000-0000-000000000001'
    let summary = '', key_points: string[] = [], action_items: string[] = [], sentiment = 'Unknown', next_steps = ''
    if (transcript) {
      const analysisRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: isRomyLabs ? 'You are an AI assistant for RomyLabs, a software company. Analyze business call transcripts and return JSON only. Never assume tax-resolution context.' : 'You are an AI assistant for a tax resolution firm. Analyze call transcripts and return JSON only.' },
            { role: 'user', content: `Analyze this call transcript and return ONLY a JSON object with these keys: summary (2-3 sentences), key_points (array of strings), action_items (array of strings - specific tasks), sentiment (one of: Positive/Neutral/Concerned/Frustrated), next_steps (string).\n\nTranscript:\n${transcript}` }
          ], max_tokens: 1024, temperature: 0.1,
        })
      })
      if (analysisRes.ok) {
        const analysisData = await analysisRes.json()
        const rawText = analysisData.choices?.[0]?.message?.content || ''
        try {
          const jsonMatch = rawText.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0])
            summary = parsed.summary || ''; key_points = parsed.key_points || []; action_items = parsed.action_items || []
            sentiment = parsed.sentiment || 'Unknown'; next_steps = parsed.next_steps || ''
          }
        } catch { summary = rawText }
      }
    }

    let case_id = null, client_id = null, client_name = ''
    const searchPhone = (from_number || to_number || '').replace(/\D/g, '').slice(-10)
    if (!isRomyLabs && searchPhone) {
      const { data: client } = await supabase.from('clients').select('id, name').eq('tenant_id', tenant_id)
        .or(`phone.ilike.%${searchPhone}%,mobile.ilike.%${searchPhone}%`).limit(1).maybeSingle()
      if (client) {
        client_id = client.id; client_name = client.name || ''
        const { data: caseRow } = await supabase.from('cases').select('id').eq('tenant_id', tenant_id).eq('client_id', client_id)
          .order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (caseRow) case_id = caseRow.id
      }
    }

    const { error: summaryInsertError } = await supabase.from('call_ai_summaries').insert({
      tenant_id, call_sid, from_number, to_number, duration_seconds, recording_url,
      transcript, summary, key_points, action_items, sentiment, next_steps, client_id, case_id,
      created_at: new Date().toISOString()
    })
    if (summaryInsertError) {
      if (summaryInsertError.code === '23505') {
        return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 })
      }
      throw summaryInsertError
    }

    if (!isRomyLabs && action_items.length > 0 && client_id) {
      await supabase.from('tasks').insert(action_items.map((item: string) => ({
        tenant_id, client_id, clientName: client_name, linkedcase: case_id || null,
        title: item, status_label: 'Open', created_at: new Date().toISOString(),
      })))
    }

    if (!isRomyLabs && client_id && (summary || transcript)) {
      const mins = Math.floor((duration_seconds || 0) / 60), secs = (duration_seconds || 0) % 60
      const duration_str = duration_seconds ? `${mins}m ${secs}s` : 'unknown duration'
      const noteLines = [`📞 Call Summary — ${duration_str} · ${from_number || 'Unknown'}`, '', summary || 'No summary available.']
      if (key_points?.length) { noteLines.push('', 'Key Points:'); key_points.forEach((p: string) => noteLines.push(`• ${p}`)) }
      if (action_items?.length) { noteLines.push('', 'Action Items:'); action_items.forEach((a: string) => noteLines.push(`• ${a}`)) }
      if (next_steps) noteLines.push('', `Next Steps: ${next_steps}`)
      if (sentiment && sentiment !== 'Unknown') noteLines.push('', `Client Sentiment: ${sentiment}`)
      await supabase.from('client_notes').insert({
        tenant_id, client_id, clientname: client_name, text: noteLines.join('\n'), author: 'AI Call Summary',
        type: 'Call', note_type: 'Call', visible_to_client: false, created_at: new Date().toISOString()
      })
    }
    return new Response(JSON.stringify({ ok: true, case_id, client_id }), { status: 200 })
  } catch (err) {
    console.error('call-ai-summary error:', err)
    return new Response('error', { status: 200 })
  }
})
