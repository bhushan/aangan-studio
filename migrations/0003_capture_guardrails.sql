-- Core details the server asked the agent to collect before judging (each asked once).
alter table calls add column if not exists requested text[] not null default '{}';

-- Post-call review of the full transcript: filled answers, re-checked criteria, and a note when it disagrees.
alter table calls add column if not exists review jsonb;
