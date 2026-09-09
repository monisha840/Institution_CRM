-- Two new audit tables so every fee change and every transport
-- assignment lives in Supabase as a queryable row, not in a file on
-- the VPS. Both are append-only ledgers — never updated in place,
-- never deleted (except by an explicit admin SQL).

-- ----------------------------------------------------------------------
-- fee_edits
--   Records every change to a student's fees: raising the total,
--   logging an offline payment, undoing an edit, deleting a receipt.
--   The 1-hour Undo button uses the most recent NOT-reverted row per
--   student. Old rows survive forever as the audit trail.
-- ----------------------------------------------------------------------
create table if not exists public.fee_edits (
  id              text primary key,
  student_id      text not null,
  student_name    text,
  cls             text,
  action          text not null,        -- 'edit'|'undo'|'delete_receipt'
  amount_before   numeric(12, 2),       -- total fee before this change
  amount_after    numeric(12, 2),       -- total fee after this change
  paid_before     numeric(12, 2),
  paid_after      numeric(12, 2),
  receipt_id      text,                 -- recent_fees.id if action created / deleted a receipt
  actor_name      text,
  actor_role      text,
  created_at      timestamptz not null default now(),
  reverted_at     timestamptz           -- set when undone; null while live
);

create index if not exists fee_edits_student_idx on public.fee_edits (student_id, created_at desc);
create index if not exists fee_edits_created_idx on public.fee_edits (created_at desc);

-- ----------------------------------------------------------------------
-- transport_assignments
--   One row per student per direction (morning, evening) per change.
--   Active row = status='active' AND replaced_at IS NULL. When a
--   student is moved to a different route, the old row's status flips
--   to 'replaced' and a new 'active' row is inserted — full history
--   preserved.
-- ----------------------------------------------------------------------
create table if not exists public.transport_assignments (
  id              text primary key,
  student_id      text not null,
  student_name    text,
  cls             text,
  direction       text not null,        -- 'morning' | 'evening'
  route_code      text,                 -- route code, or null if cleared
  stop_name       text,
  assigned_at     timestamptz not null default now(),
  assigned_by     text,
  status          text not null default 'active', -- 'active' | 'replaced' | 'cleared'
  replaced_at     timestamptz,
  constraint transport_direction_check check (direction in ('morning','evening'))
);

create index if not exists transport_student_dir_idx on public.transport_assignments (student_id, direction, status);
create index if not exists transport_assigned_idx on public.transport_assignments (assigned_at desc);
create index if not exists transport_route_idx on public.transport_assignments (route_code, direction) where status = 'active';

-- Convenience view: current (active) transport assignments. Lets the
-- admin browse "who's on what route right now" as if it were a regular
-- table. The students table columns remain the source of truth for the
-- live app; this view is the audit-friendly mirror.
create or replace view public.current_transport_assignments as
select
  ta.student_id,
  ta.student_name,
  ta.cls,
  ta.direction,
  ta.route_code,
  ta.stop_name,
  ta.assigned_at,
  ta.assigned_by
from public.transport_assignments ta
where ta.status = 'active';

-- Hint PostgREST to reload its schema cache so the new tables are
-- queryable without an API restart.
notify pgrst, 'reload schema';
