"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";

// Top-bar notifications panel.
// Combines two streams:
//   1. Live alerts derived from current data (overdue fees, open complaints,
//      absentees today, low-stock items) — these are actionable.
//   2. Recent audit-log entries — the "recent activity" feed.
//
// Click an alert → jump to the relevant screen.

// Map a notification.type → icon name. New types map here as we add them.
const TYPE_ICONS = {
  parent_message: "send",
  donor_form:     "donors",
  leave_request:  "calendar",
  gov_doc_expiry: "warning",
  remark_reward:  "shield",
  transport:      "bus",
};
function iconForType(t) {
  return TYPE_ICONS[t] || "bell";
}

// Parse a donor "next touchpoint" string. Mirrors parseNextTouchpoint in
// Donors.jsx; kept local to avoid importing a screen component into the shell.
function parseDonorNext(raw) {
  const s = (raw || "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s*[·\-]\s*(.+))?$/);
  if (!m) return null;
  return { iso: `${m[1]}-${m[2]}-${m[3]}`, note: (m[4] || "").trim() };
}

export function buildAlerts(E) {
  const alerts = [];
  const overdueFees = (E.PENDING_FEES || []).filter((f) => f.overdue);
  const openComplaints = (E.COMPLAINTS || []).filter((c) => c.status === "Open");
  const lowStock = (E.INVENTORY || []).filter((i) => (i.onHand ?? 0) < (i.min ?? 0));
  const todayIso = new Date().toISOString().slice(0, 10);
  const todaysLogs = (E.DAILY_LOGS || []).filter((l) => l.date === todayIso);
  const absent = todaysLogs.filter((l) => l.attendance === "absent");

  if (overdueFees.length) {
    alerts.push({
      tone: "bad", icon: "fees", screen: "fees",
      title: `${overdueFees.length} overdue fee${overdueFees.length === 1 ? "" : "s"}`,
      sub: overdueFees.slice(0, 3).map((f) => f.name).join(" · "),
      ts: "now",
    });
  }
  if (openComplaints.length) {
    alerts.push({
      tone: "bad", icon: "complaint", screen: "complaints",
      title: `${openComplaints.length} open complaint${openComplaints.length === 1 ? "" : "s"}`,
      sub: openComplaints.slice(0, 3).map((c) => c.student || c.id).join(" · "),
      ts: "now",
    });
  }
  if (absent.length) {
    alerts.push({
      tone: "warn", icon: "users", screen: "academic",
      title: `${absent.length} student${absent.length === 1 ? "" : "s"} absent today`,
      sub: absent.slice(0, 3).map((l) => l.studentName).join(" · "),
      ts: "today",
    });
  }
  if (lowStock.length) {
    alerts.push({
      tone: "warn", icon: "box", screen: "inventory",
      title: `${lowStock.length} low-stock item${lowStock.length === 1 ? "" : "s"}`,
      sub: lowStock.slice(0, 3).map((i) => i.name).join(" · "),
      ts: "now",
    });
  }

  // Government documents nearing expiry / already expired. We surface
  // expired and <= 30d-out separately so the principal can triage.
  const govDocs = E.GOVERNMENT_DOCUMENTS || [];
  const now = new Date();
  const expiredDocs = [];
  const soonDocs = [];
  for (const d of govDocs) {
    if (!d.expiryDate) continue;
    const exp = new Date(`${d.expiryDate}T00:00:00`);
    if (Number.isNaN(exp.getTime())) continue;
    const days = Math.round((exp - now) / 86_400_000);
    if (days < 0)        expiredDocs.push({ d, days });
    else if (days <= 30) soonDocs.push({ d, days });
  }
  if (expiredDocs.length) {
    alerts.push({
      tone: "bad", icon: "warning", screen: "government_documents",
      title: `${expiredDocs.length} expired document${expiredDocs.length === 1 ? "" : "s"}`,
      sub: expiredDocs.slice(0, 3).map(({ d }) => d.title).join(" · "),
      ts: "now",
    });
  }
  if (soonDocs.length) {
    alerts.push({
      tone: "warn", icon: "warning", screen: "government_documents",
      title: `${soonDocs.length} document${soonDocs.length === 1 ? "" : "s"} expiring soon`,
      sub: soonDocs.slice(0, 3).map(({ d, days }) => `${d.title} · ${days}d`).join(" · "),
      ts: "30d",
    });
  }

  // Shared "today" anchor for every date-based reminder below.
  const todayMs = new Date(`${todayIso}T00:00:00`).getTime();
  const DAY = 86_400_000;

  // Helpers for the date-driven reminders that follow. `daysFromIso` accepts
  // either a YYYY-MM-DD or a full ISO timestamp and returns whole days from
  // today (negative = past, 0 = today, positive = future). Returns null if
  // the input isn't a parseable date.
  function daysFromIso(iso) {
    if (!iso) return null;
    const t = new Date(/T/.test(iso) ? iso : `${iso}T00:00:00`).getTime();
    if (Number.isNaN(t)) return null;
    return Math.round((t - todayMs) / DAY);
  }
  function tsLabel(days) {
    if (days < 0)  return `${Math.abs(days)}d ago`;
    if (days === 0) return "today";
    if (days === 1) return "tomorrow";
    return `in ${days}d`;
  }

  // ---------- Library loans: overdue + due ≤ 3 days ----------
  // Skip already-returned. Borrower side too: parents/teachers who see this
  // panel will see only their own loans because E is already scoped.
  const loanRem = [];
  for (const l of (E.LOANS || [])) {
    if (l.returnedAt) continue;
    const d = daysFromIso(l.dueAt);
    if (d == null) continue;
    if (d <= 3) loanRem.push({ l, days: d });
  }
  loanRem.sort((a, b) => a.days - b.days);
  const loanOverdue = loanRem.filter((r) => r.days < 0);
  const loanDueSoon = loanRem.filter((r) => r.days >= 0 && r.days <= 3);
  if (loanOverdue.length) {
    alerts.push({
      tone: "bad", icon: "book", screen: "library",
      title: `${loanOverdue.length} library loan${loanOverdue.length === 1 ? "" : "s"} overdue`,
      sub: loanOverdue.slice(0, 3).map((r) => `${r.l.borrowerName} · ${r.l.bookTitle}`).join(" · "),
      ts: tsLabel(loanOverdue[0].days),
    });
  }
  if (loanDueSoon.length) {
    alerts.push({
      tone: "warn", icon: "book", screen: "library",
      title: `${loanDueSoon.length} library loan${loanDueSoon.length === 1 ? "" : "s"} due soon`,
      sub: loanDueSoon.slice(0, 3).map((r) => `${r.l.borrowerName} · ${r.l.bookTitle} · ${tsLabel(r.days)}`).join(" · "),
      ts: tsLabel(loanDueSoon[0].days),
    });
  }

  // ---------- Tasks: overdue + due today/tomorrow (skip completed) ----------
  const taskRem = [];
  for (const t of (E.TASKS || [])) {
    const status = String(t.status || "").toLowerCase();
    if (status === "completed" || status === "done") continue;
    const d = daysFromIso(t.dueDate);
    if (d == null) continue;
    if (d <= 1) taskRem.push({ t, days: d });
  }
  taskRem.sort((a, b) => a.days - b.days);
  const taskOverdue = taskRem.filter((r) => r.days < 0);
  const taskSoon    = taskRem.filter((r) => r.days >= 0 && r.days <= 1);
  if (taskOverdue.length) {
    alerts.push({
      tone: "bad", icon: "check", screen: "tasks",
      title: `${taskOverdue.length} task${taskOverdue.length === 1 ? "" : "s"} overdue`,
      sub: taskOverdue.slice(0, 3).map((r) => r.t.title).join(" · "),
      ts: tsLabel(taskOverdue[0].days),
    });
  }
  if (taskSoon.length) {
    alerts.push({
      tone: "warn", icon: "check", screen: "tasks",
      title: `${taskSoon.length} task${taskSoon.length === 1 ? "" : "s"} due ${taskSoon[0].days === 0 ? "today" : "tomorrow"}`,
      sub: taskSoon.slice(0, 3).map((r) => r.t.title).join(" · "),
      ts: tsLabel(taskSoon[0].days),
    });
  }

  // ---------- Meetings within the next 7 days ----------
  const mtgRem = [];
  for (const m of (E.MEETINGS || [])) {
    const d = daysFromIso(m.scheduledAt);
    if (d == null) continue;
    if (d >= 0 && d <= 7) mtgRem.push({ m, days: d });
  }
  mtgRem.sort((a, b) => a.days - b.days);
  if (mtgRem.length) {
    alerts.push({
      tone: mtgRem[0].days === 0 ? "warn" : "warn",
      icon: "clock", screen: "meetings",
      title: `${mtgRem.length} meeting${mtgRem.length === 1 ? "" : "s"} ${mtgRem[0].days === 0 ? "today" : "this week"}`,
      sub: mtgRem.slice(0, 3).map((r) => `${r.m.title} · ${tsLabel(r.days)}`).join(" · "),
      ts: tsLabel(mtgRem[0].days),
    });
  }

  // ---------- Exams within the next 7 days ----------
  const examRem = [];
  for (const x of (E.EXAMS || [])) {
    const d = daysFromIso(x.date);
    if (d == null) continue;
    if (d >= 0 && d <= 7) examRem.push({ x, days: d });
  }
  examRem.sort((a, b) => a.days - b.days);
  if (examRem.length) {
    alerts.push({
      tone: "warn", icon: "reports", screen: "exams",
      title: `${examRem.length} exam${examRem.length === 1 ? "" : "s"} ${examRem[0].days === 0 ? "today" : "this week"}`,
      sub: examRem.slice(0, 3).map((r) => {
        const head = [r.x.cls, r.x.subject || r.x.name].filter(Boolean).join(" · ");
        return `${head || r.x.name || "Exam"} · ${tsLabel(r.days)}`;
      }).join(" · "),
      ts: tsLabel(examRem[0].days),
    });
  }

  // ---------- Transport maintenance: overdue + ≤30 days out ----------
  // Each maintenance log carries a `nextDueDate`. The legally-required
  // paperwork (insurance, FC, PUC) and service / repair items all share
  // this field, so a single block covers everything that can "expire" on
  // a bus. We keep only the LATEST log per (bus, type) — when a school
  // records the next service, the older log's nextDueDate is superseded.
  const TYPE_LABEL = {
    service:   "Service",
    fuel:      "Fuel",
    insurance: "Insurance",
    FC:        "Fitness (FC)",
    PUC:       "Pollution (PUC)",
    repair:    "Repair",
    tyre:      "Tyre",
    battery:   "Battery",
  };
  const latestByBusType = new Map();
  for (const m of (E.MAINTENANCE_LOGS || [])) {
    if (!m.nextDueDate) continue;
    const key = `${m.busNumber || ""}|${m.type || ""}`;
    const ts = new Date(m.createdAt || m.date || 0).getTime();
    const cur = latestByBusType.get(key);
    if (!cur || ts > cur._ts) latestByBusType.set(key, { ...m, _ts: ts });
  }
  const mntExpired = [];
  const mntSoon = [];
  for (const m of latestByBusType.values()) {
    const d = daysFromIso(m.nextDueDate);
    if (d == null) continue;
    if (d < 0)        mntExpired.push({ m, days: d });
    else if (d <= 30) mntSoon.push({ m, days: d });
  }
  mntExpired.sort((a, b) => a.days - b.days);
  mntSoon.sort((a, b) => a.days - b.days);
  if (mntExpired.length) {
    alerts.push({
      tone: "bad", icon: "bus", screen: "transport",
      title: `${mntExpired.length} bus maintenance overdue`,
      sub: mntExpired.slice(0, 3).map((r) =>
        `${r.m.busNumber || "—"} · ${TYPE_LABEL[r.m.type] || r.m.type || "Item"} · ${tsLabel(r.days)}`
      ).join(" · "),
      ts: tsLabel(mntExpired[0].days),
    });
  }
  if (mntSoon.length) {
    alerts.push({
      tone: "warn", icon: "bus", screen: "transport",
      title: `${mntSoon.length} bus item${mntSoon.length === 1 ? "" : "s"} due within 30 days`,
      sub: mntSoon.slice(0, 3).map((r) =>
        `${r.m.busNumber || "—"} · ${TYPE_LABEL[r.m.type] || r.m.type || "Item"} · ${tsLabel(r.days)}`
      ).join(" · "),
      ts: tsLabel(mntSoon[0].days),
    });
  }

  // ---------- Pending fees due within 3 days (overdue handled above) ----------
  const feeSoon = [];
  for (const f of (E.PENDING_FEES || [])) {
    if (f.overdue) continue;
    // f.due is a free-text field — pull the first YYYY-MM-DD we find.
    const iso = String(f.due || "").match(/(\d{4}-\d{2}-\d{2})/)?.[1];
    const d = daysFromIso(iso);
    if (d == null) continue;
    if (d >= 0 && d <= 3) feeSoon.push({ f, days: d });
  }
  feeSoon.sort((a, b) => a.days - b.days);
  if (feeSoon.length) {
    alerts.push({
      tone: "warn", icon: "fees", screen: "fees",
      title: `${feeSoon.length} fee payment${feeSoon.length === 1 ? "" : "s"} due soon`,
      sub: feeSoon.slice(0, 3).map((r) => `${r.f.name} · ${tsLabel(r.days)}`).join(" · "),
      ts: tsLabel(feeSoon[0].days),
    });
  }

  // ---------- Donor touchpoints (existing) — fires on the scheduled day,
  // nags for a week after (overdue), and gives a heads-up in the preceding
  // 3 days so the principal isn't surprised. Older / farther-out dates
  // stay silent.
  const reminders = [];
  for (const d of (E.DONORS || [])) {
    const parsed = parseDonorNext(d.next);
    if (!parsed) continue;
    const dueMs = new Date(`${parsed.iso}T00:00:00`).getTime();
    if (Number.isNaN(dueMs)) continue;
    const days = Math.round((dueMs - todayMs) / DAY);
    if (days > 3 || days < -7) continue;
    reminders.push({ d, parsed, days });
  }
  reminders.sort((a, b) => a.days - b.days);
  for (const { d, parsed, days } of reminders) {
    const ts = days === 0 ? "today" : days > 0 ? `in ${days}d` : `${Math.abs(days)}d ago`;
    alerts.push({
      tone: days < 0 ? "bad" : days === 0 ? "warn" : "warn",
      icon: "donors", screen: "donors",
      title: `Follow up with ${d.name}`,
      sub: parsed.note
        ? `${parsed.note} · ${new Date(`${parsed.iso}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`
        : `Touchpoint on ${new Date(`${parsed.iso}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`,
      ts,
    });
  }

  return alerts;
}

export default function NotificationsPanel({ E, role, setCurrent }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  // DB-backed notifications + unread counter. Polled every 30s so the
  // badge stays roughly live without web sockets. Resets when the
  // popover opens or a row is marked read.
  const [dbItems, setDbItems] = useState([]);
  const [dbUnread, setDbUnread] = useState(0);

  const alerts = useMemo(() => buildAlerts(E), [E]);
  const audit  = (E.AUDIT || []).slice(0, 8);
  const total  = alerts.length + dbUnread;

  async function refreshNotifications() {
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (j?.ok) {
        setDbItems(j.items || []);
        setDbUnread(j.unread || 0);
      }
    } catch {}
  }
  useEffect(() => {
    refreshNotifications();
    const t = setInterval(refreshNotifications, 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (open) refreshNotifications(); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function jump(screen) {
    if (screen && setCurrent) setCurrent(screen);
    setOpen(false);
  }

  async function dismiss(id) {
    setDbItems((items) => items.map((n) => n.id === id ? { ...n, isRead: true } : n));
    setDbUnread((u) => Math.max(0, u - 1));
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {}
  }
  async function dismissAll() {
    setDbItems((items) => items.map((n) => ({ ...n, isRead: true })));
    setDbUnread(0);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch {}
  }
  function handleDbClick(n) {
    // Best-effort screen routing from redirectUrl. We support
    // ?screen=foo[&...] which the topbar uses for in-app jumps.
    if (n.redirectUrl) {
      const m = String(n.redirectUrl).match(/screen=([a-z_]+)/i);
      if (m && m[1] && setCurrent) setCurrent(m[1]);
    }
    dismiss(n.id);
    setOpen(false);
  }

  const toneBg = (t) =>
    t === "bad"  ? "var(--bad-soft)"  :
    t === "warn" ? "var(--warn-soft)" :
                   "var(--ok-soft)";
  const toneInk = (t) =>
    t === "bad"  ? "var(--bad)"  :
    t === "warn" ? "var(--warn)" :
                   "var(--ok)";

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        className={`icon-btn ${total > 0 ? "has-dot" : ""}`}
        onClick={() => setOpen((s) => !s)}
        title={`Notifications${total ? ` (${total})` : ""}`}
        aria-label="Notifications"
      >
        <Icon name="bell" size={15} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute", right: 0, top: "calc(100% + 6px)",
            width: 380, maxHeight: 520, overflowY: "auto",
            background: "var(--card)", border: "1px solid var(--rule)",
            borderRadius: 12, padding: 0, zIndex: 200,
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <div style={{
            padding: "12px 14px", borderBottom: "1px solid var(--rule)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Notifications</div>
            {total > 0 && (
              <span style={{
                fontSize: 10, padding: "2px 7px", borderRadius: 5,
                background: "var(--accent-soft)", color: "var(--accent)",
                fontWeight: 600,
              }}>{total} live</span>
            )}
            {dbUnread > 0 && (
              <button
                onClick={dismissAll}
                style={{
                  marginLeft: "auto", background: "none", border: 0,
                  color: "var(--ink-3)", cursor: "pointer",
                  fontSize: 10.5, fontWeight: 500,
                }}
              >Mark all read</button>
            )}
          </div>

          {/* DB-backed notifications (parent messages, donor-form submissions,
              leave requests, gov-doc expiry alerts). Unread items show a
              dot; clicking either navigates via redirect_url or just
              marks the row read. */}
          {dbItems.length > 0 && (
            <div style={{ padding: "8px 6px", borderBottom: "1px solid var(--rule)" }}>
              <div style={{
                fontSize: 10, color: "var(--ink-4)", textTransform: "uppercase",
                letterSpacing: 0.6, fontWeight: 500, padding: "4px 10px 6px",
              }}>Inbox{dbUnread ? ` · ${dbUnread} unread` : ""}</div>
              {dbItems.slice(0, 8).map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleDbClick(n)}
                  style={{
                    display: "flex", gap: 10, padding: "9px 10px",
                    borderRadius: 8, cursor: "pointer",
                    transition: "background .12s",
                    opacity: n.isRead ? 0.65 : 1,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: 7,
                    background: n.isRead ? "var(--bg-2)" : "var(--accent-soft)",
                    color: n.isRead ? "var(--ink-3)" : "var(--accent)",
                    display: "grid", placeItems: "center", flexShrink: 0,
                  }}>
                    <Icon name={iconForType(n.type)} size={13} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: n.isRead ? 400 : 500, color: "var(--ink)" }}>{n.title}</div>
                    {n.description && (
                      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {n.description}
                      </div>
                    )}
                  </div>
                  {!n.isRead && (
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: "var(--accent)", flexShrink: 0,
                      alignSelf: "center",
                    }} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Live alerts */}
          {alerts.length > 0 && (
            <div style={{ padding: "8px 6px" }}>
              <div style={{
                fontSize: 10, color: "var(--ink-4)", textTransform: "uppercase",
                letterSpacing: 0.6, fontWeight: 500, padding: "4px 10px 6px",
              }}>Needs attention</div>
              {alerts.map((a, i) => (
                <div
                  key={i}
                  onClick={() => jump(a.screen)}
                  style={{
                    display: "flex", gap: 10, padding: "9px 10px",
                    borderRadius: 8, cursor: "pointer",
                    transition: "background .12s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: 7,
                    background: toneBg(a.tone), color: toneInk(a.tone),
                    display: "grid", placeItems: "center", flexShrink: 0,
                  }}>
                    <Icon name={a.icon} size={13} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink)" }}>{a.title}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {a.sub}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, color: "var(--ink-4)", whiteSpace: "nowrap" }}>{a.ts}</span>
                </div>
              ))}
            </div>
          )}

          {/* Recent activity (audit log) */}
          <div style={{ padding: "8px 6px", borderTop: alerts.length ? "1px solid var(--rule)" : "none" }}>
            <div style={{
              fontSize: 10, color: "var(--ink-4)", textTransform: "uppercase",
              letterSpacing: 0.6, fontWeight: 500, padding: "4px 10px 6px",
            }}>Recent activity</div>
            {audit.length === 0 ? (
              <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--ink-3)" }}>
                No activity yet. Things you do (admit a student, take a fee, send a broadcast) will show up here.
              </div>
            ) : (
              audit.map((a, i) => (
                <div key={a.id || i} style={{
                  display: "flex", gap: 10, padding: "8px 10px",
                  borderRadius: 8,
                }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: 7,
                    background: "var(--bg-2)", color: "var(--ink-3)",
                    display: "grid", placeItems: "center", flexShrink: 0,
                  }}>
                    <Icon name="audit" size={12} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      <span style={{ fontWeight: 500, color: "var(--ink)" }}>{a.who}</span>{" — "}{a.action}
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {a.entity}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, color: "var(--ink-4)", whiteSpace: "nowrap" }}>{a.when}</span>
                </div>
              ))
            )}
          </div>

          <div style={{
            padding: "8px 14px", borderTop: "1px solid var(--rule)",
            fontSize: 11, color: "var(--ink-3)",
            display: "flex", justifyContent: "space-between",
          }}>
            <span>Auto-refreshes with the data</span>
            {role !== "parent" && (
              <button
                onClick={() => jump("audit")}
                style={{ background: "none", border: 0, color: "var(--accent)", cursor: "pointer", fontSize: 11, fontWeight: 500 }}
              >
                Open audit log →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
