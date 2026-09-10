"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "../Icon";
import {
  KPI, EmptyState, SearchInput, SectionHeader, Drawer, Avatar,
  SkeletonTable, ScreenToast as Toast, PageHeader,
} from "../ui";
import { resolveSchool, downloadPdf, downloadCsv, csvHeaderLines } from "@/lib/export";
import { formatClassLabel, getWorkingDays, getHolidayDates } from "@/lib/format";
import { vocab, isCollege } from "@/lib/institution";
import {
  buildRegister, sortRegister, summarise, deriveCalendar, countWorkingDays,
  BAND_META, POLICIES, DEFAULT_BANDS,
} from "./eligibility-calc";

// Attendance shortage & exam eligibility.
//
// Affiliating universities gate exam entry on a minimum attendance percentage.
// This screen ranks a cohort against that bar worst-first and — the part that
// saves the examinations office a morning — works out for every short student
// whether they can still recover and the fewest days it takes.
//
// Where the data comes from, and why it is not just `E.DAILY_LOGS`:
// the shell bundle deliberately caps daily_logs at the last 7 days
// (SHELL_WINDOW_DAYS in backend/lib/db.js) because the table grows without
// bound. Seven days measured against a 55-day term would report the whole
// institution at ~12% and brand everyone detained. So this screen pulls the
// real range from the EXISTING GET /api/academic/attendance route, exactly as
// the Attendance screen's month register already does. No new endpoint, no
// schema change, and nothing is written back — a condonation grant is a
// decision the institution records itself, and inventing a database state for
// it would claim a workflow this build does not have.

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function ScreenEligibility({ E, role, session, setCurrent }) {
  const V = vocab();
  const college = isCollege();
  const school = resolveSchool(E?.SETTINGS);
  const actor = session?.name || null;

  const [policy, setPolicy] = useState("strict");
  const [bar, setBar] = useState(DEFAULT_BANDS.bar);
  const [floor, setFloor] = useState(DEFAULT_BANDS.floor);
  const [bandFilter, setBandFilter] = useState("at-risk");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("pct");
  const [examDate, setExamDate] = useState("");
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState(null);
  const flash = (msg, tone = "ok") => { setToast({ msg, tone }); setTimeout(() => setToast(null), 2600); };

  const bands = { bar, floor };

  const holidaySet = useMemo(() => new Set(getHolidayDates(E?.SETTINGS)), [E?.SETTINGS]);
  const roster = useMemo(() => (E?.ADDED_STUDENTS || []).filter((s) => s?.id), [E?.ADDED_STUDENTS]);

  const classOptions = useMemo(() => {
    const set = new Set(roster.map((s) => s.cls).filter(Boolean));
    return [...set].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  }, [roster]);

  // One cohort at a time: the route is per-class, and a 30-cohort college
  // would otherwise fire 30 requests on mount.
  const [clsFilter, setClsFilter] = useState("");
  useEffect(() => {
    if (!clsFilter && classOptions.length) setClsFilter(classOptions[0]);
  }, [classOptions, clsFilter]);

  // ---- hydrate the real range ------------------------------------------
  const [fetched, setFetched] = useState(null);   // null = not loaded, [] = loaded and empty
  const [loading, setLoading] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);

  const plannedForSelected = getWorkingDays(E?.SETTINGS, clsFilter);

  useEffect(() => {
    if (!clsFilter) return;
    let cancelled = false;
    setLoading(true);
    setFetchFailed(false);
    // Reach back far enough to cover the planned term. A six-day week makes
    // the calendar span roughly 7/6 of the working-day count; pad it.
    const span = Math.ceil(((plannedForSelected || 90) * 7) / 6) + 14;
    const from = new Date(Date.now() - span * 86400000).toISOString().slice(0, 10);
    (async () => {
      try {
        const r = await fetch(
          `/api/academic/attendance?cls=${encodeURIComponent(clsFilter)}&from=${from}&to=${todayISO()}`,
          { cache: "no-store" }
        );
        const j = await r.json();
        if (cancelled) return;
        if (j?.ok && Array.isArray(j.logs)) setFetched(j.logs);
        else { setFetched(null); setFetchFailed(true); }
      } catch {
        if (!cancelled) { setFetched(null); setFetchFailed(true); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clsFilter, plannedForSelected]);

  // Fall back to the shell bundle if the fetch failed — degraded, and said so.
  const usingShellWindow = fetched == null;
  const logs = useMemo(() => {
    if (fetched) return fetched;
    return (E?.DAILY_LOGS || []).filter((l) => !clsFilter || l.cls === clsFilter);
  }, [fetched, E?.DAILY_LOGS, clsFilter]);

  const logsByStudent = useMemo(() => {
    const m = new Map();
    for (const l of logs) {
      if (!l?.studentId) continue;
      let arr = m.get(l.studentId);
      if (!arr) { arr = []; m.set(l.studentId, arr); }
      arr.push(l);
    }
    for (const arr of m.values()) arr.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return m;
  }, [logs]);

  const calendar = useMemo(() => deriveCalendar(logs, holidaySet), [logs, holidaySet]);

  // Days left before the bar applies. Derived from an explicit exam date when
  // one is set; otherwise assumed from the planned term and labelled as an
  // assumption — a term where elapsed already equals planned would otherwise
  // silently report "cannot recover" for every short student.
  const remaining = useMemo(() => {
    if (examDate) {
      return countWorkingDays(todayISO(), examDate, { holidaySet, weekdays: calendar.weekdays });
    }
    return Math.max(0, (plannedForSelected || 0) - calendar.elapsed);
  }, [examDate, holidaySet, calendar, plannedForSelected]);

  const cohort = useMemo(
    () => roster.filter((s) => !clsFilter || s.cls === clsFilter),
    [roster, clsFilter]
  );

  const register = useMemo(() => buildRegister({
    roster: cohort,
    logsByStudent,
    calendarFor: () => calendar,
    plannedFor: (cls) => getWorkingDays(E?.SETTINGS, cls),
    remainingFor: () => remaining,
    holidaySet,
    bands,
    policy,
  }), [cohort, logsByStudent, calendar, E?.SETTINGS, remaining, holidaySet, bar, floor, policy]);

  const summary = useMemo(() => summarise(register), [register]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = register.filter((r) => {
      if (bandFilter === "at-risk" && (r.band === "eligible" || r.band === "unknown")) return false;
      if (bandFilter !== "at-risk" && bandFilter !== "All" && r.band !== bandFilter) return false;
      if (q && !`${r.name} ${r.id}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return sortRegister(filtered, sortKey, "asc");
  }, [register, bandFilter, search, sortKey]);

  const hasLogs = calendar.elapsed > 0;

  // ---- exports ---------------------------------------------------------
  const basisLine = `${policy === "lenient" ? "Lenient" : "Strict"} policy · ${bar}% bar · ${floor}% floor · ${calendar.elapsed} days registered${plannedForSelected ? ` of ${plannedForSelected} planned` : ""}${remaining ? ` · ${remaining} remaining` : ""}`;

  const outlookText = (r) => {
    if (r.pct == null) return "No register";
    if (r.band === "eligible") return r.projection.remaining === 0 ? "Clear" : `Clear, can miss ${r.projection.slack} more`;
    if (!r.projection.recoverable) {
      return r.projection.remaining === 0
        ? "Term complete, below the bar"
        : `Cannot reach ${bar} percent (short by ${r.projection.shortfall} days)`;
    }
    return `Attend ${r.projection.needed} of ${r.projection.remaining} left`;
  };

  const exportPdf = async () => {
    // A condonation list is by definition the students below the bar.
    const rows = register.filter((r) => r.band === "condonation" || r.band === "detained");
    if (!rows.length) return flash("No student is below the bar", "err");
    await downloadPdf({
      title: college ? "Condonation List" : "Attendance Shortage List",
      subtitle: `${formatClassLabel(clsFilter)} · ${basisLine}`,
      school, actor,
      orientation: "landscape",
      dateRange: calendar.firstDate ? `${calendar.firstDate} to ${calendar.lastDate}` : "Current term",
      summary: [
        { label: "Below bar", value: rows.length },
        { label: "Condonation", value: summary.condonation },
        { label: "Detained", value: summary.detained },
        { label: "Cannot recover", value: summary.unrecoverable },
      ],
      columns: [
        { key: "i",    label: "#",         align: "right", width: "26px" },
        { key: "id",   label: "Admission", width: "84px" },
        { key: "name", label: "Student",   width: "140px" },
        { key: "cls",  label: college ? "Semester" : "Class", width: "76px" },
        { key: "days", label: "Attended",  align: "right", width: "62px" },
        { key: "pct",  label: "Percent",   align: "right", width: "54px" },
        { key: "ab",   label: "Absent",    align: "right", width: "48px" },
        { key: "lv",   label: "Leave",     align: "right", width: "44px" },
        { key: "band", label: "Status",    width: "78px" },
        { key: "look", label: "Outlook",   width: "156px" },
      ],
      // No arrows or maths glyphs anywhere in these strings: jsPDF ships
      // WinAnsi Helvetica and anything outside it renders as garbage.
      rows: sortRegister(rows, "pct").map((r, i) => ({
        i: i + 1,
        id: r.id,
        name: r.name,
        cls: formatClassLabel(r.cls),
        days: `${r.attended}/${r.elapsed}`,
        pct: r.pct == null ? "-" : `${r.pct}%`,
        ab: r.tally.absent,
        lv: r.tally.leave,
        band: BAND_META[r.band].label,
        look: outlookText(r),
      })),
      filename: `condonation-${clsFilter || "cohort"}-${todayISO()}.pdf`,
    });
    flash("List exported");
  };

  const exportCsv = () => {
    if (!visible.length) return flash("Nothing to export with these filters", "err");
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = [
      "#", "Admission", "Student", college ? "Semester" : "Class",
      "Days registered", "Attended (strict)", "Percent (strict)",
      "Attended (lenient)", "Percent (lenient)",
      "Absent", "Leave", "Unmarked days", "Status",
      "Max attainable", "Days needed", "Recoverable",
    ];
    // Both policies always, so the emailed file never depends on which toggle
    // happened to be set when it was generated.
    const body = visible.map((r, i) => [
      i + 1, r.id, r.name, formatClassLabel(r.cls),
      r.elapsed, r.strict.attended, r.strict.pct ?? "",
      r.lenient.attended, r.lenient.pct ?? "",
      r.tally.absent, r.tally.leave, r.unmarkedDays,
      BAND_META[r.band].label,
      r.projection.maxAttainable ?? "", r.projection.needed ?? "",
      r.pct == null ? "" : (r.projection.recoverable ? "Yes" : "No"),
    ]);
    const csv = [
      ...csvHeaderLines(college ? "Condonation list" : "Attendance shortage list", {
        school, actor, recordCount: visible.length,
        dateRange: calendar.firstDate ? `${calendar.firstDate} to ${calendar.lastDate}` : null,
      }),
      `# Basis: ${basisLine}`,
      head.map(esc).join(","),
      ...body.map((r) => r.map(esc).join(",")),
    ].join("\n");
    downloadCsv({ filename: `attendance-eligibility-${clsFilter || "cohort"}-${todayISO()}.csv`, csv });
    flash("CSV exported");
  };

  // ---- render ----------------------------------------------------------
  const bandTabs = [
    { k: "at-risk",     label: `Needs action · ${summary.atRisk}` },
    { k: "detained",    label: `Detained · ${summary.detained}` },
    { k: "condonation", label: `Condonation · ${summary.condonation}` },
    { k: "eligible",    label: `Eligible · ${summary.eligible}` },
    { k: "All",         label: `All · ${summary.total}` },
  ];

  return (
    <div className="page">
      <Toast msg={toast?.msg} tone={toast?.tone} onClose={() => setToast(null)} />

      <PageHeader
        sub={`Every student in the cohort measured against the ${bar}% examination bar — and for those short of it, whether they can still recover and exactly how many days it takes.`}
        actions={
          <>
            <button className="btn" onClick={exportCsv}><Icon name="download" size={13} />CSV</button>
            <button className="btn accent" onClick={exportPdf}>
              <Icon name="reports" size={13} />{college ? "Condonation list" : "Shortage list"}
            </button>
          </>
        }
      />

      <div className="grid g-4" style={{ marginBottom: 14 }}>
        <KPI
          label="Below the bar" value={summary.atRisk}
          sub={summary.total ? `of ${summary.total} in ${formatClassLabel(clsFilter)}` : "no students in this cohort"}
          puck="rose" puckIcon="warning"
          progress={summary.total ? Math.round((summary.atRisk / summary.total) * 100) : undefined}
          progressTone={summary.atRisk === 0 ? "ok" : "warn"}
        />
        <KPI
          label="Cannot recover" value={summary.unrecoverable}
          sub={summary.unrecoverable
            ? `cannot reach ${bar}% even attending every remaining day`
            : "every short student can still recover"}
          puck="peach" puckIcon="x"
        />
        <KPI
          label="Condonation range" value={summary.condonation}
          sub={`between ${floor}% and ${bar}%`}
          puck="cream" puckIcon="reports"
        />
        <KPI
          label="Changes band on policy" value={summary.bandChangers}
          sub={summary.bandChangers ? "sanctioned leave decides their status" : "policy makes no difference here"}
          puck="sky" puckIcon="sliders"
        />
      </div>

      <div className="card" style={{ marginBottom: 14, padding: "12px 16px", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <span className="mstrip-lbl" style={{ marginTop: 0, whiteSpace: "nowrap" }}>{V.classWord}</span>
          <select className="select" value={clsFilter} onChange={(e) => setClsFilter(e.target.value)} style={{ width: 150 }}>
            {classOptions.map((c) => <option key={c} value={c}>{formatClassLabel(c)}</option>)}
          </select>
        </label>

        <div className="segmented">
          {POLICIES.map((p) => (
            <button key={p.key} type="button" className={policy === p.key ? "active" : ""}
              onClick={() => setPolicy(p.key)} title={p.hint}>{p.label}</button>
          ))}
        </div>

        <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <span className="field-hint" style={{ whiteSpace: "nowrap" }}>Bar</span>
          <input className="input" type="number" min={1} max={100} value={bar} style={{ width: 76 }}
            onChange={(e) => setBar(Math.min(100, Math.max(1, Number(e.target.value) || 0)))} />
        </label>
        <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <span className="field-hint" style={{ whiteSpace: "nowrap" }}>Floor</span>
          <input className="input" type="number" min={0} max={bar} value={floor} style={{ width: 76 }}
            onChange={(e) => setFloor(Math.min(bar, Math.max(0, Number(e.target.value) || 0)))} />
        </label>

        <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 7, marginLeft: "auto" }}>
          <span className="field-hint" style={{ whiteSpace: "nowrap" }}>Exam date</span>
          <input className="input" type="date" value={examDate} min={todayISO()} style={{ width: 158 }}
            onChange={(e) => setExamDate(e.target.value)} />
          <span className="chip" title={examDate
            ? "Working days between today and the exam"
            : "Assumed from the planned term — set an exam date to be exact"}>
            {remaining} left{examDate ? "" : " (assumed)"}
          </span>
        </label>
      </div>

      <BasisBanner
        loading={loading}
        hasLogs={hasLogs}
        usingShellWindow={usingShellWindow}
        fetchFailed={fetchFailed}
        calendar={calendar}
        planned={plannedForSelected}
        registerGaps={summary.registerGaps}
        examDate={examDate}
        V={V}
      />

      <SectionHeader
        title="Register"
        sub={`${visible.length} shown · anyone who cannot recover is listed first`}
        actions={
          <select className="select" value={sortKey} onChange={(e) => setSortKey(e.target.value)}
            style={{ width: 172 }} aria-label="Sort register by">
            <option value="pct">Sort · lowest percent</option>
            <option value="needed">Sort · days needed</option>
            <option value="absent">Sort · most absent</option>
            <option value="name">Sort · name</option>
          </select>
        }
      />

      <div className="card">
        <div className="toolbar" style={{ margin: 0, padding: "12px 18px", borderBottom: "1px solid var(--rule-2)" }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search name or admission no."
            style={{ width: 240, maxWidth: "100%" }} />
          <div className="segmented" style={{ minWidth: 0 }}>
            {bandTabs.map((t) => (
              <button key={t.k} type="button" className={bandFilter === t.k ? "active" : ""}
                onClick={() => setBandFilter(t.k)}>{t.label}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <SkeletonTable rows={8} cols={6} />
        ) : !hasLogs ? (
          <EmptyState
            icon="check"
            title="No attendance has been marked for this cohort"
            body={`Eligibility is computed from the daily register. The percentage shown on the Students screen is a stored profile figure, not a computed one — until the register is marked there is nothing to measure against the ${bar}% bar.`}
            action={setCurrent
              ? <button className="btn accent sm" onClick={() => setCurrent("attendance")}><Icon name="check" size={12} />Open attendance</button>
              : null}
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ minWidth: 190 }}>Student</th>
                  <th className="num">Attended</th>
                  <th style={{ minWidth: 128 }}>Against bar</th>
                  <th className="num">Absent</th>
                  <th>Status</th>
                  <th style={{ minWidth: 220 }}>Outlook</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 0 }}>
                    <EmptyState
                      icon={bandFilter === "at-risk" ? "check" : "search"}
                      title={bandFilter === "at-risk" ? "Nobody in this cohort is below the bar" : "No students match these filters"}
                      body={bandFilter === "at-risk"
                        ? `Every student with a marked register is at or above ${bar}%. Switch to All to see the whole cohort.`
                        : "Try another status tab, or clear the search."}
                    />
                  </td></tr>
                )}
                {visible.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <Avatar name={r.name} size="sm" />
                        <div style={{ minWidth: 0 }}>
                          <div className="t-primary truncate">{r.name}</div>
                          <div className="t-sub mono">{r.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="num">
                      {r.pct == null ? <span style={{ color: "var(--ink-4)" }}>—</span> : (
                        <>
                          <div style={{ fontWeight: 600, color: "var(--ink)" }}>{r.attended}/{r.elapsed}</div>
                          {r.unmarkedDays > 0 && (
                            <div className="t-sub" style={{ color: "var(--warn)" }}
                              title="Days the class was registered but this student has no row">
                              {r.unmarkedDays} unmarked
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td>
                      {r.pct == null ? <span style={{ color: "var(--ink-4)" }}>—</span> : (
                        <BarAgainstBar r={r} bar={bar} floor={floor} policy={policy} />
                      )}
                    </td>
                    <td className="num">
                      {r.tally.absent}
                      {r.tally.leave ? <div className="t-sub">+{r.tally.leave} leave</div> : null}
                    </td>
                    <td>
                      <span className={`chip ${BAND_META[r.band].tone}`} title={BAND_META[r.band].desc}>
                        <span className="dot" />{BAND_META[r.band].label}
                      </span>
                    </td>
                    <td><Outlook r={r} bar={bar} /></td>
                    <td>
                      <button className="btn sm" onClick={() => setDetail(r)} title="Day-by-day register">
                        <Icon name="eye" size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && <StudentDrawer r={detail} bar={bar} policy={policy} onClose={() => setDetail(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------------
   A regulatory register that does not state its own basis is not usable.
   Only renders when something about the basis is weak.
   ------------------------------------------------------------------------ */
function BasisBanner({ loading, hasLogs, usingShellWindow, fetchFailed, calendar, planned, registerGaps, examDate, V }) {
  if (loading || !hasLogs) return null;
  const problems = [];

  if (usingShellWindow) {
    problems.push(fetchFailed
      ? "The full-term history could not be loaded, so these figures cover only the few days held in the page bundle."
      : "Showing only the days held in the page bundle, not the full term.");
  }
  if (!planned) {
    problems.push(`No planned working days are set for this ${V.classWord.toLowerCase()}, so the projection relies on the exam date you pick.`);
  }
  if (registerGaps > 0) {
    problems.push(`${registerGaps} student${registerGaps === 1 ? " has" : "s have"} days where the class was registered but they have no row — those count against them until the register is completed.`);
  }
  if (!examDate) {
    problems.push("No exam date set, so days remaining are assumed from the planned term.");
  }
  if (!problems.length) return null;

  return (
    <div className="insight" style={{ marginBottom: 14, borderLeftColor: "var(--warn)" }}>
      <span className="eyebrow" style={{ color: "var(--warn)" }}><Icon name="info" size={11} />Basis</span>
      <div className="headline">
        {calendar.elapsed} days registered{planned ? ` of ${planned} planned` : ""}
        {calendar.firstDate ? ` · ${calendar.firstDate} to ${calendar.lastDate}` : ""}
      </div>
      <div className="body">
        {problems.map((p, i) => <div key={i}>· {p}</div>)}
        <div style={{ marginTop: 6, color: "var(--ink-4)" }}>
          Academic and Dashboard show a whole-number term percentage against planned working days.
          This register shows one decimal against days actually registered, so the two can differ.
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------
   Percentage against the bar, with the bar drawn as a notch and the inactive
   policy underneath so a row explains itself without switching modes.
   ------------------------------------------------------------------------ */
function BarAgainstBar({ r, bar, floor, policy }) {
  const pct = r.pct;
  const tone = pct >= bar ? "var(--ok)" : pct >= floor ? "var(--warn)" : "var(--bad)";
  const other = policy === "strict" ? r.lenient : r.strict;
  const otherLabel = policy === "strict" ? "lenient" : "strict";
  return (
    <div style={{ minWidth: 112 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
        <span className="t-sub">
          {pct >= bar ? `+${Math.round((pct - bar) * 10) / 10}` : `${Math.round((bar - pct) * 10) / 10} short`}
        </span>
      </div>
      <div className="bar" style={{ position: "relative", height: 7, marginTop: 4 }}>
        <span style={{ width: `${Math.min(100, pct)}%`, background: tone }} />
        <i aria-hidden="true" title={`${bar}% bar`}
          style={{ position: "absolute", left: `${Math.min(100, bar)}%`, top: -2, bottom: -2, width: 2, background: "var(--ink)", opacity: 0.5, borderRadius: 1 }} />
      </div>
      {other.pct != null && other.pct !== pct && (
        <div className="t-sub" style={{ marginTop: 3 }} title={`Under the ${otherLabel} policy`}>
          {other.pct}% {otherLabel}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------
   The forecast.
   ------------------------------------------------------------------------ */
function Outlook({ r, bar }) {
  if (r.pct == null) return <span style={{ color: "var(--ink-4)", fontSize: 12.5 }}>Register not marked</span>;
  const p = r.projection;

  if (r.band === "eligible") {
    return (
      <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
        {p.remaining === 0
          ? "Term complete · clear"
          : <>Clear — can miss <b style={{ color: "var(--ink)" }}>{p.slack}</b> of {p.remaining} left</>}
      </span>
    );
  }
  if (!p.recoverable) {
    return (
      <span style={{ fontSize: 12.5, color: "var(--bad)", display: "inline-flex", alignItems: "center", gap: 5 }}>
        <Icon name="warning" size={12} />
        {p.remaining === 0
          ? "Term complete — below the bar"
          : <>Cannot reach {bar}% · short by {p.shortfall} days</>}
      </span>
    );
  }
  return (
    <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
      Must attend <b style={{ color: "var(--ink)" }}>{p.needed}</b> of {p.remaining} left
      {p.slack > 0 ? <span style={{ color: "var(--ink-4)" }}> · {p.slack} to spare</span> : null}
    </span>
  );
}

/* ------------------------------------------------------------------------
   Day-by-day drill-down. A student who missed one solid fortnight is a
   different problem from one who misses every Monday.
   ------------------------------------------------------------------------ */
const DAY_TONE = {
  present:     { bg: "var(--ok-soft)",   fg: "var(--ok)",      label: "Present" },
  late:        { bg: "var(--warn-soft)", fg: "var(--warn)",    label: "Late" },
  parent_drop: { bg: "var(--ok-soft)",   fg: "var(--ok)",      label: "Parent drop" },
  leave:       { bg: "var(--sky)",       fg: "var(--sky-ink)", label: "Leave" },
  absent:      { bg: "var(--bad-soft)",  fg: "var(--bad)",     label: "Absent" },
};

function StudentDrawer({ r, bar, policy, onClose }) {
  const other = policy === "strict" ? r.lenient : r.strict;
  const otherLabel = policy === "strict" ? "lenient" : "strict";

  const byMonth = useMemo(() => {
    const m = new Map();
    for (const l of r.logs) {
      const key = String(l.date).slice(0, 7);
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(l);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [r.logs]);

  const monthLabel = (ym) => {
    const [y, mo] = ym.split("-");
    return new Date(Date.UTC(Number(y), Number(mo) - 1, 1))
      .toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  };

  return (
    <Drawer
      wide
      icon="students"
      title={r.name}
      sub={`${formatClassLabel(r.cls)} · ${r.id}`}
      onClose={onClose}
      footer={
        <span className={`chip ${BAND_META[r.band].tone}`}>
          <span className="dot" />{BAND_META[r.band].label}
        </span>
      }
    >
      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <Stat label="Attendance" value={r.pct == null ? "—" : `${r.pct}%`} sub={`${r.attended} of ${r.elapsed} registered days`} />
        <Stat label="Days missed" value={r.tally.absent} sub={`${r.tally.leave} leave · ${r.tally.late} late`} />
        <Stat label="Longest absence" value={r.tally.longestAbsentRun} sub="consecutive days" />
      </div>

      <div className="insight" style={{ marginBottom: 16 }}>
        <span className="eyebrow"><Icon name="trending" size={11} />Outlook</span>
        <div className="headline" style={{ fontSize: 13.5 }}><Outlook r={r} bar={bar} /></div>
        <div className="body">
          Attending every one of the {r.projection.remaining} remaining days finishes at{" "}
          <b>{r.projection.maxAttainable}%</b>; attending none finishes at <b>{r.projection.minIfNoneMore}%</b>.
          {other.pct != null && other.pct !== r.pct && (
            <> Under the {otherLabel} reading they are at <b>{other.pct}%</b> ({BAND_META[other.band].label.toLowerCase()})
              {r.changesBand ? " — sanctioned leave decides their status." : "."}</>
          )}
          {r.tally.unknown > 0 && (
            <> {r.tally.unknown} day{r.tally.unknown === 1 ? " has" : "s have"} an unrecognised status and count as not attended.</>
          )}
        </div>
      </div>

      <SectionHeader title="Day by day" sub="Most recent month first" />
      {byMonth.length === 0 ? (
        <EmptyState icon="calendar" title="No register entries" body="This student has no marked attendance in the loaded range." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {byMonth.map(([ym, days]) => (
            <div key={ym}>
              <div className="tl-day" style={{ padding: "0 0 8px" }}>{monthLabel(ym)}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(26px, 1fr))", gap: 4 }}>
                {days.map((l) => {
                  const tone = DAY_TONE[l.attendance] || { bg: "var(--bg-2)", fg: "var(--ink-4)", label: "Unrecognised" };
                  return (
                    <span key={l.date}
                      title={`${l.date} · ${tone.label}${l.leaveReason ? ` · ${l.leaveReason}` : ""}`}
                      style={{
                        height: 28, borderRadius: "var(--radius-xs)", display: "grid", placeItems: "center",
                        background: tone.bg, color: tone.fg, fontSize: 11.5, fontWeight: 600,
                        fontVariantNumeric: "tabular-nums",
                      }}>{String(l.date).slice(8, 10)}</span>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="chart-legend" style={{ paddingTop: 4 }}>
            {["present", "late", "leave", "absent"].map((k) => (
              <span className="lg" key={k}>
                <i style={{ background: DAY_TONE[k].bg, border: `1px solid ${DAY_TONE[k].fg}` }} />
                {DAY_TONE[k].label}
              </span>
            ))}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="kpi" style={{ boxShadow: "none" }}>
      <div className="kpi-top"><div className="lbl">{label}</div></div>
      <div className="val-row"><div className="val" style={{ fontSize: 24 }}>{value}</div></div>
      <div className="meta"><span>{sub}</span></div>
    </div>
  );
}
