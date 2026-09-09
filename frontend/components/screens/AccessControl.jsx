"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "../Icon";

const ROLE_LABEL = {
  admin: "Admin",
  academic_director: "Academic Director",
  principal: "Principal",
  teacher: "Teacher",
  parent: "Parent",
  school_accountant: "School Accountant",
  trust_accountant: "Trust Accountant",
};

// Locked features admin can never disable for themselves — kept in sync with
// lib/permissions.js. Mirrored here so the UI can show the lock icon.
const ADMIN_LOCKED = new Set(["access", "dashboard", "trust", "settings"]);

function Toast({ msg, tone, onClose }) {
  if (!msg) return null;
  const bg = tone === "ok" ? "var(--ok)" : tone === "err" ? "var(--err, #b13c1c)" : "var(--ink)";
  return (
    <div onClick={onClose} role="status" style={{
      position: "fixed", bottom: 18, right: 18, zIndex: 9000,
      background: bg, color: "#fff", padding: "9px 14px", borderRadius: 8,
      fontSize: 12, fontWeight: 500, cursor: "pointer", maxWidth: 360,
      boxShadow: "0 12px 30px -16px rgba(0,0,0,0.35)",
    }}>{msg}</div>
  );
}

// Toggle pill — clicking flips, disabled state shown subtly.
function Toggle({ on, onClick, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 38, height: 22, borderRadius: 999,
        background: on ? "var(--accent)" : "var(--rule-2, #d8d2c4)",
        position: "relative", border: 0, cursor: disabled ? "not-allowed" : "pointer",
        transition: "background .15s ease",
        opacity: disabled ? 0.55 : 1,
        flexShrink: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 2, left: on ? 18 : 2,
        width: 18, height: 18, borderRadius: "50%",
        background: "#fff",
        transition: "left .15s ease",
        boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
      }} />
    </button>
  );
}

export default function ScreenAccessControl({ E, refresh, role, session }) {
  const [activeRole, setActiveRole] = useState("parent");
  const [features, setFeatures] = useState([]);
  const [perms, setPerms] = useState({}); // { role: { fid: bool } }
  const [draft, setDraft] = useState({}); // local edits before save: { fid: bool }
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const showToast = (msg, tone) => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 3000);
  };

  // Fetch the matrix on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/permissions", { cache: "no-store" });
        const json = await r.json();
        if (cancelled) return;
        if (!json.ok) throw new Error(json.error || "Failed to load");
        setFeatures(json.features || []);
        setPerms(json.permissions || {});
        setLoaded(true);
      } catch (e) {
        if (!cancelled) showToast(e.message, "err");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Whenever the active role changes, snapshot the saved values into the draft.
  useEffect(() => {
    if (!loaded) return;
    setDraft({ ...(perms[activeRole] || {}) });
  }, [activeRole, perms, loaded]);

  const isAdmin = role === "admin";
  const groups = useMemo(() => {
    const map = new Map();
    for (const f of features) {
      if (!map.has(f.group)) map.set(f.group, []);
      map.get(f.group).push(f);
    }
    return [...map.entries()];
  }, [features]);

  const dirty = useMemo(() => {
    const saved = perms[activeRole] || {};
    return features.some((f) => (draft[f.id] === false ? false : true) !== (saved[f.id] === false ? false : true));
  }, [draft, perms, activeRole, features]);

  const flip = (fid, on) => setDraft((d) => ({ ...d, [fid]: on }));
  const allOn  = () => setDraft(Object.fromEntries(features.map((f) => [f.id, true])));
  const allOff = () => setDraft(Object.fromEntries(features.map((f) => [f.id, false])));

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/permissions", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: activeRole, permissions: draft }),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) throw new Error(json.error || "Failed");
      setPerms(json.permissions || {});
      showToast(`${ROLE_LABEL[activeRole]} permissions saved`, "ok");
      await refresh?.();
    } catch (e) { showToast(e.message, "err"); }
    finally { setBusy(false); }
  }

  if (!isAdmin) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <div className="page-eyebrow">Governance · Access</div>
            <div className="page-title">Access <span className="amber">control</span></div>
          </div>
        </div>
        <div className="card"><div className="empty">Only Admin can edit role permissions.</div></div>
      </div>
    );
  }

  const enabledCount = features.filter((f) => draft[f.id] !== false).length;

  return (
    <div className="page">
      <Toast msg={toast?.msg} tone={toast?.tone} onClose={() => setToast(null)} />

      <div className="page-head">
        <div>
          <div className="page-eyebrow">Governance · Access</div>
          <div className="page-title">Access <span className="amber">control</span></div>
          <div className="page-sub">Toggle which features each role can see in the sidebar</div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={allOn} disabled={busy}>
            <Icon name="check" size={13} />Enable all
          </button>
          <button className="btn" onClick={allOff} disabled={busy}>
            <Icon name="x" size={13} />Disable all
          </button>
          <button className="btn accent" onClick={save} disabled={busy || !dirty}>
            <Icon name="check" size={13} />{busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </div>

      {/* Role tab strip */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{
          padding: "10px 14px", display: "flex", gap: 6, flexWrap: "wrap",
          borderBottom: "1px solid var(--rule)", alignItems: "center",
        }}>
          <span style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 500, marginRight: 8 }}>
            Editing role:
          </span>
          {Object.keys(ROLE_LABEL).map((r) => {
            const on = activeRole === r;
            return (
              <button
                key={r}
                onClick={() => {
                  if (dirty && !confirm("You have unsaved changes. Discard them?")) return;
                  setActiveRole(r);
                }}
                style={{
                  padding: "6px 14px", borderRadius: 999,
                  background: on ? "var(--accent)" : "var(--bg-2)",
                  color: on ? "#fff" : "var(--ink-2)",
                  border: 0, cursor: "pointer",
                  fontSize: 12.5, fontWeight: 500,
                }}
              >
                {ROLE_LABEL[r]}
              </button>
            );
          })}
        </div>
        <div style={{ padding: "10px 14px", fontSize: 12, color: "var(--ink-3)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>
            <b style={{ color: "var(--ink)" }}>{ROLE_LABEL[activeRole]}</b> currently has access to{" "}
            <span style={{ color: "var(--accent)", fontWeight: 500 }}>{enabledCount}</span> of {features.length} features.
            Changes apply on the next page load for that role.
          </span>
          {dirty && <span style={{ color: "var(--accent)", fontWeight: 500 }}>● Unsaved changes</span>}
        </div>
      </div>

      {/* Feature toggles, grouped */}
      <div className="grid g-12" style={{ gap: 14 }}>
        {groups.map(([group, items]) => (
          <div key={group} className="card col-6">
            <div className="card-head">
              <div>
                <div className="card-title">{group}</div>
                <div className="card-sub">{items.length} feature{items.length === 1 ? "" : "s"}</div>
              </div>
            </div>
            <div style={{ padding: "4px 14px 14px", display: "flex", flexDirection: "column", gap: 2 }}>
              {items.map((f) => {
                const locked = activeRole === "admin" && ADMIN_LOCKED.has(f.id);
                const on = draft[f.id] !== false;
                return (
                  <div
                    key={f.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "9px 8px", borderRadius: 8,
                      background: on ? "transparent" : "var(--bg-2)",
                      transition: "background .12s",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{f.label}</div>
                      <div style={{ fontSize: 10.5, color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}>
                        id: {f.id}{locked ? " · locked on" : ""}
                      </div>
                    </div>
                    <Toggle
                      on={on}
                      onClick={() => flip(f.id, !on)}
                      disabled={locked}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--bg-2)", border: "1px dashed var(--rule)", borderRadius: 8, fontSize: 11.5, color: "var(--ink-3)" }}>
        <Icon name="shield" size={12} /> Toggling a feature off only hides it from the sidebar — the underlying data is preserved.
        A few core screens (Access control, Trust overview, Dashboard, Settings) are locked on for Admin to prevent lockout.
      </div>
    </div>
  );
}
