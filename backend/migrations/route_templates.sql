-- =====================================================================
-- route_templates — master timetable table
-- =====================================================================
-- Separates the school's static schedule (R1-R6 from the master PDF)
-- from the live operational state in the existing `routes` table.
--
-- Templates: edited by admin/principal, source of truth for stops/times.
-- Routes:    spawned from templates via "Apply", carry today's run state
--            (status, attendant, current stop, arrivedAt timestamps).
--
-- Run this once via the Supabase SQL editor. Idempotent — re-running is
-- safe (uses IF NOT EXISTS / IF NOT EXISTS).
--
-- IMPORTANT: Step 3 (UNIQUE constraint on routes.code) will fail if
-- duplicate rows exist. Run Step 3a's cleanup query first if you see
-- the "could not create unique index" error.
-- =====================================================================

-- Step 1: the templates table itself
CREATE TABLE IF NOT EXISTS route_templates (
  code        text PRIMARY KEY,
  name        text NOT NULL,
  bus         text DEFAULT '—',
  direction   text NOT NULL CHECK (direction IN ('morning', 'evening')),
  trip_no     integer DEFAULT 1,
  active      boolean DEFAULT true,
  stops       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_route_templates_active    ON route_templates(active);
CREATE INDEX IF NOT EXISTS idx_route_templates_direction ON route_templates(direction);

-- Step 2: link live routes back to the template they came from. Nullable
-- because routes created free-hand (before templates) have no template.
-- ON DELETE SET NULL so archiving a template doesn't cascade-delete the
-- live route.
ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS template_id text;

-- Step 3a: clean up duplicate route codes BEFORE the unique constraint.
-- Keeps the lexicographically smallest ctid (oldest physical row) for
-- each code. Inspect first, then run the DELETE if you agree.
--
--   SELECT code, COUNT(*) FROM routes GROUP BY code HAVING COUNT(*) > 1;
--
--   DELETE FROM routes
--   WHERE ctid NOT IN (
--     SELECT MIN(ctid) FROM routes GROUP BY code
--   );

-- Step 3b: enforce uniqueness on routes.code (prevents the duplicate-R5
-- bug observed in prod). Uses DO block since IF NOT EXISTS isn't valid
-- on ADD CONSTRAINT in older Postgres.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'routes_code_unique'
  ) THEN
    ALTER TABLE routes ADD CONSTRAINT routes_code_unique UNIQUE (code);
  END IF;
END$$;
