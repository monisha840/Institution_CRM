-- ==========================================================================
-- Sirah CRM · columns the application already uses      (2026-09-10)
--
-- Four columns that backend/lib/supabase.js reads and writes but that were
-- never added to the schema. PostgREST drops an unknown column on write and
-- returns undefined on read, so none of this failed loudly — it just quietly
-- lost data:
--
--   recent_fees.fee_type    Which fee a receipt was raised against. Without
--                           it every receipt renders as "Term I", because
--                           feeTypeLabel() falls back to that when the key
--                           is missing. A parent's receipt for the transport
--                           fee said Term I.
--
--   routes.started_at       Set by advanceRoute() when a bus starts its run,
--   routes.completed_at     cleared when it is reset. fromRoute() reads both.
--                           Without them the transport board cannot say when
--                           a run began, and "started 20 minutes ago" was
--                           always blank.
--
--   routes.attendant        fromRoute() defaults it to "—" for every route,
--                           so the attendant column was permanently empty.
--
-- Idempotent: safe to run more than once.
-- ==========================================================================

begin;

alter table recent_fees add column if not exists fee_type text;
alter table routes      add column if not exists started_at timestamptz;
alter table routes      add column if not exists completed_at timestamptz;
alter table routes      add column if not exists attendant text;

-- Existing receipts predate the column and have no category recorded.
-- 'term1' is what the UI was already showing them as, so this changes
-- nothing on screen — it just makes the stored value match the display
-- instead of relying on a fallback.
update recent_fees set fee_type = 'term1' where fee_type is null;

-- Receipts are filtered and grouped by category on the Fees and Reports
-- screens.
create index if not exists idx_recent_fees_fee_type on recent_fees (tenant, fee_type);

commit;

-- ==========================================================================
-- Verification
--
--   select column_name from information_schema.columns
--    where table_name = 'routes' and column_name in
--          ('started_at','completed_at','attendant');
--
--   select fee_type, count(*) from recent_fees group by fee_type;
-- ==========================================================================
