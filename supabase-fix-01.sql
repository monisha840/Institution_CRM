-- ============================================================================
-- Sirah_CRM — fix 01: columns the app writes but schema.sql never created
--
-- Paste into the Supabase SQL Editor and press Run. Safe to re-run.
-- ============================================================================
--
-- WHY THIS IS NEEDED
--
-- Creating an admission enquiry on the live site returned:
--     EROFS: read-only file system, open '/var/task/data/db.json'
--
-- The real cause was not the filesystem. app/api/enquiries/route.js sends
-- dob / age / street / city / pin with every enquiry, but the `enquiries`
-- table has none of those columns. PostgREST rejected the insert with
--     Could not find the 'age' column of 'enquiries' in the schema cache
-- and because that message matches /enquir/i, addEnquiry() treated it as
-- "table missing" and fell back to the JSON file store — which on Vercel is
-- a read-only filesystem, turning a recoverable error into a 500.
--
-- The code side is now hardened (addEnquiry strips unknown columns and
-- retries, and never falls back to the file store on a read-only mount).
-- This migration fixes the underlying gap so no data is silently dropped.

-- ---------- enquiries: admission-form fields ----------
-- PIN stays text so leading zeros survive; age is derived from dob at entry
-- time and stored alongside it because the form lets staff enter either.
alter table enquiries add column if not exists dob    date;
alter table enquiries add column if not exists age    int;
alter table enquiries add column if not exists street text;
alter table enquiries add column if not exists city   text;
alter table enquiries add column if not exists pin    text;

-- ---------- complaints: the parent-facing bucket ----------
-- backend/lib/db.js addComplaint() writes `category` (academic /
-- non_academic / transport) and supabase.js fromComplaint() reads it back.
-- Without the column the insert still succeeded — addComplaint strips
-- unknown columns and retries — but every complaint silently lost its
-- category, so the staff filter strip and CSV export had nothing to group by.
alter table complaints add column if not exists category text;

-- Tell PostgREST to reload its schema cache so the new columns are queryable
-- immediately rather than after its next refresh.
notify pgrst, 'reload schema';

-- ---------- subjects: credit hours (college mode) ----------
-- College mode computes a credit-weighted GPA on the Exams screen. Subjects
-- without a credit value are weighted as 1 by computeGpa() rather than 0, so
-- this column is an enhancement and never a prerequisite.
alter table subjects add column if not exists credits int default 4;

-- ---------- institution mode ----------
-- 'school' or 'college'. Read by backend/lib/institution.js and switchable
-- from Settings → Institution. Nothing is migrated when it changes: the same
-- records are simply presented with different vocabulary.
insert into app_settings (section, key, value)
values ('school', 'institutionType', '"school"')
on conflict (section, key) do nothing;

notify pgrst, 'reload schema';
