# Vidyalaya360 · School CRM

Fullstack Next.js school ERP / CRM. Two pluggable persistence backends:
**Supabase** for production (Postgres + RLS) and a local **JSON file** for
zero-config dev. The app picks the backend at boot from environment variables.

**Stack:** Next.js 14 (App Router) · React 18 · `@supabase/supabase-js` · API
routes for every server-side write.

## Run (no Supabase, file backend)

```bash
npm install
npm run dev
```

Open http://localhost:3000. Data persists to `data/db.json`. Delete that file
to reset. The app starts empty — populate it through the UI.

## Run with Supabase

1. Create a free project at https://supabase.com.
2. In the Supabase dashboard, open **SQL editor** → paste `lib/schema.sql` →
   **Run**. Re-running is safe (every statement is `if not exists`).
3. Copy `.env.example` to `.env.local` and fill in:

   ```
   NEXT_PUBLIC_SUPABASE_URL        = https://YOURPROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY   = <anon public key>
   SUPABASE_SERVICE_ROLE_KEY       = <service_role key — server-only>
   ```

   Find them under **Project Settings → API**.

4. `npm run dev` — the API now reads/writes Supabase. Verify:

   ```bash
   curl -i http://localhost:3000/api/data | grep x-data-backend
   # x-data-backend: supabase
   ```

The service-role key bypasses RLS, so writes from the server work without an
auth-ed user. Don't expose it to the browser.

## What's in it

- **18 screens** across four roles — Super Admin (Trust / Schools / Donors /
  Users / Audit / Settings), Principal (Dashboard / Money / Fees / Students /
  Academic / Staff / Transport / Inventory / Comms / Admissions / Complaints /
  Automation), Teacher, Parent.
- **Desktop + iPhone frame** via the Tweaks panel (⌘K) or bottom-right toggle.
- **Live interactions wired to the backend** — every mutation appends to the
  audit log, regardless of backend:
  - Students: New admission · Import CSV · Remove · View profile
  - Fees & UPI: 3-step UPI flow · bulk WhatsApp/SMS reminders · CSV export
  - Academic: Log today (upserts on student+date) · Monthly report (CSV) · week picker
  - Complaints: Open → In Progress → Resolved
  - Admissions: New → Contacted → Converted (kanban)
  - Transport: per-stop boarded / absent
- New admission auto-creates a pending fee using a per-class schedule
  (`₹14,000 + class × ₹1,000`); paying the fee flips the student record.

## Layout

```
app/
  layout.jsx                 Root layout · Google Fonts
  page.jsx                   Server component · reads DB, passes data to AppShell
  globals.css                Design system (paper + warm cream + amber)
  api/
    data/route.js                 GET all data (sets x-data-backend header)
    fees/pay/route.js             POST mark fee paid
    fees/remind/route.js          POST bulk WhatsApp/SMS reminder
    complaints/route.js           PATCH status
    enquiries/route.js            PATCH status · POST new enquiry
    transport/board/route.js      POST board · absent
    students/route.js             POST new admission · DELETE remove
    students/import/route.js      POST CSV bulk import
    academic/log/route.js         POST upsert daily log
components/
  AppShell.jsx               Client shell · role + view + screen routing + topbar
  Sidebar.jsx                Role-based nav
  MobileShell.jsx            iPhone frame + bottom tab bar
  Tweaks.jsx                 ⌘K settings panel
  Icon.jsx                   Inline SVG icon set
  ui.jsx                     KPI, Sparkline, LineBarChart, BarChart, Ring, StatusChip, FakeQR, AvatarChip
  screens/                   One file per screen (18)
lib/
  db.js                      Unified async API — Supabase or JSON file based on env
  supabase.js                Supabase client + camelCase ↔ snake_case mappers
  schema.sql                 Run this in the Supabase SQL editor once
  format.js                  money / moneyK helpers (Indian locale)
  seed.js                    UI defaults + role definitions (no real data)
```

## Notes

- The UPI QR is a deterministic fake pattern drawn in SVG — no external image.
- Money is in `en-IN` locale with Lakh / Crore truncation.
- `data/` and `.env*.local` are git-ignored.
