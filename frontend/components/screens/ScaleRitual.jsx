"use client";

// SCALE Phase 5 — Student daily 3-question ritual.
// 2-minute closing habit. Lives on the parent's phone (since the
// student usually doesn't have one). Records three short answers per
// day; tracks streak + recent history. The chat's strict rule: it's a
// closing ritual, not homework.

import { useEffect, useMemo, useState } from "react";
import Icon from "../Icon";
import { formatClassLabel } from "@/lib/format";

const QUESTIONS = [
  { k: "q1Learned",  label: "What's one thing you learned today?", icon: "academic", placeholder: "A new word, a fact, a trick — anything." },
  { k: "q2DidWell",  label: "What's one thing you did well today?", icon: "check",    placeholder: "Even a small thing counts." },
  { k: "q3Tomorrow", label: "What's one thing you'll try tomorrow?", icon: "trending", placeholder: "A goal, big or small." },
];

export default function ScreenScaleRitual({ E, role, session, refresh }) {
  const isParent = role === "parent";
  const today = new Date().toISOString().slice(0, 10);

  // For parents, lock to their child. Others get a picker.
  const myClasses = Array.isArray(session?.linkedClasses) ? session.linkedClasses : [];
  const roster = useMemo(() => {
    const all = E.ADDED_STUDENTS || [];
    if (isParent) return all.filter((s) => s.id === session?.linkedId);
    if (role === "teacher" && myClasses.length > 0) {
      const set = new Set(myClasses);
      return all.filter((s) => set.has(s.cls));
    }
    return all;
  }, [E.ADDED_STUDENTS, isParent, role, myClasses, session?.linkedId]);

  const [classFilter, setClassFilter] = useState("");
  const [studentId, setStudentId] = useState("");

  // Two-step picker — class then student — for the non-parent case.
  // Parents always have their own child auto-selected, no picker shown.
  const classes = useMemo(() => {
    const set = new Set(roster.map((s) => s.cls).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [roster]);
  const filteredRoster = useMemo(() => {
    if (!classFilter) return roster;
    return roster.filter((s) => s.cls === classFilter);
  }, [roster, classFilter]);

  useEffect(() => {
    if (filteredRoster.length === 0) { setStudentId(""); return; }
    if (!studentId || !filteredRoster.some((s) => s.id === studentId)) {
      setStudentId(filteredRoster[0].id);
    }
  }, [filteredRoster, studentId]);

  const [answers, setAnswers] = useState({ q1Learned: "", q2DidWell: "", q3Tomorrow: "" });
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const flash = (msg, tone = "ok") => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 2400);
  };

  async function reload() {
    if (!studentId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/scale/daily-rituals?studentId=${encodeURIComponent(studentId)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (j?.ok) {
        const items = j.items || [];
        setHistory(items);
        const todays = items.find((it) => it.ritualDate === today);
        if (todays) {
          setAnswers({
            q1Learned: todays.q1Learned || "",
            q2DidWell: todays.q2DidWell || "",
            q3Tomorrow: todays.q3Tomorrow || "",
          });
        } else {
          setAnswers({ q1Learned: "", q2DidWell: "", q3Tomorrow: "" });
        }
      }
    } catch {}
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [studentId]);

  async function save() {
    if (!studentId) return;
    if (!answers.q1Learned.trim() && !answers.q2DidWell.trim() && !answers.q3Tomorrow.trim()) {
      flash("Answer at least one question first", "err");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/scale/daily-rituals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId, ritualDate: today, ...answers }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Failed");
      flash("Saved · see you tomorrow!", "ok");
      await reload();
      await refresh?.();
    } catch (e) {
      flash(e.message || "Failed", "err");
    } finally {
      setBusy(false);
    }
  }

  // Compute current streak — count back from today through consecutive days that have a ritual.
  const streak = useMemo(() => {
    if (!history.length) return 0;
    const dateSet = new Set(history.map((h) => h.ritualDate));
    let n = 0;
    for (let i = 0; i < 90; i++) {
      const d = new Date(today + "T00:00:00");
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      if (dateSet.has(iso)) n++;
      else if (i > 0) break;          // today missing is fine; gap after means streak ends
    }
    return n;
  }, [history, today]);

  const todaysSaved = history.some((h) => h.ritualDate === today);

  const student = roster.find((s) => s.id === studentId);

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
          <div className="page-eyebrow">SCALE · Daily ritual</div>
          <div className="page-title">{isParent ? <>Today's <span className="amber">3 questions</span></> : <>Daily <span className="amber">ritual</span></>}</div>
          <div className="page-sub">
            {isParent
              ? `Two minutes at the end of the day with ${student?.name?.split(" ")[0] || "your child"}. Answer together. It's a closing ritual, not homework.`
              : "2-minute closing ritual. Three short questions answered each day. Saved per student per date."}
          </div>
        </div>
      </div>

      {/* Student picker — class first, then student. Hidden for parents. */}
      {!isParent && roster.length > 1 && (
        <div className="card" style={{ marginBottom: 14, padding: "10px 14px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select
            className="select"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            style={{ flex: "0 0 auto", minWidth: 140 }}
          >
            <option value="">All classes ({roster.length})</option>
            {classes.map((c) => {
              const n = roster.filter((s) => s.cls === c).length;
              return <option key={c} value={c}>{formatClassLabel(c)} ({n})</option>;
            })}
          </select>
          <select
            className="select"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
            disabled={filteredRoster.length === 0}
          >
            {filteredRoster.length === 0
              ? <option value="">No students in {classFilter ? formatClassLabel(classFilter) : "scope"}</option>
              : <>
                  <option value="">Pick a student…</option>
                  {filteredRoster.map((s) => <option key={s.id} value={s.id}>{s.name} — {formatClassLabel(s.cls)}</option>)}
                </>
            }
          </select>
        </div>
      )}

      {/* Streak + status */}
      <div className="grid g-3" style={{ marginBottom: 14 }}>
        <div className="card" style={{ padding: "16px", textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ink-3)" }}>Streak</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: streak >= 7 ? "var(--ok)" : streak >= 3 ? "var(--accent)" : "var(--ink-3)", marginTop: 4 }}>
            {streak} <span style={{ fontSize: 14, color: "var(--ink-3)" }}>day{streak === 1 ? "" : "s"}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
            {streak === 0 ? "Start today" : streak < 7 ? "Keep going" : "Excellent habit"}
          </div>
        </div>
        <div className="card" style={{ padding: "16px", textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ink-3)" }}>Today</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: todaysSaved ? "var(--ok)" : "var(--ink-3)", marginTop: 8 }}>
            {todaysSaved ? "✓ Done" : "Pending"}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>{today}</div>
        </div>
        <div className="card" style={{ padding: "16px", textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--ink-3)" }}>Total recorded</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: "var(--ink)", marginTop: 4 }}>{history.length}</div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>days this term</div>
        </div>
      </div>

      {/* The 3 questions */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <div>
            <div className="card-title">Today's three questions</div>
            <div className="card-sub">
              {todaysSaved
                ? "Already answered today — you can update them before bedtime if you want."
                : "Short answers. One sentence each."}
            </div>
          </div>
        </div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {QUESTIONS.map((q, i) => (
            <div key={q.k}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: "var(--accent-soft)", color: "var(--accent)",
                  display: "grid", placeItems: "center", fontWeight: 800, fontSize: 12,
                }}>{i + 1}</span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{q.label}</span>
              </div>
              <textarea
                className="input"
                rows={2}
                value={answers[q.k]}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.k]: e.target.value.slice(0, 500) }))}
                placeholder={q.placeholder}
                style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.5 }}
              />
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn accent" onClick={save} disabled={busy} style={{ fontSize: 14, padding: "10px 18px" }}>
              <Icon name="check" size={14} />{busy ? "Saving…" : todaysSaved ? "Update today" : "Save today"}
            </button>
          </div>
        </div>
      </div>

      {/* Recent history */}
      {history.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Recent days</div>
              <div className="card-sub">Last {Math.min(history.length, 14)} entries · most recent first</div>
            </div>
          </div>
          <div>
            {history.slice(0, 14).map((h) => (
              <div key={h.id} className="lrow" style={{ alignItems: "flex-start", gap: 12, paddingTop: 12, paddingBottom: 12 }}>
                <div style={{
                  width: 56, padding: "6px 8px",
                  background: "var(--bg-2)", borderRadius: 6,
                  textAlign: "center", flexShrink: 0,
                }}>
                  <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase" }}>
                    {new Date(h.ritualDate + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" })}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
                    {new Date(h.ritualDate + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit" })}
                  </div>
                  <div style={{ fontSize: 9.5, color: "var(--ink-3)" }}>
                    {new Date(h.ritualDate + "T00:00:00").toLocaleDateString("en-IN", { month: "short" })}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
                  {h.q1Learned && <div><strong style={{ color: "var(--accent)" }}>Learned:</strong> <span style={{ color: "var(--ink-2)" }}>{h.q1Learned}</span></div>}
                  {h.q2DidWell && <div><strong style={{ color: "var(--ok)" }}>Did well:</strong> <span style={{ color: "var(--ink-2)" }}>{h.q2DidWell}</span></div>}
                  {h.q3Tomorrow && <div><strong style={{ color: "var(--brand, #1f3f8b)" }}>Tomorrow:</strong> <span style={{ color: "var(--ink-2)" }}>{h.q3Tomorrow}</span></div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 14, padding: "10px 14px", background: "var(--bg-2)", border: "1px dashed var(--rule)", borderRadius: 8, fontSize: 11.5, color: "var(--ink-3)" }}>
        <strong>Why three questions?</strong> Short reflection at the end of the day builds a habit of noticing growth — without becoming homework. Skip a day if life happens; the streak isn't punishment.
      </div>
    </div>
  );
}
