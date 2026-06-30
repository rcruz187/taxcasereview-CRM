-- Chat feature additions: per-user "hidden reps" + "VIP" lists, employee avatar
-- column, and the avatars storage bucket. Run in Supabase SQL Editor.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS avatar_url text;

-- Each employee has their own view of who's hidden / VIP in their sidebar —
-- this is personal to the viewer, not global, matching how Slack's
-- "Hide" and "Add to VIP" work (only affects your own sidebar).
CREATE TABLE IF NOT EXISTS chat_rep_prefs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  viewer_name text NOT NULL,
  rep_name text NOT NULL,
  hidden boolean DEFAULT false,
  vip boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(viewer_name, rep_name)
);
ALTER TABLE chat_rep_prefs DISABLE ROW LEVEL SECURITY;

-- Storage bucket for employee profile photos, uploaded by the employee
-- themselves from the Directories page.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- This app's Supabase client only ever uses the anon key (no Supabase Auth
-- session login flow) — every request authenticates as Postgres role
-- 'anon', never 'authenticated'. Matches the existing firm-assets bucket,
-- which works today with no restrictive policy at all. Open access here,
-- same as everywhere else in this single-tenant app.
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
DROP POLICY IF EXISTS "avatars_authenticated_upload" ON storage.objects;
DROP POLICY IF EXISTS "avatars_authenticated_update" ON storage.objects;

CREATE POLICY "avatars_anon_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "avatars_anon_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "avatars_anon_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'avatars');
