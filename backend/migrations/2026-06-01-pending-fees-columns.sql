-- Migration: add multi-fee-per-student columns to pending_fees.
--
-- The application has long sent `student_id` and `fee_type` on every
-- pending_fees insert/upsert, but the original CREATE TABLE in schema.sql
-- never had those columns. Postgres rejected the inserts with
-- "column 'student_id' does not exist"; the Supabase JS client returns
-- { error } without throwing, and the legacy code didn't check, so every
-- bulk-import + "Add fee" tap silently produced zero rows.
--
-- After this migration:
--   - Excel imports populate pending_fees correctly
--   - Manual "Add fee" on the Fees screen works
--   - Existing rows keep working (defensive fallback in supabase.js reads
--     `student_id ?? id`, so legacy rows with NULL student_id still render)
--
-- Safe to re-run: every statement is idempotent.

alter table pending_fees add column if not exists student_id text;
alter table pending_fees add column if not exists fee_type   text default 'term1';
create index if not exists idx_pending_fees_student on pending_fees (student_id);

-- Optional: backfill legacy rows where id was used as the student id.
-- Skip this if you've already started using composite ids ("STN-1234__kit").
update pending_fees
   set student_id = id
 where student_id is null
   and id not like '%\_\_%' escape '\';
