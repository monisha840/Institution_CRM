# Sanfort International School · Vidyalaya360

A complete school CRM built for **Sanvi Educational & Charitable Trust**.
Five real roles, one login, one dashboard per role, every sensitive action
audited. Backend is Next.js 14 (App Router) with Supabase + a local
JSON file fallback so the app never goes down even if the cloud is
unreachable.

---

## 1. Roles & access model

| Role | Landing screen | What they can do |
|---|---|---|
| **Admin** | Trust → Overview | Everything. Trust-level finance, governance, settings, audit log, every school screen. |
| **Academic Director** | Dashboard | Academics-only: attendance, daily logs, exams & marks, classes, timetable, students, complaints. |
| **Principal** | Dashboard | School operations: fees, money, students, staff, transport, library, admissions, complaints, donors, volunteers, TC, meetings, reports. |
| **Teacher** | Class tracker (Academic) | Their assigned classes only: classroom log, parent chat, attendance, exams, library. |
| **Parent** | Home (Dashboard) | Read-only view of their child's academics, timetable, fees, transport, library. Can chat with assigned class teacher. |

- **Sidebar nav is per-role** ([frontend/components/Sidebar.jsx](frontend/components/Sidebar.jsx)) — each role sees only the modules they need, grouped into collapsible categories that persist their open/closed state per role to `localStorage`.
- **Admin permission overrides** — Admin can toggle individual modules off for any role from the *Access control* screen; missing entries default to allowed so new screens stay visible.
- **JWT sessions** (`jose`) with bcrypt password hashes. Edge middleware gates every page. Static asset extensions (`.png`, `.css`, …) are whitelisted so the school logo loads on `/login`.

---

## 2. Module catalogue

### Trust & finance (Admin)

- **Trust → Overview** — KPI strip (Students, Fee collection, Donations YTD, Transport) with a "Things needing attention" roll-up that lists pending fees and low-attendance students with one-click drill-downs to the relevant screen.
- **Finance / Money** — log expenses to the trust, see all transactions in one ledger.
- **Trust & Donors** — donor receipts (Cash / UPI / Bank), per-donor history, exportable summary with total donation amount in the export header.

### School operations (Admin · Principal · Academic Director)

#### Dashboard
- Time-aware greeting: *"Good evening, Rashmi."* — first name only, drawn from the user profile, refreshes when name changes.
- KPI cards (every card opens a popover with the underlying records).
- Quick links to whatever needs attention today.

#### Students
- Roster grouped by class, search, filter by status.
- **Add student** → triggers the Admission/Enquiry flow; not added directly here.
- **Inline phone edit** — pencil icon next to parent column opens a quick edit dialog (validates +country format).
- **Auto-archive on TC issue** — student row dims with a strikethrough and "Deactivated · TC issued" chip when their transfer certificate is issued. Financial history is preserved; only the active status changes.
- **Restore** moves an archived student back to active.

#### Classes
- Classes & sections setup screen (add/remove a class or section).
- **Assign class teacher** picker — choose a teacher account; the assignment cascades to the parent-chat scoping logic.

#### Timetable
- Per class-section grid, drag-and-drop slots, clash detection.
- **Add subject** — admin can add new subjects to the picker; subject list is persisted, not hardcoded.

#### Attendance
- Daily attendance per class. Bulk mark, single-tap toggle.
- Computes `attendance %` per student which feeds into KPIs and the Reports page.

#### Academic (Daily log / Class tracker)
- Per-student row of inline pills: **CW**, **HW**, **HG** (handwriting grade A+ → D).
- "Today's log" / "Edit log" modal for full-form entry: attendance, leave reason, classwork, homework, topics, behaviour, handwriting note, extra remarks.
- **Read-only for parents** — pills disabled with tooltip "Daily log is read-only for parents — only the class teacher can update this." API-side defence: POSTs from `parent` role return `403`.
- Monthly report PDF generation per class.
- Teacher-only **"Announce to class"** broadcast (WhatsApp / SMS / both).

#### Exams & Marks
- Create exams per class, enter marks per student, generate report cards.

#### Fees & UPI
- **Pending fees** list + collect flow with per-method behaviour:
  - **UPI**: shows a QR built from the school's stored UPI ID + payee name.
  - **Cash**: skips the QR step and marks paid directly.
  - **Bank** removed per design — only UPI + Cash.
- **Edit fee amount** before joining and after joining (pencil opens an amount editor).
- **Send payment QR** to parent via WhatsApp.
- **Parent online pay** route (`/api/fees/pay-online`) for parent-initiated UPI flow.
- **Auto-receipt** on payment with the school name, trust name, payment method, and cashier name.
- **Reminders** — bulk reminder sender that records the remind action in the audit log.
- **Parent fees view** is locally filtered so a parent only sees their own child's fees, never anyone else's.

#### Transfer certificates (TC)
- TC request → review → issue workflow.
- On issue, the linked student is auto-archived (cascades from `archiveStudent()`).
- Backfill helper available to archive existing students whose TCs were issued before the cascade was added.

#### Staff
- Roster, profile, awards, performance.
- **Performance is auto-computed** from attendance, students' performance under that teacher, and contribution metrics — `recomputeStaffPerformance()` runs on demand.
- **Awards** — admin can add or remove awards; each tracked with date and description.

#### Transport
- Routes, stops, vehicles.
- **Per-student transport attendance** with off-stop boarding support — students can board at a stop other than their assigned one without breaking their record.
- **Transport attendance history** screen for each student.

#### Inventory · Library · Complaints · Admissions · Meetings · Volunteers · Reports

- **Inventory** — categories, items, move stock between locations, audit trail of moves.
- **Library** — books CRUD + bulk import, loan tracking with overdue flags.
- **Complaints** — kanban-style status board, KPI popovers per status column.
- **Admissions / Enquiries** — kanban: New → Contacted → Visit → Converted → Lost.
  - **Drag freely between any non-converted states.**
  - **Confirmation dialog before Convert** — irreversible action, surfaced explicitly.
  - **Locked once Converted** — card shows a "Locked" chip and rejects further status changes.
  - **Conversion creates a parent login** with a temporary password sent via WhatsApp.
- **Meetings** — schedule, RSVP, agenda, minutes.
- **Volunteers** — sign-up tracking, hours logged.
- **Reports** — single page with KPI strip; **inline expandable rows** drill down (per-month school/trust split, donors per type, students per grade, etc.). PDF + CSV exports for everything.

### Communication & chat

#### Communication (broadcast)
- Templates, send to class / role / everyone, channel toggles (WhatsApp / SMS / both), audit-logged.

#### Chat (parent ↔ teacher)
- **Scoped strictly**:
  - Parent sees only the class teachers assigned to their child.
  - Teacher sees only the parents of students in their assigned classes.
- Threads keyed by `(parentId, teacherId, studentId)`, mirrored to file fallback so messages persist if Supabase is missing.
- File-store users normalised through `fromUser()` so `linkedClasses` is always populated — fixed an earlier 403/500 bug where the chat would reject sends because `linkedClasses` was undefined.

### Governance (Admin)

- **Audit log** — every sensitive action: financial writes, permission changes, automation runs, parent-facing messages. KPI tiles show all-time totals; the dropdown filters the recent-activity list and the export.
- **CSV export** with the standardised school header preamble — see *Cross-cutting* below.
- **Tasks** — assignable tasks across users (admin → anyone, anyone → self). Status board, audit trail.
- **Users & Roles** — directory of staff, students, parents. Filterable, exportable.
- **Settings** — Trust identity, finance (UPI ID + payee name, academic year, fee cycle, GST), communication (SMS provider, WhatsApp, email sender, office hours), security (MFA, session timeout, IP allowlist, backup). Admin-only.
- **Access control** — toggle individual modules on/off per role.
- **Automation** — rules + run log (currently scaffolded).

### My account (every role)

- Self-service profile editing.
- **Editable**: display name, email, password.
- **Read-only**: phone (lives on the staff/student record, admin-managed), role.
- **Email cascade** — changing your email mirrors to the linked staff row by old email; uniqueness enforced (DB + file). New JWT issued so sign-in continues without logging out.
- **Name cascade** — name change cascades to the staff row so leaderboards, class teacher pickers, and performance breakdowns all update.

---

## 3. Cross-cutting features

### Standardised exports
Every CSV download and printable PDF in the app shares one header preamble built by [csvHeaderLines()](backend/lib/export.js#L43):

```
# Sanfort International School
# Run by Sanvi Educational and Charitable Trust
# Reg No: …
# PAN / 80G: …
# Contact: …
#
# Report: <screen-specific title>
# Date range: <if any>
# Records: <count>
# Generated: <local timestamp>
# Generated by: <actor name>
# Powered by Vidyalaya360
```

Identity is read from `app_settings.trust` with a bundled fallback so exports always have a school name even before Settings has been filled in.

### Cloud + file fallback
Every read in [backend/lib/db.js](backend/lib/db.js) is implemented with `mergeXxx()` helpers that union Supabase rows with the file store, deduped by id. This is what makes expenses, donations, TCs, and other writes show up reliably on the dashboard regardless of which storage layer accepted them.

### Theming
- Brand **blue** `#1F3F8B` + accent **orange** `#E8530E` — sampled from the school logo.
- Fonts: **Manrope** (UI), **Fraunces** (display headings), **JetBrains Mono** (numbers, IDs, timestamps).
- Global bold rule (`body, body * { font-weight: 700 !important; }`) for an emphatic feel.
- Theme variables in [app/globals.css](app/globals.css); every screen uses `var(--brand)`, `var(--accent)`, `var(--ink)`, `var(--card)`, etc., so a future dark mode is one toggle away.
- Sidebar collapse state, theme, density all persist per user.

### KPI popovers
Across **14 screens** (Dashboard, Students, Classes, Timetable, TC, Library, Complaints, Admissions, Meetings, Volunteers, Reports, Tasks, Users & Roles, Audit, Automation) every KPI card opens a popover or inline-expand showing the underlying records that compose its number. No silent metrics.

### Branded login
- Two-pane login screen with feature highlights on the left and role picker → credential form on the right.
- Five role cards, each tinted with its own colour for glanceability.
- Demo credentials auto-fill when a role is picked (development convenience).

### Branded footer
- Pill-shaped "Designed & developed by **Sirah Digital**" credit anchored at the bottom of every authenticated screen.
- Gradient badge (brand blue → accent orange) on the left, ↗ glyph on the right that nudges on hover.
- Click anywhere on the pill → opens https://sirahdigital.in/ in a new tab.

---

## 4. Data architecture

- **Storage**: Supabase Postgres (primary) + `data/db.json` (file fallback). Every CRUD function tries Supabase first, then writes to file; reads union both.
- **Schema**: [backend/lib/schema.sql](backend/lib/schema.sql). Re-runnable (every statement is `if not exists`). Idempotent column adds via `alter table … add column if not exists` for installs that ran an earlier version.
- **Key tables**: `students`, `staff`, `users`, `pending_fees`, `recent` (paid fees), `daily_logs`, `enquiries`, `tc_requests`, `complaints`, `donors`, `expenses`, `meetings`, `volunteers`, `tasks`, `library_books`, `library_loans`, `inventory`, `routes`, `transport_attendance`, `staff_awards`, `audit`, `app_settings`, `automation_rules`.
- **Auth-related tables**: `users` (sign-in identity, unique email, password hash, role, linked_id) — links a parent to one student row or a teacher to one staff row.
- **Production rule**: students are never hard-deleted. Withdraw/TC sets `status='archived'` and stamps `archived_at`; financial history and audit log are preserved forever.

---

## 5. API surface

API routes live under [app/api/](app/api/). Most match the screen name 1:1.

| Area | Endpoints |
|---|---|
| Auth | `/api/auth/login`, `/logout`, `/me`, `/profile` (GET + PATCH for self-service edit), `/seed` |
| Students | `/api/students`, `/students/import`, `/students/restore` |
| Fees | `/api/fees/add`, `/pay`, `/pay-online`, `/remind`, `/qr-image`, `/send-qr`, `/amount` |
| Academic | `/api/academic/log` (role-gated: parents `403`), `/academic/attendance` |
| Exams | `/api/exams`, `/exams/marks` |
| Staff | `/api/staff`, `/staff/awards`, `/staff/recompute`, `/teacher-attendance` |
| Communication | `/api/communication/broadcast`, `/template`, `/list`, `/campaigns`, `/parents/message` |
| Chat | `/api/chat` |
| Transport | `/api/transport/route`, `/board`, `/advance`, `/attendance` |
| Library | `/api/library/books`, `/loans`, `/books/import` |
| Inventory | `/api/inventory`, `/categories`, `/move` |
| Admissions | `/api/enquiries` |
| Complaints | `/api/complaints` |
| Donors | `/api/donors` |
| Volunteers | `/api/volunteers` |
| Meetings | `/api/meetings` |
| Tasks | `/api/tasks` |
| TC | `/api/tc` |
| Documents | `/api/documents`, `/documents/[id]` |
| Governance | `/api/audit` (via `/data`), `/permissions`, `/users`, `/settings`, `/timetable`, `/subjects`, `/classes`, `/expenses`, `/maintenance` |

All write endpoints log to the audit table so the Audit screen and exports stay accurate.

---

## 6. Tech stack

- **Framework**: Next.js 14.2.5 (App Router), React 18
- **Database**: Supabase (Postgres) with file-based fallback (`data/db.json`)
- **Auth**: bcrypt for password hashing, `jose` for JWT signing/verification, edge middleware for route protection
- **Styling**: CSS variables + scoped `<style jsx>` blocks; no Tailwind, no UI library
- **Fonts**: Manrope, Fraunces, JetBrains Mono (Google Fonts)
- **Icons**: Custom SVG icon set ([frontend/components/Icon.jsx](frontend/components/Icon.jsx))
- **Receipts**: Server-rendered HTML → printable; image receipts via [backend/lib/receipt-image.js](backend/lib/receipt-image.js)
- **Messaging**: WhatsApp via Evolution API (Sirah Messenger); SMS abstracted behind a provider config
- **Deployment**: standalone Next.js server, runs anywhere Node 18+ is available

---

## 7. Notable design decisions

- **Append, don't mutate**: every state-change is auditable; archived ≠ deleted.
- **Cloud + file dual-write**: the app keeps working through cloud outages.
- **Identity over connection strings**: Settings → Trust identity drives every export header so the app re-skins for a different school by editing one record.
- **Read-only by default for parents**: every screen the parent can see is read-only at the API layer, not just the UI.
- **No silent numbers**: every KPI tile drills down to its rows.
- **One login per person**: a parent with two children gets one account and one dashboard, scoped automatically.

---

*Generated 2026-04-30 · Vidyalaya360 build · Designed & developed by [Sirah Digital](https://sirahdigital.in/).*
