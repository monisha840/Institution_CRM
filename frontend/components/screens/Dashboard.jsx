"use client";

import { useEffect, useState } from "react";
import Icon from "../Icon";
import { KPI, BarChart, LineBarChart, Ring, AvatarChip } from "../ui";
import QuickAccessRecent from "../QuickAccessRecent";
import AttendanceTodayCard from "../AttendanceTodayCard";
import { money, moneyK, formatClassLabel, feeTypeLabel, getWorkingDays, getHolidayDates, attendanceFromLogs } from "@/lib/format";

// Deferred current-time state. Returns 0 during SSR + the first client
// render, then flips to a real Date.now() after mount and ticks every
// `intervalMs` thereafter. Used to drive any relative-time labels on the
// dashboard without causing hydration mismatches — server and client
// both render the "now=0" branch initially, then the client re-renders
// with the live timestamp once hydration is safely past.
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

// Same deferred pattern for today's day-name. The Mon/Tue/Wed string is
// timezone-derived, so server-side (often UTC) and client-side (IST for
// this school) can disagree around midnight → hydration mismatch on the
// filtered timetable rows that depend on it. Returns "" on the first
// render; effect populates after mount.
function useTodayDayName() {
  const [day, setDay] = useState("");
  useEffect(() => {
    setDay(new Date().toLocaleDateString("en-US", { weekday: "short" }));
  }, []);
  return day;
}

export default function ScreenDashboard({ E, role, session, refresh, setCurrent, onOpenItem }) {
  const { KPIS, CLASS_STRENGTH, RECENT_FEES, PENDING_FEES, ACTIVITIES, ROUTES, INCOME_SERIES } = E;
  const isParent = role === "parent";
  const child = isParent ? (E.ADDED_STUDENTS || [])[0] : null;

  // Resolve the signed-in teacher's staff id. Prefer the authoritative
  // session.staffId resolved server-side in app/page.jsx (teachers don't
  // get the full STAFF list client-side, so client matching is unreliable).
  const mySid = (() => {
    if (isParent) return null;
    if (session?.staffId) return session.staffId;
    const lid = session?.linkedId || "";
    if (typeof lid === "string" && lid.startsWith("STF-")) return lid;
    if (session?.email) {
      const match = (E.STAFF || []).find((s) => (s.email || "").toLowerCase() === session.email.toLowerCase());
      if (match) return match.id;
    }
    return session?.id || null;
  })();

  // ----- "My library loans" surface -----
  // Anyone non-parent on the staff side gets a small loans card on their
  // dashboard if they currently have books out. Parents see their child's
  // loans inside ParentDashboard further down.
  const myLoans = mySid
    ? (E.LOANS || []).filter((l) =>
        !l.returnedAt && (l.borrowerType === "teacher" || l.borrowerType === "staff") && l.borrowerId === mySid)
    : [];

  // ----- "Today's schedule" surface -----
  // Teachers see periods they're teaching today; parents see their child's
  // class schedule for today. The day-name uses the same Mon/Tue/Wed
  // abbreviations the Timetable screen writes, so the filter lines up.
  // Deferred via useTodayDayName so SSR and the first client render both
  // see "" (empty filter result) — prevents hydration mismatch on the
  // rendered period list. The list re-populates after mount.
  const todayDayName = useTodayDayName();
  const teacherToday = mySid
    ? (E.TIMETABLE || [])
        .filter((t) => t.teacherId === mySid && t.day === todayDayName)
        .sort((a, b) => (a.period || 0) - (b.period || 0))
    : [];

  // ----- "My leave requests" surface -----
  // Teachers (and any staff who file leave) see a card on their dashboard
  // summarising the status of their recent requests so they don't have to
  // navigate to the Leave screen to check whether admin acted on them.
  // Match by session.sub OR session.staffId — leave requests created by a
  // teacher store requesterId = session.sub (the user id), but the same
  // person's staff record uses STF-…, so we accept both.
  const myUserId = session?.sub || session?.id || null;
  const myLeaveRequests = !isParent
    ? (E.LEAVE_REQUESTS || [])
        .filter((r) => r.requesterType === "teacher"
          && (r.requesterId === myUserId || r.requesterId === mySid))
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 5)
    : [];

  // Greeting + date string both depend on the client clock — computed after
  // mount to avoid SSR/CSR hydration mismatch.
  const [greet, setGreet] = useState("Hello");
  const [dateLabel, setDateLabel] = useState("");
  const [todayIso, setTodayIso] = useState("");
  useEffect(() => {
    const now = new Date();
    const h = now.getHours();
    setGreet(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
    setDateLabel(now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
    setTodayIso(now.toISOString().slice(0, 10));
  }, []);

  // First name from the signed-in user's profile, used in the greeting
  // ("Good morning, Rashmi"). Updates everywhere when the user renames
  // themselves on the My Account page (we re-issue the session JWT, so
  // session.name is current). Falls back to the full name or "there" for
  // edge cases (no name on the session, e.g. seeded demo accounts).
  const firstName = (() => {
    const raw = session?.name || "";
    const first = raw.trim().split(/\s+/)[0];
    return first || "there";
  })();

  // Parent dashboard is a focused view for one child — daily log, attendance,
  // transport, and announcements. It replaces the operations-style layout
  // that staff/admin see.
  if (isParent) {
    return (
      <ParentDashboard
        child={child}
        greet={greet}
        firstName={firstName}
        dateLabel={dateLabel}
        todayIso={todayIso}
        E={E}
        session={session}
        refresh={refresh}
        setCurrent={setCurrent}
      />
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">{dateLabel || "\u00A0"}</div>
          <div className="page-title">
            {greet}, <span className="amber">{firstName}</span>.
          </div>
          <div className="page-sub">
            {isParent
              ? "Your child's fees, attendance, and transport — all in one place."
              : "Your operating snapshot — fees, attendance, transport."}
          </div>
        </div>
      </div>

      <QuickAccessRecent role={role} session={session} onOpenItem={onOpenItem} />

      {(() => {
        const studentCount = (E.ADDED_STUDENTS || []).length;
        const collected = (RECENT_FEES || []).reduce((a, f) => a + (f.amount || 0), 0);
        const pendingTotal = (PENDING_FEES || []).reduce((a, f) => a + (f.amount || 0), 0);
        // Total fees expected from the school = paid + still-outstanding.
        // This is what every parent owes summed up; "Fees collected" is
        // the slice already received. Showing both is how an admin tells
        // at a glance whether collection is on track.
        const totalExpected = collected + pendingTotal;
        const pctCollected = totalExpected > 0 ? Math.round((collected / totalExpected) * 100) : 0;
        const studentsByClass = {};
        for (const s of (E.ADDED_STUDENTS || [])) {
          studentsByClass[s.cls] = (studentsByClass[s.cls] || 0) + 1;
        }
        // Today's student attendance snapshot (from daily logs).
        const attLogs = (E.DAILY_LOGS || []).filter((l) => l.date === todayIso);
        const attPresent = attLogs.filter((l) => ["present", "late", "parent_drop"].includes(l.attendance)).length;
        const attAbsent = attLogs.filter((l) => l.attendance === "absent").length;
        const attLeave = attLogs.filter((l) => l.attendance === "leave").length;
        const attMarked = attLogs.length;
        const attPct = attMarked ? Math.round((attPresent / attMarked) * 100) : null;
        return (
          <div className="grid g-4" style={{ marginBottom: 20 }}>
            <KPI
              label="Students" value={studentCount} sub="on roll"
              puck="mint" puckIcon="students"
              details={{
                title: `Students · ${studentCount} on roll`,
                sub: "Breakdown by class",
                items: Object.entries(studentsByClass)
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([cls, n]) => ({ label: formatClassLabel(cls), value: n, sub: `${n} student${n === 1 ? "" : "s"}` })),
              }}
            />
            <KPI
              label="Fees collected" value={moneyK(collected)}
              sub={
                totalExpected > 0
                  ? `of ${moneyK(totalExpected)} total · ${moneyK(pendingTotal)} pending · ${pctCollected}% collected`
                  : "no fees raised yet"
              }
              puck="peach" puckIcon="fees"
              details={{
                title: `Fees · ${moneyK(collected)} of ${moneyK(totalExpected)} expected`,
                sub: `${(RECENT_FEES || []).length} receipt${(RECENT_FEES || []).length === 1 ? "" : "s"} · ${moneyK(pendingTotal)} still outstanding · ${pctCollected}% collected`,
                items: (RECENT_FEES || []).slice(0, 8).map((f) => ({
                  label: `${f.name} · ${formatClassLabel(f.cls)}`,
                  value: `₹${(f.amount || 0).toLocaleString("en-IN")}`,
                  sub: `${f.method} · ${f.time}`,
                  tone: "ok",
                })),
              }}
            />
            <KPI
              label="Student attendance"
              value={attPct != null ? `${attPct}%` : "—"}
              sub={attMarked ? `${attPresent}/${attMarked} present today` : "not marked yet"}
              puck="cream" puckIcon="check"
              details={{
                title: `Attendance today · ${attPresent}/${attMarked} present`,
                sub: `${attAbsent} absent · ${attLeave} on leave · ${attMarked} marked`,
                items: attLogs
                  .filter((l) => l.attendance === "absent" || l.attendance === "leave")
                  .slice(0, 12)
                  .map((l) => ({ label: l.studentName || "—", value: l.attendance === "leave" ? "Leave" : "Absent", sub: formatClassLabel(l.cls), tone: "bad" })),
              }}
            />
            <KPI
              label="Buses" value={(E.ROUTES || []).length || 0}
              sub={(E.ROUTES || []).length ? "running" : "no routes"}
              puck="sky" puckIcon="bus"
              details={{
                title: `Transport · ${(E.ROUTES || []).length} bus${(E.ROUTES || []).length === 1 ? "" : "es"}`,
                sub: "Current run status by route",
                items: (E.ROUTES || []).map((r) => {
                  const stops = r.stops || [];
                  const cur = stops.find((s) => s.status === "current");
                  return {
                    label: `${r.code} · ${r.name}`,
                    value: r.status === "completed" ? "Done" : cur ? cur.name : (r.status || "Idle"),
                    sub: `${r.driver} · ${stops.length} stops`,
                  };
                }),
              }}
            />
          </div>
        );
      })()}

      {!isParent && <AttendanceTodayCard E={E} role={role} setCurrent={setCurrent} />}

      <div className="grid g-12" style={{ marginBottom: 20 }}>
        <div className="card col-12">
          <div className="card-head">
            <div>
              <div className="card-title">Money coming in, money going out</div>
              <div className="card-sub">Weekly · lakhs · April YTD</div>
            </div>
            <div className="card-actions">
              <span className="chip accent">
                <span className="dot" />
                Income
              </span>
              <span className="chip">
                <span className="dot" />
                Expense
              </span>
            </div>
          </div>
          <div className="card-body" style={{ padding: "10px 14px 14px" }}>
            <LineBarChart data={INCOME_SERIES} w={760} h={240} lineKeys={["inc"]} barKey="exp" palette={["var(--accent)"]} />
            {(() => {
              const incomeYtd = (RECENT_FEES || []).reduce((a, f) => a + (f.amount || 0), 0);
              const expenseYtd = 0;
              const surplus = incomeYtd - expenseYtd;
              const margin = incomeYtd > 0 ? Math.round((surplus / incomeYtd) * 100) : 0;
              return (
                <div style={{ display: "flex", gap: 28, paddingTop: 14, borderTop: "1px solid var(--rule-2)", marginTop: 8, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>Income YTD</div>
                    <div style={{ fontFamily: "var(--font-serif)", fontSize: 24, marginTop: 4, letterSpacing: "-0.02em" }}>{moneyK(incomeYtd)}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{(RECENT_FEES || []).length} fee receipt{(RECENT_FEES || []).length === 1 ? "" : "s"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>Expense YTD</div>
                    <div style={{ fontFamily: "var(--font-serif)", fontSize: 24, marginTop: 4, letterSpacing: "-0.02em" }}>{moneyK(expenseYtd)}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>not tracked yet</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>Net surplus</div>
                    <div style={{ fontFamily: "var(--font-serif)", fontSize: 24, marginTop: 4, letterSpacing: "-0.02em", color: "var(--ok)" }}>
                      {moneyK(surplus)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{incomeYtd > 0 ? `${margin}% margin` : "no income yet"}</div>
                  </div>
                  <div style={{ marginLeft: "auto", alignSelf: "center" }}>
                    <button className="btn sm">
                      <Icon name="link" size={12} />
                      Open ledger
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

      </div>

      {/* My bus routes — shown to teachers (and any staff) who are
          assigned as the attendant on one or more routes. Each card has
          the start / advance / finish controls so the teacher can drive
          the run from their own dashboard without going to Transport. */}
      {!isParent && (() => {
        const me = (session?.name || "").trim().toLowerCase();
        if (!me) return null;
        const myRoutes = (ROUTES || []).filter((r) => {
          const att = (r.attendant || "").trim().toLowerCase();
          return att && att !== "—" && att === me;
        });
        if (!myRoutes.length) return null;
        return (
          <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            {myRoutes.map((r) => (
              <TeacherBusRouteCard key={r.code} route={r} refresh={refresh} />
            ))}
          </div>
        );
      })()}

      {/* Live alerts strip — pulls from real data so the principal can act in one click */}
      {/* Today's teaching periods — shown to teachers (and any other staff
          who happen to be timetabled). Hidden when the schedule is empty. */}
      {!isParent && teacherToday.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <TodayScheduleCard
            title="Today's schedule"
            sub={`${teacherToday.length} period${teacherToday.length === 1 ? "" : "s"} · ${todayDayName}`}
            entries={teacherToday}
            mode="teacher"
          />
        </div>
      )}

      {/* Library loans I currently have out — only shown when staff actually
          has books on loan, so admin/principal dashboards stay uncluttered. */}
      {!isParent && myLoans.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <LibraryLoansCard
            title="My library loans"
            sub={`${myLoans.length} book${myLoans.length === 1 ? "" : "s"} currently on loan`}
            loans={myLoans}
          />
        </div>
      )}

      {/* My leave requests — visible to any non-parent who has filed leave.
          Surfaces the latest approve/reject decision so the teacher doesn't
          have to dig into the Leave screen to find out what happened. */}
      {!isParent && myLeaveRequests.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <MyLeaveCard
            title="My leave requests"
            sub={`${myLeaveRequests.length} recent request${myLeaveRequests.length === 1 ? "" : "s"}`}
            requests={myLeaveRequests}
          />
        </div>
      )}

      {!isParent && (() => {
        const todayIso = new Date().toISOString().slice(0, 10);
        const todaysLogs = (E.DAILY_LOGS || []).filter((l) => l.date === todayIso);
        const absentToday = todaysLogs.filter((l) => l.attendance === "absent");
        const lateStudents = todaysLogs.filter((l) => l.attendance === "late");
        const todaysTeacherAtt = (E.TEACHER_ATTENDANCE || []).filter((r) => r.date === todayIso);
        const lateTeachers = todaysTeacherAtt.filter((r) => r.status === "late");
        const pendingHomework = todaysLogs.filter((l) => l.homeworkStatus === "pending");
        const incompleteClasswork = todaysLogs.filter((l) => l.classworkStatus === "not_completed");
        const openComplaints = (E.COMPLAINTS || []).filter((c) => c.status === "Open");
        const overdueFees = (PENDING_FEES || []).filter((f) => f.overdue);
        const items = [
          openComplaints.length && { tone: "bad", icon: "complaint", title: `${openComplaints.length} pending complaint${openComplaints.length === 1 ? "" : "s"}`, sub: openComplaints.slice(0, 3).map((c) => c.student || "—").join(" · ") },
          absentToday.length      && { tone: "warn", icon: "users",     title: `${absentToday.length} student${absentToday.length === 1 ? "" : "s"} absent today`, sub: absentToday.slice(0, 3).map((l) => l.studentName).join(" · ") },
          lateStudents.length     && { tone: "warn", icon: "clock",     title: `${lateStudents.length} student${lateStudents.length === 1 ? "" : "s"} late today`, sub: lateStudents.slice(0, 3).map((l) => l.studentName).join(" · ") },
          lateTeachers.length     && { tone: "warn", icon: "clock",     title: `${lateTeachers.length} teacher${lateTeachers.length === 1 ? "" : "s"} late today`, sub: lateTeachers.slice(0, 3).map((r) => r.teacherName).join(" · ") },
          pendingHomework.length  && { tone: "warn", icon: "book",      title: `${pendingHomework.length} pending homework`, sub: pendingHomework.slice(0, 3).map((l) => l.studentName).join(" · ") },
          incompleteClasswork.length && { tone: "warn", icon: "pencil", title: `${incompleteClasswork.length} classwork not completed`, sub: incompleteClasswork.slice(0, 3).map((l) => l.studentName).join(" · ") },
          overdueFees.length      && { tone: "bad",  icon: "fees",      title: `${overdueFees.length} overdue fee${overdueFees.length === 1 ? "" : "s"}`, sub: overdueFees.slice(0, 3).map((f) => f.name).join(" · ") },
        ].filter(Boolean);
        if (items.length === 0) return null;
        return (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-head">
              <div><div className="card-title">Live alerts</div><div className="card-sub">{items.length} item{items.length === 1 ? "" : "s"} need attention</div></div>
            </div>
            <div>
              {items.map((it, i) => (
                <div key={i} className="lrow">
                  <div className={`act-ico ${it.tone}`}><Icon name={it.icon} size={13} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{it.title}</div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{it.sub || "—"}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="grid g-12" style={{ marginBottom: 20 }}>
        <div className="card col-5">
          <div className="card-head">
            <div>
              <div className="card-title">Transport · live boarding</div>
              <div className="card-sub">Morning run · 3 buses</div>
            </div>
            <span className="live-pill">
              <span className="pulse-dot" />
              Live
            </span>
          </div>
          <div>
            {ROUTES.length === 0 && (
              <div className="empty">No transport routes yet.</div>
            )}
            {ROUTES.map((r) => {
              const boarded = r.stops.reduce((a, s) => a + s.boarded, 0);
              const total = r.stops.reduce((a, s) => a + s.cap, 0);
              const absent = r.stops.reduce((a, s) => a + s.absent, 0);
              const pct = total ? Math.round((boarded / total) * 100) : 0;
              return (
                <div key={r.code} className="lrow">
                  <div className="school-puck" style={{ width: 36, height: 36, borderRadius: 10 }}>
                    <Icon name="bus" size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 500, fontSize: 13 }}>{r.code}</span>
                      <span style={{ fontSize: 13 }}>{r.name}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                      {r.driver} · {r.eta}
                    </div>
                  </div>
                  <div style={{ width: 90 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--ink-3)", marginBottom: 4 }}>
                      <span>
                        {boarded}/{total}
                      </span>
                      {absent > 0 && <span style={{ color: "var(--bad)" }}>{absent} abs</span>}
                    </div>
                    <div className="bar">
                      <span style={{ width: `${pct}%`, background: r.status === "delayed" ? "var(--warn)" : "var(--ok)" }} />
                    </div>
                  </div>
                  <span className={`chip ${r.status === "delayed" ? "warn" : "ok"}`}>
                    <span className="dot" />
                    {r.status === "delayed" ? "Late" : "On route"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card col-4">
          <div className="card-head">
            <div>
              <div className="card-title">Fees by class</div>
              <div className="card-sub">Paid vs pending · Classes 1–8</div>
            </div>
          </div>
          <div className="card-body" style={{ padding: "8px 6px" }}>
            <BarChart
              data={CLASS_STRENGTH}
              w={360}
              h={190}
              xKey="label"
              yKey="paid"
              yKey2="pending"
              labelFmt={(d) => `${d.paid}/${d.total}`}
              palette={["var(--accent)", "var(--rule-2)"]}
            />
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 12px 4px", borderTop: "1px solid var(--rule-2)", marginTop: 6 }}>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Avg collection</div>
              <div className="mono" style={{ fontSize: 13, fontWeight: 500 }}>
                {CLASS_STRENGTH.length && CLASS_STRENGTH.reduce((a, c) => a + c.total, 0)
                  ? Math.round((CLASS_STRENGTH.reduce((a, c) => a + c.paid, 0) / CLASS_STRENGTH.reduce((a, c) => a + c.total, 0)) * 100) + "%"
                  : "—"}
              </div>
            </div>
          </div>
        </div>

        <div className="card col-3">
          <div className="card-head">
            <div>
              <div className="card-title">Today</div>
              <div className="card-sub">28 April · 08:14</div>
            </div>
          </div>
          <div className="card-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, justifyItems: "center" }}>
            <div style={{ textAlign: "center" }}>
              <Ring pct={91} label="91%" sub="attend." color="var(--accent)" track="var(--rule-2)" />
            </div>
            <div style={{ textAlign: "center" }}>
              <Ring pct={87} label="87%" sub="h/work" color="var(--ok)" track="var(--rule-2)" />
            </div>
            <div style={{ textAlign: "center" }}>
              <Ring pct={68} label="68%" sub="fees" color="var(--peach-ink)" track="var(--rule-2)" />
            </div>
            <div style={{ textAlign: "center" }}>
              <Ring pct={92} label="38" sub="staff" color="var(--info)" track="var(--rule-2)" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid g-12">
        <div className="card col-5">
          <div className="card-head">
            <div>
              <div className="card-title">Recent fees</div>
              <div className="card-sub">Last 2 hours · auto-receipts sent</div>
            </div>
            <button className="btn sm ghost">
              View all <Icon name="chevronRight" size={11} />
            </button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Class</th>
                <th className="num">Amount</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {RECENT_FEES.length === 0 && (
                <tr><td colSpan={4} className="empty">No fees collected yet.</td></tr>
              )}
              {RECENT_FEES.slice(0, 6).map((f) => (
                <tr key={f.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <AvatarChip initials={f.name.split(" ").map((n) => n[0]).join("")} />
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 500 }}>{f.name}</div>
                        <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{f.id}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="chip">{formatClassLabel(f.cls)}</span>
                  </td>
                  <td className="num">{money(f.amount)}</td>
                  <td style={{ color: "var(--ink-3)", fontSize: 12 }}>{f.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card col-4">
          <div className="card-head">
            <div>
              <div className="card-title">Pending fees</div>
              <div className="card-sub">{PENDING_FEES.length} {PENDING_FEES.length === 1 ? "student" : "students"} · {moneyK(PENDING_FEES.reduce((a, f) => a + f.amount, 0))} outstanding</div>
            </div>
            <button className="btn sm">
              <Icon name="send" size={12} />
              Remind all
            </button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Student</th>
                <th className="num">Amount</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {PENDING_FEES.length === 0 && (
                <tr><td colSpan={3} className="empty">No pending fees.</td></tr>
              )}
              {PENDING_FEES.map((f) => (
                <tr key={f.id}>
                  <td>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>
                      {f.name}{" "}
                      <span style={{ color: "var(--ink-4)", fontWeight: 400, marginLeft: 4 }}>{formatClassLabel(f.cls)}</span>
                    </div>
                    <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{f.id}</div>
                  </td>
                  <td className="num">{money(f.amount)}</td>
                  <td>
                    {f.overdue ? (
                      <span className="chip bad">
                        <span className="dot" />
                        {f.due}
                      </span>
                    ) : (
                      <span className="chip warn">
                        <span className="dot" />
                        {f.due}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card col-3">
          <div className="card-head">
            <div>
              <div className="card-title">Activity</div>
              <div className="card-sub">Live · audit trail</div>
            </div>
          </div>
          <div className="activity">
            {ACTIVITIES.length === 0 && (
              <div className="empty">No activity yet.</div>
            )}
            {ACTIVITIES.slice(0, 7).map((a, i) => (
              <div key={i} className="act-item">
                <div className={`act-ico ${a.tone === "accent" ? "accent" : a.tone}`}>
                  <Icon
                    name={
                      a.t === "fee" ? "fees" :
                      a.t === "enquiry" ? "enquiry" :
                      a.t === "complaint" ? "complaint" :
                      a.t === "stock" ? "inventory" :
                      a.t === "attendance" ? "students" :
                      a.t === "donation" ? "donors" :
                      a.t === "salary" ? "money" : "zap"
                    }
                    size={12}
                  />
                </div>
                <div className="act-body">
                  <div className="line">{a.title}</div>
                  <div className="sub">{a.sub}</div>
                </div>
                <div className="act-time">{a.ts}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Parent dashboard ----------
// Focused on a single child: today's daily log (attendance / classwork /
// homework / handwriting), bus status, recent announcements, fees summary.
function ParentDashboard({ child, greet, firstName, dateLabel, todayIso, E, session, refresh, setCurrent }) {
  // Auto-refresh the dashboard data every 20 seconds so live bus tracking
  // updates without the parent having to manually reload the page. Only
  // active when the tab is visible (no point polling in the background) —
  // saves bandwidth on phones. Pauses while the page is hidden, resumes
  // when it becomes visible again.
  useEffect(() => {
    if (typeof document === "undefined") return;
    let timer = null;
    const tick = () => { if (document.visibilityState === "visible") refresh?.(); };
    timer = setInterval(tick, 20_000);
    const onVis = () => { if (document.visibilityState === "visible") refresh?.(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  if (!child) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <div className="page-eyebrow">{dateLabel || " "}</div>
            <div className="page-title">{greet}, <span className="amber">{firstName}</span>.</div>
            <div className="page-sub">Ask the school office to link your account to your child's record.</div>
          </div>
        </div>
      </div>
    );
  }

  const logs = (E.DAILY_LOGS || []).filter((l) => l.studentId === child.id);
  const today = logs.find((l) => l.date === todayIso);
  // Active library loans for this child — surfaced as a card in the right
  // column so the parent can see "borrowed Matilda · due 12 May" at a glance.
  const childLoans = (E.LOANS || []).filter((l) =>
    !l.returnedAt && l.borrowerType === "student" && l.borrowerId === child.id
  );
  // Today's class periods + full week for the child. Match class head so
  // "1" / "1-A" both work against timetable rows.
  const todayDayName = useTodayDayName();
  const childHead = String(child.cls || "").split("-")[0];
  const childTimetable = (E.TIMETABLE || []).filter((t) => {
    const tKey = String(t.cls || "");
    return tKey === child.cls || tKey.split("-")[0] === childHead;
  });
  const childToday = childTimetable
    .filter((t) => t.day === todayDayName)
    .sort((a, b) => (a.period || 0) - (b.period || 0));
  const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const childWeekByDay = WEEK_DAYS.map((day) => ({
    day,
    entries: childTimetable
      .filter((t) => t.day === day)
      .sort((a, b) => (a.period || 0) - (b.period || 0)),
  }));
  // Both legs of the child's commute. Either may be missing (parent drop-off
  // one direction is common). The route objects come pre-filtered by
  // /api/data so this scope only ever sees the child's own buses.
  //
  // A '—' or empty value means "no bus that direction" — coerce those to
  // null so the .find() below doesn't accidentally match a route with an
  // empty code.
  //
  // Note: even when morningCode === eveningCode (same bus both legs), we
  // still render TWO separate cards — one Morning, one Evening — because
  // the parent wants to track pickup and drop as independent journeys.
  // The bus run state is the same on the backend (one route), but the
  // labels and "Your stop" callouts can differ per leg.
  const morningCode = child.transport && child.transport !== "—" ? child.transport : null;
  const eveningCode = child.transportEvening && child.transportEvening !== "—" ? child.transportEvening : null;
  const morningRoute = morningCode ? (E.ROUTES || []).find((r) => r.code === morningCode) : null;
  const eveningRoute = eveningCode ? (E.ROUTES || []).find((r) => r.code === eveningCode) : null;
  // Composite pending rows use studentId (id may be STN-xxx__transport).
  const myFees    = (E.PENDING_FEES || []).filter((f) => (f.studentId || f.id) === child.id);
  const myPaid    = (E.RECENT_FEES || []).filter((f) => (f.studentId || f.id) === child.id);
  const announcements = (E.BROADCASTS || []).filter((b) =>
    b.audience === "all"
    || b.audience === `class_${child.cls}`
    || b.audience === `student_${child.id}`
  ).slice(0, 6);

  // 7-day attendance summary from real logs
  const last7 = (() => {
    if (!todayIso) return [];
    const out = [];
    const today = new Date(`${todayIso}T00:00:00`);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const log = logs.find((l) => l.date === iso);
      out.push({
        iso,
        label: d.toLocaleDateString("en-IN", { weekday: "short" })[0],
        state: !log ? (d.getDay() === 0 ? "weekend" : "empty") : (log.attendance === "absent" ? "absent" : "present"),
      });
    }
    return out;
  })();

  // Attendance % = present ÷ (class working days − holidays).
  const holidayDates = getHolidayDates(E.SETTINGS);
  const workingDays = getWorkingDays(E.SETTINGS, child.cls);
  const attStats = attendanceFromLogs(logs, workingDays, { holidayDates });
  const presentCount = attStats.presentCount;
  const totalLogs = attStats.totalLogs;
  const attendancePct = attStats.pct;

  // Bus KPI — show morning + evening route codes when both are assigned.
  const stopLabel = (r) =>
    r ? ((r.stops || []).find((s) => s.status === "current")?.name || (r.stops || [])[0]?.name || "—") : null;
  const sameBusBothWays = morningCode && eveningCode && morningCode === eveningCode;
  const busValue = (() => {
    if (morningCode && eveningCode && !sameBusBothWays) return `${morningCode} / ${eveningCode}`;
    if (morningCode || eveningCode) return morningCode || eveningCode;
    return "—";
  })();
  const busSub = (() => {
    if (!morningCode && !eveningCode) return "no route assigned";
    if (sameBusBothWays) return `Morning & evening · ${stopLabel(morningRoute) || "—"}`;
    if (morningCode && eveningCode) return `AM ${morningCode} · PM ${eveningCode}`;
    if (morningCode) return `Morning · ${stopLabel(morningRoute) || "—"}`;
    return `Evening · ${stopLabel(eveningRoute) || "—"}`;
  })();
  const busDetailsItems = (() => {
    const items = [];
    if (morningCode) {
      items.push({
        label: "Morning route",
        value: morningCode,
        sub: [morningRoute?.name, stopLabel(morningRoute) ? `Stop · ${stopLabel(morningRoute)}` : null, morningRoute?.driver ? `Driver · ${morningRoute.driver}` : null]
          .filter(Boolean).join(" · ") || "Assigned",
        tone: "ok",
      });
    }
    if (eveningCode) {
      items.push({
        label: "Evening route",
        value: eveningCode,
        sub: [
          sameBusBothWays ? "Same bus as morning" : eveningRoute?.name,
          stopLabel(eveningRoute) ? `Stop · ${stopLabel(eveningRoute)}` : null,
          eveningRoute?.driver ? `Driver · ${eveningRoute.driver}` : null,
        ].filter(Boolean).join(" · ") || "Assigned",
        tone: "ok",
      });
    }
    if (!items.length) {
      items.push({ label: "Route", value: "Not assigned", sub: "Ask the school office to assign a bus", tone: "warn" });
    }
    return items;
  })();

  // Class teacher for the child's section. Match linkedClasses / linkedId
  // flexibly: "1-A" ↔ "1-A", or same class head ("1" matches "1-A") since
  // the school uses a single section per class.
  const classTeacher = (() => {
    const childKey = String(child.cls || "");
    const childHead = childKey.split("-")[0];
    const matches = (key) => {
      const k = String(key || "");
      if (!k) return false;
      if (k === childKey) return true;
      const head = k.split("-")[0];
      return head && childHead && head === childHead;
    };
    return (E.USERS || [])
      .filter((u) => !u.role || u.role === "teacher")
      .find((u) => {
        const keys = [
          ...(Array.isArray(u.linkedClasses) ? u.linkedClasses : []),
          u.linkedId,
        ].filter(Boolean);
        // linkedId may be a CSV of class keys ("1-A,2-A")
        const expanded = keys.flatMap((k) => String(k).split(",").map((p) => p.trim()).filter(Boolean));
        return expanded.some(matches);
      }) || null;
  })();

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">{dateLabel || " "}</div>
          <div className="page-title">
            {greet}, <span className="amber">{firstName || child.name.split(" ")[0]}</span>.
          </div>
          <div className="page-sub">Today's classroom report, attendance, transport, and any messages from the school.</div>
        </div>
      </div>

      {/* Child + class teacher snapshot strip. Sits between the greeting
          and the KPI row so parents see "who is my child, who teaches
          them" without having to drill into another screen. */}
      <div style={{
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18,
        padding: "12px 16px", marginBottom: 14,
        background: "var(--card)",
        border: "1px solid var(--rule-2)",
        borderRadius: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
            color: "#fff", display: "grid", placeItems: "center",
            fontSize: 13, fontWeight: 700, flexShrink: 0,
          }}>
            {child.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{child.name}</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
              <span className="mono">{child.id}</span>
              <span style={{ margin: "0 6px", color: "var(--ink-4)" }}>·</span>
              {formatClassLabel(child.cls)}
            </div>
          </div>
        </div>

        <div style={{
          width: 1, alignSelf: "stretch", background: "var(--rule-2)",
        }} />

        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{
            width: 36, height: 36, borderRadius: "50%",
            background: classTeacher ? "linear-gradient(135deg, var(--ok), #2f6048)" : "var(--bg-2)",
            color: classTeacher ? "#fff" : "var(--ink-4)",
            display: "grid", placeItems: "center",
            fontSize: 13, fontWeight: 700, flexShrink: 0,
          }}>
            {classTeacher
              ? classTeacher.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()
              : "?"}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10.5, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>
              Class teacher
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: classTeacher ? "var(--ink)" : "var(--ink-4)" }}>
              {classTeacher ? classTeacher.name : "Not assigned yet"}
            </div>
          </div>
        </div>

        <div style={{
          width: 1, alignSelf: "stretch", background: "var(--rule-2)",
        }} />

        {(() => {
          const heightCm = child.heightCm != null && child.heightCm !== "" && Number.isFinite(Number(child.heightCm))
            ? Number(child.heightCm) : null;
          const weightKg = child.weightKg != null && child.weightKg !== "" && Number.isFinite(Number(child.weightKg))
            ? Number(child.weightKg) : null;
          const hasGrowth = heightCm != null || weightKg != null;
          return (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10.5, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>
                Height · Weight
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: hasGrowth ? "var(--ink)" : "var(--ink-4)" }}>
                {hasGrowth
                  ? `${heightCm != null ? `${heightCm} cm` : "—"} · ${weightKg != null ? `${weightKg} kg` : "—"}`
                  : "Not recorded yet"}
              </div>
              {child.measuredAt && hasGrowth && (
                <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  Measured {String(child.measuredAt).slice(0, 10)}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* KPIs */}
      <div className="grid g-4" style={{ marginBottom: 14 }}>
        <KPI label="Today" value={today ? (today.attendance === "absent" ? "Absent" : "Present") : "Not posted"}
             sub={today ? `posted by ${today.postedBy || "teacher"}` : "teacher hasn't posted yet"}
             puck={today?.attendance === "absent" ? "rose" : "mint"}
             puckIcon={today?.attendance === "absent" ? "x" : "check"} />
        <KPI label="Attendance · this term" value={attendancePct !== null ? `${attendancePct}%` : "—"}
             sub={attStats.denom
               ? `${presentCount}/${attStats.denom}${workingDays ? " working days" : " days logged"}`
               : "no logs yet"}
             puck="cream" puckIcon="trending" />
        <KPI
          label="Bus"
          value={busValue}
          sub={morningCode || eveningCode ? `${busSub} · tap for details` : busSub}
          puck="sky"
          puckIcon="bus"
          details={{
            title: "Bus routes",
            sub: `${child.name} · morning & evening`,
            items: busDetailsItems,
          }}
        />
        <KPI
          label="Fees pending"
          value={myFees.length ? `₹${myFees.reduce((a, f) => a + (f.amount || 0), 0).toLocaleString("en-IN")}` : "₹0"}
          sub={myFees.length ? `${myFees.length} pending · tap for details` : "all clear"}
          puck="peach"
          puckIcon="fees"
          details={{
            title: "Fees pending",
            sub: myFees.length
              ? `${child.name} · ${myFees.length} unpaid item${myFees.length === 1 ? "" : "s"} · ₹${myFees.reduce((a, f) => a + (f.amount || 0), 0).toLocaleString("en-IN")} total`
              : `${child.name} · no pending fees`,
            items: myFees.length
              ? [
                  ...myFees.map((f) => ({
                    label: feeTypeLabel(f.feeType || f.fee_type),
                    value: `₹${(f.amount || 0).toLocaleString("en-IN")}`,
                    sub: f.due ? `Due ${f.due}${f.overdue ? " · overdue" : ""}` : (f.overdue ? "Overdue" : "Pending"),
                    tone: f.overdue ? "bad" : "warn",
                  })),
                  {
                    label: "Total pending",
                    value: `₹${myFees.reduce((a, f) => a + (f.amount || 0), 0).toLocaleString("en-IN")}`,
                    tone: "warn",
                  },
                ]
              : [{ label: "Status", value: "All clear", sub: "No unpaid fees right now", tone: "ok" }],
          }}
        />
      </div>

      <div className="grid g-12">
        {/* Today's daily log */}
        <div className="card col-7">
          <div className="card-head">
            <div>
              <div className="card-title">Today · classroom report</div>
              <div className="card-sub">
                {today
                  ? `Posted by ${today.postedBy || "teacher"} · ${today.postedAt ? new Date(today.postedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}`
                  : "Your child's teacher hasn't posted today's update yet"}
              </div>
            </div>
            <div className="card-actions">
              {today
                ? <span className="chip ok"><span className="dot" />Submitted</span>
                : <span className="chip"><span className="dot" />Pending</span>}
            </div>
          </div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {!today ? (
              <div className="empty" style={{ padding: 24 }}>Once the class teacher submits today's log, you'll see attendance, classwork, homework, handwriting and any teacher notes here.</div>
            ) : (() => {
              const absent = today.attendance === "absent";
              const logged = Array.isArray(today.subjectLogs) ? today.subjectLogs.filter((s) => s?.subject) : [];
              const byName = new Map(logged.map((s) => [String(s.subject).toLowerCase(), s]));
              const childHead = String(child.cls || "").split("-")[0];
              const classRow = (E.CLASSES || []).find((x) => Number(x.n) === Number(childHead));
              const classSubjects = (Array.isArray(classRow?.subjects) && classRow.subjects.length
                ? classRow.subjects
                : (E.SUBJECTS || []).map((s) => (typeof s === "string" ? s : s?.name))
              ).map((s) => String(s || "").trim()).filter(Boolean);
              const subjectNames = [];
              const seen = new Set();
              for (const name of classSubjects) {
                const key = name.toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                subjectNames.push(name);
              }
              for (const s of logged) {
                const name = String(s.subject).trim();
                const key = name.toLowerCase();
                if (!name || seen.has(key)) continue;
                seen.add(key);
                subjectNames.push(name);
              }
              const statusChip = (kind, status) => {
                if (kind === "cw") {
                  if (status === "completed") return <span className="chip ok" style={{ minWidth: 52, justifyContent: "center" }}>CW ✓</span>;
                  if (status === "not_completed") return <span className="chip bad" style={{ minWidth: 52, justifyContent: "center" }}>CW −</span>;
                  return <span className="chip" style={{ minWidth: 52, justifyContent: "center", opacity: 0.7 }}>CW</span>;
                }
                if (status === "completed") return <span className="chip ok" style={{ minWidth: 52, justifyContent: "center" }}>HW ✓</span>;
                if (status === "pending") return <span className="chip warn" style={{ minWidth: 52, justifyContent: "center" }}>HW −</span>;
                return <span className="chip" style={{ minWidth: 52, justifyContent: "center", opacity: 0.7 }}>HW</span>;
              };
              const metaRows = [
                ...(absent && today.leaveReason ? [{ l: "Reason", v: today.leaveReason }] : []),
                ...(!absent && !subjectNames.length ? [
                  { l: "Classwork", v: today.classwork || "—", c: today.classworkStatus === "completed" ? <span className="chip ok">Done</span> : today.classworkStatus === "not_completed" ? <span className="chip bad">Not done</span> : null },
                  { l: "Homework", v: today.homework || "—", c: today.homeworkStatus === "completed" ? <span className="chip ok">Done</span> : today.homeworkStatus === "pending" ? <span className="chip warn">Pending</span> : null },
                ] : []),
                ...(!absent ? [
                  { l: "Handwriting", v: today.handwritingNote || "—", c: today.handwritingGrade ? <span className="chip">{today.handwritingGrade}</span> : null },
                  { l: "Topics covered", v: today.topics || "—" },
                  { l: "Behaviour", v: today.behaviour || "—" },
                  { l: "Extra-curricular", v: today.extra || "—" },
                ] : []),
              ];
              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingBottom: 10, borderBottom: "1px solid var(--rule-2)" }}>
                    <div style={{ fontSize: 11.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Attendance</div>
                    {absent ? <span className="chip bad">Absent</span> : <span className="chip ok">Present</span>}
                  </div>
                  {!absent && subjectNames.length > 0 && (
                    <div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 56px 56px", gap: 8, paddingBottom: 6, borderBottom: "1px solid var(--rule-2)" }}>
                        <div style={{ fontSize: 10.5, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Subject</div>
                        <div style={{ fontSize: 10.5, color: "var(--ink-4)", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.05em" }}>CW</div>
                        <div style={{ fontSize: 10.5, color: "var(--ink-4)", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.05em" }}>HW</div>
                      </div>
                      {subjectNames.map((name) => {
                        const s = byName.get(name.toLowerCase()) || {};
                        const note = [s.classwork, s.homework].filter(Boolean).join(" · ");
                        return (
                          <div key={name} style={{ display: "grid", gridTemplateColumns: "1fr 56px 56px", gap: 8, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--rule-2)" }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 560 }}>{name}</div>
                              {note ? <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{note}</div> : null}
                            </div>
                            <div style={{ display: "flex", justifyContent: "center" }}>{statusChip("cw", s.classworkStatus)}</div>
                            <div style={{ display: "flex", justifyContent: "center" }}>{statusChip("hw", s.homeworkStatus)}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {metaRows.map((r, i) => (
                    <div key={r.l} style={{ display: "grid", gridTemplateColumns: "120px 1fr auto", gap: 12, alignItems: "flex-start", paddingBottom: 10, borderBottom: i < metaRows.length - 1 ? "1px solid var(--rule-2)" : "none" }}>
                      <div style={{ fontSize: 11.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", paddingTop: 1 }}>{r.l}</div>
                      <div style={{ fontSize: 13 }}>{r.v}</div>
                      <div>{r.c || null}</div>
                    </div>
                  ))}
                </>
              );
            })()}
          </div>
        </div>

        {/* Right column: Bus + Last 7 days + Announcements */}
        <div className="col-5" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">My child's bus</div>
                <div className="card-sub">
                  {(morningRoute || eveningRoute)
                    ? "Live status — updates as the teacher marks each stop"
                    : "No transport assigned"}
                </div>
              </div>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {!(morningRoute || eveningRoute) && (
                <div className="empty" style={{ padding: 16 }}>
                  Your child isn't assigned to a school route. Speak to the office to set this up.
                </div>
              )}
              {/* Always render morning and evening as SEPARATE cards even if
                  they share the same route code — the parent tracks pickup
                  and drop-off as independent journeys. Each card displays
                  its own "Your stop" callout based on the matching
                  pickup_stop / pickup_stop_evening field. */}
              {morningRoute && (
                <ParentBusRouteCard route={morningRoute} child={child} leg="morning" />
              )}
              {eveningRoute && (
                <ParentBusRouteCard route={eveningRoute} child={child} leg="evening" />
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><div><div className="card-title">Last 7 days</div><div className="card-sub">Attendance pattern</div></div></div>
            <div className="card-body">
              <div style={{ display: "flex", gap: 6, justifyContent: "space-between" }}>
                {last7.map((d) => {
                  const colours = { present: "var(--ok)", absent: "var(--err, #b13c1c)", weekend: "var(--rule-2)", empty: "var(--bg-2)" };
                  return (
                    <div key={d.iso} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div title={`${d.iso} — ${d.state}`} style={{
                        width: "100%", height: 36, borderRadius: 6,
                        background: colours[d.state],
                        opacity: d.state === "weekend" ? 0.5 : 1,
                      }} />
                      <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{d.label}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 10, fontSize: 10.5, color: "var(--ink-4)", display: "flex", gap: 12 }}>
                <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--ok)", marginRight: 4 }}/>Present</span>
                <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--err, #b13c1c)", marginRight: 4 }}/>Absent</span>
                <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--bg-2)", marginRight: 4, border: "1px solid var(--rule)" }}/>No log</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><div><div className="card-title">From the school</div><div className="card-sub">{announcements.length ? `${announcements.length} recent` : "No recent messages"}</div></div></div>
            {announcements.length === 0 ? (
              <div className="empty" style={{ padding: 16 }}>Class announcements and school broadcasts appear here.</div>
            ) : (
              <div style={{ padding: "8px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                {announcements.map((a) => (
                  <div key={a.id} style={{ padding: 10, background: "var(--bg-2)", borderRadius: 7 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{a.campaign || a.audienceLabel}</div>
                      <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{a.sentAt ? new Date(a.sentAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.4 }}>{a.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Today's class schedule */}
          {childToday.length > 0 ? (
            <TodayScheduleCard
              title={`Today · ${formatClassLabel(child.cls)}`}
              sub={`${childToday.length} period${childToday.length === 1 ? "" : "s"} · ${todayDayName}`}
              entries={childToday}
              mode="parent"
            />
          ) : (
            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">Today · {formatClassLabel(child.cls)}</div>
                  <div className="card-sub">
                    {todayDayName
                      ? (childTimetable.length
                        ? `No periods scheduled for ${todayDayName}`
                        : "Timetable not published for this class yet")
                      : "Loading schedule…"}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Weekly timetable snapshot */}
          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Weekly timetable</div>
                <div className="card-sub">{formatClassLabel(child.cls)} · Mon–Sat</div>
              </div>
              {typeof setCurrent === "function" && (
                <button type="button" className="btn sm" onClick={() => setCurrent("timetable")}>
                  Full grid
                </button>
              )}
            </div>
            <div style={{ padding: "4px 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              {childTimetable.length === 0 ? (
                <div className="empty" style={{ padding: 16 }}>
                  No timetable published for {formatClassLabel(child.cls)} yet. Ask the school office.
                </div>
              ) : (
                childWeekByDay.map(({ day, entries }) => (
                  <div key={day} style={{
                    display: "grid",
                    gridTemplateColumns: "44px 1fr",
                    gap: 10,
                    alignItems: "start",
                    padding: "8px 0",
                    borderBottom: "1px solid var(--rule-2)",
                  }}>
                    <div style={{
                      fontSize: 12, fontWeight: 700,
                      color: day === todayDayName ? "var(--accent-2)" : "var(--ink-3)",
                      paddingTop: 2,
                    }}>
                      {day}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {entries.length === 0 ? (
                        <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>—</span>
                      ) : (
                        entries.map((e) => (
                          <span
                            key={e.id || `${day}-${e.period}`}
                            title={[e.teacherName, e.room ? `Room ${e.room}` : null].filter(Boolean).join(" · ")}
                            style={{
                              fontSize: 11, padding: "4px 8px", borderRadius: 6,
                              background: day === todayDayName ? "var(--accent-soft)" : "var(--bg-2)",
                              border: "1px solid var(--rule-2)",
                              color: "var(--ink)",
                            }}
                          >
                            <b style={{ fontWeight: 600 }}>P{e.period}</b> {e.subject || "—"}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Library loans for this child — only rendered when active */}
          {childLoans.length > 0 && (
            <LibraryLoansCard
              title="Library · borrowed"
              sub={`${childLoans.length} book${childLoans.length === 1 ? "" : "s"} on loan`}
              loans={childLoans}
              showBorrower={false}
            />
          )}
        </div>
      </div>

      {/* Fees summary */}
      <div className="grid g-12" style={{ marginTop: 14 }}>
        <div className="card col-12">
          <div className="card-head">
            <div><div className="card-title">Fees</div><div className="card-sub">{myFees.length ? `${myFees.length} pending · ${myPaid.length} paid this term` : `All clear · ${myPaid.length} receipt${myPaid.length === 1 ? "" : "s"} this term`}</div></div>
          </div>
          <table className="table">
            <thead><tr><th>Status</th><th>Description</th><th className="num">Amount</th><th>When / Due</th></tr></thead>
            <tbody>
              {myFees.length === 0 && myPaid.length === 0 && (
                <tr><td colSpan={4} className="empty">No fee history yet.</td></tr>
              )}
              {myFees.map((f) => (
                <tr key={`p-${f.id}-${f.due}`}>
                  <td><span className={`chip ${f.overdue ? "bad" : "warn"}`}><span className="dot" />{f.overdue ? "Overdue" : "Pending"}</span></td>
                  <td style={{ fontSize: 13 }}>{feeTypeLabel(f.feeType || f.fee_type)} · {formatClassLabel(f.cls || child.cls)}</td>
                  <td className="num" style={{ fontWeight: 500 }}>₹{(f.amount || 0).toLocaleString("en-IN")}</td>
                  <td style={{ fontSize: 12, color: "var(--ink-3)" }}>{f.due}</td>
                </tr>
              ))}
              {myPaid.slice(0, 5).map((f, i) => (
                <tr key={`r-${f.id}-${i}`}>
                  <td><span className="chip ok"><span className="dot" />Paid</span></td>
                  <td style={{ fontSize: 13 }}>
                    {feeTypeLabel(f.feeType || f.fee_type)} · {formatClassLabel(f.cls || child.cls)}
                    {f.method ? <span style={{ color: "var(--ink-4)", fontSize: 11 }}> ({f.method})</span> : null}
                  </td>
                  <td className="num" style={{ fontWeight: 500 }}>₹{(f.amount || 0).toLocaleString("en-IN")}</td>
                  <td style={{ fontSize: 12, color: "var(--ink-3)" }}>{f.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Today's schedule card — list of period rows for whoever is signed in.
// `mode="teacher"` shows class + room beside each period; `mode="parent"`
// shows subject + teacher (since the class is already implied).
// ----------------------------------------------------------------------
const PERIOD_TIMES = {
  1: "08:00 – 08:45",
  2: "08:45 – 09:30",
  3: "09:30 – 10:15",
  4: "10:30 – 11:15",
  5: "11:15 – 12:00",
  6: "12:00 – 12:45",
  7: "13:30 – 14:15",
};

function TodayScheduleCard({ title, sub, entries, mode }) {
  if (!entries || entries.length === 0) return null;
  // Highlight whichever period contains "now" (rough — uses the start hour
  // from PERIOD_TIMES, ignoring weekends since the parent component already
  // filters by today's day name). Deferred via useNow so the "live" pill
  // doesn't render differently on server vs client.
  const now = useNow(60_000);
  const minutes = now ? new Date(now).getHours() * 60 + new Date(now).getMinutes() : -1;
  function isLive(periodNum) {
    const t = PERIOD_TIMES[periodNum];
    if (!t) return false;
    const [start, end] = t.split("–").map((s) => s.trim());
    const toMin = (hm) => {
      const [h, m] = hm.split(":").map(Number);
      return h * 60 + m;
    };
    return minutes >= toMin(start) && minutes <= toMin(end);
  }
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">{title}</div>
          {sub && <div className="card-sub">{sub}</div>}
        </div>
        <div className="card-actions">
          <span className="chip"><Icon name="clock" size={11} />{entries.length}</span>
        </div>
      </div>
      <div style={{ padding: "8px 14px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
        {entries.map((e) => {
          const live = isLive(e.period);
          return (
            <div key={e.id} style={{
              display: "flex", gap: 10, padding: "8px 10px", borderRadius: 8,
              border: live ? "1.5px solid var(--accent)" : "1px solid var(--rule-2)",
              background: live ? "var(--accent-soft)" : "var(--bg-2)",
            }}>
              <div style={{ width: 70, flexShrink: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: live ? "var(--accent-2)" : "var(--ink)" }}>P{e.period}</div>
                <div style={{ fontSize: 10, color: "var(--ink-4)", whiteSpace: "nowrap" }}>{PERIOD_TIMES[e.period] || ""}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: live ? "var(--accent-2)" : "var(--ink)" }}>
                  {e.subject}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {mode === "teacher"
                    ? <>{formatClassLabel(e.cls)}{e.room ? ` · Room ${e.room}` : ""}</>
                    : <>{e.teacherName || "Teacher TBA"}{e.room ? ` · Room ${e.room}` : ""}</>}
                </div>
              </div>
              {live && (
                <div style={{ alignSelf: "center", fontSize: 10, fontWeight: 600, color: "var(--accent-2)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Now
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Reusable Library loans card. Shared between the parent dashboard (where
// it shows the child's loans) and the staff dashboard (where it shows the
// signed-in teacher's own loans). Pass `showBorrower={false}` to hide the
// borrower column when the surrounding context already implies who.
// ----------------------------------------------------------------------
function LibraryLoansCard({ title, sub, loans, showBorrower = true }) {
  if (!loans || loans.length === 0) return null;
  // Sort: overdue first, then earliest due date. Uses useNow so the
  // overdue/not-overdue partition doesn't differ between SSR (server's
  // "now") and the first client render — would cause a hydration mismatch
  // if a loan straddles the boundary. now === 0 makes everything count
  // as "not yet due" pre-hydration; correct partition + sort kicks in
  // after mount.
  const now = useNow(60_000);
  const sorted = [...loans].sort((a, b) => {
    const ao = now && new Date(a.dueAt).getTime() < now ? 0 : 1;
    const bo = now && new Date(b.dueAt).getTime() < now ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return new Date(a.dueAt) - new Date(b.dueAt);
  });
  const fmt = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">{title}</div>
          {sub && <div className="card-sub">{sub}</div>}
        </div>
        <div className="card-actions">
          <span className="chip"><Icon name="book" size={11} />{loans.length}</span>
        </div>
      </div>
      <div style={{ padding: "8px 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {sorted.map((l) => {
          // All "days left / overdue / since" math depends on `now`; when
          // now === 0 (pre-hydration) we render neutral placeholders so
          // server and client agree. After mount the live values populate.
          const due = new Date(l.dueAt).getTime();
          const overdue = now ? due < now : false;
          const daysLeft = now ? Math.ceil((due - now) / 86400000) : null;
          const since = now ? Math.floor((now - new Date(l.borrowedAt).getTime()) / 86400000) : null;
          return (
            <div key={l.id} style={{
              padding: 10, borderRadius: 8,
              background: overdue ? "var(--err-soft, #fbe1d8)" : "var(--bg-2)",
              border: overdue ? "1px solid var(--err, #b13c1c)" : "1px solid transparent",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {l.bookTitle}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 2 }}>
                    Borrowed {fmt(l.borrowedAt)}{since != null && <> ({since} day{since === 1 ? "" : "s"} ago)</>}
                    {showBorrower && <> · <span style={{ textTransform: "capitalize" }}>{l.borrowerType}</span> {l.borrowerName}</>}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {daysLeft != null && (
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: overdue ? "var(--err, #b13c1c)" : "var(--ink-2)" }}>
                      {overdue
                        ? `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"} overdue`
                        : daysLeft === 0
                          ? "due today"
                          : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
                    </div>
                  )}
                  <div style={{ fontSize: 10.5, color: "var(--ink-4)" }}>by {fmt(l.dueAt)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// "My leave requests" card — shows the teacher's recent leave applications
// with the latest approval status. Color-coded chip per row so the user can
// see at a glance whether their request is still pending or was actioned.
function MyLeaveCard({ title, sub, requests }) {
  if (!requests || requests.length === 0) return null;
  const TONE = {
    approved:  { bg: "var(--ok-soft, #e7f3e8)", fg: "var(--ok)",            border: "var(--ok)",            label: "Approved" },
    rejected:  { bg: "var(--err-soft, #fbe1d8)", fg: "var(--err, #b13c1c)", border: "var(--err, #b13c1c)",  label: "Rejected" },
    pending:   { bg: "var(--bg-2)",              fg: "var(--ink-2)",        border: "var(--rule)",          label: "Pending review" },
    cancelled: { bg: "var(--bg-2)",              fg: "var(--ink-3)",        border: "var(--rule)",          label: "Cancelled" },
  };
  const fmt = (iso) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
    catch { return iso; }
  };
  const fmtRange = (from, to) => {
    if (!from || !to) return "—";
    const days = Math.max(1, Math.round((new Date(to) - new Date(from)) / 86_400_000) + 1);
    return `${fmt(from)} → ${fmt(to)} · ${days}d`;
  };
  const counts = requests.reduce((m, r) => { m[r.approvalStatus] = (m[r.approvalStatus] || 0) + 1; return m; }, {});
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">{title}</div>
          {sub && <div className="card-sub">{sub}</div>}
        </div>
        <div className="card-actions" style={{ display: "flex", gap: 6 }}>
          {counts.pending  > 0 && <span className="chip warn"><span className="dot" />{counts.pending} pending</span>}
          {counts.approved > 0 && <span className="chip ok"><span className="dot" />{counts.approved} approved</span>}
          {counts.rejected > 0 && <span className="chip bad"><span className="dot" />{counts.rejected} rejected</span>}
        </div>
      </div>
      <div style={{ padding: "8px 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {requests.map((r) => {
          const tone = TONE[r.approvalStatus] || TONE.pending;
          return (
            <div key={r.id} style={{
              padding: 10, borderRadius: 8,
              background: tone.bg,
              border: `1px solid ${tone.border}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, textTransform: "capitalize" }}>
                    {r.leaveType || "leave"} leave
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                    {fmtRange(r.fromDate, r.toDate)}
                  </div>
                  {r.reason && (
                    <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4, lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.reason}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", minWidth: 120 }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    fontSize: 11, fontWeight: 600, color: tone.fg,
                    padding: "3px 8px", borderRadius: 999,
                    border: `1px solid ${tone.fg}`,
                    background: "rgba(255,255,255,0.6)",
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: tone.fg, display: "inline-block" }} />
                    {tone.label}
                  </span>
                  <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 4 }}>
                    Filed {r.createdAt ? fmt(r.createdAt) : "—"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Teacher-facing live controls for one route they're assigned to. Drives
// the bus through its stops via /api/transport/advance. Buttons are gated
// server-side too (we double-check the route.attendant matches session.name)
// so a stale UI doesn't let a former teacher mark the run.
function TeacherBusRouteCard({ route, refresh }) {
  const [busy, setBusy] = useState(null); // 'start' | 'next' | 'prev' | 'finish' | null
  const [err, setErr] = useState("");
  // Deferred current-time for all relativeMins() calls in this card.
  // Returns 0 pre-hydration so the strings render as "" both server-side
  // and on first client render → no hydration mismatch.
  const now = useNow();
  const stops = Array.isArray(route.stops) ? route.stops : [];
  const curIdx = stops.findIndex((s) => s.status === "current");
  const cur = curIdx >= 0 ? stops[curIdx] : null;
  const next = curIdx >= 0 && curIdx + 1 < stops.length ? stops[curIdx + 1] : null;
  const isRunning = route.status === "running";
  const isCompleted = route.status === "completed";
  const isIdle = !isRunning && !isCompleted;
  const isLast = curIdx === stops.length - 1;

  const advance = async (action) => {
    setBusy(action); setErr("");
    try {
      const r = await fetch("/api/transport/advance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: route.code, action }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Failed");
      await refresh?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">
            My bus · {route.code}
            {route.direction === "evening"
              ? <span className="chip" style={{ marginLeft: 8, fontSize: 10 }}>Evening</span>
              : route.direction === "morning"
                ? <span className="chip" style={{ marginLeft: 8, fontSize: 10 }}>Morning</span>
                : null}
          </div>
          <div className="card-sub">
            {route.name}
            {route.driver && <> · Driver: {route.driver}</>}
            {route.bus && <> · {route.bus}</>}
          </div>
        </div>
        <div>
          {isCompleted
            ? <span className="chip ok"><span className="dot" />Completed</span>
            : isRunning
              ? <span className="chip"><span className="dot" />Running</span>
              : <span className="chip"><span className="dot" />Not started</span>}
        </div>
      </div>
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {isIdle && (
          <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
            Tap <b>Start bus run</b> when you depart. Parents will see the bus status update live.
          </div>
        )}
        {isRunning && cur && (
          <div style={{
            padding: "8px 12px",
            background: "var(--accent-soft)",
            border: "1px solid var(--accent)",
            borderRadius: 8,
            fontSize: 12.5, color: "var(--ink-2)",
          }}>
            Currently at <b>{cur.name}</b>
            {cur.arrivedAt && relativeMins(cur.arrivedAt, now) && <> · arrived {relativeMins(cur.arrivedAt, now)}</>}
            {next && <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
              Next: {next.name}{next.t ? ` · scheduled ${next.t}` : ""}
            </div>}
          </div>
        )}
        {isCompleted && (
          <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
            Run completed{relativeMins(route.completedAt, now) ? ` · ${relativeMins(route.completedAt, now)}` : ""}.
            Tap <b>Reset for next trip</b> when you're ready to start again.
          </div>
        )}
        {err && (
          <div style={{ background: "var(--err-soft, #fbe1d8)", color: "var(--err, #b13c1c)", padding: "8px 12px", borderRadius: 7, fontSize: 12 }}>{err}</div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {isIdle && (
            <button className="btn sm accent" disabled={busy === "start"} onClick={() => advance("start")}>
              <Icon name="bus" size={12} />{busy === "start" ? "Starting…" : "Start bus run"}
            </button>
          )}
          {isRunning && (
            <>
              <button className="btn sm" disabled={busy === "prev" || curIdx <= 0} onClick={() => advance("prev")}>
                <Icon name="x" size={11} />{busy === "prev" ? "…" : "Back a stop"}
              </button>
              <button className="btn sm accent" disabled={!!busy} onClick={() => advance("next")}>
                <Icon name="check" size={12} />
                {busy === "next" ? "Saving…" : isLast ? "Mark this stop done & finish" : "Mark this stop done & advance"}
              </button>
              <button className="btn sm" disabled={!!busy} onClick={() => advance("finish")} title="Mark all remaining stops as done">
                {busy === "finish" ? "…" : "Finish run"}
              </button>
            </>
          )}
          {isCompleted && (
            <button className="btn sm" disabled={busy === "reset"} onClick={() => advance("reset")}>
              {busy === "reset" ? "Resetting…" : "Reset for next trip"}
            </button>
          )}
        </div>

        {stops.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
            {stops.map((s, i) => {
              const isCurrent = s.status === "current";
              const isDone    = s.status === "done";
              const dotColor = isDone ? "var(--ok)" : isCurrent ? "var(--accent-2)" : "var(--ink-4)";
              return (
                <div key={`${s.name}-${i}`} style={{
                  display: "grid", gridTemplateColumns: "16px 1fr auto",
                  alignItems: "center", gap: 8,
                  padding: "3px 0",
                  opacity: isDone ? 0.65 : 1,
                }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: dotColor,
                    boxShadow: isCurrent ? "0 0 0 3px rgba(255,165,80,0.18)" : "none",
                    justifySelf: "center",
                  }} />
                  <span style={{
                    fontSize: 12.5,
                    fontWeight: isCurrent ? 600 : 400,
                    color: isCurrent ? "var(--ink)" : isDone ? "var(--ink-3)" : "var(--ink-2)",
                  }}>{s.name}</span>
                  <span style={{ fontSize: 10.5, color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}>
                    {isDone && s.doneAt && relativeMins(s.doneAt, now)
                      ? `done · ${relativeMins(s.doneAt, now)}`
                      : isCurrent && s.arrivedAt && now
                        ? `at ${new Date(s.arrivedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
                        : s.t || ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Human-friendly relative time. "just now" / "2 min ago" / "1 hr 12 min ago"
// / null if the timestamp is missing OR if `now` is 0 (pre-hydration).
// The `now` parameter must be supplied by the caller via useNow() — taking
// Date.now() inline here would re-introduce the hydration mismatch this
// function was refactored to avoid.
function relativeMins(iso, now) {
  if (!iso || !now) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hrs} hr ago` : `${hrs} hr ${rem} min ago`;
}

// Parent-facing live status for one leg of the child's commute. Renders
// the route header (code + driver + status pill), then the stop timeline
// with the current stop highlighted and the child's own stop marked.
function ParentBusRouteCard({ route, child, leg }) {
  // Deferred current-time so relativeMins() strings don't differ between
  // the server-rendered HTML and the first client render.
  const now = useNow();
  const stops = Array.isArray(route.stops) ? route.stops : [];
  const curIdx = stops.findIndex((s) => s.status === "current");
  const cur = curIdx >= 0 ? stops[curIdx] : null;
  const next = curIdx >= 0 && curIdx + 1 < stops.length ? stops[curIdx + 1] : null;
  // The "Your stop" callout uses the leg-specific pickup_stop column.
  const childStopName = leg === "evening" ? child.pickupStopEvening : child.pickupStop;
  // Heading: always "Morning" or "Evening" — the parent wants the two
  // legs as separate cards regardless of whether they share a route code.
  const legLabel = leg === "evening" ? "Evening" : "Morning";
  const isRunning = route.status === "running";
  const isCompleted = route.status === "completed";
  const isIdle = !isRunning && !isCompleted;
  const arrivedAgo = cur ? relativeMins(cur.arrivedAt, now) : null;

  const statusChip = isCompleted
    ? <span className="chip ok"><span className="dot" />Completed</span>
    : isRunning
      ? <span className="chip"><span className="dot" />Running</span>
      : <span className="chip"><span className="dot" />Not started</span>;

  return (
    <div style={{
      background: "var(--bg-2)",
      border: "1px solid var(--rule-2)",
      borderRadius: 9,
      padding: "10px 12px",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Icon name="bus" size={14} style={{ color: "var(--accent-2)" }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>
            {legLabel} · {route.code}
          </span>
          <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{route.name}</span>
        </div>
        {statusChip}
      </div>

      <div style={{ fontSize: 11, color: "var(--ink-4)" }}>
        Driver: <b style={{ color: "var(--ink-3)" }}>{route.driver || "—"}</b>
        {route.attendant && route.attendant !== "—" && (
          <> · Teacher: <b style={{ color: "var(--ink-3)" }}>{route.attendant}</b></>
        )}
        {route.bus && <> · Bus: <b style={{ color: "var(--ink-3)" }}>{route.bus}</b></>}
      </div>

      {isIdle && (
        <div style={{ fontSize: 11.5, color: "var(--ink-4)", fontStyle: "italic" }}>
          Bus hasn't departed yet. You'll see live progress here once the teacher starts the run.
        </div>
      )}

      {isRunning && cur && (
        <div style={{
          padding: "6px 10px",
          background: "var(--accent-soft)",
          border: "1px solid var(--accent)",
          borderRadius: 7,
          fontSize: 12,
          color: "var(--ink-2)",
        }}>
          <b>At {cur.name}</b>
          {arrivedAgo && <span style={{ color: "var(--ink-3)" }}> · {arrivedAgo}</span>}
          {next && <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
            Next: {next.name}{next.t ? ` · scheduled ${next.t}` : ""}
          </div>}
        </div>
      )}

      {isCompleted && (
        <div style={{
          padding: "6px 10px",
          background: "var(--bg)",
          border: "1px solid var(--rule-2)",
          borderRadius: 7,
          fontSize: 12, color: "var(--ink-3)",
        }}>
          Run completed{relativeMins(route.completedAt, now) ? ` · ${relativeMins(route.completedAt, now)}` : ""}.
        </div>
      )}

      {/* Stop timeline */}
      {stops.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
          {stops.map((s, i) => {
            const isCurrent = s.status === "current";
            const isDone    = s.status === "done";
            const isChildStop = childStopName && s.name === childStopName;
            const dotColor = isDone ? "var(--ok)" : isCurrent ? "var(--accent-2)" : "var(--ink-4)";
            return (
              <div key={`${s.name}-${i}`} style={{
                display: "grid", gridTemplateColumns: "16px 1fr auto",
                alignItems: "center", gap: 8,
                padding: "3px 0",
                opacity: isDone ? 0.65 : 1,
              }}>
                <span style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: dotColor,
                  border: isCurrent ? "2px solid var(--accent-soft)" : "none",
                  boxShadow: isCurrent ? "0 0 0 3px rgba(255,165,80,0.18)" : "none",
                  justifySelf: "center",
                }} />
                <span style={{
                  fontSize: 12,
                  fontWeight: isCurrent || isChildStop ? 600 : 400,
                  color: isCurrent ? "var(--ink)" : isDone ? "var(--ink-3)" : "var(--ink-2)",
                }}>
                  {s.name}
                  {isChildStop && (
                    <span className="chip ok" style={{ marginLeft: 6, fontSize: 9.5, padding: "1px 6px" }}>
                      Your stop
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 10.5, color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}>
                  {isDone && s.doneAt && relativeMins(s.doneAt, now)
                    ? `done · ${relativeMins(s.doneAt, now)}`
                    : isCurrent && s.arrivedAt && now
                      ? `at ${new Date(s.arrivedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
                      : s.t || ""}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
