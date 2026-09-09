"use client";

// SCALE Phase 4 — admin evaluation dashboard + sequenced
// weaker-student support workflow. The four metrics are derived from
// existing SCALE session/entry data on the server so admins can see
// what teachers are actually doing without grading them subjectively.

import { useEffect, useMemo, useState } from "react";
import Icon from "../Icon";
import { KPI } from "../ui";
import { formatClassLabel } from "@/lib/format";

const ROOT_CAUSE_CATEGORIES = [
  { k: "academic",  label: "Academic / curricular gap" },
  { k: "attentional", label: "Attentional / focus" },
  { k: "language",  label: "Language / expression" },
  { k: "behavioural", label: "Behavioural / habit" },
  { k: "family",    label: "Family / home context" },
  { k: "health",    label: "Health / sensory" },
  { k: "other",     label: "Other" },
];

const SPECIALIST_TYPES = [
  { k: "speech",       label: "Speech & language" },
  { k: "occupational", label: "Occupational therapy" },
  { k: "psych",        label: "Psychologist" },
  { k: "remedial",     label: "Remedial educator" },
  { k: "medical",      label: "Medical referral" },
  { k: "other",        label: "Other" },
];

export default function ScreenScaleAdmin({ E, role, session, refresh }) {
  const isAuthorised = role === "admin" || role === "principal" || role === "academic_director";

  const [metrics, setMetrics] = useState(null);
  const [windowDays, setWindowDays] = useState(30);
  const [activePlan, setActivePlan] = useState(null); // student row from weakerStudents
  const [planData, setPlanData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const flash = (msg, tone = "ok") => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 2800);
  };

  async function reload() {
    try {
      const r = await fetch(`/api/scale/admin-metrics?days=${windowDays}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (j?.ok) setMetrics(j);
    } catch {}
  }
  useEffect(() => { if (isAuthorised) reload(); /* eslint-disable-next-line */ }, [windowDays]);

  // Load (or initialise) the support plan for the active student.
  async function openPlan(stu) {
    setActivePlan(stu);
    try {
      const r = await fetch(`/api/scale/support-plans?studentId=${encodeURIComponent(stu.id)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      const existing = (j?.items || [])[0];
      setPlanData(existing || {
        studentId: stu.id, term: "all", currentStep: 1, status: "active",
        rootCause: {}, domainAdvisory: { actions: [] }, strengthPlan: {}, referral: {},
      });
    } catch {
      setPlanData({
        studentId: stu.id, term: "all", currentStep: 1, status: "active",
        rootCause: {}, domainAdvisory: { actions: [] }, strengthPlan: {}, referral: {},
      });
    }
  }

  async function savePlan(patch) {
    if (!planData) return;
    const next = { ...planData, ...patch };
    setBusy(true);
    try {
      const r = await fetch("/api/scale/support-plans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Failed");
      setPlanData(j.plan);
      flash("Support plan saved", "ok");
      await refresh?.();
    } catch (e) {
      flash(e.message || "Failed", "err");
    } finally {
      setBusy(false);
    }
  }

  if (!isAuthorised) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <div className="page-title">SCALE admin</div>
            <div className="page-sub">Only admin / principal / academic director can review SCALE telemetry.</div>
          </div>
        </div>
      </div>
    );
  }

  const m = metrics?.metrics || {};

  return (
    <div className="page">
      {toast && (
        <div role="status" style={{
          position: "fixed", bottom: 18, right: 18, zIndex: 9000,
          background: toast.tone === "err" ? "var(--bad, #b13c1c)" : "var(--ok)",
          color: "#fff", padding: "9px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
        }}>{toast.msg}</div>
      )}

      <div className="page-head">
        <div>
          <div className="page-eyebrow">Governance · SCALE</div>
          <div className="page-title">SCALE <span className="amber">admin</span></div>
          <div className="page-sub">
            Four telemetry metrics from real session data — objective, hard to manipulate.
            Use them to evaluate <strong>teaching</strong>, not just learning. Below: weaker-student support workflow.
          </div>
        </div>
        <div className="page-actions">
          <select className="select" value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last term</option>
          </select>
        </div>
      </div>

      <div className="grid g-4" style={{ marginBottom: 14 }}>
        <KPI
          label="Register submission rate"
          value={m.registerSubmissionRate == null ? "—" : `${m.registerSubmissionRate}%`}
          sub="sessions filed within 24h"
          puck={m.registerSubmissionRate >= 80 ? "mint" : m.registerSubmissionRate >= 60 ? "peach" : "rose"}
          puckIcon="check"
        />
        <KPI
          label="Lesson plans on time"
          value={m.lessonPlansOnTime == null ? "—" : `${m.lessonPlansOnTime}%`}
          sub="pre-session prep complete"
          puck={m.lessonPlansOnTime >= 80 ? "mint" : m.lessonPlansOnTime >= 60 ? "peach" : "rose"}
          puckIcon="academic"
        />
        <KPI
          label="Class average"
          value={m.classAverage == null ? "—" : m.classAverage}
          sub="composite across students"
          puck={m.classAverage >= 70 ? "mint" : m.classAverage >= 55 ? "peach" : "rose"}
          puckIcon="trending"
        />
        <KPI
          label="Weaker students flagged"
          value={m.weakerStudentsFlagged ?? "—"}
          sub="composite below 55"
          puck={(m.weakerStudentsFlagged || 0) === 0 ? "mint" : "rose"}
          puckIcon="warning"
        />
      </div>

      {/* Per-class breakdown */}
      {Array.isArray(metrics?.classAverages) && metrics.classAverages.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head">
            <div>
              <div className="card-title">Class averages</div>
              <div className="card-sub">SCALE composite per class · last {metrics.windowDays} days</div>
            </div>
          </div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {metrics.classAverages.map((c) => {
              const tone = c.average >= 70 ? "ok" : c.average >= 55 ? "warn" : "bad";
              const color = tone === "ok" ? "var(--ok)" : tone === "warn" ? "#ad7900" : "var(--bad, #b13c1c)";
              return (
                <div key={c.cls}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700 }}>{formatClassLabel(c.cls)}</span>
                    <span style={{ fontFamily: "var(--font-mono)", color }}>{c.average} · {c.students} student{c.students === 1 ? "" : "s"}</span>
                  </div>
                  <div style={{ height: 6, background: "var(--bg-2)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, c.average))}%`, background: color, borderRadius: 999 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weaker-students triage */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <div>
            <div className="card-title">Weaker students — support queue</div>
            <div className="card-sub">Composite below 55 · sorted lowest first. Click to open the sequenced support workflow.</div>
          </div>
          <span className="chip warn"><span className="dot" />{(metrics?.weakerStudents || []).length} flagged</span>
        </div>
        {!metrics ? (
          <div className="empty" style={{ padding: 30 }}>Loading…</div>
        ) : (metrics.weakerStudents || []).length === 0 ? (
          <div className="empty" style={{ padding: 30 }}>No students flagged in the current window — good news.</div>
        ) : (
          <div>
            {metrics.weakerStudents.map((s) => (
              <div key={s.id} className="lrow" style={{ cursor: "pointer", background: activePlan?.id === s.id ? "var(--accent-soft)" : "transparent" }}
                   onClick={() => openPlan(s)}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: "var(--bad-soft, #fbe1d8)", color: "var(--bad, #b13c1c)",
                  display: "grid", placeItems: "center", flexShrink: 0,
                  fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13,
                }}>{s.composite}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{s.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{formatClassLabel(s.cls)} · {s.id}</div>
                </div>
                <span className="chip">{activePlan?.id === s.id ? "Open" : "Start plan →"}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sequenced support workflow */}
      {activePlan && planData && (
        <SupportWorkflow
          student={activePlan}
          plan={planData}
          onChange={setPlanData}
          onSave={savePlan}
          busy={busy}
        />
      )}
    </div>
  );
}

function SupportWorkflow({ student, plan, onChange, onSave, busy }) {
  const cur = plan.currentStep || 1;
  const rootDone = !!plan.rootCause?.category;
  const advisoryDone = (plan.domainAdvisory?.actions || []).length > 0;
  const strengthDone = !!plan.strengthPlan?.entryPoint;

  function setRootCause(patch) { onChange({ ...plan, rootCause: { ...(plan.rootCause || {}), ...patch } }); }
  function setAdvisory(patch)  { onChange({ ...plan, domainAdvisory: { ...(plan.domainAdvisory || {}), ...patch } }); }
  function setStrength(patch)  { onChange({ ...plan, strengthPlan: { ...(plan.strengthPlan || {}), ...patch } }); }
  function setReferral(patch)  { onChange({ ...plan, referral: { ...(plan.referral || {}), ...patch } }); }

  return (
    <div className="card" style={{ marginBottom: 14, borderTop: "3px solid var(--accent)" }}>
      <div className="card-head">
        <div>
          <div className="card-title">Support plan · {student.name}</div>
          <div className="card-sub">
            Composite {student.composite} · {formatClassLabel(student.cls)}.{" "}
            <strong>Steps must be done in order.</strong> Don't skip to therapy referral without root-cause + advisory documented.
          </div>
        </div>
        <span className="chip accent"><span className="dot" />Step {cur} of 5</span>
      </div>

      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Step 1 — Root cause */}
        <Step n={1} title="Root cause" status={rootDone ? "done" : cur === 1 ? "active" : "pending"}>
          <Field label="Most likely category">
            <select className="select" value={plan.rootCause?.category || ""} onChange={(e) => setRootCause({ category: e.target.value })}>
              <option value="">Pick one…</option>
              {ROOT_CAUSE_CATEGORIES.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="What you observed">
            <textarea
              className="input" rows={2}
              value={plan.rootCause?.observed || ""}
              onChange={(e) => setRootCause({ observed: e.target.value.slice(0, 500) })}
              placeholder="The specific moment(s) or pattern that surfaced this."
              style={{ resize: "vertical", fontFamily: "inherit" }}
            />
          </Field>
          <Field label="Working hypothesis">
            <textarea
              className="input" rows={2}
              value={plan.rootCause?.hypothesis || ""}
              onChange={(e) => setRootCause({ hypothesis: e.target.value.slice(0, 500) })}
              placeholder="Your best explanation right now. It's a hypothesis, not a verdict."
              style={{ resize: "vertical", fontFamily: "inherit" }}
            />
          </Field>
          <RowEnd>
            <button className="btn accent" onClick={() => onSave({ currentStep: rootDone ? 2 : 1 })} disabled={busy || !rootDone}>
              {rootDone ? "Save & advance to step 2 →" : "Pick a category to advance"}
            </button>
          </RowEnd>
        </Step>

        {/* Step 2 — Domain advisory */}
        <Step n={2} title="Domain advisory" status={cur >= 2 ? (advisoryDone ? "done" : "active") : "locked"}>
          {cur < 2 ? (
            <Locked text="Complete Step 1 (root cause) first." />
          ) : (
            <>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 6 }}>
                Specific classroom-level actions tied to the indicators dragging the composite down.
                Add 1–3 actions you'll commit to this term.
              </div>
              <ActionList
                actions={plan.domainAdvisory?.actions || []}
                onChange={(actions) => setAdvisory({ actions })}
              />
              <RowEnd>
                <button className="btn accent" onClick={() => onSave({ currentStep: advisoryDone ? 3 : 2 })} disabled={busy || !advisoryDone}>
                  {advisoryDone ? "Save & advance to step 3 →" : "Add at least one action"}
                </button>
              </RowEnd>
            </>
          )}
        </Step>

        {/* Step 3 — Strength-first scheduling */}
        <Step n={3} title="Strength-first scheduling" status={cur >= 3 ? (strengthDone ? "done" : "active") : "locked"}>
          {cur < 3 ? (
            <Locked text="Complete Step 2 (domain advisory) first." />
          ) : (
            <>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 6 }}>
                Use the student's strongest channel as the entry point for academic tasks they're avoiding.
                Creativity-strong students learn academics through making; expression-strong students through speaking aloud.
              </div>
              <Field label="Entry point (strongest channel)">
                <input
                  className="input"
                  value={plan.strengthPlan?.entryPoint || ""}
                  onChange={(e) => setStrength({ entryPoint: e.target.value.slice(0, 200) })}
                  placeholder="e.g. Drawing concepts before writing them; oral summary before written essay."
                />
              </Field>
              <Field label="Scheduling change">
                <textarea
                  className="input" rows={2}
                  value={plan.strengthPlan?.schedulingNotes || ""}
                  onChange={(e) => setStrength({ schedulingNotes: e.target.value.slice(0, 500) })}
                  placeholder="When in the day will this happen? Who is responsible? How will you know it's working?"
                  style={{ resize: "vertical", fontFamily: "inherit" }}
                />
              </Field>
              <RowEnd>
                <button className="btn accent" onClick={() => onSave({ currentStep: strengthDone ? 4 : 3 })} disabled={busy || !strengthDone}>
                  {strengthDone ? "Save & advance to step 4 →" : "Fill in the entry point"}
                </button>
              </RowEnd>
            </>
          )}
        </Step>

        {/* Step 4 — Internal review checkpoint */}
        <Step n={4} title="Internal review" status={cur >= 4 ? "active" : "locked"}>
          {cur < 4 ? (
            <Locked text="Complete steps 1–3 first." />
          ) : (
            <>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 6 }}>
                <strong>Pause before referral.</strong> Re-read steps 1–3. Has 4–6 weeks elapsed since you started?
                Has the student's composite moved? Document what changed (or didn't) before considering external help.
              </div>
              <Field label="What changed in the last 4–6 weeks?">
                <textarea
                  className="input" rows={3}
                  value={plan.strengthPlan?.review || ""}
                  onChange={(e) => setStrength({ review: e.target.value.slice(0, 600) })}
                  placeholder="Score changes, observed shifts, parent feedback. Honest assessment beats flattering one."
                  style={{ resize: "vertical", fontFamily: "inherit" }}
                />
              </Field>
              <RowEnd style={{ gap: 8 }}>
                <button className="btn" onClick={() => onSave({ status: "closed", currentStep: 4 })} disabled={busy}>
                  Close plan — issue resolved
                </button>
                <button className="btn accent" onClick={() => onSave({ currentStep: 5 })} disabled={busy}>
                  Advance to specialist referral →
                </button>
              </RowEnd>
            </>
          )}
        </Step>

        {/* Step 5 — Specialist referral */}
        <Step n={5} title="Specialist referral" status={cur >= 5 ? "active" : "locked"} tone="warn">
          {cur < 5 ? (
            <Locked text="This is the last resort. Steps 1–4 must be documented before reaching here." />
          ) : (
            <>
              <div style={{ fontSize: 12, color: "var(--bad, #b13c1c)", fontWeight: 700, marginBottom: 6 }}>
                External referral. Use only when classroom interventions haven't moved the composite over 4–6 weeks.
              </div>
              <Field label="Specialist type">
                <select className="select" value={plan.referral?.specialistType || ""} onChange={(e) => setReferral({ specialistType: e.target.value })}>
                  <option value="">Pick one…</option>
                  {SPECIALIST_TYPES.map((t) => <option key={t.k} value={t.k}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Reason for referral">
                <textarea
                  className="input" rows={3}
                  value={plan.referral?.reason || ""}
                  onChange={(e) => setReferral({ reason: e.target.value.slice(0, 600) })}
                  placeholder="Specific behaviours / scores / observations that suggest specialist input is needed."
                  style={{ resize: "vertical", fontFamily: "inherit" }}
                />
              </Field>
              <RowEnd>
                <button
                  className="btn accent"
                  onClick={() => onSave({ status: "escalated", referral: { ...plan.referral, referredAt: new Date().toISOString() } })}
                  disabled={busy || !plan.referral?.specialistType || !plan.referral?.reason}
                >
                  Mark as referred & escalate
                </button>
              </RowEnd>
            </>
          )}
        </Step>
      </div>
    </div>
  );
}

function Step({ n, title, status, children, tone }) {
  // status: 'done' | 'active' | 'pending' | 'locked'
  const palette = (() => {
    if (status === "done")    return { bg: "var(--ok-soft, #e3f2e7)", color: "var(--ok)", chip: "ok",   label: "Done" };
    if (status === "active")  return { bg: "var(--accent-soft)", color: "var(--accent)", chip: "accent", label: "Active" };
    if (status === "locked")  return { bg: "var(--bg-2)", color: "var(--ink-4)", chip: "info", label: "Locked" };
    return                          { bg: "var(--bg-2)", color: "var(--ink-3)", chip: "info", label: "Pending" };
  })();
  return (
    <div style={{
      border: "1px solid var(--rule)",
      borderLeft: `3px solid ${tone === "warn" ? "var(--bad, #b13c1c)" : "var(--accent)"}`,
      borderRadius: 8, padding: 12,
      opacity: status === "locked" ? 0.7 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{
          width: 26, height: 26, borderRadius: "50%",
          background: palette.bg, color: palette.color,
          display: "grid", placeItems: "center",
          fontWeight: 800, fontSize: 12,
        }}>{n}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--ink)" }}>{title}</span>
        <span className={`chip ${palette.chip}`} style={{ marginLeft: "auto" }}>{palette.label}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  );
}

function Locked({ text }) {
  return (
    <div style={{ padding: "10px 12px", background: "var(--bg-2)", borderRadius: 6, fontSize: 12, color: "var(--ink-3)" }}>
      <Icon name="shield" size={11} /> {text}
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

function RowEnd({ children, style }) {
  return <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, paddingTop: 4, ...(style || {}) }}>{children}</div>;
}

function ActionList({ actions, onChange }) {
  const [draft, setDraft] = useState("");
  function add() {
    const t = draft.trim();
    if (!t) return;
    onChange([...actions, t]);
    setDraft("");
  }
  function remove(i) { onChange(actions.filter((_, idx) => idx !== i)); }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {actions.map((a, i) => (
        <div key={i} style={{ display: "flex", gap: 8, padding: "8px 10px", background: "var(--bg-2)", borderRadius: 6 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent)" }}>{i + 1}.</span>
          <span style={{ flex: 1, fontSize: 12.5, color: "var(--ink)" }}>{a}</span>
          <button type="button" className="btn sm" onClick={() => remove(i)}>Remove</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6 }}>
        <input
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 200))}
          placeholder="Add a specific classroom-level action…"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          style={{ flex: 1 }}
        />
        <button type="button" className="btn accent" onClick={add} disabled={!draft.trim()}>Add</button>
      </div>
    </div>
  );
}
