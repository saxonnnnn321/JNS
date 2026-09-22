-- Timesheets, drawings and the partnership split.
--
-- Two partners who both do the work. The money is separated into the two
-- different things it pays for: a WAGE for hours actually worked (unequal on
-- purpose) and a PROFIT SHARE for owning the business (split by ownership).
-- The business keeps a slice off the top before either.
--
-- Money is CENTS. Percentages and ownership are BASIS POINTS (10000 = 100%),
-- so there is never a float anywhere near someone's pay.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- What the business keeps before anyone is paid
-- ---------------------------------------------------------------------------
create table if not exists business_settings (
  id                     integer primary key default 1 check (id = 1),
  retention_basis_points integer not null default 3000
                           check (retention_basis_points between 0 and 10000),
  updated_at             timestamptz not null default now()
);

insert into business_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Who the partners are, what they own, what their hours are worth
-- ---------------------------------------------------------------------------
create table if not exists partners (
  staff_id            uuid primary key references staff (id) on delete cascade,
  share_basis_points  integer not null default 5000
                        check (share_basis_points between 0 and 10000),
  wage_cents_per_hour integer not null default 5000 check (wage_cents_per_hour >= 0),
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);

-- Everyone already on staff becomes a partner with an equal share, so the
-- shares add to 100% from the start instead of throwing a warning.
insert into partners (staff_id, share_basis_points)
select id, (10000 / (select greatest(count(*), 1) from staff where active))::int
from staff
where active
on conflict (staff_id) do nothing;

-- ---------------------------------------------------------------------------
-- The hours
-- ---------------------------------------------------------------------------
create table if not exists timesheet_entries (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references staff (id) on delete cascade,
  work_date   date not null,
  minutes     integer not null check (minutes > 0 and minutes <= 1440),
  description text,
  -- Optional links, so hours can be read back against the job they went into.
  customer_id uuid references customers (id) on delete set null,
  visit_id    uuid references visits (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists timesheet_entries_date_idx on timesheet_entries (work_date);
create index if not exists timesheet_entries_staff_idx
  on timesheet_entries (staff_id, work_date);

-- ---------------------------------------------------------------------------
-- Money taken out by a partner, and money coming in that is not on the round
-- ---------------------------------------------------------------------------
create table if not exists partner_drawings (
  id           uuid primary key default gen_random_uuid(),
  staff_id     uuid not null references staff (id) on delete cascade,
  paid_on      date not null,
  amount_cents integer not null check (amount_cents > 0),
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists partner_drawings_date_idx on partner_drawings (paid_on);

create table if not exists income_entries (
  id           uuid primary key default gen_random_uuid(),
  received_on  date not null,
  amount_cents integer not null check (amount_cents > 0),
  description  text,
  customer_id  uuid references customers (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists income_entries_date_idx on income_entries (received_on);

-- ---------------------------------------------------------------------------
-- Audit columns, same as every other table
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['business_settings', 'partners', 'timesheet_entries',
                           'partner_drawings', 'income_entries']
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
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Who can do what
--
-- Both partners can SEE everything — the split does not work if half the
-- hours are hidden, and partners are entitled to the books. But you may only
-- add or change YOUR OWN hours and YOUR OWN drawings. Saxon, as owner, can
-- correct anything.
-- ---------------------------------------------------------------------------
drop policy if exists business_settings_read on business_settings;
drop policy if exists business_settings_write on business_settings;
create policy business_settings_read on business_settings
  for select to authenticated using (is_staff());
create policy business_settings_write on business_settings
  for update to authenticated using (is_owner()) with check (is_owner());

drop policy if exists partners_read on partners;
drop policy if exists partners_insert on partners;
drop policy if exists partners_update on partners;
drop policy if exists partners_delete on partners;
create policy partners_read on partners
  for select to authenticated using (is_staff());
create policy partners_insert on partners
  for insert to authenticated with check (is_owner());
create policy partners_update on partners
  for update to authenticated using (is_owner()) with check (is_owner());
create policy partners_delete on partners
  for delete to authenticated using (is_owner());

drop policy if exists timesheet_read on timesheet_entries;
drop policy if exists timesheet_insert on timesheet_entries;
drop policy if exists timesheet_update on timesheet_entries;
drop policy if exists timesheet_delete on timesheet_entries;
create policy timesheet_read on timesheet_entries
  for select to authenticated using (is_staff());
create policy timesheet_insert on timesheet_entries
  for insert to authenticated
  with check (is_staff() and (staff_id = auth.uid() or is_owner()));
create policy timesheet_update on timesheet_entries
  for update to authenticated
  using (is_staff() and (staff_id = auth.uid() or is_owner()))
  with check (is_staff() and (staff_id = auth.uid() or is_owner()));
create policy timesheet_delete on timesheet_entries
  for delete to authenticated
  using (is_staff() and (staff_id = auth.uid() or is_owner()));

drop policy if exists drawings_read on partner_drawings;
drop policy if exists drawings_insert on partner_drawings;
drop policy if exists drawings_update on partner_drawings;
drop policy if exists drawings_delete on partner_drawings;
create policy drawings_read on partner_drawings
  for select to authenticated using (is_staff());
create policy drawings_insert on partner_drawings
  for insert to authenticated
  with check (is_staff() and (staff_id = auth.uid() or is_owner()));
create policy drawings_update on partner_drawings
  for update to authenticated
  using (is_staff() and (staff_id = auth.uid() or is_owner()))
  with check (is_staff() and (staff_id = auth.uid() or is_owner()));
create policy drawings_delete on partner_drawings
  for delete to authenticated
  using (is_staff() and (staff_id = auth.uid() or is_owner()));

drop policy if exists income_read on income_entries;
drop policy if exists income_insert on income_entries;
drop policy if exists income_update on income_entries;
drop policy if exists income_delete on income_entries;
create policy income_read on income_entries
  for select to authenticated using (is_staff());
create policy income_insert on income_entries
  for insert to authenticated with check (is_staff());
create policy income_update on income_entries
  for update to authenticated using (is_staff()) with check (is_staff());
create policy income_delete on income_entries
  for delete to authenticated using (is_owner());

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
        where schemaname = 'public'
          and tablename in ('partners', 'timesheet_entries', 'partner_drawings',
                            'income_entries', 'business_settings')) < 5
    then 'FAIL — tables missing'
  else 'DONE — timesheet ready. Partners: '
       || (select string_agg(coalesce(s.full_name, s.email)
                             || ' ' || (p.share_basis_points / 100.0) || '%', ', ')
           from partners p join staff s on s.id = p.staff_id)
end as result;
