-- Subjects taught in each class (jsonb string array of subject names).
-- Example: ["English","Maths","Science","Tamil"]
alter table classes
  add column if not exists subjects jsonb default '[]'::jsonb;
