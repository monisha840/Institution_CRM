-- Add a `direction` column to the routes table so each route is tagged as
-- a MORNING bus, an EVENING bus, or BOTH (some schools double a route on
-- the same vehicle, others run separate buses for AM and PM).
--
-- The student pickers (Admission + Edit Student modals) filter the route
-- dropdown by direction: morning picker shows routes where direction in
-- ('morning', 'both'), evening picker shows ('evening', 'both').
--
-- Default = 'both' so legacy rows pre-migration keep showing up in both
-- pickers without requiring an admin to re-tag each route. Safe to re-run.

alter table public.routes
  add column if not exists direction text not null default 'both';

-- Make sure existing rows are explicitly labelled 'both' even if the
-- default didn't take effect on the historical insert.
update public.routes set direction = coalesce(direction, 'both') where direction is null;

-- Hint PostgREST to reload its schema cache so the new column is
-- queryable without an API restart.
notify pgrst, 'reload schema';
