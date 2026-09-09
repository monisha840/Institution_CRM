-- Migration: enforce one pending-fee row per (student, fee_type).
--
-- The term-wise fee model records Term I/II/III (+ Application/Van) as
-- separate rows with composite ids ("STN-1234__term1"). The row id is already
-- the primary key, but this adds a second guard so the same student can never
-- end up with two rows of the same fee type (e.g. a legacy single-fee row AND
-- a new __term1 row) — which would double-count their outstanding balance.
--
-- Rows with a NULL student_id (very old imports) are excluded, so they stay
-- valid; Postgres treats NULLs as distinct in unique indexes anyway.
--
-- If step 2 fails with a uniqueness error, you have pre-existing duplicates.
-- List them with step 1, decide which row to keep, delete the other, re-run.

-- 1) Inspect duplicates first (safe, read-only):
-- select student_id, fee_type, count(*) as n, array_agg(id) as ids
--   from pending_fees
--  where student_id is not null
--  group by student_id, fee_type
-- having count(*) > 1;

-- 2) Enforce uniqueness (idempotent: skipped if the index already exists).
create unique index if not exists uq_pending_fees_student_feetype
  on pending_fees (student_id, fee_type)
  where student_id is not null;
