-- Migration: expense templates (quick-add tiles on the Money screen).
--
-- Each template is a reusable spec for a frequently-logged expense:
-- name + category + default amount + vendor + payment method + scope.
-- Clicking a template on the Money screen opens the existing
-- AddExpenseModal pre-filled, so the admin just confirms and saves.
-- The actual expense row still lands in `expenses` like any other —
-- templates don't auto-create anything; they're a UX shortcut.
--
-- Safe to re-run: every statement is idempotent.

create table if not exists expense_templates (
  id                     text primary key,
  name                   text not null,
  category               text not null,
  default_amount         int  not null default 0,
  default_vendor         text,
  default_payment_method text default 'Bank transfer',
  scope                  text not null default 'school',
  created_by             text,
  created_at             timestamptz default now()
);

create index if not exists idx_expense_templates_scope on expense_templates (scope);
