-- Per-subject classwork / homework on each daily log.
-- Shape: [{ "subject":"English", "classwork":"...", "classworkStatus":"completed",
--           "homework":"...", "homeworkStatus":"pending" }, ...]
alter table daily_logs
  add column if not exists subject_logs jsonb default '[]'::jsonb;
