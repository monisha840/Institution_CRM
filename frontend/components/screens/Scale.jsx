"use client";

// SCALE — Student Competency and Activity Ledger for Education.
// Phase 2: the staff per-session form. Designed to clear a 2-minute
// fill-in target — every rating defaults to 3 (on track), teacher only
// taps outliers, score buttons are oversized for thumb use on mobile.

import { useEffect, useMemo, useState } from "react";
import Icon from "../Icon";
import { KPI } from "../ui";
import { formatClassLabel } from "@/lib/format";

const PRE_CHECKLIST = [
  { k: "lessonPlan",    label: "Lesson plan prepared and submitted on time", hint: "Plan must be in the register by 8:00 AM on the day" },
  { k: "objectiveBoard", label: "Learning objective written on board before students enter" },
  { k: "sheetsReady",   label: "SCALE record sheets / mark sheet ready for all students" },
  { k: "materials",     label: "Materials, aids, or activity equipment arranged in advance" },
  { k: "iepNotes",      label: "IEP / special needs modifications noted for applicable students", hint: "Required for all CWSN-enrolled students" },
  { k: "attendance",    label: "Attendance register updated within first 5 minutes" },
];

const DURING_RATINGS = [
  { k: "objectiveCommunicated", label: "Lesson objective clearly communicated to students", tag: "delivery"   },
  { k: "pace",                  label: "Pace appropriate — not too fast, not too slow",     tag: "delivery"   },
  { k: "allAddressed",          label: "All students addressed — not just front-row or vocal ones", tag: "inclusion" },
  { k: "iepApplied",            label: "CWSN / IEP modifications visibly applied",          tag: "inclusion"  },
  { k: "engagement",            label: "Student engagement maintained throughout session",  tag: "engagement" },
  { k: "oralDistribution",      label: "Oral questioning distributed fairly across the class", tag: "engagement" },
  { k: "scaleNoted",            label: "SCALE indicators observed and noted during session", tag: "recording" },
  { k: "behaviourCalm",         label: "Disruptive behaviour handled calmly and promptly",  tag: "management" },
];

const POST_RATINGS = [
  { k: "metObjective",   label: "I met today's lesson objective",                         tag: "delivery" },
  { k: "adapted",        label: "I adapted when students were not following",             tag: "responsiveness" },
  { k: "individualAttn", label: "I gave individual attention to at least one struggling student", tag: "inclusion" },
  { k: "recordsComplete", label: "My SCALE records for today are complete and accurate", tag: "recording" },
];

const TAG_COLOR = {
  delivery:       { bg: "var(--accent-soft)", color: "var(--accent-2, var(--accent))" },
  inclusion:      { bg: "var(--ok-soft, #e3f2e7)", color: "var(--ok)" },
  engagement:     { bg: "var(--mint-soft, #e3f2e7)", color: "#1f7a3a" },
  recording:      { bg: "var(--cream, #f7e9c8)", color: "#8a6b1a" },
  management:     { bg: "var(--bad-soft, #fbe1d8)", color: "var(--bad, #b13c1c)" },
  responsiveness: { bg: "var(--warn-soft, #fff3cd)", color: "#856404" },
};

const SIGNOFF_ITEMS = [
  { k: "entriesComplete", label: "All SCALE entries completed and legible" },
  { k: "registerSubmitted", label: "Register submitted to admin by end of day" },
  { k: "concernsEscalated", label: "Any student concern escalated to coordinator verbally" },
];

export default function ScreenScale({ E, role, session, refresh }) {
  const today = new Date().toISOString().slice(0, 10);

  // SCALE catalogue (loaded once on mount). 4 domains × 4 indicators.
  // `scales` maps each scale type (num10 / yesno / gbe / num4) to its picker
  // options, so each indicator renders the right control.
  const [catalogue, setCatalogue] = useState({ domains: [], indicators: [], scales: {}, weights: {} });
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/scale/indicators", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (j?.ok) setCatalogue({ domains: j.domains || [], indicators: j.indicators || [], scales: j.scales || {}, weights: j.weights || {} });
      } catch {}
    })();
  }, []);
  // Resolve an indicator's picker options (falls back to 1-4 while loading).
  const optionsFor = (ind) =>
    (catalogue.scales?.[ind?.scaleType]?.options) || [1, 2, 3, 4].map((v) => ({ v, label: String(v) }));
  const scaleHintFor = (ind) => catalogue.scales?.[ind?.scaleType]?.hint || "1–4";

  // Default class for a teacher = first assigned. Otherwise empty;
  // admin/principal must pick.
  const myClasses = Array.isArray(session?.linkedClasses) ? session.linkedClasses : [];
  const initialCls = myClasses[0] || "";
  const [identity, setIdentity] = useState({
    cls: initialCls,
    subject: "",
    sessionDate: today,
    sessionType: "regular",
    studentsPresent: 0,
  });

  // Pre / during / post / sign-off state — all default to "on track" so
  // a teacher who's tired only has to tap outliers.
  const [preChecklist, setPreChecklist] = useState(
    PRE_CHECKLIST.reduce((a, it) => ({ ...a, [it.k]: false }), {})
  );
  const [duringRatings, setDuringRatings] = useState(
    DURING_RATINGS.reduce((a, it) => ({ ...a, [it.k]: 3 }), {})
  );
  const [postRatings, setPostRatings] = useState(
    POST_RATINGS.reduce((a, it) => ({ ...a, [it.k]: 3 }), {})
  );
  const [workedWell, setWorkedWell] = useState("");
  const [toChange, setToChange] = useState("");
  const [signoff, setSignoff] = useState(
    SIGNOFF_ITEMS.reduce((a, it) => ({ ...a, [it.k]: false }), {})
  );

  // Per-student SCALE entries. We deliberately keep this *sparse* — the
  // teacher picks 1+ students and 1+ indicators they want to score this
  // session. Anything not picked stays unscored (no entry written). The
  // composite report aggregates over the term anyway, so a teacher
  // doesn't have to fill all 16 indicators every lesson.
  // Shape: { [studentId]: { [indicatorKey]: score } }
  const [studentScores, setStudentScores] = useState({});
  const [activeDomain, setActiveDomain] = useState("A");

  const roster = useMemo(() => {
    const want = identity.cls;
    if (!want) return [];
    return (E.ADDED_STUDENTS || []).filter((s) => s.cls === want);
  }, [E.ADDED_STUDENTS, identity.cls]);

  // When the class changes, snap the studentsPresent default to roster
  // size so the teacher only adjusts on a short day.
  useEffect(() => {
    setIdentity((id) => ({ ...id, studentsPresent: roster.length || 0 }));
  }, [roster.length]);

  function setScore(studentId, indicatorKey, score) {
    setStudentScores((prev) => {
      const next = { ...prev };
      const row = { ...(next[studentId] || {}) };
      // Clicking an already-active score (or clearing via the dropdown's "—")
      // removes it (mark unrated).
      if (score == null || row[indicatorKey] === score) delete row[indicatorKey];
      else                                              row[indicatorKey] = score;
      if (Object.keys(row).length === 0) delete next[studentId];
      else                                next[studentId] = row;
      return next;
    });
  }

  // Flatten the sparse scores into the [{studentId, indicatorKey, score}] payload.
  const flatEntries = useMemo(() => {
    const out = [];
    for (const sid of Object.keys(studentScores)) {
      for (const ik of Object.keys(studentScores[sid])) {
        const v = studentScores[sid][ik];
        if (Number.isFinite(v)) out.push({ studentId: sid, indicatorKey: ik, score: v });
      }
    }
    return out;
  }, [studentScores]);

  const studentsScored = Object.keys(studentScores).length;

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const flash = (msg, tone = "ok") => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 2800);
  };

  async function submit() {
    if (busy) return;
    if (!identity.sessionDate) { flash("Pick a session date", "err"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/scale/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cls: identity.cls,
          subject: identity.subject,
          sessionDate: identity.sessionDate,
          sessionType: identity.sessionType,
          studentsPresent: identity.studentsPresent,
          preChecklist, duringRatings, postRatings,
          workedWell, toChange, signoff,
          entries: flatEntries,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Failed");
      flash(`Session saved · ${flatEntries.length} entries logged`, "ok");
      // Reset the per-student scores and free-text notes; keep identity
      // so the teacher can immediately log another short session if needed.
      setStudentScores({});
      setWorkedWell("");
      setToChange("");
      setPreChecklist(PRE_CHECKLIST.reduce((a, it) => ({ ...a, [it.k]: false }), {}));
      setSignoff(SIGNOFF_ITEMS.reduce((a, it) => ({ ...a, [it.k]: false }), {}));
      await refresh?.();
    } catch (e) {
      flash(e.message || "Failed", "err");
    } finally {
      setBusy(false);
    }
  }

  const recentSessions = (E.SCALE_SESSIONS || []).slice(0, 6);

  return (
    <div className="page">
      {toast && (
        <div role="status" style={{
          position: "fixed", bottom: 18, right: 18, zIndex: 9000,
          background: toast.tone === "err" ? "var(--bad, #b13c1c)" : "var(--ok)",
          color: "#fff", padding: "9px 14px", borderRadius: 8,
          fontSize: 12, fontWeight: 700,
        }}>{toast.msg}</div>
      )}

      <div className="page-head">
        <div>
          <div className="page-eyebrow">Academics · SCALE</div>
          <div className="page-title">SCALE <span className="amber">session</span></div>
          <div className="page-sub">
            Per-lesson record. Targets a 2-minute fill — every rating defaults to <strong>3 (on track)</strong>,
            tap only the outliers. Score the students whose performance today moved up or down.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn accent" onClick={submit} disabled={busy}>
            <Icon name="check" size={13} />{busy ? "Saving…" : "Save session"}
          </button>
        </div>
      </div>

      <div className="grid g-4" style={{ marginBottom: 14 }}>
        <KPI label="Today's roster" value={roster.length} sub={identity.cls ? formatClassLabel(identity.cls) : "no class picked"} puck="cream" puckIcon="students" />
        <KPI label="Students scored" value={studentsScored} sub="this session" puck="mint" puckIcon="check" />
        <KPI label="Indicator entries" value={flatEntries.length} sub="will be saved" puck="peach" puckIcon="academic" />
        <KPI label="Recent sessions" value={(E.SCALE_SESSIONS || []).length} sub="all time" puck="sky" puckIcon="clock" />
      </div>

      {/* Identity row */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <div>
            <div className="card-title">Session identity</div>
            <div className="card-sub">Who · what · when</div>
          </div>
        </div>
        <div className="card-body" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <Field label="Class">
            <select className="select" value={identity.cls} onChange={(e) => setIdentity((id) => ({ ...id, cls: e.target.value }))}>
              <option value="">Pick class…</option>
              {Array.from(new Set([...(myClasses || []), ...(E.ADDED_STUDENTS || []).map((s) => s.cls)])).filter(Boolean).map((c) =>
                <option key={c} value={c}>{formatClassLabel(c)}</option>)}
            </select>
          </Field>
          <Field label="Subject">
            <input className="input" value={identity.subject} onChange={(e) => setIdentity((id) => ({ ...id, subject: e.target.value }))} placeholder="e.g. Maths · Tens & ones" />
          </Field>
          <Field label="Date">
            <input type="date" className="input" value={identity.sessionDate} onChange={(e) => setIdentity((id) => ({ ...id, sessionDate: e.target.value }))} />
          </Field>
          <Field label="Session type">
            <select className="select" value={identity.sessionType} onChange={(e) => setIdentity((id) => ({ ...id, sessionType: e.target.value }))}>
              <option value="regular">Regular lesson</option>
              <option value="remedial">Remedial</option>
              <option value="special">Special / project</option>
            </select>
          </Field>
          <Field label="Students present">
            <input type="number" className="input" min={0} value={identity.studentsPresent} onChange={(e) => setIdentity((id) => ({ ...id, studentsPresent: Number(e.target.value) || 0 }))} />
          </Field>
        </div>
      </div>

      {/* Pre-session checklist */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <div>
            <div className="card-title">Pre-session preparation</div>
            <div className="card-sub">Tap each item once it's done. Aim for all six.</div>
          </div>
          <span className="chip">{Object.values(preChecklist).filter(Boolean).length} / {PRE_CHECKLIST.length}</span>
        </div>
        <div>
          {PRE_CHECKLIST.map((it) => (
            <label key={it.k} className="lrow" style={{ cursor: "pointer", gap: 12 }}>
              <input
                type="checkbox"
                checked={!!preChecklist[it.k]}
                onChange={(e) => setPreChecklist((p) => ({ ...p, [it.k]: e.target.checked }))}
                style={{ width: 16, height: 16, flexShrink: 0, accentColor: "var(--accent)" }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{it.label}</div>
                {it.hint && <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{it.hint}</div>}
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* During-session ratings */}
      <RatingBlock
        title="During session — observation & delivery"
        sub="Rate 1 (poor) → 4 (excellent). Default is 3."
        items={DURING_RATINGS}
        values={duringRatings}
        onChange={setDuringRatings}
      />

      {/* Per-student SCALE entries */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <div>
            <div className="card-title">Score students · SCALE indicators</div>
            <div className="card-sub">
              Pick a domain → tap a score for each student you want to record.
              You don't have to score every student or every indicator — score only what today's lesson surfaced.
            </div>
          </div>
          <span className="chip accent"><span className="dot" />{studentsScored} student{studentsScored === 1 ? "" : "s"} · {flatEntries.length} entries</span>
        </div>

        {/* Domain picker */}
        <div style={{ padding: "10px 14px", display: "flex", gap: 6, flexWrap: "wrap", borderBottom: "1px solid var(--rule)" }}>
          {catalogue.domains.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => setActiveDomain(d.key)}
              className="btn sm"
              style={{
                background: activeDomain === d.key ? "var(--accent-soft)" : "var(--card)",
                color:      activeDomain === d.key ? "var(--accent-2, var(--accent))" : "var(--ink-2)",
                borderColor: activeDomain === d.key ? "var(--accent)" : "var(--rule)",
                fontWeight: 700,
              }}
            >
              {d.key} · {d.short}
            </button>
          ))}
        </div>

        {!identity.cls ? (
          <div className="empty" style={{ padding: 30 }}>Pick a class above to see the roster.</div>
        ) : roster.length === 0 ? (
          <div className="empty" style={{ padding: 30 }}>No students in {formatClassLabel(identity.cls)} yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 160 }}>Student</th>
                  {catalogue.indicators
                    .filter((ind) => ind.domain === activeDomain)
                    .map((ind) => (
                      <th key={ind.key} style={{ minWidth: 130, textAlign: "center" }}>
                        <div style={{ fontSize: 11.5 }}>{ind.label}</div>
                        <div style={{ fontSize: 10, color: "var(--ink-4)", fontWeight: 500, marginTop: 2 }}>
                          {scaleHintFor(ind)} · weight {ind.indicatorWeight}%
                        </div>
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {roster.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{s.name}</div>
                      <div style={{ fontSize: 10.5, color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}>{s.id}</div>
                    </td>
                    {catalogue.indicators
                      .filter((ind) => ind.domain === activeDomain)
                      .map((ind) => {
                        const v = studentScores[s.id]?.[ind.key];
                        return (
                          <td key={ind.key} style={{ textAlign: "center" }}>
                            <ScorePicker value={v} options={optionsFor(ind)} onChange={(n) => setScore(s.id, ind.key, n)} />
                          </td>
                        );
                      })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Post-session ratings */}
      <RatingBlock
        title="Post-session self-evaluation"
        sub="Honest answer beats a flattering one. Rate 1–4."
        items={POST_RATINGS}
        values={postRatings}
        onChange={setPostRatings}
      />

      {/* Free-text notes */}
      <div className="grid g-2" style={{ marginBottom: 14, gap: 14 }}>
        <div className="card">
          <div className="card-head"><div><div className="card-title">One thing that worked well</div></div></div>
          <div className="card-body">
            <textarea
              className="input"
              rows={3}
              value={workedWell}
              onChange={(e) => setWorkedWell(e.target.value.slice(0, 500))}
              placeholder="Brief note for your own record…"
              style={{ resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div><div className="card-title">One thing to do differently next session</div></div></div>
          <div className="card-body">
            <textarea
              className="input"
              rows={3}
              value={toChange}
              onChange={(e) => setToChange(e.target.value.slice(0, 500))}
              placeholder="Brief improvement note…"
              style={{ resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
        </div>
      </div>

      {/* Sign-off */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <div>
            <div className="card-title">Staff accountability — sign-off</div>
            <div className="card-sub">All three before submission.</div>
          </div>
        </div>
        <div>
          {SIGNOFF_ITEMS.map((it) => (
            <label key={it.k} className="lrow" style={{ cursor: "pointer", gap: 12 }}>
              <input
                type="checkbox"
                checked={!!signoff[it.k]}
                onChange={(e) => setSignoff((p) => ({ ...p, [it.k]: e.target.checked }))}
                style={{ width: 16, height: 16, flexShrink: 0, accentColor: "var(--accent)" }}
              />
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{it.label}</div>
            </label>
          ))}
        </div>
      </div>

      {/* Submit */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 24 }}>
        <button className="btn accent" onClick={submit} disabled={busy} style={{ fontSize: 14, padding: "11px 20px" }}>
          <Icon name="check" size={14} />{busy ? "Saving…" : `Save session · ${flatEntries.length} entries`}
        </button>
      </div>

      {/* Recent sessions */}
      {recentSessions.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Recent sessions</div>
              <div className="card-sub">Your last few entries</div>
            </div>
          </div>
          <div>
            {recentSessions.map((s) => (
              <div key={s.id} className="lrow">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{s.cls ? formatClassLabel(s.cls) : "—"} · {s.subject || "(no subject)"}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                    {s.sessionDate} · {s.sessionType} · {s.studentsPresent} students
                  </div>
                </div>
                <span className="chip">{s.id}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RatingBlock({ title, sub, items, values, onChange }) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-head">
        <div>
          <div className="card-title">{title}</div>
          <div className="card-sub">{sub}</div>
        </div>
      </div>
      <div>
        {items.map((it) => {
          const c = TAG_COLOR[it.tag] || { bg: "var(--bg-2)", color: "var(--ink-3)" };
          return (
            <div key={it.k} className="lrow" style={{ gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{it.label}</span>
                {it.tag && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: c.bg, color: c.color }}>
                    {it.tag}
                  </span>
                )}
              </div>
              <ScorePicker
                value={values[it.k]}
                onChange={(n) => onChange((p) => ({ ...p, [it.k]: n }))}
                size="md"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScorePicker({ value, onChange, size = "sm", options }) {
  // Options come from the indicator's scale type ({ v, label }). Falls back
  // to a 1-4 row (used by the during/post session self-ratings which don't
  // pass options). Clicking an active button toggles back to "no score".
  const opts = (options && options.length) ? options : [1, 2, 3, 4].map((v) => ({ v, label: String(v) }));
  const dim = size === "md" ? { h: 32, font: 13 } : { h: 26, font: 12 };

  // Many options (e.g. 1–10) → compact dropdown so the grid cell stays narrow.
  if (opts.length > 6) {
    return (
      <select
        className="select"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        style={{ height: dim.h, fontSize: dim.font, padding: "0 6px", minWidth: 58 }}
      >
        <option value="">—</option>
        {opts.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
    );
  }

  // Few options → pill buttons. Numeric labels stay square; word labels
  // (No/Yes, Good/Very Good/Excellent) get auto width.
  const numeric = opts.every((o) => /^\d+$/.test(String(o.label)));
  return (
    <div style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
      {opts.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            title={o.label}
            style={{
              height: dim.h,
              minWidth: numeric ? dim.h : undefined,
              padding: numeric ? 0 : "0 9px",
              border: "1px solid",
              borderColor: active ? "var(--accent)" : "var(--rule)",
              borderRadius: 999,
              background: active ? "var(--accent)" : "var(--card)",
              color: active ? "#fff" : "var(--ink-2)",
              fontWeight: 700, fontSize: dim.font,
              cursor: "pointer",
              transition: "background .12s, border-color .12s",
            }}
          >{o.label}</button>
        );
      })}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-3)" }}>{label}</span>
      {children}
    </label>
  );
}
