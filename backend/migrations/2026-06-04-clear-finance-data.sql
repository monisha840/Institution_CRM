-- Clear finance + operational test data from production Supabase.
-- ================================================================
-- Run AFTER 2026-06-04-clear-students-only.sql. Wipes everything that
-- contributes to the Money / Dashboard / Reports KPI cards so the
-- school opens at a true zero state.
--
-- Wipes:
--   donors, donor_receipts, campaigns, donor_form_submissions
--   expenses
--   broadcasts, broadcast_recipients
--   inventory_movements (NOT the inventory items themselves — those
--     are physical assets like desks, projectors, etc. that the
--     school owns; only the movement history is junk test data)
--
-- Preserves:
--   inventory  (physical asset records — keep)
--   library, library_loans (real catalog)
--   staff (real staff like Salman)
--   classes, subjects, app_settings
--   admin / principal / accountant users
--   message_templates, recipient_lists
--
-- Safe to re-run.

begin;

-- Donations
delete from donor_receipts;
delete from donors;
delete from campaigns;
delete from donor_form_submissions;

-- School expenses
delete from expenses;

-- Past broadcasts + their per-recipient logs
delete from broadcast_recipients;
delete from broadcasts;

-- Inventory movement history (keeps the inventory items themselves)
delete from inventory_movements;

-- Trim audit_log entries that reference the wiped tables
delete from audit_log
 where action ilike '%expense%'
    or action ilike '%donation%'
    or action ilike '%donor%'
    or action ilike '%broadcast%'
    or action ilike '%campaign%'
    or action ilike '%inventory%';

commit;

-- Sanity check — all should be 0
select 'donors'                    as table_name, count(*) from donors
union all select 'donor_receipts',           count(*) from donor_receipts
union all select 'campaigns',                count(*) from campaigns
union all select 'expenses',                 count(*) from expenses
union all select 'broadcasts',               count(*) from broadcasts
union all select 'inventory_movements',      count(*) from inventory_movements
union all select 'library (preserved)',      count(*) from library
union all select 'staff (preserved)',        count(*) from staff
union all select 'classes (preserved)',      count(*) from classes
union all select 'inventory items (preserved)', count(*) from inventory;
