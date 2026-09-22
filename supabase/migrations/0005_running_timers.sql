-- A clock you can start and walk away from.
--
-- The running timer lives in the database, not in the phone. A tradesman
-- starts the clock, puts the phone in his pocket, the screen locks, the
-- browser gets evicted from memory, and he finishes the job an hour later on
-- a different device. Anything kept in localStorage is gone by then; a row
-- here is still ticking.
--
-- One timer per person, which is why staff_id is the primary key: starting a
-- second clock replaces the first rather than quietly double-counting.
--
-- Safe to run more than once.

create table if not exists running_timers (
  staff_id    uuid primary key references staff (id) on delete cascade,
  started_at  timestamptz not null default now(),
  description text,
  customer_id uuid references customers (id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table running_timers
  add column if not exists created_by uuid references staff (id),
  add column if not exists updated_by uuid references staff (id),
  add column if not exists updated_at timestamptz not null default now();

create or replace trigger running_timers_stamp_actor
  before insert or update on running_timers
  for each row execute function stamp_actor();

alter table running_timers enable row level security;
alter table running_timers force row level security;

-- Both partners can see a running clock — knowing the other bloke is on the
-- job is useful. Only you can start or stop your own.
drop policy if exists running_timers_read on running_timers;
drop policy if exists running_timers_insert on running_timers;
drop policy if exists running_timers_update on running_timers;
drop policy if exists running_timers_delete on running_timers;

create policy running_timers_read on running_timers
  for select to authenticated using (is_staff());
create policy running_timers_insert on running_timers
  for insert to authenticated
  with check (is_staff() and (staff_id = auth.uid() or is_owner()));
create policy running_timers_update on running_timers
  for update to authenticated
  using (is_staff() and (staff_id = auth.uid() or is_owner()))
  with check (is_staff() and (staff_id = auth.uid() or is_owner()));
create policy running_timers_delete on running_timers
  for delete to authenticated
  using (is_staff() and (staff_id = auth.uid() or is_owner()));

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

select case
  when (select count(*) from pg_tables
        where schemaname = 'public' and tablename = 'running_timers'
          and rowsecurity) = 1
    then 'DONE — the timer is ready'
  else 'FAIL — running_timers missing or unprotected'
end as result;
