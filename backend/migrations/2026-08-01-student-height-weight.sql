    -- Latest height / weight snapshot for each student (class teachers update anytime).
    alter table students add column if not exists height_cm numeric(6,2);
    alter table students add column if not exists weight_kg numeric(6,2);
    alter table students add column if not exists measured_at timestamptz;
