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
