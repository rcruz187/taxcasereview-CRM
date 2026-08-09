import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://mpxgxfqdbquzkrvvejkh.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1weGd4ZnFkYnF1emtydnZlamtoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyOTk5MzksImV4cCI6MjA5NDg3NTkzOX0.puvhU1MV5nGOykizeTkwCpRR7NKKaGsVpA8oqjVjmu4'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 10,   // throttle client-side to stay under Supabase limits
    },
    reconnectAfterMs: (attempts) => {
      // Exponential backoff capped at 30s: 1s, 2s, 4s, 8s, 16s, 30s, 30s, ...
      return Math.min(1000 * Math.pow(2, attempts), 30000)
    },
  },
  db: {
    schema: 'public',
  },
  global: {
    fetch: (...args) => {
      // Add a 30s timeout to all Supabase fetches so hung requests don't block indefinitely
      const controller = new AbortController()
      const id = setTimeout(() => controller.abort(), 30000)
      return fetch(args[0], { ...args[1], signal: controller.signal })
        .finally(() => clearTimeout(id))
    },
  },
})