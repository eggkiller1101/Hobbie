-- Browser-owned records live separately from the legacy shared data.
-- No old record is deleted or assigned to an arbitrary visitor.
create table if not exists public.browser_entrants (
  id bigint generated always as identity primary key,
  browser_key text not null check (browser_key ~ '^[a-f0-9]{64}$'),
  name text not null check (char_length(name) between 1 and 20 and name = btrim(name)),
  created_at timestamptz not null default now(),
  unique (id, browser_key)
);
create unique index if not exists browser_entrants_name_idx
  on public.browser_entrants(browser_key, lower(name));

create table if not exists public.browser_hobbies (
  id bigint generated always as identity primary key,
  browser_key text check (browser_key is null or browser_key ~ '^[a-f0-9]{64}$'),
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  created_at timestamptz not null default now()
);
-- NULL ownership is reserved for the fixed, public starter catalogue.
create unique index if not exists browser_hobbies_name_idx
  on public.browser_hobbies(coalesce(browser_key, ''), lower(name));
create index if not exists browser_hobbies_owner_idx on public.browser_hobbies(browser_key);

create table if not exists public.browser_time_entries (
  id bigint generated always as identity primary key,
  browser_key text not null check (browser_key ~ '^[a-f0-9]{64}$'),
  entrant_id bigint not null,
  hobby_id bigint not null references public.browser_hobbies(id),
  started_at timestamptz not null,
  ended_at timestamptz not null check (ended_at >= started_at),
  duration_seconds integer not null check (duration_seconds >= 1),
  created_at timestamptz not null default now(),
  foreign key (entrant_id, browser_key) references public.browser_entrants(id, browser_key)
);
create index if not exists browser_time_owner_idx on public.browser_time_entries(browser_key, entrant_id, hobby_id);
create index if not exists browser_time_entrant_idx on public.browser_time_entries(entrant_id, browser_key);
create index if not exists browser_time_hobby_idx on public.browser_time_entries(hobby_id);

create or replace view public.browser_hobby_totals with (security_invoker = true) as
select e.browser_key, e.id as entrant_id, e.name as entrant, h.id as hobby_id, h.name as hobby,
       count(*) as sessions, sum(t.duration_seconds) as total_seconds
from public.browser_time_entries t
join public.browser_entrants e on e.id = t.entrant_id and e.browser_key = t.browser_key
join public.browser_hobbies h on h.id = t.hobby_id
group by e.browser_key, e.id, h.id;

-- Only the server can access these objects. Browser ownership is enforced by
-- the API; no public role may read even a hash of the identity credential.
alter table public.browser_entrants enable row level security;
alter table public.browser_hobbies enable row level security;
alter table public.browser_time_entries enable row level security;
revoke all on public.browser_entrants, public.browser_hobbies, public.browser_time_entries, public.browser_hobby_totals from public, anon, authenticated;
grant usage on schema public to service_role;
grant select, insert on public.browser_entrants, public.browser_hobbies, public.browser_time_entries to service_role;
grant select on public.browser_hobby_totals to service_role;
grant usage, select on sequence public.browser_entrants_id_seq, public.browser_hobbies_id_seq, public.browser_time_entries_id_seq to service_role;
revoke all on sequence public.browser_entrants_id_seq, public.browser_hobbies_id_seq, public.browser_time_entries_id_seq from public, anon, authenticated;

insert into public.browser_hobbies(browser_key, name)
values (null, 'Guitar'), (null, 'Painting'), (null, 'Running'), (null, 'Reading')
on conflict do nothing;
