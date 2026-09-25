-- Progress claims: billing a big job in stages.
--
-- A retaining wall is not a mow. It runs for weeks, and waiting until the
-- last block is laid to send the first invoice means carrying the materials
-- and the wages yourself the whole time. Builders bill progressively, and so
-- should this.
--
-- The model is deliberately the simple one. A job has a total. You claim an
-- amount against it whenever you like — "$5,000, slab down" — and what is
-- left is the total less everything claimed. When the job is finally marked
-- finished, invoicing bills THE REMAINDER, not the whole price again.
--
-- Percentages are not stored. "40% of $20,000" is a way of arriving at
-- $8,000, not a thing worth keeping, and storing both invites them to
-- disagree.
--
-- Safe to run more than once.

create table if not exists job_claims (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references one_off_jobs (id) on delete cascade,

  description  text not null,
  amount_cents integer not null check (amount_cents > 0),
  claimed_on   date not null,

  -- Set when billed, which is what stops a stage being charged twice.
  invoice_id   uuid references invoices (id) on delete set null,

  created_at   timestamptz not null default now()
);

create index if not exists job_claims_job_idx on job_claims (job_id);
create index if not exists job_claims_invoice_idx on job_claims (invoice_id);

-- ---------------------------------------------------------------------------
-- Audit columns and RLS
-- ---------------------------------------------------------------------------
alter table job_claims
  add column if not exists created_by uuid references staff (id),
  add column if not exists updated_by uuid references staff (id),
  add column if not exists updated_at timestamptz not null default now();

create or replace trigger job_claims_stamp_actor
  before insert or update on job_claims
  for each row execute function stamp_actor();

alter table job_claims enable row level security;
alter table job_claims force row level security;

drop policy if exists job_claims_staff_read on job_claims;
drop policy if exists job_claims_staff_insert on job_claims;
drop policy if exists job_claims_staff_update on job_claims;
drop policy if exists job_claims_owner_delete on job_claims;

create policy job_claims_staff_read on job_claims
  for select to authenticated using (is_staff());
create policy job_claims_staff_insert on job_claims
  for insert to authenticated with check (is_staff());
create policy job_claims_staff_update on job_claims
  for update to authenticated using (is_staff()) with check (is_staff());
create policy job_claims_owner_delete on job_claims
  for delete to authenticated using (is_owner());

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

select case
  when (select count(*) from pg_tables
        where schemaname = 'public' and tablename = 'job_claims'
          and rowsecurity) = 1
    then 'DONE — you can bill big jobs in stages now'
  else 'FAIL — job_claims missing or unprotected'
end as result;
