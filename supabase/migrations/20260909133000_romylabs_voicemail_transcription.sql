alter table public.voicemails
  add column if not exists transcript text,
  add column if not exists transcription_status text not null default 'pending';

update public.voicemails
set transcription_status = case
  when coalesce(transcript,'') <> '' then 'complete'
  else 'pending'
end
where transcription_status is null;
