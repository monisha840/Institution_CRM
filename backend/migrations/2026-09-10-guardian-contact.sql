-- ==========================================================================
-- Sirah CRM · guardian contact details        (2026-09-10)
--
-- Gives students a real guardian phone and e-mail instead of leaving the
-- number buried in a free-form name.
--
-- Until now the only place a parent's number existed was inside the
-- `parent` text column, as a string like "Mr Suresh · 9876543210", and
-- every sender dug it back out with a regex (see parentPhoneOf() in
-- Communication.jsx and the fee-reminder route). That works right up until
-- someone types the name without a number, at which point fee reminders,
-- absence alerts and transport notifications all fail silently — no error,
-- no delivery.
--
-- The regex fallback stays in the application for rows that predate this
-- migration, so nothing breaks on the way through.
--
-- Idempotent: safe to run more than once.
-- ==========================================================================

begin;

alter table students add column if not exists parent_phone text;
alter table students add column if not exists parent_email text;
-- 'Father' | 'Mother' | 'Guardian' — printed on certificates and used to
-- address messages correctly rather than opening every one with "Dear Parent".
alter table students add column if not exists parent_relation text;

-- Backfill from the free-form name where a number is already sitting in it:
-- take the last 10 digits and keep it only if it looks like an Indian mobile.
update students
   set parent_phone = right(regexp_replace(parent, '\D', '', 'g'), 10)
 where parent_phone is null
   and length(regexp_replace(parent, '\D', '', 'g')) >= 10
   and right(regexp_replace(parent, '\D', '', 'g'), 10) ~ '^[6-9][0-9]{9}$';

-- Messaging reads by phone often enough to be worth an index.
create index if not exists idx_students_parent_phone on students (parent_phone);

commit;

-- ==========================================================================
-- Verification
--
--   select count(*) filter (where parent_phone is not null) as with_phone,
--          count(*) as total
--     from students;
-- ==========================================================================
