-- Per-viewer conversation/channel preferences: star, mute, custom sections.
-- Extends chat_rep_prefs pattern to channels too. Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS chat_conv_prefs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  viewer_name text NOT NULL,
  conv_id text NOT NULL,        -- channel id (e.g. 'general') or dm id (e.g. 'dm_123')
  conv_type text NOT NULL,      -- 'channel' or 'dm'
  starred boolean DEFAULT false,
  muted boolean DEFAULT false,
  section text,                 -- custom section name, null = default grouping
  created_at timestamptz DEFAULT now(),
  UNIQUE(viewer_name, conv_id)
);
ALTER TABLE chat_conv_prefs DISABLE ROW LEVEL SECURITY;
