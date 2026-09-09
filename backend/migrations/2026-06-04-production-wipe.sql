-- Production-readiness wipe — Sanfort International School CRM
-- ============================================================
-- Removes all operational data the user entered during pre-launch testing
-- (students, fees, donors, expenses, attendance, communication history,
-- audit log, etc.) so the live school opens with a clean state.
--
-- PRESERVED (the user explicitly asked to keep these):
--   - library              (real book catalog)
--   - library_loans        (borrowing history)
--   - inventory_categories (custom category slugs they set up)
--   - users                (their real admin/principal/teacher logins —
--                           demo @school.com accounts can be deleted via
--                           the Users & Roles UI later)
--   - role_permissions     (their Access Control toggles)
--   - role_feature_access  (custom-role permissions)
--   - custom_roles         (any custom roles they defined)
--   - app_settings         (UPI ID, school name, parent contact numbers)
--   - subjects             (curriculum metadata)
--   - classes              (Class 1-8 + sections they configured)
--   - expense_categories   (custom expense category names)
--   - message_templates    (DLT-approved message templates)
--   - recipient_lists      (custom WhatsApp recipient lists)
--
-- ⚠️ THIS IS DESTRUCTIVE AND IRREVERSIBLE.
-- Before running:
--   1. Export a Supabase backup (Dashboard → Database → Backups → Download)
--   2. Read the full list of tables being wiped — make sure nothing
--      important to you is on it. If anything is, comment out that line.
--   3. Run in the Supabase SQL editor for ONE project at a time. Never
--      against a shared dev DB unless you've confirmed it's the right one.
--
-- After running, the dashboard KPIs will all read zero. As you onboard
-- real students/staff via the UI, those numbers populate from real data.

begin;

-- People + academics
delete from students;
delete from staff;
delete from staff_awards;
delete from daily_logs;
delete from teacher_attendance;
delete from transport_attendance;
delete from exams;
delete from exam_marks;
delete from tc_requests;
delete from student_activities;
delete from leave_requests;
delete from remarks_rewards;
delete from syllabus;
delete from timetable;

-- Finance
delete from pending_fees;
delete from recent_fees;
delete from expenses;
delete from donors;
delete from donor_receipts;
delete from donor_form_submissions;
delete from campaigns;

-- Operations
delete from routes;
delete from inventory;
delete from inventory_movements;
delete from maintenance_logs;
delete from complaints;
delete from enquiries;
delete from meetings;
delete from meeting_rsvps;
delete from volunteers;
delete from volunteer_hours;
delete from government_documents;
delete from tasks;
delete from automation_rules;
delete from automation_runs;

-- Communication (audit trail of past broadcasts + chats)
delete from broadcasts;
delete from broadcast_recipients;
delete from chat_threads;
delete from chat_messages;
delete from messages;
delete from notifications;

-- SCALE programme records
delete from scale_sessions;
delete from scale_entries;
delete from scale_support_plans;
delete from scale_daily_rituals;

-- Schools (multi-school trust setup, if you used it during testing)
delete from schools;

-- Audit log — fresh start so the production log only reflects live ops.
-- Keep this LAST in case anything above triggers an audit row.
delete from audit_log;

-- Documents (file attachments tied to wiped entities)
delete from documents;

-- ⚠️ NOT wiped — re-read the header. If you want to nuke any of these too,
-- uncomment carefully:
-- delete from users where email like '%@school.com';   -- demo accounts only
-- delete from message_templates;
-- delete from recipient_lists;
-- delete from expense_categories;
-- delete from custom_roles;
-- delete from role_feature_access;
-- delete from role_permissions;

commit;

-- Sanity-check counts after running. All of these should be 0.
select 'students'      as table_name, count(*) from students
union all select 'pending_fees', count(*) from pending_fees
union all select 'expenses',     count(*) from expenses
union all select 'donors',       count(*) from donors
union all select 'broadcasts',   count(*) from broadcasts
union all select 'audit_log',    count(*) from audit_log
-- These should be NON-zero (preserved):
union all select 'library (preserved)',         count(*) from library
union all select 'library_loans (preserved)',   count(*) from library_loans
union all select 'classes (preserved)',         count(*) from classes
union all select 'users (preserved)',           count(*) from users;
