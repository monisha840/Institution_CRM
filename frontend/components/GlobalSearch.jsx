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


// Recently opened records, per browser. Purely a client-side convenience —
// nothing is sent anywhere, and the list is capped so it stays scannable.
const RECENTS_KEY = "sirahcrm.search.recents";
const RECENTS_MAX = 5;

function readRecents() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
    return Array.isArray(raw) ? raw.slice(0, RECENTS_MAX) : [];
  } catch { return []; }
}

function pushRecent(item) {
  try {
    const next = [
      { type: item.type, id: item.id, title: item.title, sub: item.sub },
      ...readRecents().filter((r) => !(r.type === item.type && r.id === item.id)),
    ].slice(0, RECENTS_MAX);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {}
}

// Result row — shared by recents and live matches so both read identically.
function ResultRow({ item, meta, active, onHover, onPick }) {
  return (
    <button
      type="button"
      className={`gs-row ${active ? "active" : ""}`}
      onMouseEnter={onHover}
      onClick={onPick}
      role="option"
      aria-selected={active}
    >
      <span className="gs-ico" aria-hidden="true">
        <Icon name={meta.icon || "search"} size={13} />
      </span>
      <span className="gs-text">
        <span className="gs-title">{item.title}</span>
        {item.sub ? <span className="gs-sub">{item.sub}</span> : null}
      </span>
      <span className="gs-type">{meta.label || item.type}</span>
    </button>
  );
}

export default function GlobalSearch({ E, role, setCurrent, onPickItem, placeholder, modKey = "Ctrl ", quickActions = [] }) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recents, setRecents] = useState([]);
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

  // Recents are read on open so a record opened elsewhere this session is
  // already in the list the next time the palette appears.
  useEffect(() => { if (open) setRecents(readRecents()); }, [open]);
  useEffect(() => { setActive(0); }, [query]);

  const searching = Boolean(query.trim());
  // One flat keyboard list across whichever sections are on screen.
  const rows = searching
    ? results.map((it) => ({ kind: "result", it }))
    : [
        ...recents.map((it) => ({ kind: "result", it })),
        ...quickActions.map((a) => ({ kind: "action", a })),
      ];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Cmd/Ctrl+F focuses the palette (preventing browser find — appropriate
  // for an app where in-app search is the primary expectation). Cmd/Ctrl+K
  // is deliberately left alone: it already opens the display-settings panel.
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
    pushRecent(it);
    // Prefer the deep-linking callback when supplied — it both navigates AND
    // passes the focus (type + id) so the destination screen can open the
    // relevant detail (e.g. ProfileModal for a student).
    if (onPickItem) {
      onPickItem({ screen: meta?.screen, type: it.type, id: it.id, title: it.title });
    } else if (meta?.screen && setCurrent) {
      setCurrent(meta.screen);
    }
    setOpen(false);
    setQuery("");
  }

  function runRow(row) {
    if (!row) return;
    if (row.kind === "action") { setOpen(false); setQuery(""); row.a.onSelect?.(); }
    else pick(row.it);
  }

  function onInputKey(e) {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(rows.length - 1, a + 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === "Enter")     { e.preventDefault(); runRow(rows[active]); }
  }

  const recentCount = searching ? 0 : recents.length;

  return (
    <div ref={wrapRef} className="topbar-search" style={{ position: "relative" }} onClick={() => inputRef.current?.focus()}>
      <Icon name="search" size={14} />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onInputKey}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-controls="global-search-results"
        aria-autocomplete="list"
      />
      {!open && <span className="kbd">{modKey}F</span>}

      {open && (
        <div className="gs-panel" id="global-search-results" role="listbox">
          {/* Nothing typed yet: recents plus the same quick-create actions the
              top bar offers, so the palette is useful before the first keystroke. */}
          {!searching && (
            <>
              {recents.length > 0 && (
                <>
                  <div className="gs-label">Recent</div>
                  {recents.map((it, i) => (
                    <ResultRow
                      key={`r-${it.type}-${it.id}-${i}`}
                      item={it}
                      meta={TYPE_META[it.type] || {}}
                      active={active === i}
                      onHover={() => setActive(i)}
                      onPick={() => pick(it)}
                    />
                  ))}
                </>
              )}
              {quickActions.length > 0 && (
                <>
                  <div className="gs-label">Quick actions</div>
                  {quickActions.map((a, i) => {
                    const idx = recentCount + i;
                    return (
                      <button
                        type="button"
                        key={a.id}
                        className={`gs-row ${active === idx ? "active" : ""}`}
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => runRow({ kind: "action", a })}
                        role="option"
                        aria-selected={active === idx}
                      >
                        <span className="gs-ico" aria-hidden="true"><Icon name="plus" size={13} /></span>
                        <span className="gs-text">
                          <span className="gs-title">Create {a.label.toLowerCase()}</span>
                        </span>
                        <span className="gs-type">Action</span>
                      </button>
                    );
                  })}
                </>
              )}
              {recents.length === 0 && quickActions.length === 0 && (
                <div className="gs-hint">
                  Start typing to search across {index.length.toLocaleString("en-IN")} record
                  {index.length === 1 ? "" : "s"} you have access to.
                </div>
              )}
            </>
          )}

          {searching && results.length === 0 && (
            <div className="gs-hint">
              No matches for <b style={{ color: "var(--ink)" }}>&ldquo;{query}&rdquo;</b>.
              <div style={{ marginTop: 4 }}>Try a name, an id, a class, a status, a vendor or an activity.</div>
            </div>
          )}

          {searching && results.map((it, i) => (
            <ResultRow
              key={`${it.type}-${it.id}-${i}`}
              item={it}
              meta={TYPE_META[it.type] || {}}
              active={active === i}
              onHover={() => setActive(i)}
              onPick={() => pick(it)}
            />
          ))}

          <div className="gs-foot">
            <span>
              {searching
                ? `${results.length} match${results.length === 1 ? "" : "es"}`
                : `${index.length.toLocaleString("en-IN")} records indexed`}
            </span>
            <span className="gs-keys">
              <span className="kbd">&uarr;&darr;</span> navigate
              <span className="kbd">&crarr;</span> open
              <span className="kbd">esc</span> close
            </span>
          </div>
        </div>
      )}

      <style jsx>{`
        .gs-panel {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          right: 0;
          min-width: 320px;
          background: var(--card);
          border: 1px solid var(--rule);
          border-radius: var(--radius);
          box-shadow: var(--shadow-lg);
          padding: 5px;
          z-index: 200;
          max-height: 440px;
          overflow-y: auto;
          animation: gs-in 180ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes gs-in {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: none; }
        }
        .gs-label {
          padding: 8px 10px 5px;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--ink-4);
          font-weight: 600;
        }
        .gs-panel :global(.gs-row) {
          width: 100%;
          display: flex;
          gap: 10px;
          align-items: center;
          padding: 8px 10px;
          border-radius: var(--radius-xs);
          text-align: left;
          transition: background 120ms ease;
        }
        .gs-panel :global(.gs-row.active) { background: var(--card-2); }
        .gs-panel :global(.gs-ico) {
          width: 26px;
          height: 26px;
          border-radius: var(--radius-xs);
          background: var(--bg-2);
          color: var(--ink-3);
          display: grid;
          place-items: center;
          flex-shrink: 0;
        }
        .gs-panel :global(.gs-row.active .gs-ico) { background: var(--accent-soft); color: var(--accent); }
        .gs-panel :global(.gs-text) { flex: 1; min-width: 0; display: block; }
        .gs-panel :global(.gs-title) {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: var(--ink);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .gs-panel :global(.gs-sub) {
          display: block;
          font-size: 11px;
          color: var(--ink-3);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 1px;
        }
        .gs-panel :global(.gs-type) {
          font-size: 10px;
          padding: 2px 7px;
          border-radius: 999px;
          background: var(--bg-2);
          color: var(--ink-3);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 600;
          flex-shrink: 0;
        }
        .gs-hint {
          padding: 16px 12px;
          font-size: 12.5px;
          color: var(--ink-3);
          line-height: 1.55;
        }
        .gs-foot {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding: 9px 10px 4px;
          margin-top: 4px;
          border-top: 1px solid var(--rule-2);
          font-size: 11px;
          color: var(--ink-4);
        }
        .gs-keys { display: inline-flex; align-items: center; gap: 5px; }
        @media (max-width: 640px) {
          .gs-keys { display: none; }
          .gs-panel { min-width: 0; }
        }
      `}</style>
    </div>
  );
}
