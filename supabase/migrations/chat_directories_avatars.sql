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
