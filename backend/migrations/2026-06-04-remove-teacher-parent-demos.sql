-- Remove the Teacher (Anita Kumar) and Parent demo accounts from
-- production Supabase. The Classes "Pick a teacher" dropdown reads
-- from the users table where role='teacher', so leaving Anita Kumar
-- alive made it look like the school had a teacher on staff when only
-- Salman (a real staff record) existed.
--
-- Safe to re-run — both DELETEs are idempotent.

begin;

-- By id (set by the dev seeder).
delete from users where id in ('USR-TEACHER', 'USR-PARENT');

-- Defensive: also match by email in case an older install used a
-- different id format.
delete from users where email in ('teacher@school.com', 'parent@school.com');

commit;

-- Sanity check — both queries should return 0.
select 'teacher@school.com'   as email, count(*) from users where email = 'teacher@school.com'
union all
select 'parent@school.com',           count(*) from users where email = 'parent@school.com';
