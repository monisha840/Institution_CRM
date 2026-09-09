"use client";

// SCALE Phase 5 — Parent advisory script.
// Teacher-facing screen that generates a structured *meeting script*
// for the teacher to read aloud. **Not handed to the parent** — that's
// flagged at the top of every page and on the printable.
// Honours the chat's strong rule: ONE specific home action per
// meeting, never five. We only print the single weakest indicator's
// action.

import { useEffect, useMemo, useState } from "react";
import Icon from "../Icon";
import { resolveSchool, downloadPdf } from "@/lib/export";
import { formatClassLabel } from "@/lib/format";

export default function ScreenScaleAdvisory({ E, role, session }) {
  const isAuthorised = role === "admin" || role === "principal" || role === "academic_director" || role === "teacher";

  const myClasses = Array.isArray(session?.linkedClasses) ? session.linkedClasses : [];
  const roster = useMemo(() => {
    const all = E.ADDED_STUDENTS || [];
    if (role === "teacher" && myClasses.length > 0) {
      const set = new Set(myClasses);
      return all.filter((s) => set.has(s.cls));
    }
    return all;
  }, [E.ADDED_STUDENTS, role, myClasses]);

  const [classFilter, setClassFilter] = useState("");
  const [studentId, setStudentId] = useState("");
  const [profile, setProfile] = useState(null);
  const [priorityFocus, setPriorityFocus] = useState([]);
  const [narratives, setNarratives] = useState({});
  const [openingNotes, setOpeningNotes] = useState("");
  const [parentQuestion, setParentQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Distinct classes + class-filtered student list for the two-step picker.
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

  // Persist the teacher's typed lines per student in localStorage so a
  // closed tab doesn't lose the prep work.
  const noteKey = studentId ? `scale.advisory.${studentId}` : null;
  useEffect(() => {
    if (!noteKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(noteKey) || "{}");
      setOpeningNotes(saved.openingNotes || "");
      setParentQuestion(saved.parentQuestion || "");
    } catch {}
  }, [noteKey]);
  function saveNote(field, value) {
    const next = { openingNotes, parentQuestion, [field]: value };
    if (field === "openingNotes")  setOpeningNotes(value);
    if (field === "parentQuestion") setParentQuestion(value);
    try { if (noteKey) localStorage.setItem(noteKey, JSON.stringify(next)); } catch {}
  }

  async function reload() {
    if (!studentId) return;
    setLoading(true); setErr("");
    try {
      const r = await fetch(`/api/scale/student/${encodeURIComponent(studentId)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Failed");
      setProfile(j);
      const mod = await import("@/lib/scale");
      const narrs = {};
      for (const k of ["A", "E", "C", "B"]) {
        narrs[k] = mod.narrativeFor(k, j.perDomain?.[k]?.score ?? null, j.perIndicator || {});
      }
      setNarratives(narrs);
      const flat = {};
      for (const k of Object.keys(j.perDomain || {})) flat[k] = j.perDomain[k]?.score ?? null;
      setPriorityFocus(mod.priorityFocusFor(j.perIndicator || {}, flat, 4));
    } catch (e) {
      setErr(e.message); setProfile(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [studentId]);

  const student = roster.find((s) => s.id === studentId);
  const school  = resolveSchool(E?.SETTINGS);

  // Identify the strongest domain for the praise line, and the SINGLE
  // priority action for the home-task line. The chat is unambiguous:
  // "Parents who receive five instructions act on zero."
  const strongestDomain = useMemo(() => {
    if (!profile) return null;
    const list = Object.entries(profile.perDomain || {})
      .map(([k, v]) => ({ key: k, score: v?.score ?? null }))
      .filter((r) => r.score != null)
      .sort((a, b) => b.score - a.score);
    return list[0] || null;
  }, [profile]);

  const oneHomeAction = priorityFocus[0] || null;

  function exportScriptPdf() {
    if (!profile || !student) return;
    const sections = [
      ["1. OPENING (warm + factual)",
        openingNotes ||
        `Thank you for coming in. ${student.name} has had a productive term. ` +
        `I want to walk through how they're doing across four areas, then we'll agree one thing to work on at home together.`],
      ["2. STRENGTH TO PRAISE (specific, evidence-based)",
        strongestDomain
          ? `${student.name}'s strongest area is ${({A:"academic output",E:"expression",C:"creativity & play",B:"behaviour & habits"})[strongestDomain.key]} ` +
            `(score ${strongestDomain.score}). ${narratives[strongestDomain.key] || ""}`
          : "Score data is not yet sufficient — describe one specific moment from the term."],
      ["3. ONE HOME ACTION (single, specific, doable)",
        oneHomeAction
          ? `For the next term, one thing that will help most: ${oneHomeAction.action} ` +
            `(triggered by '${oneHomeAction.indicator}', score ${oneHomeAction.score}).`
          : "No clear weak indicator — congratulate the parent on a balanced profile and confirm continued routine."],
      ["4. ONE QUESTION TO ASK THE PARENT",
        parentQuestion ||
        "What does the home routine look like in the 30 minutes after school? " +
        "(Use the answer to anchor the home action above.)"],
      ["5. CLOSE",
        `Thank you again. We'll review at the next term. ` +
        `If something changes at home in the next few weeks, please send a message — earlier is always better than later.`],
    ];

    downloadPdf({
      title: `Parent meeting script · ${student.name}`,
      subtitle: "TEACHER'S SCRIPT — DO NOT HAND TO PARENT",
      school,
      actor: session?.name || null,
      dateRange: `${formatClassLabel(student.cls)} · prepared ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`,
      summary: [
        { label: "Composite",      value: profile.composite ?? "—" },
        { label: "Strongest area", value: strongestDomain?.key || "—" },
        { label: "Weakest indicator", value: oneHomeAction?.indicator || "—" },
        { label: "One home action",   value: oneHomeAction ? "Yes" : "—" },
      ],
      columns: [
        { key: "section", label: "Section", width: "70mm" },
        { key: "script",  label: "Script (read aloud naturally — don't read verbatim)" },
      ],
      rows: sections.map(([section, script]) => ({ section, script })),
      filename: `parent-script-${student.name.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`,
      orientation: "portrait",
    });
  }

  if (!isAuthorised) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <div className="page-title">Parent advisory</div>
            <div className="page-sub">Teachers / admin / principal only.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">SCALE · Stakeholder layer 4</div>
          <div className="page-title">Parent <span className="amber">advisory</span></div>
          <div className="page-sub">
            Teacher's script for the parent meeting. <strong>Not a handout.</strong>{" "}
            One specific home action per meeting — never five. The data below builds the script automatically.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn accent" onClick={exportScriptPdf} disabled={!profile}>
            <Icon name="download" size={13} />Print teacher's script
          </button>
        </div>
      </div>

      {/* Don't-hand-to-parent warning bar */}
      <div style={{
        marginBottom: 14, padding: "10px 14px",
        background: "rgba(177, 60, 28, 0.08)", border: "1px solid var(--bad, #b13c1c)",
        borderRadius: 8, fontSize: 12, color: "var(--bad, #b13c1c)", fontWeight: 700,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <Icon name="warning" size={14} />
        <span>This is the <em>teacher's</em> script, not a parent handout. Translate each section into the parent's language; do not read verbatim.</span>
      </div>

      {/* Student picker — class first, then student. */}
      <div className="card" style={{ marginBottom: 14, padding: "10px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
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
          style={{ flex: 1, minWidth: 240 }}
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

      {!profile ? (
        <div className="card"><div className="empty" style={{ padding: 50 }}>
          {loading ? "Loading…" : err ? <span style={{ color: "var(--bad)" }}>{err}</span> : "Pick a student to build the script."}
        </div></div>
      ) : (
        <>
          <ScriptSection n={1} title="Opening — warm + factual">
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55, marginBottom: 8 }}>
              <strong>Suggested opening</strong> — adapt to the parent's language. Default below; type your own to override.
            </div>
            <textarea
              className="input"
              rows={3}
              value={openingNotes}
              onChange={(e) => saveNote("openingNotes", e.target.value.slice(0, 600))}
              placeholder={`Thank you for coming in. ${student?.name || "—"} has had a productive term. I want to walk through how they're doing across four areas, then we'll agree one thing to work on at home together.`}
              style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
            />
          </ScriptSection>

          <ScriptSection n={2} title="Strength to praise — specific, evidence-based" tone="ok">
            {strongestDomain ? (
              <>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ok)", marginBottom: 4 }}>
                  Strongest area: {({A:"Academic output",E:"Expression",C:"Creativity & play",B:"Behaviour & habits"})[strongestDomain.key]} · score {strongestDomain.score}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55, fontStyle: "italic" }}>
                  "{narratives[strongestDomain.key] || ""}"
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                Not enough scored data yet — describe one specific moment from the term instead.
              </div>
            )}
          </ScriptSection>

          <ScriptSection n={3} title="One home action — single, specific, doable" tone="warn">
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 6 }}>
              <strong>Just one.</strong> Parents who receive five instructions act on zero.
            </div>
            {oneHomeAction ? (
              <div style={{ padding: "10px 14px", background: "rgba(255, 247, 230, 0.8)", borderLeft: "3px solid var(--accent)", borderRadius: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--ink)" }}>{oneHomeAction.action}</div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3 }}>
                  Triggered by <strong>{oneHomeAction.indicator}</strong> · score {oneHomeAction.score}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--ok)" }}>
                No clear weak indicator — congratulate the parent on a balanced profile and confirm continued routine.
              </div>
            )}
          </ScriptSection>

          <ScriptSection n={4} title="One question to ask the parent">
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 6 }}>
              Default below — anchor your follow-up on the answer.
            </div>
            <textarea
              className="input"
              rows={2}
              value={parentQuestion}
              onChange={(e) => saveNote("parentQuestion", e.target.value.slice(0, 400))}
              placeholder="What does the home routine look like in the 30 minutes after school?"
              style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
            />
          </ScriptSection>

          <ScriptSection n={5} title="Close">
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
              "Thank you again. We'll review at the next term. If something changes at home in the next few weeks,
              please send a message — earlier is always better than later."
            </div>
          </ScriptSection>
        </>
      )}
    </div>
  );
}

function ScriptSection({ n, title, tone, children }) {
  const accent = tone === "ok"   ? "var(--ok)"
              : tone === "warn" ? "var(--accent)"
              :                    "var(--brand, #1f3f8b)";
  return (
    <div className="card" style={{ marginBottom: 12, borderLeft: `3px solid ${accent}` }}>
      <div className="card-head">
        <div>
          <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              width: 22, height: 22, borderRadius: "50%",
              background: accent, color: "#fff",
              display: "grid", placeItems: "center",
              fontWeight: 800, fontSize: 11,
            }}>{n}</span>
            {title}
          </div>
        </div>
      </div>
      <div className="card-body">{children}</div>
    </div>
  );
}
