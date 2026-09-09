"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";

// Today's attendance monitor — students (from daily logs) and teachers (from
// teacher_attendance) side by side, so admin/principal can watch both at a
// glance from their landing page. Renders nothing for parents.
export default function AttendanceTodayCard({ E, setCurrent, role }) {
  if (role === "parent") return null;

  // Resolve "today" after mount to avoid SSR/hydration mismatch.
  const [todayIso, setTodayIso] = useState("");
  const [dateLabel, setDateLabel] = useState("");
  useEffect(() => {
    const d = new Date();
    setTodayIso(d.toISOString().slice(0, 10));
    setDateLabel(d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
  }, []);

  const logs = (E.DAILY_LOGS || []).filter((l) => l.date === todayIso);
  const sPresent = logs.filter((l) => l.attendance === "present" || l.attendance === "parent_drop").length;
  const sLate = logs.filter((l) => l.attendance === "late").length;
  const sAbsent = logs.filter((l) => l.attendance === "absent").length;
  const sLeave = logs.filter((l) => l.attendance === "leave").length;
  const sMarked = logs.length;
  const sTotal = (E.ADDED_STUDENTS || []).length;
  const sPct = sMarked ? Math.round(((sPresent + sLate) / sMarked) * 100) : null;

  const tAtt = (E.TEACHER_ATTENDANCE || []).filter((r) => r.date === todayIso);
  const tPresent = tAtt.filter((r) => r.status === "present").length;
  const tLate = tAtt.filter((r) => r.status === "late").length;
  const tAbsent = tAtt.filter((r) => r.status === "absent").length;
  const tLeave = tAtt.filter((r) => r.status === "leave").length;
  const tMarked = tAtt.length;
  const tTotal = (E.STAFF || []).filter((s) => /teach/i.test(s.role || "")).length;
  const tPct = tMarked ? Math.round(((tPresent + tLate) / tMarked) * 100) : null;

  const pctColor = (p) => p == null ? "var(--ink-4)" : p >= 90 ? "var(--ok)" : p >= 75 ? "var(--warn, #b07a18)" : "var(--err, #b13c1c)";

  const Pill = ({ label, n, tone }) => (
    <div style={{ flex: "1 1 56px", textAlign: "center", padding: "7px 4px", borderRadius: 8, background: "var(--card-2)" }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: tone || "var(--ink)" }}>{n}</div>
      <div style={{ fontSize: 9.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
    </div>
  );
  const Block = ({ title, icon, pct, present, late, absent, leave, marked, total }) => (
    <div style={{ flex: "1 1 280px", padding: "14px 16px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div className="school-puck" style={{ width: 30, height: 30, borderRadius: 8 }}><Icon name={icon} size={15} /></div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
        <div style={{ marginLeft: "auto", fontSize: 22, fontWeight: 800, color: pctColor(pct) }}>{pct == null ? "—" : `${pct}%`}</div>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginBottom: 8 }}>
        {`${marked}/${total} marked`}{total - marked > 0 ? ` · ${total - marked} not marked yet` : " · all marked"}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <Pill label="Present" n={present} tone="var(--ok)" />
        <Pill label="Late" n={late} tone="var(--warn, #b07a18)" />
        <Pill label="Absent" n={absent} tone="var(--err, #b13c1c)" />
        <Pill label="Leave" n={leave} tone="var(--accent-2)" />
      </div>
    </div>
  );

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-head">
        <div>
          <div className="card-title">Attendance today</div>
          <div className="card-sub">{dateLabel || todayIso || " "} · students &amp; teachers</div>
        </div>
        {setCurrent && (
          <button className="btn sm" onClick={() => setCurrent("attendance")} title="Open the Attendance screen">
            <Icon name="check" size={12} />Open attendance
          </button>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap" }}>
        <Block title="Students" icon="students" pct={sPct} present={sPresent} late={sLate} absent={sAbsent} leave={sLeave} marked={sMarked} total={sTotal} />
        <div style={{ width: 1, background: "var(--rule)", alignSelf: "stretch" }} />
        <Block title="Teachers" icon="user" pct={tPct} present={tPresent} late={tLate} absent={tAbsent} leave={tLeave} marked={tMarked} total={tTotal} />
      </div>
    </div>
  );
}
