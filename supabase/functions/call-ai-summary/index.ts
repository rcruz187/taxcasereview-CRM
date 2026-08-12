import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const { recording_url, call_sid, from_number, to_number, tenant_id, duration_seconds } = await req.json()

    if (!recording_url || !tenant_id) {
      return new Response(JSON.stringify({ error: 'missing required fields' }), { status: 400 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const GROQ_KEY = Deno.env.get('GROQ_API_KEY')!

    // Download the audio file
    const audioRes = await fetch(recording_url)
    if (!audioRes.ok) {
      console.error('call-ai-summary: failed to download audio', recording_url)
      return new Response('audio download failed', { status: 200 })
    }

    // Convert audio to base64 for transcription
    // Since Groq doesn't support audio directly, use the Whisper API for transcription
    const audioBytes = await audioRes.arrayBuffer()
    const blob = new Blob([audioBytes], { type: 'audio/mp3' })
    
    // Transcribe with Groq Whisper
    const formData = new FormData()
    formData.append('file', blob, 'recording.mp3')
    formData.append('model', 'whisper-large-v3')
    formData.append('response_format', 'text')

    const transcribeRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_KEY}` },
      body: formData
    })

    let transcript = ''
    if (transcribeRes.ok) {
      transcript = await transcribeRes.text()
    } else {
      console.error('call-ai-summary: Whisper error', await transcribeRes.text())
    }

    // Now analyze the transcript with Groq LLM
    let summary = '', key_points: string[] = [], action_items: string[] = [], sentiment = 'Unknown', next_steps = ''

    if (transcript) {
      const analysisRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'You are an AI assistant for a tax resolution firm. Analyze call transcripts and return JSON only.'
            },
            {
              role: 'user',
              content: `Analyze this call transcript and return ONLY a JSON object with these keys: summary (2-3 sentences), key_points (array of strings), action_items (array of strings - specific tasks), sentiment (one of: Positive/Neutral/Concerned/Frustrated), next_steps (string).\n\nTranscript:\n${transcript}`
            }
          ],
          max_tokens: 1024,
          temperature: 0.1,
        })
      })

      if (analysisRes.ok) {
        const analysisData = await analysisRes.json()
        const rawText = analysisData.choices?.[0]?.message?.content || ''
        try {
          const jsonMatch = rawText.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0])
            summary = parsed.summary || ''
            key_points = parsed.key_points || []
            action_items = parsed.action_items || []
            sentiment = parsed.sentiment || 'Unknown'
            next_steps = parsed.next_steps || ''
          }
        } catch {
          summary = rawText
        }
      }
    }

    // Find matching client/case by phone number
    let case_id = null
    let client_id = null
    let client_name = ""
    const searchPhone = (from_number || to_number || '').replace(/\D/g, '').slice(-10)
    if (searchPhone) {
      const { data: client } = await supabase
        .from('clients')
        .select('id, name')
        .eq('tenant_id', tenant_id)
        .or(`phone.ilike.%${searchPhone}%,mobile.ilike.%${searchPhone}%`)
        .limit(1)
        .maybeSingle()

      if (client) {
        client_id = client.id
        client_name = client.name || ""
        const { data: caseRow } = await supabase
          .from('cases')
          .select('id')
          .eq('tenant_id', tenant_id)
          .eq('client_id', client_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (caseRow) case_id = caseRow.id
      }
    }

    // Save to DB
    await supabase.from('call_ai_summaries').insert({
      tenant_id,
      call_sid,
      from_number,
      to_number,
      duration_seconds,
      recording_url,
      transcript,
      summary,
      key_points,
      action_items,
      sentiment,
      next_steps,
      client_id,
      case_id,
      created_at: new Date().toISOString()
    })

    // Auto-create tasks from action items
    if (action_items.length > 0 && client_id) {
      await supabase.from('tasks').insert(
        action_items.map((item: string) => ({
          tenant_id,
          client_id,
          clientName: client_name,
          linkedcase: case_id || null,
          title: item,
          status_label: 'Open',
          created_at: new Date().toISOString(),
        }))
      )
    }

    return new Response(JSON.stringify({ ok: true, case_id, client_id }), { status: 200 })

  } catch (err) {
    console.error('call-ai-summary error:', err)
    return new Response('error', { status: 200 })
  }
})
