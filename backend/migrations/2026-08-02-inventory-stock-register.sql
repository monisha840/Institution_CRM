-- Stock register fields (Sanfort Excel layout).
-- Balance stays on_hand (source of truth). qty_purchased / issued are tracked
-- separately and updated by stock-in / stock-out.

alter table inventory add column if not exists description text;
alter table inventory add column if not exists storage_location text;
alter table inventory add column if not exists qty_purchased numeric default 0;

-- Allow fractional qty (e.g. 8.4 L cleaning compound) and rupee amounts.
alter table inventory alter column on_hand type numeric using on_hand::numeric;
alter table inventory alter column issued type numeric using issued::numeric;
alter table inventory alter column min type numeric using min::numeric;
alter table inventory alter column unit_price type numeric using unit_price::numeric;

alter table inventory_movements add column if not exists issued_to text;
alter table inventory_movements alter column qty type numeric using qty::numeric;
