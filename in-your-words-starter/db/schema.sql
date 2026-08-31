create table if not exists storytellers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  storyteller_id uuid not null references storytellers(id) on delete cascade,
  current_question text not null,
  status text not null check (status in ('active','paused','closed')) default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists turns (
  id uuid primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  question_text text not null,
  raw_audio_key text not null,
  audio_content_type text not null,
  transcript text,
  extracted_data jsonb,
  intent text check (intent in ('story_answer','app_question','app_command')),
  ai_payload jsonb,
  status text not null check (status in ('uploading','processing','complete','failed')),
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table turns add column if not exists extracted_data jsonb;

create index if not exists idx_turns_session_created on turns(session_id, created_at);
create index if not exists idx_turns_story_answers on turns(session_id, intent) where intent='story_answer';
