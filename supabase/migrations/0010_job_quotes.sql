-- Quoting a construction job.
--
-- The quoting page prices lawns: it measures the block off the cadastre and
-- runs the rate card over it. None of that means anything for a retaining
-- wall, where the number comes out of your head and a tape measure.
--
-- A job in 'quoted' status already IS a quote — it has a title, a scope, a
-- price and materials. What it lacked was a reference, a document, and any
-- way to send it. This adds the first, and the code adds the rest.
--
-- Safe to run more than once.

alter table one_off_jobs
  -- Assigned the first time a quote document is produced, then kept, so the
  -- number on the customer's copy never changes under them.
  add column if not exists quote_reference text,
  add column if not exists quote_sent_at timestamptz;

-- Two jobs must not share a reference, but plenty of jobs have none.
create unique index if not exists one_off_jobs_quote_reference_idx
  on one_off_jobs (quote_reference)
  where quote_reference is not null;

select case
  when (select count(*) from information_schema.columns
        where table_name = 'one_off_jobs'
          and column_name in ('quote_reference', 'quote_sent_at')) = 2
    then 'DONE — construction quotes ready'
  else 'FAIL — columns missing'
end as result;
