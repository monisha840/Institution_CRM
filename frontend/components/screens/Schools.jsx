"use client";

import { useEffect, useState } from "react";
import Icon from "../Icon";

const PUCKS = ["sky", "mint", "peach", "cream", "ink"];

function Toast({ msg, tone, onClose }) {
  if (!msg) return null;
  const bg = tone === "ok" ? "var(--ok)" : tone === "err" ? "var(--err, #b13c1c)" : "var(--ink)";
  return (
    <div onClick={onClose} role="status" style={{
      position: "fixed", bottom: 18, right: 18, zIndex: 9000,
      background: bg, color: "#fff", padding: "9px 14px", borderRadius: 8,
      fontSize: 12, fontWeight: 500, cursor: "pointer",
    }}>{msg}</div>
  );
}

export default function ScreenSchools({ E, role }) {
  const fallback = E?.SCHOOLS || [];
  const [schools, setSchools] = useState(fallback);
  const [sel, setSel] = useState(fallback[0]?.id || null);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({ name: "", city: "", students: 0, fees: 0, wellness: "—", puck: "sky" });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const canEdit = role === "admin";

  const showToast = (msg, tone) => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 2500);
  };

  const refresh = async () => {
    try {
      const r = await fetch("/api/schools", { cache: "no-store" });
      const json = await r.json();
      if (json.ok) {
        const list = json.schools.length ? json.schools : fallback;
        setSchools(list);
        if (!sel && list[0]) setSel(list[0].id);
      }
    } catch {}
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const create = async () => {
    if (!draft.name.trim()) { showToast("Name required", "err"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/schools", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await r.json();
      if (json.ok) {
        showToast("School added", "ok");
        setShowNew(false);
        setDraft({ name: "", city: "", students: 0, fees: 0, wellness: "—", puck: "sky" });
        refresh();
      } else {
        showToast(json.error || "Failed", "err");
      }
    } finally { setBusy(false); }
  };

  const s = schools.find((x) => x.id === sel) || null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Trust · {schools.length} {schools.length === 1 ? "school" : "schools"}</div>
          <div className="page-title">Schools <span className="amber">at a glance</span></div>
          <div className="page-sub">Switch between schools. Each one has its own fees, staff, and academic tracker — but reports roll up here.</div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="download" size={13} />Export</button>
          {canEdit && (
            <button className="btn accent" onClick={() => setShowNew(true)}><Icon name="plus" size={13} />Add school</button>
          )}
        </div>
      </div>

      {showNew && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head">
            <div><div className="card-title">New school</div></div>
            <button className="btn sm ghost" onClick={() => setShowNew(false)}><Icon name="x" size={11} />Cancel</button>
          </div>
          <div className="card-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              style={{ padding: "8px 10px", border: "1px solid var(--rule-2)", borderRadius: 6, fontSize: 13 }} />
            <input placeholder="City" value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })}
              style={{ padding: "8px 10px", border: "1px solid var(--rule-2)", borderRadius: 6, fontSize: 13 }} />
            <input type="number" placeholder="Students" value={draft.students}
              onChange={(e) => setDraft({ ...draft, students: Number(e.target.value) || 0 })}
              style={{ padding: "8px 10px", border: "1px solid var(--rule-2)", borderRadius: 6, fontSize: 13 }} />
            <input type="number" placeholder="Fees collected %" value={draft.fees}
              onChange={(e) => setDraft({ ...draft, fees: Number(e.target.value) || 0 })}
              style={{ padding: "8px 10px", border: "1px solid var(--rule-2)", borderRadius: 6, fontSize: 13 }} />
            <select value={draft.puck} onChange={(e) => setDraft({ ...draft, puck: e.target.value })}
              style={{ padding: "8px 10px", border: "1px solid var(--rule-2)", borderRadius: 6, fontSize: 13 }}>
              {PUCKS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <button className="btn accent" onClick={create} disabled={busy}>
              <Icon name="check" size={13} />{busy ? "Saving…" : "Create"}
            </button>
          </div>
        </div>
      )}

      {schools.length === 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="empty" style={{ padding: 60 }}>No schools added yet. Click "Add school" to start.</div>
        </div>
      )}

      <div className="grid g-3" style={{ marginBottom: 18 }}>
        {schools.map((sc) => (
          <div className="card" key={sc.id} style={{ cursor: "pointer", borderColor: sel === sc.id ? "var(--accent)" : undefined }} onClick={() => setSel(sc.id)}>
            <div className="card-body">
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div className={`school-puck ${sc.puck}`} style={{ width: 44, height: 44 }}><Icon name="school" size={20} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, fontFamily: "var(--font-serif)" }}>{sc.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{sc.city || "—"}{sc.city ? " · " : ""}est. 2002</div>
                </div>
                <span className="chip ok"><span className="dot" />{sc.status || "Active"}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 16 }}>
                <div>
                  <div style={{ fontSize: 10.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Students</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 500, marginTop: 3 }}>{sc.students || 0}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Fees</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: "var(--ok)", marginTop: 3 }}>{sc.fees || 0}%</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Wellness</div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 500, color: "var(--accent)", marginTop: 3 }}>{sc.wellness || "—"}</div>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <div className="dual-bar"><span className="g" style={{ width: (sc.fees || 0) + "%" }} /><span className="r" style={{ width: 100 - (sc.fees || 0) + "%" }} /></div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {s && (
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">{s.name}</div>
            <div className="card-sub">{s.city || "—"} · detailed snapshot</div>
          </div>
          <div className="card-actions">
            <button className="btn sm"><Icon name="pencil" size={11} />Edit</button>
            <button className="btn sm"><Icon name="link" size={11} />Open as Principal</button>
          </div>
        </div>
        <div className="card-body">
          <div className="grid g-4">
            {[
              { t: "Students", v: s.students || 0, s: "on roll" },
              { t: "Teachers", v: 0, s: "—" },
              { t: "Fees collected", v: (s.fees ?? 0) + "%", s: "this term" },
              { t: "Complaints open", v: 0, s: "—" },
              { t: "Transport routes", v: 0, s: "—" },
              { t: "Inventory low", v: 0, s: "—" },
              { t: "Donors", v: 0, s: "—" },
              { t: "Audit score", v: s.wellness || "—", s: "—" },
            ].map((k) => (
              <div key={k.t} style={{ padding: "14px 0" }}>
                <div style={{ fontSize: 10.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 500 }}>{k.t}</div>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, marginTop: 6, letterSpacing: "-0.02em" }}>{k.v}</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{k.s}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      <Toast msg={toast?.msg} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}
