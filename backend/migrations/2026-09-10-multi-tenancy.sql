-- ==========================================================================
-- Sirah CRM · multi-tenancy migration   (2026-09-10)
--
-- One database, two institutions: the school and the college. Every data
-- table gains a `tenant` column and no row is ever shared between them.
--
-- Enforcement lives in the application layer, in the from() wrapper in
-- backend/lib/supabase.js: every read filters on tenant, every write
-- stamps it, and every upsert conflict target gains tenant as its first
-- column. This migration supplies what that wrapper needs from the
-- database — the column, the indexes that keep those filters fast, and
-- tenant-scoped keys so both institutions can hold the same natural key.
--
-- Idempotent: safe to run more than once.
-- ==========================================================================

begin;

-- ==========================================================================
-- 1 · tenant column on all 65 tables
--
-- Existing rows are adopted by the school, which is what they already
-- were before the college existed. The default stays in place so that a
-- write path we have missed fails safe into the school rather than into
-- a not-null violation in the middle of a request.
-- ==========================================================================
alter table students add column if not exists tenant text not null default 'school';
alter table pending_fees add column if not exists tenant text not null default 'school';
alter table recent_fees add column if not exists tenant text not null default 'school';
alter table complaints add column if not exists tenant text not null default 'school';
alter table enquiries add column if not exists tenant text not null default 'school';
alter table daily_logs add column if not exists tenant text not null default 'school';
alter table routes add column if not exists tenant text not null default 'school';
alter table audit_log add column if not exists tenant text not null default 'school';
alter table classes add column if not exists tenant text not null default 'school';
alter table activities add column if not exists tenant text not null default 'school';
alter table donors add column if not exists tenant text not null default 'school';
alter table campaigns add column if not exists tenant text not null default 'school';
alter table broadcasts add column if not exists tenant text not null default 'school';
alter table message_templates add column if not exists tenant text not null default 'school';
alter table recipient_lists add column if not exists tenant text not null default 'school';
alter table inventory add column if not exists tenant text not null default 'school';
alter table inventory_movements add column if not exists tenant text not null default 'school';
alter table staff add column if not exists tenant text not null default 'school';
alter table users add column if not exists tenant text not null default 'school';
alter table tasks add column if not exists tenant text not null default 'school';
alter table meetings add column if not exists tenant text not null default 'school';
alter table meeting_rsvps add column if not exists tenant text not null default 'school';
alter table volunteers add column if not exists tenant text not null default 'school';
alter table volunteer_hours add column if not exists tenant text not null default 'school';
alter table chat_threads add column if not exists tenant text not null default 'school';
alter table chat_messages add column if not exists tenant text not null default 'school';
alter table tc_requests add column if not exists tenant text not null default 'school';
alter table subjects add column if not exists tenant text not null default 'school';
alter table staff_awards add column if not exists tenant text not null default 'school';
alter table transport_attendance add column if not exists tenant text not null default 'school';
alter table teacher_attendance add column if not exists tenant text not null default 'school';
alter table exams add column if not exists tenant text not null default 'school';
alter table exam_marks add column if not exists tenant text not null default 'school';
alter table maintenance_logs add column if not exists tenant text not null default 'school';
alter table expenses add column if not exists tenant text not null default 'school';
alter table documents add column if not exists tenant text not null default 'school';
alter table donor_receipts add column if not exists tenant text not null default 'school';
alter table role_permissions add column if not exists tenant text not null default 'school';
alter table schools add column if not exists tenant text not null default 'school';
alter table app_settings add column if not exists tenant text not null default 'school';
alter table automation_rules add column if not exists tenant text not null default 'school';
alter table automation_runs add column if not exists tenant text not null default 'school';
alter table broadcast_recipients add column if not exists tenant text not null default 'school';
alter table timetable add column if not exists tenant text not null default 'school';
alter table library add column if not exists tenant text not null default 'school';
alter table library_loans add column if not exists tenant text not null default 'school';
alter table inventory_categories add column if not exists tenant text not null default 'school';
alter table syllabus add column if not exists tenant text not null default 'school';
alter table roles add column if not exists tenant text not null default 'school';
alter table user_permissions add column if not exists tenant text not null default 'school';
alter table custom_roles add column if not exists tenant text not null default 'school';
alter table role_feature_access add column if not exists tenant text not null default 'school';
alter table expense_categories add column if not exists tenant text not null default 'school';
alter table messages add column if not exists tenant text not null default 'school';
alter table donor_form_submissions add column if not exists tenant text not null default 'school';
alter table student_activities add column if not exists tenant text not null default 'school';
alter table remarks_rewards add column if not exists tenant text not null default 'school';
alter table government_documents add column if not exists tenant text not null default 'school';
alter table notifications add column if not exists tenant text not null default 'school';
alter table leave_requests add column if not exists tenant text not null default 'school';
alter table scale_sessions add column if not exists tenant text not null default 'school';
alter table scale_entries add column if not exists tenant text not null default 'school';
alter table scale_support_plans add column if not exists tenant text not null default 'school';
alter table scale_daily_rituals add column if not exists tenant text not null default 'school';
alter table expense_templates add column if not exists tenant text not null default 'school';

-- ==========================================================================
-- 2 · tenant indexes
--
-- Every query the app issues now carries `where tenant = ...`. Without
-- these, each one degrades into a sequential scan as row counts grow.
-- ==========================================================================
create index if not exists idx_students_tenant on students (tenant);
create index if not exists idx_pending_fees_tenant on pending_fees (tenant);
create index if not exists idx_recent_fees_tenant on recent_fees (tenant);
create index if not exists idx_complaints_tenant on complaints (tenant);
create index if not exists idx_enquiries_tenant on enquiries (tenant);
create index if not exists idx_daily_logs_tenant on daily_logs (tenant);
create index if not exists idx_routes_tenant on routes (tenant);
create index if not exists idx_audit_log_tenant on audit_log (tenant);
create index if not exists idx_classes_tenant on classes (tenant);
create index if not exists idx_activities_tenant on activities (tenant);
create index if not exists idx_donors_tenant on donors (tenant);
create index if not exists idx_campaigns_tenant on campaigns (tenant);
create index if not exists idx_broadcasts_tenant on broadcasts (tenant);
create index if not exists idx_message_templates_tenant on message_templates (tenant);
create index if not exists idx_recipient_lists_tenant on recipient_lists (tenant);
create index if not exists idx_inventory_tenant on inventory (tenant);
create index if not exists idx_inventory_movements_tenant on inventory_movements (tenant);
create index if not exists idx_staff_tenant on staff (tenant);
create index if not exists idx_users_tenant on users (tenant);
create index if not exists idx_tasks_tenant on tasks (tenant);
create index if not exists idx_meetings_tenant on meetings (tenant);
create index if not exists idx_meeting_rsvps_tenant on meeting_rsvps (tenant);
create index if not exists idx_volunteers_tenant on volunteers (tenant);
create index if not exists idx_volunteer_hours_tenant on volunteer_hours (tenant);
create index if not exists idx_chat_threads_tenant on chat_threads (tenant);
create index if not exists idx_chat_messages_tenant on chat_messages (tenant);
create index if not exists idx_tc_requests_tenant on tc_requests (tenant);
create index if not exists idx_subjects_tenant on subjects (tenant);
create index if not exists idx_staff_awards_tenant on staff_awards (tenant);
create index if not exists idx_transport_attendance_tenant on transport_attendance (tenant);
create index if not exists idx_teacher_attendance_tenant on teacher_attendance (tenant);
create index if not exists idx_exams_tenant on exams (tenant);
create index if not exists idx_exam_marks_tenant on exam_marks (tenant);
create index if not exists idx_maintenance_logs_tenant on maintenance_logs (tenant);
create index if not exists idx_expenses_tenant on expenses (tenant);
create index if not exists idx_documents_tenant on documents (tenant);
create index if not exists idx_donor_receipts_tenant on donor_receipts (tenant);
create index if not exists idx_role_permissions_tenant on role_permissions (tenant);
create index if not exists idx_schools_tenant on schools (tenant);
create index if not exists idx_app_settings_tenant on app_settings (tenant);
create index if not exists idx_automation_rules_tenant on automation_rules (tenant);
create index if not exists idx_automation_runs_tenant on automation_runs (tenant);
create index if not exists idx_broadcast_recipients_tenant on broadcast_recipients (tenant);
create index if not exists idx_timetable_tenant on timetable (tenant);
create index if not exists idx_library_tenant on library (tenant);
create index if not exists idx_library_loans_tenant on library_loans (tenant);
create index if not exists idx_inventory_categories_tenant on inventory_categories (tenant);
create index if not exists idx_syllabus_tenant on syllabus (tenant);
create index if not exists idx_roles_tenant on roles (tenant);
create index if not exists idx_user_permissions_tenant on user_permissions (tenant);
create index if not exists idx_custom_roles_tenant on custom_roles (tenant);
create index if not exists idx_role_feature_access_tenant on role_feature_access (tenant);
create index if not exists idx_expense_categories_tenant on expense_categories (tenant);
create index if not exists idx_messages_tenant on messages (tenant);
create index if not exists idx_donor_form_submissions_tenant on donor_form_submissions (tenant);
create index if not exists idx_student_activities_tenant on student_activities (tenant);
create index if not exists idx_remarks_rewards_tenant on remarks_rewards (tenant);
create index if not exists idx_government_documents_tenant on government_documents (tenant);
create index if not exists idx_notifications_tenant on notifications (tenant);
create index if not exists idx_leave_requests_tenant on leave_requests (tenant);
create index if not exists idx_scale_sessions_tenant on scale_sessions (tenant);
create index if not exists idx_scale_entries_tenant on scale_entries (tenant);
create index if not exists idx_scale_support_plans_tenant on scale_support_plans (tenant);
create index if not exists idx_scale_daily_rituals_tenant on scale_daily_rituals (tenant);
create index if not exists idx_expense_templates_tenant on expense_templates (tenant);

-- ==========================================================================
-- 3 · composite primary keys for natural-key tables
--
-- The school has a Class 1 and the college a Semester 1, and both are
-- row n = 1. Same story for route codes, settings keys, and the
-- attendance tables keyed by (student, date). Without the tenant in the
-- key, the second institution simply cannot be inserted.
-- ==========================================================================

-- classes: (n)  ->  (tenant, n)
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'classes_pkey') then
    alter table classes drop constraint classes_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'classes_pkey') then
    alter table classes add primary key (tenant, n);
  end if;
end $$;

-- app_settings: (section, key)  ->  (tenant, section, key)
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'app_settings_pkey') then
    alter table app_settings drop constraint app_settings_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'app_settings_pkey') then
    alter table app_settings add primary key (tenant, section, key);
  end if;
end $$;

-- routes: (code)  ->  (tenant, code)
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'routes_pkey') then
    alter table routes drop constraint routes_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'routes_pkey') then
    alter table routes add primary key (tenant, code);
  end if;
end $$;

-- inventory_categories: (key)  ->  (tenant, key)
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'inventory_categories_pkey') then
    alter table inventory_categories drop constraint inventory_categories_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inventory_categories_pkey') then
    alter table inventory_categories add primary key (tenant, key);
  end if;
end $$;

-- role_permissions: (role, feature_id)  ->  (tenant, role, feature_id)
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'role_permissions_pkey') then
    alter table role_permissions drop constraint role_permissions_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'role_permissions_pkey') then
    alter table role_permissions add primary key (tenant, role, feature_id);
  end if;
end $$;

-- daily_logs: (student_id, date)  ->  (tenant, student_id, date)
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'daily_logs_pkey') then
    alter table daily_logs drop constraint daily_logs_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'daily_logs_pkey') then
    alter table daily_logs add primary key (tenant, student_id, date);
  end if;
end $$;

-- transport_attendance: (student_id, date, direction)  ->  (tenant, student_id, date, direction)
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'transport_attendance_pkey') then
    alter table transport_attendance drop constraint transport_attendance_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transport_attendance_pkey') then
    alter table transport_attendance add primary key (tenant, student_id, date, direction);
  end if;
end $$;

-- meeting_rsvps: (meeting_id, from_email)  ->  (tenant, meeting_id, from_email)
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'meeting_rsvps_pkey') then
    alter table meeting_rsvps drop constraint meeting_rsvps_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'meeting_rsvps_pkey') then
    alter table meeting_rsvps add primary key (tenant, meeting_id, from_email);
  end if;
end $$;

-- ==========================================================================
-- 4 · unique (tenant, id) on every id-keyed table
--
-- The application wrapper rewrites an upsert conflict target of "id"
-- into "tenant,id", and Postgres needs a unique index matching the
-- target exactly. Adding it everywhere means any future upsert works
-- without a follow-up migration. `id` keeps its own primary key, so the
-- foreign keys pointing at users, students, inventory, custom_roles,
-- expense_categories and scale_sessions all stay intact.
-- ==========================================================================
create unique index if not exists uq_students_tenant_id on students (tenant, id);
create unique index if not exists uq_pending_fees_tenant_id on pending_fees (tenant, id);
create unique index if not exists uq_recent_fees_tenant_id on recent_fees (tenant, id);
create unique index if not exists uq_complaints_tenant_id on complaints (tenant, id);
create unique index if not exists uq_enquiries_tenant_id on enquiries (tenant, id);
create unique index if not exists uq_audit_log_tenant_id on audit_log (tenant, id);
create unique index if not exists uq_activities_tenant_id on activities (tenant, id);
create unique index if not exists uq_donors_tenant_id on donors (tenant, id);
create unique index if not exists uq_campaigns_tenant_id on campaigns (tenant, id);
create unique index if not exists uq_broadcasts_tenant_id on broadcasts (tenant, id);
create unique index if not exists uq_message_templates_tenant_id on message_templates (tenant, id);
create unique index if not exists uq_recipient_lists_tenant_id on recipient_lists (tenant, id);
create unique index if not exists uq_inventory_tenant_id on inventory (tenant, id);
create unique index if not exists uq_inventory_movements_tenant_id on inventory_movements (tenant, id);
create unique index if not exists uq_staff_tenant_id on staff (tenant, id);
create unique index if not exists uq_users_tenant_id on users (tenant, id);
create unique index if not exists uq_tasks_tenant_id on tasks (tenant, id);
create unique index if not exists uq_meetings_tenant_id on meetings (tenant, id);
create unique index if not exists uq_volunteers_tenant_id on volunteers (tenant, id);
create unique index if not exists uq_volunteer_hours_tenant_id on volunteer_hours (tenant, id);
create unique index if not exists uq_chat_threads_tenant_id on chat_threads (tenant, id);
create unique index if not exists uq_chat_messages_tenant_id on chat_messages (tenant, id);
create unique index if not exists uq_tc_requests_tenant_id on tc_requests (tenant, id);
create unique index if not exists uq_subjects_tenant_id on subjects (tenant, id);
create unique index if not exists uq_staff_awards_tenant_id on staff_awards (tenant, id);
create unique index if not exists uq_teacher_attendance_tenant_id on teacher_attendance (tenant, id);
create unique index if not exists uq_exams_tenant_id on exams (tenant, id);
create unique index if not exists uq_exam_marks_tenant_id on exam_marks (tenant, id);
create unique index if not exists uq_maintenance_logs_tenant_id on maintenance_logs (tenant, id);
create unique index if not exists uq_expenses_tenant_id on expenses (tenant, id);
create unique index if not exists uq_documents_tenant_id on documents (tenant, id);
create unique index if not exists uq_donor_receipts_tenant_id on donor_receipts (tenant, id);
create unique index if not exists uq_schools_tenant_id on schools (tenant, id);
create unique index if not exists uq_automation_rules_tenant_id on automation_rules (tenant, id);
create unique index if not exists uq_automation_runs_tenant_id on automation_runs (tenant, id);
create unique index if not exists uq_broadcast_recipients_tenant_id on broadcast_recipients (tenant, id);
create unique index if not exists uq_timetable_tenant_id on timetable (tenant, id);
create unique index if not exists uq_library_tenant_id on library (tenant, id);
create unique index if not exists uq_library_loans_tenant_id on library_loans (tenant, id);
create unique index if not exists uq_syllabus_tenant_id on syllabus (tenant, id);
create unique index if not exists uq_roles_tenant_id on roles (tenant, id);
create unique index if not exists uq_user_permissions_tenant_id on user_permissions (tenant, id);
create unique index if not exists uq_custom_roles_tenant_id on custom_roles (tenant, id);
create unique index if not exists uq_role_feature_access_tenant_id on role_feature_access (tenant, id);
create unique index if not exists uq_expense_categories_tenant_id on expense_categories (tenant, id);
create unique index if not exists uq_messages_tenant_id on messages (tenant, id);
create unique index if not exists uq_donor_form_submissions_tenant_id on donor_form_submissions (tenant, id);
create unique index if not exists uq_student_activities_tenant_id on student_activities (tenant, id);
create unique index if not exists uq_remarks_rewards_tenant_id on remarks_rewards (tenant, id);
create unique index if not exists uq_government_documents_tenant_id on government_documents (tenant, id);
create unique index if not exists uq_notifications_tenant_id on notifications (tenant, id);
create unique index if not exists uq_leave_requests_tenant_id on leave_requests (tenant, id);
create unique index if not exists uq_scale_sessions_tenant_id on scale_sessions (tenant, id);
create unique index if not exists uq_scale_entries_tenant_id on scale_entries (tenant, id);
create unique index if not exists uq_scale_support_plans_tenant_id on scale_support_plans (tenant, id);
create unique index if not exists uq_scale_daily_rituals_tenant_id on scale_daily_rituals (tenant, id);
create unique index if not exists uq_expense_templates_tenant_id on expense_templates (tenant, id);

-- ==========================================================================
-- 5 · re-scope the pre-existing unique constraints
--
-- Each of these was global. A single unique email, subject name or
-- route code across the whole database would stop the college from
-- having an office@ address, an English paper, or a route RT-01 purely
-- because the school already does.
-- ==========================================================================

-- users: unique (email)  ->  (tenant, email)
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'users_email_key') then
    alter table users drop constraint users_email_key;
  end if;
end $$;
create unique index if not exists uq_users_tenant_email on users (tenant, email);

-- subjects: unique (name)  ->  (tenant, name)
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'subjects_name_key') then
    alter table subjects drop constraint subjects_name_key;
  end if;
end $$;
create unique index if not exists uq_subjects_tenant_name on subjects (tenant, name);

-- routes: unique (code)  ->  (tenant, code)
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'routes_code_unique') then
    alter table routes drop constraint routes_code_unique;
  end if;
end $$;
create unique index if not exists uq_routes_tenant_code on routes (tenant, code);

-- teacher_attendance: unique (teacher_id, date)  ->  (tenant, teacher_id, date)
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'teacher_attendance_teacher_id_date_key') then
    alter table teacher_attendance drop constraint teacher_attendance_teacher_id_date_key;
  end if;
end $$;
create unique index if not exists uq_teacher_attendance_tenant on teacher_attendance (tenant, teacher_id, date);

-- exam_marks: unique (exam_id, student_id)  ->  (tenant, exam_id, student_id)
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'exam_marks_exam_id_student_id_key') then
    alter table exam_marks drop constraint exam_marks_exam_id_student_id_key;
  end if;
end $$;
create unique index if not exists uq_exam_marks_tenant on exam_marks (tenant, exam_id, student_id);

-- user_permissions: unique (user_id, feature_name)  ->  (tenant, user_id, feature_name)
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'user_permissions_user_id_feature_name_key') then
    alter table user_permissions drop constraint user_permissions_user_id_feature_name_key;
  end if;
end $$;
create unique index if not exists uq_user_permissions_tenant on user_permissions (tenant, user_id, feature_name);

-- role_feature_access: unique (role_id, feature_name)  ->  (tenant, role_id, feature_name)
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'role_feature_access_role_id_feature_name_key') then
    alter table role_feature_access drop constraint role_feature_access_role_id_feature_name_key;
  end if;
end $$;
create unique index if not exists uq_role_feature_access_tenant on role_feature_access (tenant, role_id, feature_name);

-- scale_daily_rituals: unique (student_id, ritual_date)  ->  (tenant, student_id, ritual_date)
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'scale_daily_rituals_student_id_ritual_date_key') then
    alter table scale_daily_rituals drop constraint scale_daily_rituals_student_id_ritual_date_key;
  end if;
end $$;
create unique index if not exists uq_scale_daily_rituals_tenant on scale_daily_rituals (tenant, student_id, ritual_date);

-- pending_fees: unique (student_id, fee_type)  ->  (tenant, student_id, fee_type)
drop index if exists uq_pending_fees_student_feetype;
create unique index if not exists uq_pending_fees_tenant_student_feetype on pending_fees (tenant, student_id, fee_type) where student_id is not null;

commit;

-- ==========================================================================
-- Verification
--
--   -- every table carries the column
--   select table_name from information_schema.columns
--    where column_name = 'tenant' and table_schema = 'public'
--    order by table_name;
--
--   -- and every row is assigned to an institution
--   select tenant, count(*) from students group by tenant;
-- ==========================================================================
