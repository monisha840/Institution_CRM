-- Add evening-transport columns to the students table so each child can
-- have one route + stop for the morning trip and a separate one for the
-- evening trip. The existing `transport` + `pickup_stop` columns become
-- the MORNING fields by convention. Backward compatibility: rows where
-- the evening columns are null mean "no evening transport configured"
-- (or, in school-floor practice, the same route as morning) — the UI
-- treats null as "use morning".
--
-- Safe to re-run: `add column if not exists` is idempotent.

alter table public.students
  add column if not exists transport_evening text,
  add column if not exists pickup_stop_evening text;

-- Hint PostgREST to reload its schema cache so the new columns are
-- queryable without an API restart.
notify pgrst, 'reload schema';
