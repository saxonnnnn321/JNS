-- The round, plus a way to tell demo data from real data.
--
-- 0001 created quoting and invoicing tables. The CRM screens also need the
-- recurring round — standing plans and the visits generated from them — which
-- had only ever existed as mock objects in TypeScript.
--
-- `is_demo` is the important column here. Demo rows go in the real tables and
-- behave like real rows, so nothing is faked and no code path is special. The
-- only difference is that one flag, which makes "clear the demo data" a single
-- delete rather than a hunt.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- The round
-- ---------------------------------------------------------------------------
create table if not exists service_plans (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references customers (id) on delete cascade,
  property_id       uuid not null references properties (id) on delete cascade,

  frequency         text not null
                      check (frequency in ('weekly', 'fortnightly', 'monthly', 'onceOff')),
  -- A date a visit lands on. Every later visit counts forward from here, so
  -- this also fixes the weekday the job falls on.
  anchor_date       date not null,

  package_key       text not null default 'standard'
                      check (package_key in ('standard', 'fullTidy')),
  price_cents       integer not null check (price_cents >= 0),
  estimated_minutes integer not null check (estimated_minutes >= 0),

  active            boolean not null default true,
  -- Customers go away, and grass stops growing over winter. Inclusive.
  paused_until      date,

  is_demo           boolean not null default false,
  created_at        timestamptz not null default now()
);

create index if not exists service_plans_customer_idx on service_plans (customer_id);
create index if not exists service_plans_active_idx on service_plans (active);

create table if not exists visits (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid not null references service_plans (id) on delete cascade,
  visit_date      date not null,
  status          text not null default 'scheduled'
                    check (status in ('scheduled', 'done', 'skipped')),

  -- The number that eventually replaces the guesses in the rate card.
  actual_minutes  integer check (actual_minutes >= 0),
  invoice_id      uuid references invoices (id) on delete set null,
  notes           text,

  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),

  -- A plan cannot be visited twice on the same day.
  unique (plan_id, visit_date)
);

create index if not exists visits_date_idx on visits (visit_date);
create index if not exists visits_plan_idx on visits (plan_id);

-- ---------------------------------------------------------------------------
-- Mark the tables that can hold demo rows
-- ---------------------------------------------------------------------------
alter table customers  add column if not exists is_demo boolean not null default false;
alter table properties add column if not exists is_demo boolean not null default false;
alter table quotes     add column if not exists is_demo boolean not null default false;

create index if not exists customers_demo_idx on customers (is_demo) where is_demo;

-- ---------------------------------------------------------------------------
-- Same protection as everything else
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['service_plans', 'visits']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);

    execute format('drop policy if exists %I on %I', t || '_staff_read', t);
    execute format('drop policy if exists %I on %I', t || '_staff_insert', t);
    execute format('drop policy if exists %I on %I', t || '_staff_update', t);
    execute format('drop policy if exists %I on %I', t || '_owner_delete', t);

    execute format(
      'create policy %I on %I for select to authenticated using (is_staff())',
      t || '_staff_read', t);
    execute format(
      'create policy %I on %I for insert to authenticated with check (is_staff())',
      t || '_staff_insert', t);
    execute format(
      'create policy %I on %I for update to authenticated using (is_staff()) with check (is_staff())',
      t || '_staff_update', t);
    execute format(
      'create policy %I on %I for delete to authenticated using (is_owner())',
      t || '_owner_delete', t);

    -- Who did what, same as the other tables.
    execute format(
      'alter table %I
         add column if not exists created_by uuid references staff (id),
         add column if not exists updated_by uuid references staff (id),
         add column if not exists updated_at timestamptz not null default now()', t);
    execute format(
      'create or replace trigger %I before insert or update on %I
         for each row execute function stamp_actor()',
      t || '_stamp_actor', t);
  end loop;
end $$;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------
select case
  when (select count(*) from pg_tables
        where schemaname = 'public' and not rowsecurity
          and tablename <> 'spatial_ref_sys') > 0
    then 'FAIL — something is unprotected'
  when (select count(*) from pg_tables
        where schemaname = 'public' and tablename in ('service_plans', 'visits')) < 2
    then 'FAIL — tables missing'
  else 'DONE — round tables created and locked down'
end as result;
