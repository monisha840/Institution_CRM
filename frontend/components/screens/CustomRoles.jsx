"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "../Icon";

// Catalogue of features the admin can grant / restrict per custom role.
// Keep this list aligned with the canonical sidebar ids in Sidebar.jsx
// so the access toggles map cleanly to actual screens.
const FEATURE_CATALOG = [
  { group: "Trust",        items: [
    { k: "trust",     label: "Trust overview" },
    { k: "money",     label: "Finance / Money" },
    { k: "donors",    label: "Trust & Donors" },
  ]},
  { group: "School",       items: [
    { k: "dashboard", label: "Dashboard" },
    { k: "students",  label: "Students" },
    { k: "classes",   label: "Classes" },
    { k: "timetable", label: "Timetable" },
    { k: "attendance",label: "Attendance" },
    { k: "academic",  label: "Academic" },
    { k: "exams",     label: "Exams & Marks" },
    { k: "fees",      label: "Fees & UPI" },
    { k: "tc",        label: "Transfer certificates" },
    { k: "staff",     label: "Staff" },
  ]},
  { group: "Operations",   items: [
    { k: "transport",  label: "Transport" },
    { k: "inventory",  label: "Inventory" },
    { k: "library",    label: "Library" },
    { k: "complaints", label: "Complaints" },
    { k: "enquiries",  label: "Admissions" },
    { k: "meetings",   label: "Meetings" },
    { k: "volunteers", label: "Volunteers" },
    { k: "reports",    label: "Reports" },
  ]},
  { group: "Workflow",     items: [
    { k: "leave",                label: "Leave requests" },
    { k: "remarks_rewards",      label: "Remarks & rewards" },
    { k: "student_activities",   label: "Student activities" },
    { k: "messages",             label: "Parent messages" },
  ]},
  { group: "Governance",   items: [
    { k: "access",                label: "Access control" },
    { k: "tasks",                 label: "Tasks" },
    { k: "users",                 label: "Users & Roles" },
    { k: "government_documents",  label: "Government documents" },
    { k: "audit",                 label: "Audit log" },
    { k: "settings",              label: "Settings" },
  ]},
];

export default function ScreenCustomRoles({ E, role, refresh }) {
  const isAdmin = role === "admin";
  const [roles, setRoles] = useState(E.CUSTOM_ROLES || []);
  const [activeRoleId, setActiveRoleId] = useState(null);
  const [features, setFeatures] = useState([]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const flash = (msg, tone = "ok") => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 2400);
  };

  async function reloadRoles() {
    try {
      const r = await fetch("/api/custom-roles", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (j?.ok) setRoles(j.roles || []);
    } catch {}
  }
  async function loadFeatures(roleId) {
    if (!roleId) { setFeatures([]); return; }
    try {
      const r = await fetch(`/api/custom-roles?roleId=${encodeURIComponent(roleId)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (j?.ok) setFeatures(j.features || []);
    } catch {}
  }

  useEffect(() => { reloadRoles(); }, []);
  useEffect(() => { loadFeatures(activeRoleId); }, [activeRoleId]);

  const featureMap = (() => {
    const m = new Map();
    for (const f of features) m.set(f.featureName, f);
    return m;
  })();

  const nameInputRef = useRef(null);
  async function createRole(e) {
    e.preventDefault();
    if (busy) return;
    // Friendly validation — instead of a silently disabled button, tell the
    // admin exactly why nothing happened and put the cursor in the input.
    if (!newName.trim()) {
      flash("Type a role name first (e.g. Mid-office)", "err");
      nameInputRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/custom-roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roleName: newName.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Failed");
      setNewName("");
      flash(`Role "${j.role.roleName}" created`, "ok");
      await reloadRoles();
      setActiveRoleId(j.role.id);
      await refresh?.();
    } catch (ex) {
      flash(ex.message || "Failed", "err");
    } finally {
      setBusy(false);
    }
  }

  async function removeRole(r) {
    if (!confirm(`Delete role "${r.roleName}"? Users currently assigned to it will lose access.`)) return;
    try {
      const resp = await fetch("/api/custom-roles", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: r.id }),
      });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok || !j.ok) throw new Error(j.error || "Failed");
      flash("Role removed", "ok");
      if (activeRoleId === r.id) setActiveRoleId(null);
      await reloadRoles();
      await refresh?.();
    } catch (ex) {
      flash(ex.message || "Failed", "err");
    }
  }

  async function toggleFeature(featureName, level, value) {
    if (!activeRoleId) return;
    const cur = featureMap.get(featureName) || { canView: false, canEdit: false, canDelete: false };
    const next = { ...cur, [level]: value };
    // Cascading defaults: granting edit implies view; revoking view revokes everything.
    if (level === "canEdit"   && value === true)  next.canView = true;
    if (level === "canDelete" && value === true) { next.canView = true; next.canEdit = true; }
    if (level === "canView"   && value === false) { next.canEdit = false; next.canDelete = false; }
    try {
      const r = await fetch("/api/custom-roles", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roleId: activeRoleId, featureName,
          canView: next.canView, canEdit: next.canEdit, canDelete: next.canDelete,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Failed");
      // Update local feature list.
      setFeatures((prev) => {
        const i = prev.findIndex((p) => p.featureName === featureName);
        if (i === -1) return [...prev, j.access];
        const copy = [...prev]; copy[i] = j.access; return copy;
      });
    } catch (ex) {
      flash(ex.message || "Failed", "err");
    }
  }

  if (!isAdmin) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <div className="page-title">Custom roles</div>
            <div className="page-sub">Only admin can configure custom roles.</div>
          </div>
        </div>
      </div>
    );
  }

  const activeRole = roles.find((r) => r.id === activeRoleId);

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
          <div className="page-eyebrow">Governance · Access</div>
          <div className="page-title">Custom <span className="amber">roles</span></div>
          <div className="page-sub">
            Build new roles on top of the seven canonical ones — say,
            "Mid-office" with view-only fees, or "Sports head" with full
            access to Activities. Toggle View / Edit / Delete per feature.
          </div>
        </div>
      </div>

      <div className="grid g-12">
        <div className="card col-5">
          <div className="card-head">
            <div>
              <div className="card-title">Roles</div>
              <div className="card-sub">{roles.length} custom role{roles.length === 1 ? "" : "s"}</div>
            </div>
          </div>
          <form onSubmit={createRole} style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--rule)" }}>
            <input
              ref={nameInputRef}
              className="input"
              placeholder="Type a role name, e.g. Mid-office, Sports head…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={60}
              style={{ flex: 1 }}
              autoFocus
            />
            <button
              type="submit"
              className="btn accent"
              disabled={busy}
              title={!newName.trim() ? "Type a role name first" : "Create this role"}
            >
              {busy ? "Creating…" : <><Icon name="plus" size={13} />Create</>}
            </button>
          </form>
          {roles.length === 0 ? (
            <div className="empty" style={{ padding: 30 }}>No custom roles yet — create one to get started.</div>
          ) : (
            <div>
              {roles.map((r) => {
                const active = r.id === activeRoleId;
                return (
                  <div key={r.id} className="lrow" style={{
                    background: active ? "var(--accent-soft)" : "transparent",
                    cursor: "pointer",
                  }} onClick={() => setActiveRoleId(r.id)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{r.roleName}</div>
                      <div style={{ fontSize: 10.5, color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}>{r.id}</div>
                    </div>
                    <button
                      className="btn sm"
                      onClick={(e) => { e.stopPropagation(); removeRole(r); }}
                    >Remove</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card col-7">
          <div className="card-head">
            <div>
              <div className="card-title">
                {activeRole ? `Feature access · ${activeRole.roleName}` : "Pick a role to edit"}
              </div>
              <div className="card-sub">
                {activeRole
                  ? "View → can see the screen · Edit → can change · Delete → can remove rows."
                  : "Select a role on the left or create a new one."}
              </div>
            </div>
          </div>
          {!activeRole ? (
            <div className="empty" style={{ padding: 50 }}>Nothing selected.</div>
          ) : (
            <div style={{ maxHeight: 620, overflowY: "auto" }}>
              {FEATURE_CATALOG.map((grp) => (
                <div key={grp.group}>
                  <div style={{
                    padding: "10px 14px", background: "var(--bg-2)",
                    fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: 0.5, color: "var(--ink-3)",
                  }}>{grp.group}</div>
                  <div>
                    {grp.items.map((it) => {
                      const f = featureMap.get(it.k);
                      const v = !!f?.canView;
                      const e = !!f?.canEdit;
                      const d = !!f?.canDelete;
                      return (
                        <div key={it.k} className="lrow" style={{ paddingTop: 10, paddingBottom: 10 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700 }}>{it.label}</div>
                            <div style={{ fontSize: 10.5, color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}>{it.k}</div>
                          </div>
                          <ToggleChip label="View"   active={v} onClick={() => toggleFeature(it.k, "canView", !v)} />
                          <ToggleChip label="Edit"   active={e} onClick={() => toggleFeature(it.k, "canEdit", !e)} />
                          <ToggleChip label="Delete" active={d} onClick={() => toggleFeature(it.k, "canDelete", !d)} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ToggleChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
        border: "1px solid",
        borderColor: active ? "var(--accent)" : "var(--rule)",
        background:  active ? "var(--accent-soft)" : "var(--card)",
        color:       active ? "var(--accent-2, var(--accent))" : "var(--ink-3)",
        cursor: "pointer",
        marginLeft: 4,
        flexShrink: 0,
      }}
    >
      {label}
    </button>
  );
}
