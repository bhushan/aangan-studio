-- One follow-up question per unclear criterion (area, scope, timeline), not one per call.
alter table calls add column if not exists asked_about text[] not null default '{}';
alter table calls drop column if exists ask_count;

-- Lease so call_ended and call_postprocessing never sync the same call to HubSpot at once.
alter table calls add column if not exists hubspot_lock_until timestamptz;
