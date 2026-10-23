-- =============================================================
-- Hobbies Time Tracker — migration 2:
--   the Hobby Log view, access for the server, starter hobbies.
--
-- Run AFTER 20261022061940_create_hobby_tracker_tables.sql:
-- Supabase dashboard → SQL Editor → New query → paste → Run.
-- Safe to run more than once.
-- =============================================================


-- ---------- Total time per player per hobby (the Hobby Log) ----------
-- A view is a saved query you can read like a table; it's always up to date.
--
-- security_invoker = true matters: by default a view runs with its OWNER's
-- rights, which would let the public anon key read the data through the view
-- and slip past Row Level Security. With security_invoker, whoever reads the
-- view is held to the tables' RLS, so anon sees nothing.
create or replace view public.hobby_totals
with (security_invoker = true) as
select
  e.id                    as entrant_id,
  e.name                  as entrant,
  h.id                    as hobby_id,
  h.name                  as hobby,
  count(*)                as sessions,
  sum(t.duration_seconds) as total_seconds
from public.time_entries t
join public.entrants e on e.id = t.entrant_id
join public.hobbies  h on h.id = t.hobby_id
group by e.id, h.id;  -- e.name/h.name are allowed because id is each table's primary key

comment on view public.hobby_totals is 'Total tracked time per player per hobby (the Hobby Log).';


-- ---------- Access for the server ----------
-- The Node server uses the secret (service_role) key. Supabase normally grants
-- these rights automatically; granting them here keeps the app working in
-- projects where that default was switched off.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.entrants, public.hobbies, public.time_entries to service_role;
grant select on public.hobby_totals to service_role;

-- The public roles have no use for the view.
revoke all on public.hobby_totals from anon, authenticated;


-- ---------- Starter hobbies (only while the table is empty) ----------
insert into public.hobbies (name)
select v.name
from (values ('Guitar'), ('Painting'), ('Running'), ('Reading')) as v(name)
where not exists (select 1 from public.hobbies);
