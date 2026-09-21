-- PART 1 OF 2 — the tables

create extension if not exists postgis;

create table if not exists customers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  email        text,
  phone        text,
  billing_address text,
  created_at   timestamptz not null default now()
);

create table if not exists properties (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid references customers (id) on delete cascade,
  address_line  text not null,
  suburb        text not null,
  state         text not null default 'NSW',
  postcode      text,

  location      geography (point, 4326),
  parcel        geography (polygon, 4326),
  lawn_areas    geography (multipolygon, 4326),

  lawn_area_m2     numeric(10, 2),
  edge_metres      numeric(10, 2),
  hard_surface_m2  numeric(10, 2),
  access_notes     text,
  created_at    timestamptz not null default now()
);

create index if not exists properties_location_idx on properties using gist (location);

create table if not exists quotes (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique,
  customer_id   uuid not null references customers (id) on delete restrict,
  property_id   uuid not null references properties (id) on delete restrict,
  status        text not null default 'draft'
                  check (status in ('draft', 'sent', 'accepted', 'declined', 'expired')),
  issued_date   date not null,
  valid_until   date not null,

  request       jsonb not null,
  estimate      jsonb not null,
  rate_card     jsonb not null,

  needs_site_visit boolean not null default false,
  accepted_option  text,
  created_at    timestamptz not null default now()
);

create index if not exists quotes_customer_idx on quotes (customer_id);
create index if not exists quotes_status_idx on quotes (status);

create table if not exists quote_photos (
  id           uuid primary key default gen_random_uuid(),
  quote_id     uuid not null references quotes (id) on delete cascade,
  storage_path text not null,
  taken_at     timestamptz,
  assessment   jsonb,
  created_at   timestamptz not null default now()
);

create table if not exists invoices (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique,
  quote_id      uuid references quotes (id) on delete set null,
  customer_id   uuid not null references customers (id) on delete restrict,
  status        text not null default 'draft'
                  check (status in ('draft', 'sent', 'paid', 'overdue', 'void')),
  issued_date   date not null,
  due_date      date not null,
  subtotal_cents integer not null,
  gst_cents      integer not null,
  total_cents    integer not null,
  paid_at       timestamptz,
  xero_id       text,
  created_at    timestamptz not null default now()
);

create table if not exists invoice_items (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references invoices (id) on delete cascade,
  sort          integer not null default 0,
  description   text not null,
  quantity      numeric(10, 2),
  unit          text,
  amount_cents  integer not null
);

create table if not exists jobs (
  id                uuid primary key default gen_random_uuid(),
  quote_id          uuid references quotes (id) on delete set null,
  property_id       uuid not null references properties (id) on delete restrict,
  scheduled_for     date,
  completed_at      timestamptz,
  estimated_minutes numeric(10, 2),
  actual_minutes    numeric(10, 2),
  invoice_id        uuid references invoices (id) on delete set null,
  crew_notes        text,
  created_at        timestamptz not null default now()
);

create index if not exists jobs_property_idx on jobs (property_id);

-- PART 2 OF 2 — locking it down

create table if not exists staff (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'crew' check (role in ('owner', 'crew')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Deliberately NOT "force"d, unlike the tables below: that is what lets you
-- insert the very first owner from this SQL editor. Do not add force here or
-- you will lock every human out of the allow-list permanently.
alter table staff enable row level security;

create or replace function is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from staff
    where staff.id = auth.uid() and staff.active
  );
$$;

drop policy if exists staff_read on staff;
create policy staff_read on staff
  for select to authenticated using (is_staff());

create or replace function is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from staff
    where staff.id = auth.uid() and staff.active and staff.role = 'owner'
  );
$$;

drop policy if exists staff_write on staff;
create policy staff_write on staff
  for all to authenticated
  using (is_owner())
  with check (is_owner());

do $$
declare
  t text;
begin
  foreach t in array array[
    'customers', 'properties', 'quotes', 'quote_photos',
    'invoices', 'invoice_items', 'jobs'
  ]
  loop
    execute format('alter table %I enable row level security', t);

    execute format('alter table %I force row level security', t);

    execute format('drop policy if exists %I on %I', t || '_staff_read', t);
    execute format('drop policy if exists %I on %I', t || '_staff_insert', t);
    execute format('drop policy if exists %I on %I', t || '_staff_update', t);
    execute format('drop policy if exists %I on %I', t || '_owner_delete', t);

    execute format(
      'create policy %I on %I for select to authenticated using (is_staff())',
      t || '_staff_read', t
    );
    execute format(
      'create policy %I on %I for insert to authenticated with check (is_staff())',
      t || '_staff_insert', t
    );
    execute format(
      'create policy %I on %I for update to authenticated using (is_staff()) with check (is_staff())',
      t || '_staff_update', t
    );
    execute format(
      'create policy %I on %I for delete to authenticated using (is_owner())',
      t || '_owner_delete', t
    );
  end loop;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['customers', 'properties', 'quotes', 'invoices', 'jobs']
  loop
    execute format(
      'alter table %I
         add column if not exists created_by uuid references staff (id),
         add column if not exists updated_by uuid references staff (id),
         add column if not exists updated_at timestamptz not null default now()', t);
  end loop;
end $$;

create or replace function stamp_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    new.created_by := coalesce(new.created_by, auth.uid());
  else
    new.created_by := old.created_by;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['customers', 'properties', 'quotes', 'invoices', 'jobs']
  loop
    execute format(
      'create or replace trigger %I before insert or update on %I
         for each row execute function stamp_actor()',
      t || '_stamp_actor', t
    );
  end loop;
end $$;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', false)
on conflict (id) do update set public = false;

drop policy if exists job_photos_staff_read on storage.objects;
create policy job_photos_staff_read on storage.objects
  for select to authenticated
  using (bucket_id = 'job-photos' and is_staff());

drop policy if exists job_photos_staff_write on storage.objects;
create policy job_photos_staff_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'job-photos' and is_staff());

drop policy if exists job_photos_staff_delete on storage.objects;
create policy job_photos_staff_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'job-photos' and is_staff());

-- Note: SUPABASE_SERVICE_ROLE_KEY bypasses every policy above. Server-side
-- only, and never with a NEXT_PUBLIC_ prefix.

-- DID IT WORK? This should list 8 tables, all with rowsecurity = true.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- LAST STEP — ADD YOURSELF, after the check above looks right.
-- Authentication -> Users -> Add user (your email + password), then run:
--
--   insert into staff (id, email, full_name, role)
--   select id, email, 'Saxon', 'owner' from auth.users
--   where email = 'YOUR@EMAIL.COM'
--   on conflict (id) do nothing;
