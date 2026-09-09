-- Clear all student data from production Supabase.
-- ==================================================
-- Removes the students roster + every row that hangs off a student
-- (fees, attendance, logs, marks, SCALE programme, parent logins, etc.)
-- while leaving everything NOT-student-related intact:
--   - Staff, donors, expenses, broadcasts, inventory  → untouched
--   - Library, library_loans, classes, subjects        → untouched
--   - Admin / principal / accountant user accounts     → untouched
--   - app_settings, role_permissions, custom_roles     → untouched
--
-- ⚠️ DESTRUCTIVE AND IRREVERSIBLE.
-- Before running:
--   1. Take a Supabase backup (Dashboard → Database → Backups → Download)
--   2. Read the full list of tables being wiped below — make sure
--      nothing important is on it
--   3. Run in the Supabase SQL editor for ONE project only
--
-- Safe to re-run — every DELETE is idempotent.

begin;

-- --- Records that reference students by id ---
-- These would become orphans if we only deleted from students. Wipe
-- them first so foreign-key constraints (if any are added later)
-- don't block the parent delete.

delete from pending_fees;
delete from recent_fees;
delete from daily_logs;
delete from transport_attendance;
delete from tc_requests;
delete from student_activities;
delete from exam_marks;

-- SCALE programme — every row scopes to a single student.
delete from scale_entries;
delete from scale_support_plans;
delete from scale_daily_rituals;
delete from scale_sessions;

-- Complaints — most are filed for a specific student; the table mixes
-- general complaints with leave-request submissions. If you also want
-- to keep general (non-student) complaints, comment this out and use
-- the more selective variant in the WHERE-clause version below.
delete from complaints;

-- Leave requests — student-scoped rows (parent-applied leave). If
-- staff leave requests also live in this table, comment this out
-- and use the WHERE variant.
delete from leave_requests;

-- Remarks & rewards — entries tagged to a student. Same caveat as
-- leave_requests if staff-recognition rows live alongside.
delete from remarks_rewards;

-- Notifications don't need an explicit delete here — the notifications
-- table has `user_id references users(id) on delete cascade`, so when
-- we delete parent users below, every notification tied to those
-- users (fee reminders, broadcast pings, etc.) goes with them.

-- --- Parent logins ---
-- Each imported student got one parent account. They're scoped to a
-- specific student via linkedId, so they're useless once the student
-- is gone. The new (2026-06-04) auto-provisioned emails end in
-- @sanfort.com; the older format ended in @school.local. Both
-- patterns are deleted defensively.
delete from users where role = 'parent';

-- --- The students themselves ---
delete from students;

-- --- Audit-log entries that only mention students ---
-- Optional — comment out if you want to preserve the audit trail of
-- past admissions / imports for compliance.
delete from audit_log
 where action ilike '%admission%'
    or action ilike '%bulk import%'
    or action ilike '%parent login%'
    or action ilike '%transfer certificate%';

commit;

-- Sanity-check counts after running. All should be 0.
select 'students'              as table_name, count(*) from students
union all select 'pending_fees',         count(*) from pending_fees
union all select 'recent_fees',          count(*) from recent_fees
union all select 'daily_logs',           count(*) from daily_logs
union all select 'transport_attendance', count(*) from transport_attendance
union all select 'tc_requests',          count(*) from tc_requests
union all select 'exam_marks',           count(*) from exam_marks
union all select 'scale_entries',        count(*) from scale_entries
union all select 'parent users',         count(*) from users where role = 'parent'
-- These should be NON-zero (preserved):
union all select 'library (preserved)',         count(*) from library
union all select 'staff (preserved)',           count(*) from staff
union all select 'classes (preserved)',         count(*) from classes
union all select 'admin users (preserved)',     count(*) from users where role != 'parent';
