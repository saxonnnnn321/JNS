-- One-off jobs: construction, cleanups, anything that is not the mowing round.
--
-- The round assumes a standing plan on a cycle. A retaining wall is not that:
-- it happens once, for a price agreed up front, over however many days it
-- takes. Forcing it into service_plans would put a fake "frequency" on it and
-- have it reappear on the schedule forever.
--
-- So it gets its own table, and invoicing learns to bill from both.
--
-- Safe to run more than once.

create table if not exists one_off_jobs (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references customers (id) on delete cascade,
  property_id       uuid references properties (id) on delete set null,

  title             text not null,
  description       text,
  kind              text not null default 'construction'
                      check (kind in ('construction', 'landscaping',
                                      'cleanup', 'maintenance', 'other')),

  -- What the customer agreed to pay. Materials are folded in, or listed
  -- separately on the invoice as their own line.
  price_cents       integer not null default 0 check (price_cents >= 0),
  materials_cents   integer not null default 0 check (materials_cents >= 0),
  estimated_minutes integer check (estimated_minutes >= 0),

  status            text not null default 'quoted'
                      check (status in ('quoted', 'scheduled', 'in_progress',
                                        'done', 'cancelled')),
  scheduled_for     date,
  completed_on      date,

  -- Set the moment it is billed, so the same job cannot be invoiced twice.
  invoice_id        uuid references invoices (id) on delete set null,
  notes             text,

  is_demo           boolean not null default false,
  created_at        timestamptz not null default now()
);

create index if not exists one_off_jobs_customer_idx on one_off_jobs (customer_id);
create index if not exists one_off_jobs_status_idx on one_off_jobs (status);
create index if not exists one_off_jobs_scheduled_idx on one_off_jobs (scheduled_for);

-- ---------------------------------------------------------------------------
-- Invoice lines that are not tied to a visit or a job
--
-- Materials bought for a customer, a callout fee, a discount. Without this,
-- an invoice can only ever say what the round already knew.
-- ---------------------------------------------------------------------------
create table if not exists invoice_extras (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers (id) on delete cascade,
  description  text not null,
  -- Negative is allowed here, and only here: this is how a discount works.
  amount_cents integer not null,
  incurred_on  date not null,
  invoice_id   uuid references invoices (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists invoice_extras_customer_idx on invoice_extras (customer_id);

-- ---------------------------------------------------------------------------
-- Audit columns and RLS, same as every other table
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['one_off_jobs', 'invoice_extras']
  loop
    execute format(
      'alter table %I
         add column if not exists created_by uuid references staff (id),
         add column if not exists updated_by uuid references staff (id),
         add column if not exists updated_at timestamptz not null default now()', t);
    execute format(
      'create or replace trigger %I before insert or update on %I
         for each row execute function stamp_actor()',
      t || '_stamp_actor', t);

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
  end loop;
end $$;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

select case
  when (select count(*) from pg_tables
        where schemaname = 'public'
          and tablename in ('one_off_jobs', 'invoice_extras')
          and rowsecurity) = 2
    then 'DONE — construction jobs and extra invoice lines are ready'
  else 'FAIL — tables missing or unprotected'
end as result;
