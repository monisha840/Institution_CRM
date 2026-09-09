"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { formatClassLabel } from "@/lib/format";

// Cross-entity client-side search. Matches against the data already in memory
// (everything we render comes from `E`), so it's instantaneous and works
// while offline. Each result knows which screen to jump to via setCurrent.

const TYPE_META = {
  student:    { label: "Student",     icon: "students",  screen: "students" },
  fee:        { label: "Pending fee", icon: "fees",      screen: "fees" },
  paid:       { label: "Paid fee",    icon: "check",     screen: "fees" },
  staff:      { label: "Staff",       icon: "staff",     screen: "staff" },
  route:      { label: "Route",       icon: "bus",       screen: "transport" },
  inventory:  { label: "Inventory",   icon: "box",       screen: "inventory" },
  enquiry:    { label: "Admission",   icon: "enquiry",   screen: "enquiries" },
  complaint:  { label: "Complaint",   icon: "complaint", screen: "complaints" },
  donor:      { label: "Donor",       icon: "donors",    screen: "donors" },
  campaign:   { label: "Campaign",    icon: "send",      screen: "donors" },
  template:   { label: "Template",    icon: "mail",      screen: "communication" },
  klass:      { label: "Class",       icon: "book",      screen: "classes" },
  // v2 additions — keep this in sync with sidebar ids in Sidebar.jsx
  scale:      { label: "SCALE",       icon: "academic",  screen: "scale_report" },
  leave:      { label: "Leave",       icon: "calendar",  screen: "leave" },
  remark:     { label: "Remark",      icon: "shield",    screen: "remarks_rewards" },
  reward:     { label: "Reward",      icon: "shield",    screen: "remarks_rewards" },
  activity:   { label: "Activity",    icon: "academic",  screen: "student_activities" },
  govdoc:     { label: "Gov doc",     icon: "reports",   screen: "government_documents" },
  book:       { label: "Book",        icon: "book",      screen: "library" },
  loan:       { label: "Loan",        icon: "book",      screen: "library" },
  meeting:    { label: "Meeting",     icon: "clock",     screen: "meetings" },
  volunteer:  { label: "Volunteer",   icon: "users",     screen: "volunteers" },
  message:    { label: "Message",     icon: "send",      screen: "messages" },
  task:       { label: "Task",        icon: "check",     screen: "tasks" },
  expense:    { label: "Expense",     icon: "money",     screen: "money" },
  ritual:     { label: "Daily ritual", icon: "check",    screen: "scale_ritual" },
  exam:       { label: "Exam",        icon: "reports",   screen: "exams" },
  donorform:  { label: "Donor form",  icon: "donors",    screen: "donors" },
};

function buildIndex(E) {
  const out = [];
  const push = (type, id, title, sub) => {
    if (!title) return;
    out.push({ type, id: id || "", title: String(title), sub: String(sub || "") });
  };

  // ---- People ----
  (E.ADDED_STUDENTS || []).forEach((s) => push("student", s.id, s.name, `${s.id} · ${formatClassLabel(s.cls)} · ${s.parent || "—"}`));
  (E.STAFF          || []).forEach((s) => push("staff",   s.id, s.name, `${s.id} · ${s.role || "—"}${s.dept ? ` · ${s.dept}` : ""}`));
  (E.ENQUIRIES      || []).forEach((e) => push("enquiry", e.id, e.name, `${e.id} · ${e.cls ? formatClassLabel(`${e.cls}-A`) : "—"} · ${e.status}`));
  (E.VOLUNTEERS     || []).forEach((v) => push("volunteer", v.id, v.name || v.id, `${v.id}${v.role ? ` · ${v.role}` : ""}`));

  // ---- Money ----
  (E.PENDING_FEES   || []).forEach((f) => push("fee",     f.id, `₹${f.amount} pending — ${f.name}`, `${f.id} · ${formatClassLabel(f.cls)} · due ${f.due}`));
  (E.RECENT_FEES    || []).forEach((f) => push("paid",    f.id, `₹${f.amount} paid — ${f.name}`,    `${f.id} · ${f.method} · ${f.time}`));
  (E.EXPENSES       || []).forEach((e) => push("expense", e.id, `${e.category}${e.vendor ? ` · ${e.vendor}` : ""}`, `${e.id} · ₹${e.amount} · ${e.scope || "school"}${e.date ? ` · ${e.date}` : ""}`));
  (E.DONORS         || []).forEach((d) => push("donor",   d.id, d.name, `${d.id} · ${d.type || "—"} · ₹${d.ytd || 0} YTD`));
  (E.CAMPAIGNS      || []).forEach((c) => push("campaign", c.id, c.name, `${c.status || ""} · ${c.raised || 0}/${c.goal || 0}`));
  (E.DONOR_FORM_SUBMISSIONS || []).forEach((s) => push("donorform", s.id, s.donorName, `${s.id} · ${s.donationType || ""} · ${s.status}`));

  // ---- Operations ----
  (E.ROUTES     || []).forEach((r) => push("route",     r.code, `${r.code} — ${r.name}`, `Driver: ${r.driver || "—"}${r.bus ? ` · ${r.bus}` : ""}`));
  (E.INVENTORY  || []).forEach((i) => push("inventory", i.id, i.name, `${i.id} · ${i.category} · ${i.onHand} on hand`));
  (E.LIBRARY    || []).forEach((b) => push("book",      b.id, b.title, `${b.id} · ${b.author || "—"}${b.category ? ` · ${b.category}` : ""}${b.isbn ? ` · ISBN ${b.isbn}` : ""}`));
  (E.LOANS      || []).forEach((l) => push("loan",      l.id, `${l.bookTitle || l.bookId} → ${l.borrowerName || l.borrowerId}`, `${l.id} · ${l.returnedAt ? "returned" : "active"} · due ${l.dueAt || "—"}`));
  (E.MEETINGS   || []).forEach((m) => push("meeting",   m.id, m.title || m.subject || m.id, `${m.id} · ${m.date || ""}${m.attendees ? ` · ${m.attendees.length} attendees` : ""}`));

  // ---- Workflow ----
  (E.LEAVE_REQUESTS    || []).forEach((r) => push("leave", r.id, `Leave · ${r.requesterName || r.requesterId}`, `${r.id} · ${r.fromDate} → ${r.toDate} · ${r.approvalStatus}`));
  (E.REMARKS_REWARDS   || []).forEach((r) => {
    const type = r.type === "reward" ? "reward" : "remark";
    push(type, r.id, `${r.type === "reward" ? "Reward" : "Remark"} · ${r.targetType} ${r.targetId}`, `${r.id} · ${r.category || ""} · ${(r.description || "").slice(0, 60)}`);
  });
  (E.STUDENT_ACTIVITIES || []).forEach((a) => push("activity", a.id, a.activityName, `${a.id} · ${a.eventName || "—"} · ${a.achievementLevel || ""}${a.activityDate ? ` · ${a.activityDate}` : ""}`));
  (E.GOVERNMENT_DOCUMENTS || []).forEach((d) => push("govdoc", d.id, d.title, `${d.id} · ${d.documentType || "—"}${d.expiryDate ? ` · expires ${d.expiryDate}` : ""}`));
  (E.MESSAGES   || []).forEach((m) => push("message",  m.id, `Message: ${(m.message || "").slice(0, 50)}`, `${m.id} · ${m.senderRole}→${m.receiverRole}`));
  (E.TASKS      || []).forEach((t) => push("task",     t.id, t.title || t.id, `${t.id} · ${t.status || "—"}${t.assignedToName ? ` · ${t.assignedToName}` : ""}`));
  (E.SCALE_DAILY_RITUALS || []).forEach((r) => push("ritual", r.id, `Daily ritual · ${r.ritualDate}`, `${r.id} · ${(r.q1Learned || "").slice(0, 50)}`));

  // ---- Academics ----
  (E.COMPLAINTS || []).forEach((c) => push("complaint", c.id, c.student || c.id, `${c.id} · ${c.status} · ${(c.issue || "").slice(0, 60)}`));
  (E.TEMPLATES  || []).forEach((t) => push("template", t.id, t.name, `${t.channel || ""} · template`));
  (E.CLASSES    || []).forEach((c) => push("klass", `class-${c.n}`, c.label || formatClassLabel(String(c.n)), `Grade ${c.n}`));
  (E.EXAMS      || []).forEach((e) => push("exam", e.id, e.name || e.subject || e.id, `${e.id}${e.cls ? ` · ${formatClassLabel(e.cls)}` : ""}${e.date ? ` · ${e.date}` : ""}`));

  return out;
}

function scoreMatch(item, q) {
  const needle = q.toLowerCase();
  const inTitle = item.title?.toLowerCase().includes(needle);
  const inSub   = item.sub?.toLowerCase().includes(needle);
  const inId    = item.id?.toString().toLowerCase().includes(needle);
  if (!inTitle && !inSub && !inId) return -1;
  let s = 0;
  if (inTitle) s += 10;
  if (item.title?.toLowerCase().startsWith(needle)) s += 8;
  if (inId)    s += 5;
  if (inSub)   s += 1;
  return s;
}

export default function GlobalSearch({ E, role, setCurrent, onPickItem, placeholder }) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const index = useMemo(() => buildIndex(E), [E]);
  const results = useMemo(() => {
    if (!query.trim()) return [];
    return index
      .map((it) => ({ it, s: scoreMatch(it, query) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map((x) => x.it);
  }, [index, query]);

  useEffect(() => { setActive(0); }, [query]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Cmd/Ctrl+F focuses the input (preventing browser find — appropriate for an
  // app like this where global app-search is the primary expectation)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function pick(it) {
    const meta = TYPE_META[it.type];
    // Prefer the deep-linking callback when supplied — it both navigates
    // AND passes the focus (type + id) so the destination screen can open
    // the relevant detail (e.g. ProfileModal for a student).
    if (onPickItem) {
      onPickItem({ screen: meta?.screen, type: it.type, id: it.id, title: it.title });
    } else if (meta?.screen && setCurrent) {
      setCurrent(meta.screen);
    }
    setOpen(false);
    setQuery("");
  }

  function onInputKey(e) {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === "Enter" && results[active]) { e.preventDefault(); pick(results[active]); }
  }

  return (
    <div ref={wrapRef} className="topbar-search" style={{ position: "relative" }}>
      <Icon name="search" size={14} />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onInputKey}
        placeholder={placeholder}
      />

      {open && query.trim() && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
            background: "var(--card)", border: "1px solid var(--rule)",
            borderRadius: 12, padding: 4, zIndex: 200, maxHeight: 420, overflowY: "auto",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {results.length === 0 ? (
            <div style={{ padding: "16px 14px", fontSize: 12, color: "var(--ink-3)" }}>
              No matches for <b style={{ color: "var(--ink)" }}>“{query}”</b>. Try a name, id, class, status, vendor, or activity.
              <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 6 }}>
                Indexed: {index.length.toLocaleString("en-IN")} item{index.length === 1 ? "" : "s"} from your role's data
              </div>
            </div>
          ) : (
            results.map((it, i) => {
              const meta = TYPE_META[it.type] || {};
              const isActive = i === active;
              return (
                <div
                  key={`${it.type}-${it.id}-${i}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(it)}
                  style={{
                    display: "flex", gap: 10, alignItems: "center",
                    padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                    background: isActive ? "var(--bg-2)" : "transparent",
                  }}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: 7,
                    background: "var(--bg-2)", color: "var(--ink-3)",
                    display: "grid", placeItems: "center", flexShrink: 0,
                  }}>
                    <Icon name={meta.icon || "search"} size={13} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {it.title}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {it.sub}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, padding: "2px 7px", borderRadius: 5,
                    background: "var(--bg-2)", color: "var(--ink-3)",
                    textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 500,
                    flexShrink: 0,
                  }}>{meta.label || it.type}</span>
                </div>
              );
            })
          )}
          <div style={{
            display: "flex", justifyContent: "space-between", padding: "8px 10px 4px",
            borderTop: "1px dashed var(--rule)", marginTop: 4,
            fontSize: 10.5, color: "var(--ink-4)",
          }}>
            <span>{results.length ? `${results.length} match${results.length === 1 ? "" : "es"}` : "Type to search"}</span>
            <span>↑↓ navigate · ↵ open · esc close</span>
          </div>
        </div>
      )}
    </div>
  );
}
