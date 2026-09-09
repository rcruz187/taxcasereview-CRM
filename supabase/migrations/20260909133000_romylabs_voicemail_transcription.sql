alter table public.voicemails
  add column if not exists transcript text,
  add column if not exists transcription_status text;

comment on column public.voicemails.transcript is
  'Optional voicemail transcript. RomyLabs phone workflows populate this field.';
comment on column public.voicemails.transcription_status is
  'Optional transcription state used by RomyLabs voicemail workflows.';
