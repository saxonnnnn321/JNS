-- Cost-plus jobs, and receipts you never got.
--
-- COST PLUS: sometimes you do not quote. You do the work, you buy what it
-- needs, and you bill the hours plus the materials plus a margin. The price
-- is not known when the job starts — it is discovered as it goes.
--
-- Rather than invent a second kind of job, an existing job gains a `pricing`
-- mode. Fixed works exactly as before. Cost-plus works out its own value from
-- the hours logged against it and the receipts filed against it, so the
-- number on screen is always what the job is actually worth today.
--
-- That is why timesheet entries gain a job_id: an hour has to know which job
-- it belongs to before it can be billed to one.
--
-- MISSING RECEIPTS: you lost the docket, or there never was one — cash for a
-- trailer load of soil. The amount is still real and still belongs on the
-- job, so the photo becomes optional.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- How a job is priced
-- ---------------------------------------------------------------------------
alter table one_off_jobs
  add column if not exists pricing text not null default 'fixed'
    check (pricing in ('fixed', 'costPlus')),
  -- What an hour on this job is billed at. Only read for cost-plus.
  add column if not exists labour_rate_cents integer not null default 15000
    check (labour_rate_cents >= 0),
  -- Margin on materials, in basis points. 1500 = 15%. Zero is fine.
  add column if not exists markup_basis_points integer not null default 0
    check (markup_basis_points between 0 and 10000);

-- ---------------------------------------------------------------------------
-- Hours belong to a job, not just a customer
-- ---------------------------------------------------------------------------
alter table timesheet_entries
  add column if not exists job_id uuid references one_off_jobs (id) on delete set null;

create index if not exists timesheet_entries_job_idx on timesheet_entries (job_id);

-- ---------------------------------------------------------------------------
-- A receipt with no photo is still a cost
-- ---------------------------------------------------------------------------
alter table receipts alter column storage_path drop not null;

select case
  when (select count(*) from information_schema.columns
        where table_name = 'one_off_jobs'
          and column_name in ('pricing', 'labour_rate_cents', 'markup_basis_points')) < 3
    then 'FAIL — job pricing columns missing'
  when (select count(*) from information_schema.columns
        where table_name = 'timesheet_entries' and column_name = 'job_id') < 1
    then 'FAIL — timesheet_entries.job_id missing'
  when (select is_nullable from information_schema.columns
        where table_name = 'receipts' and column_name = 'storage_path') <> 'YES'
    then 'FAIL — receipts still demand a photo'
  else 'DONE — cost-plus jobs ready, and receipts no longer need a photo'
end as result;

-- The running clock needs to remember the job too, or the hours lose their
-- home the moment you press stop.
alter table running_timers
  add column if not exists job_id uuid references one_off_jobs (id) on delete set null;
