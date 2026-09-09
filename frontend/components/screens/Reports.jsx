"use client";

import React, { useMemo, useState } from "react";
import Icon from "../Icon";
import { KPI } from "../ui";
import { money, moneyK, formatClassLabel } from "@/lib/format";
import { resolveSchool } from "@/lib/export";

// Single screen that aggregates the four most-asked-for reports:
// 1. Monthly P&L (income, expense, net) split by School / Trust
// 2. Fee collection summary (paid vs outstanding by class)
// 3. Donation summary (top donors, by campaign, by type)
// 4. Student strength (by class)
// Quick-pick presets for the From/To inputs. "all" clears the filter; the
// rest set a relative window (today, 7d, 30d, this month, this FY).
const DATE_PRESETS = [
  { k: "all",   label: "All time" },
  { k: "today", label: "Today" },
  { k: "7d",    label: "Last 7 days" },
  { k: "30d",   label: "Last 30 days" },
  { k: "month", label: "This month" },
  { k: "fy",    label: "This FY (Apr–Mar)" },
];

export default function ScreenReports({ E, session }) {
  // Resolved school identity for CSV / print headers — falls back to
  // bundled defaults if Settings hasn't been written.
  const school = resolveSchool(E?.SETTINGS);
  const actor  = session?.name || null;
  const [tab, setTab] = useState("pl");
  // Date filter — applies across every tab where dates make sense (P&L,
  // fees, donations, teacher attendance, academic). Empty string = unbounded.
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate]     = useState("");
  const [preset, setPreset]     = useState("all");

  function applyPreset(k) {
    setPreset(k);
    const today = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    if (k === "all")   { setFromDate(""); setToDate(""); return; }
    if (k === "today") { setFromDate(iso(today)); setToDate(iso(today)); return; }
    if (k === "7d")    { const d = new Date(today); d.setDate(d.getDate() - 6); setFromDate(iso(d)); setToDate(iso(today)); return; }
    if (k === "30d")   { const d = new Date(today); d.setDate(d.getDate() - 29); setFromDate(iso(d)); setToDate(iso(today)); return; }
    if (k === "month") {
      const m = new Date(today.getFullYear(), today.getMonth(), 1);
      setFromDate(iso(m)); setToDate(iso(today)); return;
    }
    if (k === "fy") {
      // Indian financial year: 1 Apr → 31 Mar. If we're in Jan–Mar use last
      // year's April; otherwise this year's April.
      const y = today.getMonth() < 3 ? today.getFullYear() - 1 : today.getFullYear();
      setFromDate(`${y}-04-01`); setToDate(iso(today)); return;
    }
  }

  // True iff `iso` (a YYYY-MM-DD or full ISO) is inside [fromDate, toDate].
  // Empty filter inputs are treated as unbounded on that side. A null input
  // is excluded only if the filter is active — when both inputs are blank,
  // everything passes (so legacy records without dates still show up).
  function inDateRange(iso) {
    if (!fromDate && !toDate) return true;
    if (!iso) return false;
    const d = String(iso).slice(0, 10);
    if (fromDate && d < fromDate) return false;
    if (toDate   && d > toDate)   return false;
    return true;
  }
  const dateFilterActive = !!(fromDate || toDate);

  // Pre-filter source arrays so every rollup downstream automatically respects
  // the date window. Each entity uses its own date-bearing field.
  const fees = useMemo(
    () => (E.RECENT_FEES || []).filter((f) => inDateRange(f.paidAt)),
    [E.RECENT_FEES, fromDate, toDate]
  );
  const pending = E.PENDING_FEES || []; // due dates are forward-looking; not date-filtered
  const expenses = useMemo(
    () => (E.EXPENSES || []).filter((e) => inDateRange(e.date)),
    [E.EXPENSES, fromDate, toDate]
  );
  const receipts = useMemo(
    () => (E.DONOR_RECEIPTS || []).filter((r) => inDateRange(r.issuedAt)),
    [E.DONOR_RECEIPTS, fromDate, toDate]
  );
  const donors   = E.DONORS || [];
  const campaigns= E.CAMPAIGNS || [];
  const students = E.ADDED_STUDENTS || [];
  const teacherAtt = useMemo(
    () => (E.TEACHER_ATTENDANCE || []).filter((r) => inDateRange(r.date)),
    [E.TEACHER_ATTENDANCE, fromDate, toDate]
  );
  const exams = useMemo(
    () => (E.EXAMS || []).filter((e) => inDateRange(e.date)),
    [E.EXAMS, fromDate, toDate]
  );
  // Marks don't carry their own date — inherit it from the parent exam, then
  // apply the same filter.
  const marks = useMemo(() => {
    const examDates = new Map((E.EXAMS || []).map((e) => [e.id, e.date]));
    return (E.MARKS || []).filter((m) => inDateRange(examDates.get(m.examId)));
  }, [E.MARKS, E.EXAMS, fromDate, toDate]);

  // ---- Tab 1: P&L by month ----
  // Group by month (YYYY-MM). Income = fees + donation receipts; Expense = expenses.
  const pl = useMemo(() => {
    const months = new Map(); // key -> { income_school, income_trust, expense_school, expense_trust }
    const bump = (key, k, v) => {
      if (!months.has(key)) months.set(key, { income_school: 0, income_trust: 0, expense_school: 0, expense_trust: 0 });
      months.get(key)[k] += v;
    };
    for (const f of fees) {
      // RECENT_FEES has free-form `time` strings ("just now" etc.) — fall back
      // to the current month so they don't disappear from the report.
      const key = isoMonthFrom(f.time) || isoMonthNow();
      bump(key, "income_school", f.amount || 0);
    }
    for (const r of receipts) {
      const key = (r.issuedAt || "").slice(0, 7) || isoMonthNow();
      bump(key, "income_trust", r.amount || 0);
    }
    for (const e of expenses) {
      const key = (e.date || "").slice(0, 7) || isoMonthNow();
      const k = (e.scope === "trust" ? "expense_trust" : "expense_school");
      bump(key, k, e.amount || 0);
    }
    return [...months.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, v]) => ({
      month,
      monthLabel: monthLabel(month),
      income: v.income_school + v.income_trust,
      expense: v.expense_school + v.expense_trust,
      net: v.income_school + v.income_trust - v.expense_school - v.expense_trust,
      ...v,
    }));
  }, [fees, receipts, expenses]);

  // ---- Tab 2: Fee collection by class ----
  // Per-student aggregate first — drives the expandable drill-down beneath
  // each class row in the report. Keys are studentId; falls back to id+cls
  // for legacy receipts that never had a studentId.
  const feeByStudent = useMemo(() => {
    const map = new Map();
    // Seed every enrolled student so a 0-collected, 0-pending student still
    // shows up under their class (otherwise newly-admitted children with no
    // receipts yet would silently disappear from the drill-down).
    for (const s of students) {
      map.set(s.id, {
        id: s.id, name: s.name, cls: s.cls,
        collected: 0, pending: 0,
      });
    }
    for (const f of fees) {
      const sid = f.studentId || f.id;
      if (!sid) continue;
      if (!map.has(sid)) {
        map.set(sid, { id: sid, name: f.name || sid, cls: f.cls || "—", collected: 0, pending: 0 });
      }
      map.get(sid).collected += f.amount || 0;
    }
    for (const p of pending) {
      const sid = p.studentId || p.id;
      if (!sid) continue;
      if (!map.has(sid)) {
        map.set(sid, { id: sid, name: p.name || sid, cls: p.cls || "—", collected: 0, pending: 0 });
      }
      map.get(sid).pending += p.amount || 0;
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [students, fees, pending]);

  // Per-class summary derived from feeByStudent so the totals stay in sync.
  const feeByClass = useMemo(() => {
    const map = new Map();
    for (const r of feeByStudent) {
      if (!map.has(r.cls)) map.set(r.cls, { cls: r.cls, students: 0, collected: 0, pending: 0, rows: [] });
      const c = map.get(r.cls);
      c.students += 1;
      c.collected += r.collected;
      c.pending += r.pending;
      c.rows.push(r);
    }
    return [...map.values()].sort((a, b) => a.cls.localeCompare(b.cls));
  }, [feeByStudent]);

  // Which classes are currently expanded in the fee table.
  const [expandedFeeRows, setExpandedFeeRows] = useState(() => new Set());
  const toggleFeeRow = (cls) => setExpandedFeeRows((prev) => {
    const next = new Set(prev);
    if (next.has(cls)) next.delete(cls); else next.add(cls);
    return next;
  });

  // ---- Tab 3: Donation summary ----
  const donationSummary = useMemo(() => {
    const byType = new Map();
    for (const d of donors) {
      if (!byType.has(d.type)) byType.set(d.type, { type: d.type, donors: 0, ytd: 0 });
      const e = byType.get(d.type);
      e.donors += 1;
      e.ytd += d.ytd || 0;
    }
    return {
      totalRaised: receipts.reduce((a, r) => a + (r.amount || 0), 0),
      totalReceipts: receipts.length,
      byType: [...byType.values()].sort((a, b) => b.ytd - a.ytd),
      topDonors: [...donors].sort((a, b) => (b.ytd || 0) - (a.ytd || 0)).slice(0, 10),
      activeCampaigns: campaigns.filter((c) => c.status !== "completed"),
    };
  }, [donors, receipts, campaigns]);

  // ---- Tab 4: Student strength ----
  const strength = useMemo(() => {
    const map = new Map();
    for (const s of students) {
      const grade = String(s.cls).split("-")[0];
      if (!map.has(grade)) map.set(grade, { grade, total: 0, sections: new Set() });
      map.get(grade).total += 1;
      map.get(grade).sections.add(String(s.cls).split("-")[1] || "—");
    }
    return [...map.values()]
      .map((g) => ({ grade: g.grade, total: g.total, sections: [...g.sections].sort().join(", ") }))
      .sort((a, b) => Number(a.grade) - Number(b.grade));
  }, [students]);

  // ---- Tab 5: Teacher attendance summary (per teacher) ----
  // Tab-local filters layered on top of the global From/To at the page top.
  // "All" or "" leaves that dimension unbounded.
  const [taYear, setTaYear]   = useState("All");
  const [taMonth, setTaMonth] = useState("All");
  const [taFrom, setTaFrom]   = useState("");
  const [taTo, setTaTo]       = useState("");

  // Range of years actually present in the records, plus the current year.
  const taYears = useMemo(() => {
    const ys = new Set();
    ys.add(new Date().getFullYear());
    for (const r of (E.TEACHER_ATTENDANCE || [])) {
      const y = String(r.date || "").slice(0, 4);
      if (/^\d{4}$/.test(y)) ys.add(Number(y));
    }
    return [...ys].sort((a, b) => b - a);
  }, [E.TEACHER_ATTENDANCE]);
  const TA_MONTHS = [
    { v: "01", label: "January" },  { v: "02", label: "February" }, { v: "03", label: "March" },
    { v: "04", label: "April" },    { v: "05", label: "May" },      { v: "06", label: "June" },
    { v: "07", label: "July" },     { v: "08", label: "August" },   { v: "09", label: "September" },
    { v: "10", label: "October" },  { v: "11", label: "November" }, { v: "12", label: "December" },
  ];

  const teacherAttFiltered = useMemo(() => {
    return (teacherAtt || []).filter((r) => {
      const d = String(r.date || "").slice(0, 10);
      if (!d) return false;
      if (taYear !== "All" && d.slice(0, 4) !== String(taYear)) return false;
      if (taMonth !== "All" && d.slice(5, 7) !== taMonth) return false;
      if (taFrom && d < taFrom) return false;
      if (taTo && d > taTo) return false;
      return true;
    });
  }, [teacherAtt, taYear, taMonth, taFrom, taTo]);

  const teacherAttSummary = useMemo(() => {
    const map = new Map();
    for (const r of teacherAttFiltered) {
      if (!map.has(r.teacherId)) {
        map.set(r.teacherId, { teacherId: r.teacherId, teacherName: r.teacherName, present: 0, absent: 0, leave: 0, total: 0, lastDate: r.date });
      }
      const e = map.get(r.teacherId);
      e[r.status] = (e[r.status] || 0) + 1;
      e.total += 1;
      if (r.date > (e.lastDate || "")) e.lastDate = r.date;
    }
    return [...map.values()]
      .map((e) => ({ ...e, pct: e.total > 0 ? Math.round((e.present / e.total) * 100) : 0 }))
      .sort((a, b) => b.pct - a.pct);
  }, [teacherAttFiltered]);

  // ---- Tab 6: Academic performance ----
  // Two views: (a) per-exam class average + top scorer; (b) per-student term avg.
  const examPerf = useMemo(() => {
    return exams.map((e) => {
      const ms = marks.filter((m) => m.examId === e.id);
      if (ms.length === 0) return { ...e, count: 0, avgPct: null, top: null };
      const totalPct = ms.reduce((a, m) => a + (m.score / m.maxMarks) * 100, 0);
      const top = [...ms].sort((a, b) => b.score - a.score)[0];
      return {
        ...e,
        count: ms.length,
        avgPct: Math.round(totalPct / ms.length),
        top: { name: top.studentName, score: top.score, max: top.maxMarks },
      };
    }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [exams, marks]);

  const studentPerf = useMemo(() => {
    const map = new Map();
    for (const m of marks) {
      if (!map.has(m.studentId)) {
        map.set(m.studentId, { studentId: m.studentId, studentName: m.studentName, totalPct: 0, count: 0 });
      }
      const e = map.get(m.studentId);
      e.totalPct += (m.score / m.maxMarks) * 100;
      e.count += 1;
    }
    return [...map.values()]
      .map((e) => ({ ...e, avgPct: e.count > 0 ? Math.round(e.totalPct / e.count) : 0 }))
      .sort((a, b) => b.avgPct - a.avgPct);
  }, [marks]);

  // Build a printable HTML document for the active tab + open it in a new
  // tab. The browser's print dialog is the user's "Save as PDF" entry point —
  // works on every OS without us shipping a PDF library.
  function downloadPdf() {
    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
    // If a date range is active, append it to the title and prepend a banner
    // to the body so the printed PDF carries the filter context.
    const rangeLabel = dateFilterActive
      ? ` · ${fromDate || "start"} → ${toDate || "today"}`
      : "";
    const rangeBanner = dateFilterActive
      ? `<div style="margin:-8px 0 18px;padding:8px 12px;background:#fdf3df;border:1px solid #e8d39a;border-radius:6px;font-size:11.5px;color:#5a4318;">
          <b>Filtered:</b> ${fromDate || "the beginning"} → ${toDate || "now"} · records without a date are excluded.
        </div>`
      : "";
    let title = "Report", body = "";
    if (tab === "pl") {
      title = "Monthly Profit & Loss";
      body = renderTable(
        ["Month", "Income · School", "Income · Trust", "Expense · School", "Expense · Trust", "Total income", "Total expense", "Net"],
        pl.map((r) => [
          r.monthLabel,
          fmtRupees(r.income_school),
          fmtRupees(r.income_trust),
          fmtRupees(r.expense_school),
          fmtRupees(r.expense_trust),
          fmtRupees(r.income),
          fmtRupees(r.expense),
          { html: `<b style="color:${r.net >= 0 ? "#1f7a4d" : "#b13c1c"}">${r.net >= 0 ? "+" : ""}${fmtRupees(r.net)}</b>` },
        ]),
        ["", "num", "num", "num", "num", "num", "num", "num"],
      );
      body += summaryRow("Year-to-date totals", [
        ["Total income",  fmtRupees(pl.reduce((a, r) => a + r.income, 0))],
        ["Total expense", fmtRupees(pl.reduce((a, r) => a + r.expense, 0))],
        ["Net surplus",   fmtRupees(pl.reduce((a, r) => a + r.net, 0))],
      ]);
    } else if (tab === "fees") {
      title = "Fee Collection by Class";
      // Each class becomes a parent row with its students inset beneath, so
      // a printed report shows names and individual balances — not just
      // class totals.
      const rows = [];
      for (const r of feeByClass) {
        const total = r.collected + r.pending;
        const pct = total > 0 ? Math.round((r.collected / total) * 100) : 0;
        rows.push([
          { html: `<b>${escapeHtml(formatClassLabel(r.cls))}</b>` },
          r.students,
          fmtRupees(r.collected),
          fmtRupees(r.pending),
          `${pct}%`,
        ]);
        for (const stu of (r.rows || [])) {
          const stuTotal = stu.collected + stu.pending;
          const stuPct = stuTotal > 0 ? Math.round((stu.collected / stuTotal) * 100) : 0;
          rows.push([
            { html: `<span style="padding-left:18px;color:#5a4318">${escapeHtml(stu.name)}</span> <span style="font-family:monospace;color:#9c8c6e;font-size:10.5px">${escapeHtml(stu.id)}</span>` },
            "—",
            fmtRupees(stu.collected),
            fmtRupees(stu.pending),
            stu.pending === 0 && stu.collected > 0 ? "Paid" : (stuTotal === 0 ? "—" : `${stuPct}%`),
          ]);
        }
      }
      body = renderTable(
        ["Class / Student", "Students", "Collected", "Pending", "Coverage %"],
        rows,
        ["", "num", "num", "num", "num"],
      );
    } else if (tab === "donors") {
      title = "Donation Summary";
      body = `<h3>By donor type</h3>` + renderTable(
        ["Type", "Donors", "YTD raised"],
        donationSummary.byType.map((r) => [r.type, r.donors, fmtRupees(r.ytd)]),
        ["", "num", "num"],
      );
      body += `<h3 style="margin-top:24px">Top 10 donors</h3>` + renderTable(
        ["#", "Donor", "Type", "YTD"],
        donationSummary.topDonors.map((d, i) => [i + 1, d.name, d.type, fmtRupees(d.ytd || 0)]),
        ["num", "", "", "num"],
      );
      body += summaryRow("Totals", [
        ["Total raised",  fmtRupees(donationSummary.totalRaised)],
        ["Receipts issued", donationSummary.totalReceipts],
        ["Avg per receipt", donationSummary.totalReceipts > 0
          ? fmtRupees(Math.round(donationSummary.totalRaised / donationSummary.totalReceipts))
          : "—"],
      ]);
    } else if (tab === "strength") {
      title = "Student Strength by Grade";
      body = renderTable(
        ["Grade", "Total students", "Share %"],
        strength.map((g) => {
          const pct = students.length > 0 ? Math.round((g.total / students.length) * 100) : 0;
          return [formatClassLabel(String(g.grade)), g.total, `${pct}%`];
        }),
        ["", "num", "num"],
      );
      body += summaryRow("Totals", [
        ["Total on roll", students.length],
        ["Grades active", strength.length],
      ]);
    } else if (tab === "teachers") {
      title = "Teacher Attendance Report";
      // If any tab-local filter is active, surface it at the top of the
      // printed body so the reader knows what's being shown.
      const taFilterBits = [];
      if (taYear !== "All")  taFilterBits.push(`Year ${taYear}`);
      if (taMonth !== "All") taFilterBits.push(`Month ${TA_MONTHS.find((m) => m.v === taMonth)?.label || taMonth}`);
      if (taFrom)            taFilterBits.push(`From ${taFrom}`);
      if (taTo)              taFilterBits.push(`To ${taTo}`);
      if (taFilterBits.length > 0) {
        body = `<div style="margin:-8px 0 18px;padding:8px 12px;background:#fff4dc;border:1px solid #c8510a;border-radius:6px;font-size:11.5px;color:#5a2a0a;">
          <b>Filtered:</b> ${escapeHtml(taFilterBits.join(" · "))}
        </div>`;
      } else {
        body = "";
      }
      body += renderTable(
        ["Teacher", "Days marked", "Present", "Absent", "Leave", "Attendance %", "Last marked"],
        teacherAttSummary.map((r) => [
          r.teacherName, r.total, r.present, r.absent, r.leave, `${r.pct}%`, r.lastDate || "—",
        ]),
        ["", "num", "num", "num", "num", "num", ""],
      );
      body += summaryRow("Totals", [
        ["Teachers tracked", teacherAttSummary.length],
        ["Day-records logged", teacherAttFiltered.length],
      ]);
    } else if (tab === "academic") {
      title = "Academic Performance Report";
      body  = `<h3>By exam</h3>` + renderTable(
        ["Date", "Class", "Subject", "Exam", "Type", "Students", "Avg %", "Top scorer"],
        examPerf.map((e) => [
          e.date, formatClassLabel(e.cls), e.subject, e.name, e.type,
          e.count,
          e.avgPct === null ? "—" : `${e.avgPct}%`,
          e.top ? `${e.top.name} (${e.top.score}/${e.top.max})` : "—",
        ]),
        ["", "", "", "", "", "num", "num", ""],
      );
      body += `<h3 style="margin-top:24px">Top 10 students · overall</h3>` + renderTable(
        ["#", "Student", "Exams written", "Average %"],
        studentPerf.slice(0, 10).map((s, i) => [i + 1, s.studentName, s.count, `${s.avgPct}%`]),
        ["num", "", "num", "num"],
      );
      body += summaryRow("Totals", [
        ["Exams on file", exams.length],
        ["Students assessed", studentPerf.length],
      ]);
    }
    openPrintWindow(title + rangeLabel, today, rangeBanner + body, { school, actor });
  }


  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Governance · Reports</div>
          <div className="page-title">Reports & <span className="amber">Financials</span></div>
          <div className="page-sub">Monthly P&amp;L · fee collection · donations · student strength</div>
        </div>
        <div className="page-actions">
          <button className="btn accent" onClick={downloadPdf} title="Open a printable, branded PDF report">
            <Icon name="reports" size={13} />Download PDF
          </button>
        </div>
      </div>

      {/* Top KPIs — inline-expand on click. Click any card and the
          breakdown drops down right below the strip; click again (or the
          ✕) to close. This deliberately avoids the modal popup pattern
          since the popup wasn't appearing reliably across all browsers. */}
      <ReportsKpiStrip
        pl={pl}
        expensesCount={expenses.length}
        donationSummary={donationSummary}
        studentsCount={students.length}
        strength={strength}
        donors={donors}
        students={students}
      />

      {/* Date range filter */}
      <div className="card" style={{ padding: "12px 14px", marginBottom: 10, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 500 }}>
          <Icon name="filter" size={11} /> Date range
        </span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {DATE_PRESETS.map((p) => (
            <button
              key={p.k}
              onClick={() => applyPreset(p.k)}
              style={{
                padding: "5px 10px", borderRadius: 999,
                background: preset === p.k ? "var(--accent-soft)" : "var(--bg-2)",
                color: preset === p.k ? "var(--accent-2)" : "var(--ink-2)",
                border: preset === p.k ? "1px solid var(--accent)" : "1px solid transparent",
                cursor: "pointer", fontSize: 11.5, fontWeight: 500,
              }}
            >{p.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
          <label style={{ fontSize: 11, color: "var(--ink-3)" }}>From</label>
          <input
            type="date"
            className="input"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => { setFromDate(e.target.value); setPreset("custom"); }}
            style={{ width: 150, height: 30, padding: "0 8px", fontSize: 12 }}
          />
          <label style={{ fontSize: 11, color: "var(--ink-3)" }}>To</label>
          <input
            type="date"
            className="input"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => { setToDate(e.target.value); setPreset("custom"); }}
            style={{ width: 150, height: 30, padding: "0 8px", fontSize: 12 }}
          />
          {dateFilterActive && (
            <button
              onClick={() => applyPreset("all")}
              className="btn ghost sm"
              title="Clear date filter"
              style={{ padding: "0 8px", height: 30 }}
            >
              <Icon name="x" size={11} />Clear
            </button>
          )}
        </div>
        {dateFilterActive && (
          <div style={{ flexBasis: "100%", fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>
            Showing data from <b>{fromDate || "the beginning"}</b> to <b>{toDate || "now"}</b>. Records without a date are excluded.
          </div>
        )}
      </div>

      {/* Tab strip */}
      <div className="card" style={{ padding: "10px 14px", marginBottom: 14, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 500, marginRight: 4 }}>Report:</span>
        {[
          { k: "pl",       label: "Monthly P&L" },
          { k: "fees",     label: "Fee collection" },
          { k: "donors",   label: "Donation summary" },
          { k: "strength", label: "Student strength" },
          { k: "teachers", label: "Teacher attendance" },
          { k: "academic", label: "Academic performance" },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            style={{
              padding: "6px 14px", borderRadius: 999,
              background: tab === t.k ? "var(--accent)" : "var(--bg-2)",
              color: tab === t.k ? "#fff" : "var(--ink-2)",
              border: 0, cursor: "pointer", fontSize: 12.5, fontWeight: 500,
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "pl" && (
        <div className="card">
          <div className="card-head">
            <div><div className="card-title">Monthly P&amp;L</div><div className="card-sub">Income, expense, net surplus per month — split by School & Trust</div></div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num">Income · School</th>
                  <th className="num">Income · Trust</th>
                  <th className="num">Expense · School</th>
                  <th className="num">Expense · Trust</th>
                  <th className="num">Net</th>
                </tr>
              </thead>
              <tbody>
                {pl.length === 0 && <tr><td colSpan={6} className="empty">No financial activity yet.</td></tr>}
                {pl.map((r) => (
                  <tr key={r.month}>
                    <td style={{ fontSize: 12.5, fontWeight: 500 }}>{r.monthLabel}</td>
                    <td className="num">{money(r.income_school)}</td>
                    <td className="num">{money(r.income_trust)}</td>
                    <td className="num" style={{ color: "var(--ink-3)" }}>{money(r.expense_school)}</td>
                    <td className="num" style={{ color: "var(--ink-3)" }}>{money(r.expense_trust)}</td>
                    <td className="num" style={{ fontWeight: 600, color: r.net >= 0 ? "var(--ok)" : "var(--bad)" }}>{r.net >= 0 ? "+" : ""}{money(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "fees" && (
        <div className="card">
          <div className="card-head">
            <div><div className="card-title">Fee collection by class</div><div className="card-sub">Click a class to see students · collected vs outstanding</div></div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr><th style={{ width: 28 }}></th><th>Class</th><th className="num">Students</th><th className="num">Collected</th><th className="num">Pending</th><th>Coverage</th></tr></thead>
              <tbody>
                {feeByClass.length === 0 && <tr><td colSpan={6} className="empty">No fee data yet.</td></tr>}
                {feeByClass.map((r) => {
                  const total = r.collected + r.pending;
                  const pct = total > 0 ? Math.round((r.collected / total) * 100) : 0;
                  const isOpen = expandedFeeRows.has(r.cls);
                  return (
                    <React.Fragment key={r.cls}>
                      <tr
                        onClick={() => toggleFeeRow(r.cls)}
                        style={{ cursor: "pointer", background: isOpen ? "var(--accent-soft, var(--card-2))" : undefined }}
                        title={isOpen ? "Hide students" : "Show students in this class"}
                      >
                        <td style={{ width: 28, textAlign: "center", color: "var(--ink-3)" }}>
                          <Icon name={isOpen ? "chevronDown" : "chevronRight"} size={12} />
                        </td>
                        <td style={{ fontSize: 12.5, fontWeight: 500 }}>{formatClassLabel(r.cls)}</td>
                        <td className="num">{r.students}</td>
                        <td className="num" style={{ color: "var(--ok)" }}>{money(r.collected)}</td>
                        <td className="num" style={{ color: r.pending > 0 ? "var(--bad)" : "var(--ink-3)" }}>{money(r.pending)}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div className="bar" style={{ flex: 1, maxWidth: 120 }}><span style={{ width: `${pct}%`, background: "var(--accent)" }} /></div>
                            <span className="mono" style={{ fontSize: 11 }}>{pct}%</span>
                          </div>
                        </td>
                      </tr>

                      {isOpen && (r.rows || []).map((stu) => {
                        const stuTotal = stu.collected + stu.pending;
                        const stuPct = stuTotal > 0 ? Math.round((stu.collected / stuTotal) * 100) : 0;
                        return (
                          <tr key={`${r.cls}-${stu.id}`} style={{ background: "var(--card-2)" }}>
                            <td></td>
                            <td style={{ paddingLeft: 28, fontSize: 12 }}>
                              <div style={{ fontWeight: 500 }}>{stu.name}</div>
                              <div style={{ fontSize: 10.5, color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}>{stu.id}</div>
                            </td>
                            <td className="num" style={{ fontSize: 11, color: "var(--ink-4)" }}>—</td>
                            <td className="num" style={{ fontSize: 12, color: stu.collected > 0 ? "var(--ok)" : "var(--ink-4)" }}>
                              {money(stu.collected)}
                            </td>
                            <td className="num" style={{ fontSize: 12, color: stu.pending > 0 ? "var(--bad)" : "var(--ink-4)" }}>
                              {money(stu.pending)}
                            </td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div className="bar" style={{ flex: 1, maxWidth: 120 }}>
                                  <span style={{
                                    width: `${stuPct}%`,
                                    background: stu.pending === 0 && stu.collected > 0 ? "var(--ok)" : "var(--accent)",
                                  }} />
                                </div>
                                <span className="mono" style={{ fontSize: 10.5 }}>
                                  {stu.pending === 0 && stu.collected > 0 ? "Paid" : stuTotal === 0 ? "—" : `${stuPct}%`}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "donors" && (
        <div className="grid g-12">
          <div className="card col-12" style={{ padding: 0 }}>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
              padding: "16px 20px", gap: 16,
            }}>
              <DonationTotalStat
                label="Total raised"
                value={money(donationSummary.totalRaised)}
                sub={`across ${donationSummary.totalReceipts} receipt${donationSummary.totalReceipts === 1 ? "" : "s"}`}
                tone="ok"
              />
              <DonationTotalStat
                label="Donors on file"
                value={donors.length}
                sub={`${donationSummary.byType.length} donor type${donationSummary.byType.length === 1 ? "" : "s"}`}
              />
              <DonationTotalStat
                label="Avg per receipt"
                value={donationSummary.totalReceipts > 0
                  ? money(Math.round(donationSummary.totalRaised / donationSummary.totalReceipts))
                  : "—"}
                sub={donationSummary.activeCampaigns?.length ? `${donationSummary.activeCampaigns.length} active campaign${donationSummary.activeCampaigns.length === 1 ? "" : "s"}` : "no active campaigns"}
              />
            </div>
          </div>
          <div className="card col-6">
            <div className="card-head"><div><div className="card-title">By donor type</div></div></div>
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead><tr><th>Type</th><th className="num">Donors</th><th className="num">YTD raised</th></tr></thead>
                <tbody>
                  {donationSummary.byType.length === 0 && <tr><td colSpan={3} className="empty">No donors on file.</td></tr>}
                  {donationSummary.byType.map((r) => (
                    <tr key={r.type}>
                      <td><span className={`chip ${r.type === "CSR" ? "accent" : ""}`}><span className="dot" />{r.type}</span></td>
                      <td className="num">{r.donors}</td>
                      <td className="num" style={{ fontWeight: 500 }}>{money(r.ytd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card col-6">
            <div className="card-head"><div><div className="card-title">Top 10 donors · YTD</div></div></div>
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead><tr><th>Donor</th><th>Type</th><th className="num">YTD</th></tr></thead>
                <tbody>
                  {donationSummary.topDonors.length === 0 && <tr><td colSpan={3} className="empty">No donors yet.</td></tr>}
                  {donationSummary.topDonors.map((d) => (
                    <tr key={d.id}>
                      <td style={{ fontSize: 12.5, fontWeight: 500 }}>{d.name}</td>
                      <td style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{d.type}</td>
                      <td className="num">{money(d.ytd || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "strength" && (
        <div className="card">
          <div className="card-head">
            <div><div className="card-title">Student strength · by grade</div><div className="card-sub">Total: {students.length} students</div></div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr><th>Grade</th><th className="num">Total students</th><th>Sections</th><th>Distribution</th></tr></thead>
              <tbody>
                {strength.length === 0 && <tr><td colSpan={4} className="empty">No students on roll yet.</td></tr>}
                {strength.map((g) => {
                  const pct = students.length > 0 ? Math.round((g.total / students.length) * 100) : 0;
                  return (
                    <tr key={g.grade}>
                      <td style={{ fontSize: 12.5, fontWeight: 500 }}>{formatClassLabel(String(g.grade))}</td>
                      <td className="num">{g.total}</td>
                      <td style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{g.sections}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div className="bar" style={{ flex: 1, maxWidth: 200 }}><span style={{ width: `${pct}%`, background: "var(--accent)" }} /></div>
                          <span className="mono" style={{ fontSize: 11 }}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "teachers" && (
        <div className="card">
          <div className="card-head" style={{ flexWrap: "wrap", gap: 12 }}>
            <div>
              <div className="card-title">Teacher attendance summary</div>
              <div className="card-sub">
                {teacherAttSummary.length} teacher{teacherAttSummary.length === 1 ? "" : "s"} tracked ·{" "}
                {teacherAttFiltered.length} day-record{teacherAttFiltered.length === 1 ? "" : "s"}
                {(taYear !== "All" || taMonth !== "All" || taFrom || taTo) && (
                  <> · <span style={{ color: "var(--accent)" }}>filtered</span></>
                )}
              </div>
            </div>
            <div className="card-actions" style={{ flexWrap: "wrap", gap: 8 }}>
              <select className="select" value={taYear} onChange={(e) => setTaYear(e.target.value)} style={{ height: 28 }} title="Filter by year">
                <option value="All">All years</option>
                {taYears.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <select className="select" value={taMonth} onChange={(e) => setTaMonth(e.target.value)} style={{ height: 28 }} title="Filter by month">
                <option value="All">All months</option>
                {TA_MONTHS.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
              </select>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-3)" }}>
                From
                <input type="date" className="input" value={taFrom} max={taTo || undefined}
                  onChange={(e) => setTaFrom(e.target.value)}
                  style={{ height: 28, padding: "0 8px" }} />
              </label>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-3)" }}>
                To
                <input type="date" className="input" value={taTo} min={taFrom || undefined}
                  onChange={(e) => setTaTo(e.target.value)}
                  style={{ height: 28, padding: "0 8px" }} />
              </label>
              {(taYear !== "All" || taMonth !== "All" || taFrom || taTo) && (
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() => { setTaYear("All"); setTaMonth("All"); setTaFrom(""); setTaTo(""); }}
                  title="Clear all teacher attendance filters"
                >
                  <Icon name="x" size={11} />Clear
                </button>
              )}
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr><th>Teacher</th><th className="num">Days</th><th className="num">Present</th><th className="num">Absent</th><th className="num">Leave</th><th>Coverage</th><th>Last marked</th></tr></thead>
              <tbody>
                {teacherAttSummary.length === 0 && <tr><td colSpan={7} className="empty">No teacher attendance recorded yet. Teachers can self-mark on their dashboard.</td></tr>}
                {teacherAttSummary.map((r) => (
                  <tr key={r.teacherId}>
                    <td style={{ fontSize: 12.5, fontWeight: 500 }}>{r.teacherName}</td>
                    <td className="num">{r.total}</td>
                    <td className="num" style={{ color: "var(--ok)" }}>{r.present}</td>
                    <td className="num" style={{ color: r.absent > 0 ? "var(--bad)" : "var(--ink-3)" }}>{r.absent}</td>
                    <td className="num" style={{ color: r.leave > 0 ? "var(--warn)" : "var(--ink-3)" }}>{r.leave}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div className="bar" style={{ flex: 1, maxWidth: 140 }}><span style={{ width: `${r.pct}%`, background: r.pct < 80 ? "var(--bad)" : "var(--accent)" }} /></div>
                        <span className="mono" style={{ fontSize: 11 }}>{r.pct}%</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 11.5, color: "var(--ink-3)", whiteSpace: "nowrap" }}>{r.lastDate || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "academic" && (
        <div className="grid g-12">
          <div className="card col-7">
            <div className="card-head">
              <div><div className="card-title">By exam</div><div className="card-sub">Class average + top scorer per assessment</div></div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead><tr><th>Date</th><th>Class</th><th>Exam</th><th className="num">Students</th><th className="num">Avg %</th><th>Top scorer</th></tr></thead>
                <tbody>
                  {examPerf.length === 0 && <tr><td colSpan={6} className="empty">No exams created yet. Teachers can add exams + record marks from the Exams screen.</td></tr>}
                  {examPerf.map((e) => (
                    <tr key={e.id}>
                      <td style={{ fontSize: 11.5, color: "var(--ink-3)", whiteSpace: "nowrap" }}>{e.date}</td>
                      <td><span className="chip">{formatClassLabel(e.cls)}</span></td>
                      <td>
                        <div style={{ fontSize: 12.5, fontWeight: 500 }}>{e.subject} — {e.name}</div>
                        <div style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{e.type} · max {e.maxMarks}</div>
                      </td>
                      <td className="num">{e.count}</td>
                      <td className="num" style={{ fontWeight: 600, color: e.avgPct === null ? "var(--ink-4)" : e.avgPct >= 60 ? "var(--ok)" : e.avgPct >= 40 ? "var(--warn)" : "var(--bad)" }}>{e.avgPct === null ? "—" : `${e.avgPct}%`}</td>
                      <td style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                        {e.top ? <>{e.top.name} <span className="mono" style={{ color: "var(--ink-4)" }}>· {e.top.score}/{e.top.max}</span></> : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card col-5">
            <div className="card-head">
              <div><div className="card-title">Top 10 students · overall</div><div className="card-sub">Average across every recorded mark</div></div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead><tr><th>#</th><th>Student</th><th className="num">Exams</th><th className="num">Avg %</th></tr></thead>
                <tbody>
                  {studentPerf.length === 0 && <tr><td colSpan={4} className="empty">No marks recorded yet.</td></tr>}
                  {studentPerf.slice(0, 10).map((s, i) => (
                    <tr key={s.studentId}>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-4)", width: 28 }}>{i + 1}</td>
                      <td style={{ fontSize: 12.5, fontWeight: 500 }}>{s.studentName}</td>
                      <td className="num">{s.count}</td>
                      <td className="num" style={{ fontWeight: 600, color: s.avgPct >= 60 ? "var(--ok)" : s.avgPct >= 40 ? "var(--warn)" : "var(--bad)" }}>{s.avgPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function isoMonthFrom(t) {
  if (!t) return null;
  const m = String(t).match(/(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}
function isoMonthNow() {
  return new Date().toISOString().slice(0, 7);
}
// Self-contained KPI strip for Reports. Click any card → the matching
// breakdown panel drops down below the strip (real DOM, in-flow). No
// portal, no modal, no z-index — the panel is just a regular element so
// it always renders.
function ReportsKpiStrip({ pl, expensesCount, donationSummary, studentsCount, strength, donors = [], students = [] }) {
  const [open, setOpen] = useState(null); // 'income' | 'expense' | 'donations' | 'students' | null
  const incomeYtd  = pl.reduce((a, r) => a + r.income, 0);
  const expenseYtd = pl.reduce((a, r) => a + r.expense, 0);

  const cards = [
    {
      key: "income",
      label: "Total income · YTD",
      value: moneyK(incomeYtd),
      sub: `${pl.length} month${pl.length === 1 ? "" : "s"}`,
      puck: "mint", puckIcon: "trending",
      panelTitle: `Income · ${money(incomeYtd)}`,
      panelSub: "Per-month breakdown · click a row to see school / trust split",
      rows: pl.map((r) => ({
        label: r.monthLabel,
        value: money(r.income),
        sub: `${r.income_school ? "school " + moneyK(r.income_school) : ""}${r.income_trust ? ` · trust ${moneyK(r.income_trust)}` : ""}`.trim(),
        tone: "ok",
        children: [
          { label: "School income (fees)",        value: money(r.income_school || 0), tone: "ok" },
          { label: "Trust income (donations)",    value: money(r.income_trust || 0),  tone: "ok" },
          { label: "Month total",                 value: money(r.income || 0),         tone: "ok" },
        ],
      })),
    },
    {
      key: "expense",
      label: "Total expense · YTD",
      value: moneyK(expenseYtd),
      sub: `${expensesCount} entries`,
      puck: "peach", puckIcon: "money",
      panelTitle: `Expense · ${money(expenseYtd)}`,
      panelSub: "Per-month breakdown · click a row to see school / trust split",
      rows: pl.map((r) => ({
        label: r.monthLabel,
        value: money(r.expense),
        sub: `${r.expense_school ? "school " + moneyK(r.expense_school) : ""}${r.expense_trust ? ` · trust ${moneyK(r.expense_trust)}` : ""}`.trim(),
        tone: "bad",
        children: [
          { label: "School expense", value: money(r.expense_school || 0), tone: "bad" },
          { label: "Trust expense",  value: money(r.expense_trust  || 0), tone: "bad" },
          { label: "Month total",    value: money(r.expense || 0),        tone: "bad" },
        ],
      })),
    },
    {
      key: "donations",
      label: "Donations raised",
      value: moneyK(donationSummary.totalRaised),
      sub: `${donationSummary.totalReceipts} receipts`,
      puck: "cream", puckIcon: "donors",
      panelTitle: `Donations · ${money(donationSummary.totalRaised)}`,
      panelSub: "By donor type · click a row to see the donors in that type",
      rows: donationSummary.byType.map((t) => {
        const donorsOfType = donors
          .filter((d) => d.type === t.type)
          .sort((a, b) => (b.ytd || 0) - (a.ytd || 0));
        return {
          label: t.type,
          value: money(t.ytd),
          sub: `${t.donors} donor${t.donors === 1 ? "" : "s"}`,
          tone: "ok",
          children: donorsOfType.map((d) => ({
            label: d.name,
            value: money(d.ytd || 0),
            sub: [d.email, d.phone].filter(Boolean).join(" · ") || "—",
            tone: "ok",
          })),
        };
      }),
    },
    {
      key: "students",
      label: "Students on roll",
      value: studentsCount,
      sub: `${strength.length} grade${strength.length === 1 ? "" : "s"}`,
      puck: "sky", puckIcon: "students",
      panelTitle: `Students · ${studentsCount}`,
      panelSub: "By grade · click a row to see students in that grade",
      rows: strength.map((g) => {
        const inGrade = students
          .filter((s) => String(s.cls || "").split("-")[0] === String(g.grade))
          .sort((a, b) => (a.cls || "").localeCompare(b.cls || ""));
        return {
          label: formatClassLabel(String(g.grade)),
          value: g.total,
          sub: g.sections,
          children: inGrade.map((s) => ({
            label: s.name,
            value: formatClassLabel(s.cls),
            sub: `${s.id}${s.parent && s.parent !== "—" ? ` · ${s.parent}` : ""}`,
          })),
        };
      }),
    },
  ];

  const active = cards.find((c) => c.key === open);

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="grid g-4">
        {cards.map((c) => {
          const isActive = open === c.key;
          return (
            <div
              key={c.key}
              onClick={() => setOpen(isActive ? null : c.key)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(isActive ? null : c.key); } }}
              className="kpi"
              style={{
                cursor: "pointer",
                borderColor: isActive ? "var(--accent)" : undefined,
                boxShadow: isActive ? "0 0 0 2px var(--accent-soft, #fde6d6)" : undefined,
              }}
            >
              <div className="kpi-top">
                <div className="lbl">{c.label}</div>
                {c.puck && (
                  <div className={`kpi-puck ${c.puck}`}>
                    <Icon name={c.puckIcon} size={16} />
                  </div>
                )}
              </div>
              <div className="val-row">
                <div className="val">{c.value}</div>
              </div>
              <div className="meta">
                <span>{c.sub}</span>
                <span style={{ marginLeft: "auto", color: isActive ? "var(--accent)" : "var(--ink-4)", fontSize: 11 }}>
                  {isActive ? "Hide ▲" : "Show ▼"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {active && (
        <div
          className="card"
          style={{
            marginTop: 10,
            border: "1px solid var(--accent, #c8510a)",
            borderRadius: 12,
          }}
        >
          <div className="card-head">
            <div>
              <div className="card-title">{active.panelTitle}</div>
              <div className="card-sub">{active.panelSub}</div>
            </div>
            <button
              className="icon-btn"
              onClick={() => setOpen(null)}
              title="Close"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {active.rows.length === 0 ? (
              <div className="empty">Nothing to show yet.</div>
            ) : (
              active.rows.map((r, i) => (
                <ExpandableRow key={i} row={r} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Single row inside a Reports KPI panel. If `row.children` is a non-empty
// array, the row becomes clickable — clicking it toggles a nested list
// of children indented one level so the principal can drill from
// "Individual donors" down to the actual donor names.
function ExpandableRow({ row }) {
  const [open, setOpen] = useState(false);
  const hasChildren = Array.isArray(row.children) && row.children.length > 0;
  const tone = row.tone === "ok" ? "var(--ok)"
    : row.tone === "bad" ? "var(--bad)"
    : row.tone === "warn" ? "var(--warn, #b07a18)"
    : "var(--ink-2)";

  return (
    <>
      <div
        onClick={hasChildren ? () => setOpen((v) => !v) : undefined}
        role={hasChildren ? "button" : undefined}
        tabIndex={hasChildren ? 0 : undefined}
        onKeyDown={hasChildren ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); } } : undefined}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 10px",
          background: "var(--bg-2)",
          border: "1px solid var(--rule-2)", borderRadius: 8,
          cursor: hasChildren ? "pointer" : "default",
        }}
        title={hasChildren ? (open ? "Hide details" : "Click to see details") : undefined}
      >
        {hasChildren && (
          <Icon
            name="chevronDown"
            size={11}
            style={{
              color: "var(--ink-4)",
              transition: "transform 120ms ease",
              transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500 }}>{row.label}</div>
          {row.sub && <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 2 }}>{row.sub}</div>}
        </div>
        <div className="mono" style={{ fontSize: 13, fontWeight: 500, color: tone }}>{row.value}</div>
      </div>
      {hasChildren && open && (
        <div style={{
          display: "flex", flexDirection: "column", gap: 4,
          marginLeft: 18, marginTop: 2, marginBottom: 4,
          paddingLeft: 10, borderLeft: "2px solid var(--rule-2)",
        }}>
          {row.children.map((c, i) => {
            const ctone = c.tone === "ok" ? "var(--ok)"
              : c.tone === "bad" ? "var(--bad)"
              : c.tone === "warn" ? "var(--warn, #b07a18)"
              : "var(--ink-2)";
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "6px 10px",
                background: "var(--card)",
                border: "1px solid var(--rule-2)", borderRadius: 7,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{c.label}</div>
                  {c.sub && <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 2 }}>{c.sub}</div>}
                </div>
                <div className="mono" style={{ fontSize: 12, fontWeight: 500, color: ctone }}>{c.value}</div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function monthLabel(iso) {
  const d = new Date(iso + "-01");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

// ---- PDF (printable HTML) helpers ----
function fmtRupees(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }

function renderTable(headers, rows, aligns = []) {
  const thead = headers.map((h, i) => `<th style="text-align:${aligns[i] === "num" ? "right" : "left"}">${h}</th>`).join("");
  const tbody = rows.length === 0
    ? `<tr><td colspan="${headers.length}" style="text-align:center;color:#888;padding:18px">No data.</td></tr>`
    : rows.map((row) => {
        const cells = row.map((v, i) => {
          const align = aligns[i] === "num" ? "right" : "left";
          if (v && typeof v === "object" && v.html) return `<td style="text-align:${align}">${v.html}</td>`;
          return `<td style="text-align:${align}">${escapeHtml(String(v ?? ""))}</td>`;
        }).join("");
        return `<tr>${cells}</tr>`;
      }).join("");
  return `<table class="rpt"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;
}

function summaryRow(title, pairs) {
  const cells = pairs.map(([l, v]) =>
    `<div class="sum-cell"><div class="sum-lbl">${escapeHtml(l)}</div><div class="sum-val">${escapeHtml(String(v))}</div></div>`
  ).join("");
  return `<div class="sum-row"><div class="sum-title">${escapeHtml(title)}</div><div class="sum-cells">${cells}</div></div>`;
}

function DonationTotalStat({ label, value, sub, tone }) {
  const valueColor = tone === "ok" ? "var(--ok, #1f7a4d)" : "var(--ink)";
  return (
    <div style={{
      padding: "10px 14px",
      background: "var(--card-2)",
      border: "1px solid var(--rule)",
      borderRadius: 9,
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ fontSize: 10.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>{label}</div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: valueColor, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--ink-4)" }}>{sub}</div>}
    </div>
  );
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Opens a fresh window with the school letterhead + supplied body, then triggers
// the print dialog so the user can pick "Save as PDF". Works on every browser
// without us shipping a heavyweight PDF library.
// Open a print-styled window with the standard Vidyalaya360 header.
//
// `opts.school` (optional) lets the caller override the bundled identity
// at runtime — typically passed from `E.SETTINGS` so the school's actual
// name, registration, PAN/80G, and contact land in the printed PDF.
// `opts.actor` puts "Generated by <name>" in the footer for audit trails.
export function openPrintWindow(title, dateLabel, bodyHtml, opts = {}) {
  const school = {
    name:      opts.school?.name      || "Sanfort International School",
    trustName: opts.school?.trustName || "Sanvi Educational and Charitable Trust",
    regNo:     opts.school?.regNo     || null,
    pan80g:    opts.school?.pan80g    || null,
    contact:   opts.school?.contact   || null,
    brand:     opts.school?.brand     || "Vidyalaya360",
  };
  const actorLine = opts.actor ? ` &middot; by ${escapeHtml(opts.actor)}` : "";
  const idMeta = [
    school.regNo  ? `Reg No: ${escapeHtml(school.regNo)}`  : "",
    school.pan80g ? `PAN/80G: ${escapeHtml(school.pan80g)}` : "",
    school.contact ? `Contact: ${escapeHtml(school.contact)}` : "",
  ].filter(Boolean).join(" &middot; ");

  const w = window.open("", "_blank", "width=900,height=1180");
  if (!w) return;
  const doc = w.document;
  doc.title = title;
  const style = doc.createElement("style");
  style.textContent = `
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body { font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif; color: #20140c; padding: 0; margin: 0; }
    .head { border-bottom: 2px solid #20140c; padding-bottom: 14px; margin-bottom: 22px; display: flex; justify-content: space-between; align-items: flex-end; }
    .school { font-size: 22px; font-weight: 700; letter-spacing: 0.3px; }
    .sub { font-size: 12px; color: #666; margin-top: 4px; }
    .id-meta { font-size: 10.5px; color: #777; margin-top: 4px; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
    .meta { font-size: 11px; color: #555; text-align: right; }
    h1 { font-size: 18px; margin: 0 0 4px; font-weight: 600; }
    h3 { font-size: 13px; margin: 0 0 10px; color: #444; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    table.rpt { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px; }
    table.rpt th, table.rpt td { padding: 8px 10px; border-bottom: 1px solid #e3e3e3; }
    table.rpt th { background: #faf8f4; font-weight: 600; color: #444; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; }
    table.rpt tr:last-child td { border-bottom: 0; }
    .sum-row { margin-top: 18px; background: #faf8f4; border: 1px solid #e3e3e3; border-radius: 6px; padding: 12px 14px; }
    .sum-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; color: #777; margin-bottom: 8px; font-weight: 600; }
    .sum-cells { display: flex; gap: 32px; flex-wrap: wrap; }
    .sum-cell .sum-lbl { font-size: 11px; color: #888; }
    .sum-cell .sum-val { font-size: 16px; font-weight: 600; color: #20140c; margin-top: 2px; }
    .footer { margin-top: 36px; font-size: 10.5px; color: #888; border-top: 1px solid #ddd; padding-top: 10px; display: flex; justify-content: space-between; }
  `;
  doc.head.appendChild(style);
  doc.body.innerHTML = `
    <div class="head">
      <div style="display:flex;align-items:center;gap:14px;">
        <img src="${window.location.origin}/logo.png" alt="logo" style="width:60px;height:60px;object-fit:contain;" />
        <div>
          <div class="school">${escapeHtml(school.name)}</div>
          <div class="sub">Run by ${escapeHtml(school.trustName)} &middot; ${escapeHtml(school.brand)}</div>
          ${idMeta ? `<div class="id-meta">${idMeta}</div>` : ""}
        </div>
      </div>
      <div class="meta">
        Report date<br /><b>${escapeHtml(dateLabel)}</b>
      </div>
    </div>
    <h1>${escapeHtml(title)}</h1>
    <div class="sub" style="margin-bottom:18px">Generated from ${escapeHtml(school.brand)} on ${escapeHtml(new Date().toLocaleString("en-IN"))}${actorLine}</div>
    ${bodyHtml}
    <div class="footer">
      <span>${escapeHtml(school.name)} &middot; ${escapeHtml(school.brand)} auto-generated report</span>
      <span>Tip: pick "Save as PDF" in the print dialog to keep a copy.</span>
    </div>
  `;
  w.focus();
  setTimeout(() => w.print(), 250);
}
