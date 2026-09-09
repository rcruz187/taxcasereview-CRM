alter table public.voicemails
  add column if not exists transcript text,
  add column if not exists transcription_status text;

comment on column public.voicemails.transcript is
  'Optional voicemail transcript. RomyLabs phone workflows populate this field.';
comment on column public.voicemails.transcription_status is
  'Optional transcription state used by RomyLabs voicemail workflows.';

create unique index if not exists uq_voicemails_tenant_call_sid
  on public.voicemails (tenant_id, call_sid)
  where call_sid is not null;

create unique index if not exists uq_call_recordings_tenant_call_sid
  on public.call_recordings (tenant_id, call_sid)
  where call_sid is not null;

create unique index if not exists uq_call_ai_summaries_tenant_call_sid
  on public.call_ai_summaries (tenant_id, call_sid)
  where call_sid is not null;
