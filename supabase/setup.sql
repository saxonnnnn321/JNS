-- ===========================================================================
-- JNS — full Supabase setup. Run this once, in the Supabase SQL Editor.
--
-- HOW TO RUN
--   Supabase dashboard → SQL Editor → New query → paste all of this → Run.
--
-- It is SAFE TO RUN AGAIN. Every statement is written so that re-running it
-- does nothing the second time. If it fails partway, fix the problem and run
-- the whole thing again — you do not need to unpick anything.
--
-- WHAT IT DOES
--   Part 1  creates the tables (customers, properties, quotes, invoices, jobs…)
--   Part 2  locks them down so only signed-in staff can read anything, and
--           records who changed what
--
-- AFTER IT RUNS you still have to add yourself as staff — the last section of
-- this file tells you how. Until you do, nobody can read anything, including
-- you. That is the system working, not a fault.
-- ===========================================================================


-- ===========================================================================
-- PART 1 OF 2 — the tables
-- ===========================================================================

-- JNS quoting & invoicing — initial schema.
--
-- Step 1 does not need a database: the form and the PDF run with no environment
-- configured at all. This migration exists so steps 2 to 5 have somewhere to
-- land, and so the shape is decided before there is data to migrate.
--
-- Money is stored in CENTS as integers. Never floats.
-- Dates that represent a calendar day are DATE, in Australia/Sydney terms.

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

  -- Step 2/4: geocode + the parcel polygon straight off the NSW cadastre.
  location      geography (point, 4326),
  parcel        geography (polygon, 4326),
  -- The lawn polygons you drag on the aerial. Area is derived, but cached here
  -- so a quote can be reproduced exactly as it was priced.
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

  -- The full request + result, exactly as priced. If you change the rate card
  -- later, an old quote still explains itself.
  request       jsonb not null,
  estimate      jsonb not null,
  rate_card     jsonb not null,

  needs_site_visit boolean not null default false,
  accepted_option  text,
  created_at    timestamptz not null default now()
);

create index if not exists quotes_customer_idx on quotes (customer_id);
create index if not exists quotes_status_idx on quotes (status);

-- Step 3: the photos a quote was based on, and what the model made of them.
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

-- Step 5: the feedback loop. Every completed job records what it ACTUALLY took,
-- next to what the engine predicted. After 50-odd rows you can fit the rate card
-- to your own data instead of the seed guesses.
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


-- ===========================================================================
-- PART 2 OF 2 — locking it down
-- ===========================================================================

-- Locking the data down.
--
-- WHY THIS FILE EXISTS, and why it is not optional:
--
-- Supabase exposes every table through a public REST API. The "anon" key that
-- authorises it is PUBLIC — it is compiled into the JavaScript the browser
-- downloads, so treat it as though it were printed on the side of the ute.
--
-- The only thing standing between that key and every customer's name, address
-- and phone number is Row Level Security. A table without RLS is a table on the
-- open internet. 0001_init.sql created seven tables and enabled RLS on none of
-- them, which is the single most dangerous kind of mistake in a Supabase app:
-- everything works perfectly right up until someone reads your customer list.
--
-- MODEL: this is a single-business internal tool with a small team. Staff sign
-- in; nobody else gets anything.
--
--   owner  — full access, including managing who else can get in, and deleting
--            things. Saxon and his partner are both owners: a two-person
--            business has no meaningful boundary between them, and locking a
--            co-owner out of the money is friction with no upside.
--   crew   — can see customers and properties and get the work done, but
--            cannot delete records or add staff. For a future hire.
--
-- To make someone crew instead, change one word in their `staff` row.

-- ---------------------------------------------------------------------------
-- Who counts as staff
-- ---------------------------------------------------------------------------
-- Supabase manages the actual accounts in auth.users. This table is the
-- allow-list: having an auth account is not enough, you must also be in here.
-- That way a stray signup cannot read the customer list.

create table if not exists staff (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'crew' check (role in ('owner', 'crew')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- RLS on, but deliberately NOT `force`d, unlike the business tables below.
--
-- BOOTSTRAP: is_owner() is false when the staff table is empty, so nobody can
-- insert the first owner through the API — a chicken and egg. Leaving `force`
-- off means the table owner (which is what the Supabase SQL editor runs as)
-- still bypasses the policy, so you can insert yourself from the dashboard to
-- get started.
--
-- Do NOT add `force row level security` to this table. It would lock every
-- human out of the allow-list permanently, including you, with no way back
-- except the service role key.
alter table staff enable row level security;

-- Stable, non-recursive membership check. `security definer` lets it read the
-- staff table without triggering the policy that calls it — without this you
-- get infinite recursion the first time anyone signs in.
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

-- Staff can see the team; only owners can change it.
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

-- Only owners add or remove staff. This is the door to everything else.
drop policy if exists staff_write on staff;
create policy staff_write on staff
  for all to authenticated
  using (is_owner())
  with check (is_owner());

-- ---------------------------------------------------------------------------
-- Everything else: staff only, full access. Anon gets nothing.
-- ---------------------------------------------------------------------------
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

    -- force: applies RLS even to the table owner, so a mistake in a migration
    -- or a psql session cannot quietly bypass it.
    execute format('alter table %I force row level security', t);

    -- Staff read and write. Dropped first so a partial run can be repeated.
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
    -- Deleting is the one thing crew cannot do. Mistakes by a new hire should
    -- be recoverable without reaching for a backup.
    execute format(
      'create policy %I on %I for delete to authenticated using (is_owner())',
      t || '_owner_delete', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Who did what
-- ---------------------------------------------------------------------------
-- With one person this never comes up. With two it comes up constantly: "did
-- you already quote the Hope Street job?", "who dropped their price?". Stamping
-- rows automatically costs nothing and answers it without anyone keeping notes.

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
    -- Never let an update rewrite who created the row.
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

-- Revoke the blanket grants Supabase hands out, so an unauthenticated caller
-- is refused at the permission layer as well as the policy layer. Belt and
-- braces: either one alone would do, and neither costs anything.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- ---------------------------------------------------------------------------
-- Photos
-- ---------------------------------------------------------------------------
-- Job photos are pictures of customers' homes. They are personal information
-- and they do NOT belong in a public bucket. Private bucket + short-lived
-- signed URLs generated server-side.

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

-- ---------------------------------------------------------------------------
-- THE TRAP, written down so nobody trips over it later
-- ---------------------------------------------------------------------------
-- SUPABASE_SERVICE_ROLE_KEY bypasses every policy above. It is a master key.
--   - It must never be sent to the browser. Any NEXT_PUBLIC_ prefix on it is a
--     breach, because that prefix means "compile this into the client bundle".
--   - Use it only in server code (route handlers, server actions), and only
--     where a signed-in user's own permissions genuinely will not do.
--   - If it ever leaks, rotate it in the Supabase dashboard immediately.
--
-- Day to day, the app should talk to Supabase as the SIGNED-IN USER, so the
-- policies above are actually doing the work. If every query runs as the
-- service role, RLS is decoration — and every row gets stamped with no actor,
-- so the audit trail goes blank too.

-- ---------------------------------------------------------------------------
-- ADDING YOUR PARTNER
-- ---------------------------------------------------------------------------
-- 1. Supabase dashboard → Authentication → Users → "Invite user", their email.
-- 2. They follow the emailed link and set their own password. You never see it
--    and you should never set it for them.
-- 3. Add them to the allow-list — an auth account alone grants nothing:
--
--      insert into staff (id, email, full_name, role)
--      select id, email, 'Partner name', 'owner'
--      from auth.users where email = 'their@email.com';
--
-- 4. To remove someone later, set active = false rather than deleting the row.
--    Deleting it orphans the created_by stamps on everything they touched.
--
-- KNOWN LIMITATION: if you both edit the same quote at once, the last save
-- wins silently. With two people that is rare and the audit stamps at least
-- tell you it happened. Worth revisiting if it ever bites.


-- ===========================================================================
-- DID IT WORK?
-- ===========================================================================
-- This should list 8 tables, each with rowsecurity = true.

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- ===========================================================================
-- LAST STEP — ADD YOURSELF (do this after the query above looks right)
-- ===========================================================================
-- 1. Dashboard → Authentication → Users → Add user → your email + a password.
-- 2. Come back here, put your email in the line below, and run just that line.
--
--    insert into staff (id, email, full_name, role)
--    select id, email, 'Saxon', 'owner' from auth.users
--    where email = 'YOUR@EMAIL.COM'
--    on conflict (id) do nothing;
--
-- 3. Same again for your partner, once she has accepted her invite.
-- ===========================================================================
