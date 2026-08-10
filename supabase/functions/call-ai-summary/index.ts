import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// call-ai-summary: called after call-recorded saves a recording.
// Downloads the audio, sends to Gemini Flash for transcription + summary +
// action items, writes result to call_ai_summaries table.
// verify_jwt = false (called server-side from call-recorded)

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

    const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')!

    // Download the audio file
    const audioRes = await fetch(recording_url)
    if (!audioRes.ok) {
      console.error('call-ai-summary: failed to download audio', recording_url)
      return new Response('audio download failed', { status: 200 })
    }

    const audioBytes = await audioRes.arrayBuffer()
    const audioB64 = btoa(String.fromCharCode(...new Uint8Array(audioBytes)))

    // Send to Gemini Flash for transcription + analysis
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: 'audio/mp3',
                  data: audioB64
                }
              },
              {
                text: `You are an AI assistant for a tax resolution firm. Analyze this call recording and provide:

1. TRANSCRIPT: Full verbatim transcript of the conversation, label each speaker as "Agent" or "Client"
2. SUMMARY: 2-3 sentence summary of what was discussed
3. KEY POINTS: Bullet list of the most important points covered
4. ACTION ITEMS: Specific tasks or follow-ups that need to happen (who needs to do what)
5. SENTIMENT: Client sentiment (Positive / Neutral / Concerned / Frustrated)
6. NEXT STEPS: What should happen next with this client

Format your response as JSON with these exact keys: transcript, summary, key_points (array), action_items (array), sentiment, next_steps`
              }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096
          }
        })
      }
    )

    if (!geminiRes.ok) {
      const err = await geminiRes.text()
      console.error('call-ai-summary: Gemini error', err)
      return new Response('gemini error', { status: 200 })
    }

    const geminiData = await geminiRes.json()
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // Parse JSON from Gemini response
    let parsed: Record<string, unknown> = {}
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
    } catch {
      // If not valid JSON, store raw text as summary
      parsed = { summary: rawText, transcript: '', key_points: [], action_items: [], sentiment: 'Unknown', next_steps: '' }
    }

    // Find matching case/client by phone number
    let case_id = null
    let client_id = null
    if (from_number || to_number) {
      const searchPhone = from_number?.replace(/\D/g, '') || to_number?.replace(/\D/g, '')
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('tenant_id', tenant_id)
        .or(`phone.ilike.%${searchPhone?.slice(-10)}%,mobile.ilike.%${searchPhone?.slice(-10)}%`)
        .limit(1)
        .maybeSingle()

      if (client) {
        client_id = client.id
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

    // Save summary to DB
    await supabase.from('call_ai_summaries').insert({
      tenant_id,
      call_sid,
      from_number,
      to_number,
      duration_seconds,
      recording_url,
      transcript: parsed.transcript || '',
      summary: parsed.summary || '',
      key_points: parsed.key_points || [],
      action_items: parsed.action_items || [],
      sentiment: parsed.sentiment || 'Unknown',
      next_steps: parsed.next_steps || '',
      client_id,
      case_id,
      created_at: new Date().toISOString()
    })

    // Auto-create tasks from action items
    if (Array.isArray(parsed.action_items) && parsed.action_items.length > 0 && case_id) {
      const tasks = (parsed.action_items as string[]).map((item: string) => ({
        tenant_id,
        case_id,
        client_id,
        title: item,
        status: 'Open',
        source: 'ai_call_summary',
        created_at: new Date().toISOString()
      }))
      await supabase.from('tasks').insert(tasks)
    }

    return new Response(JSON.stringify({ ok: true, case_id, client_id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('call-ai-summary error:', err)
    return new Response('error', { status: 200 })
  }
})
