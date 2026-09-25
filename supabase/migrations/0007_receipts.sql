-- Receipts: a photo of what you spent, against who it was for.
--
-- Two jobs, one record. Every receipt is money the business spent, which is
-- what the tax man wants to see. Some of them are ALSO money to charge back
-- to a customer — the turf, the besser block, the hire of a plate compactor.
-- `rechargeable` is the difference, and when it is set the receipt creates a
-- line on that customer's next invoice.
--
-- The photo lives in a PRIVATE bucket. A receipt carries a supplier, a date,
-- an amount and sometimes a card number; it has no business being on a public
-- URL. Reading one goes through a short-lived signed link made server-side,
-- the same as job photos.
--
-- Safe to run more than once.

create table if not exists receipts (
  id            uuid primary key default gen_random_uuid(),

  -- Path within the private `receipts` bucket. No URL is stored, because a
  -- stored URL would either expire or be permanent, and both are wrong.
  storage_path  text not null,

  supplier      text,
  amount_cents  integer not null check (amount_cents >= 0),
  purchased_on  date not null,
  notes         text,

  -- Who it was for. Null on both means a business overhead: fuel, a blade,
  -- insurance — a real cost, but nobody's job.
  customer_id   uuid references customers (id) on delete set null,
  job_id        uuid references one_off_jobs (id) on delete set null,

  -- Charge it back to the customer? Only meaningful with a customer set.
  rechargeable  boolean not null default false,
  -- The invoice line this receipt created, so the two stay in step.
  extra_id      uuid references invoice_extras (id) on delete set null,

  created_at    timestamptz not null default now()
);

create index if not exists receipts_date_idx on receipts (purchased_on desc);
create index if not exists receipts_customer_idx on receipts (customer_id);
create index if not exists receipts_job_idx on receipts (job_id);

-- ---------------------------------------------------------------------------
-- Audit columns and RLS
-- ---------------------------------------------------------------------------
alter table receipts
  add column if not exists created_by uuid references staff (id),
  add column if not exists updated_by uuid references staff (id),
  add column if not exists updated_at timestamptz not null default now();

create or replace trigger receipts_stamp_actor
  before insert or update on receipts
  for each row execute function stamp_actor();

alter table receipts enable row level security;
alter table receipts force row level security;

drop policy if exists receipts_staff_read on receipts;
drop policy if exists receipts_staff_insert on receipts;
drop policy if exists receipts_staff_update on receipts;
drop policy if exists receipts_owner_delete on receipts;

create policy receipts_staff_read on receipts
  for select to authenticated using (is_staff());
create policy receipts_staff_insert on receipts
  for insert to authenticated with check (is_staff());
create policy receipts_staff_update on receipts
  for update to authenticated using (is_staff()) with check (is_staff());
create policy receipts_owner_delete on receipts
  for delete to authenticated using (is_owner());

-- ---------------------------------------------------------------------------
-- The photos. Private bucket, staff only, same shape as job-photos.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do update set public = false;

drop policy if exists receipts_staff_read_objects on storage.objects;
create policy receipts_staff_read_objects on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and is_staff());

drop policy if exists receipts_staff_write_objects on storage.objects;
create policy receipts_staff_write_objects on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and is_staff());

drop policy if exists receipts_staff_delete_objects on storage.objects;
create policy receipts_staff_delete_objects on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and is_staff());

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

select case
  when (select count(*) from pg_tables
        where schemaname = 'public' and tablename = 'receipts' and rowsecurity) = 1
   and (select count(*) from storage.buckets where id = 'receipts' and not public) = 1
    then 'DONE — receipts ready, photos private'
  else 'FAIL — table or bucket missing, or the bucket is public'
end as result;
