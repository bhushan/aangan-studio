-- One row per inbound call.
create table if not exists calls (
  id                  text primary key default gen_random_uuid()::text,
  vaani_call_id       text not null unique,
  caller_number       text,
  started_at          timestamptz not null,
  answered_at         timestamptz,
  ended_at            timestamptz,
  after_hours         boolean not null,
  answers             jsonb not null default '{}'::jsonb,
  assessment          jsonb,
  route               text check (route in ('qualified','qualified_flagged','ask','close','escalate','callback','dropped')),
  close_reason        text,
  flags               text[] not null default '{}',
  ask_count           integer not null default 0,
  booking_uid         text,
  booking_at          timestamptz,
  hubspot_contact_id  text,
  hubspot_call_id     text,
  hubspot_deal_id     text,
  hubspot_task_id     text,
  telegram_sent_at    timestamptz,
  transcript          text,
  duration_sec        integer,
  voice_minutes       integer,
  ai_cost_usd         numeric(12, 6),
  ai_latency_ms       integer,
  created_at          timestamptz not null default now()
);

create index if not exists calls_started_at_idx on calls (started_at desc);
create index if not exists calls_caller_number_idx on calls (caller_number, started_at desc);

create table if not exists schema_migrations (
  name       text primary key,
  applied_at timestamptz not null default now()
);
