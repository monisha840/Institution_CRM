-- Assignee Yes/No answer + remarks on tasks (visible to Super Admin).
alter table tasks add column if not exists response text;
alter table tasks add column if not exists remarks text;
