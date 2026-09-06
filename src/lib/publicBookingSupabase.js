import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://mpxgxfqdbquzkrvvejkh.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1weGd4ZnFkYnF1emtydnZlamtoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyOTk5MzksImV4cCI6MjA5NDg3NTkzOX0.puvhU1MV5nGOykizeTkwCpRR7NKKaGsVpA8oqjVjmu4'

// Public booking must never inherit the CRM/admin user's persisted auth session.
// These RPCs are deliberately exposed to anon through SECURITY DEFINER functions.
export const publicBookingSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})
