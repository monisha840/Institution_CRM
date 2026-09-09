"use client";

// My Account · self-service profile + password screen.
// Available to every role. Edits cascade: changing the name updates the
// users row, the staff row (for staff-linked accounts), and re-issues
// the session JWT so the topbar / sidebar / dashboard greeting all
// reflect the new name without requiring sign-out.

import { useEffect, useRef, useState } from "react";
import Icon from "../Icon";
import { AvatarChip } from "../ui";

const ROLE_LABEL = {
  admin: "Admin",
  academic_director: "Academic Director",
  principal: "Principal",
  teacher: "Teacher",
  parent: "Parent",
  school_accountant: "School Accountant",
  trust_accountant: "Trust Accountant",
};

function Toast({ msg, tone, onClose }) {
  if (!msg) return null;
  const bg = tone === "ok" ? "var(--ok)" : tone === "err" ? "var(--bad, #b13c1c)" : "var(--ink)";
  return (
    <div onClick={onClose} role="status" style={{
      position: "fixed", bottom: 18, right: 18, zIndex: 9000,
      background: bg, color: "#fff", padding: "9px 14px", borderRadius: 8,
      fontSize: 12, fontWeight: 500, cursor: "pointer", maxWidth: 360,
      boxShadow: "0 12px 30px -16px rgba(0,0,0,0.35)",
    }}>{msg}</div>
  );
}

export default function ScreenAccount({ session, refresh }) {
  const [tab, setTab] = useState("profile"); // 'profile' | 'security'
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = (msg, tone = "ok") => {
    setToast({ msg, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  // Fetch the full profile (includes phone, which the session JWT
  // doesn't carry — phone lives on the linked staff/student record).
  async function loadProfile() {
    try {
      const r = await fetch("/api/auth/profile", { cache: "no-store" });
      const j = await r.json();
      if (j.ok) setProfile(j.profile);
    } catch {}
    finally { setLoading(false); }
  }
  useEffect(() => { loadProfile(); }, []);

  return (
    <div className="page">
      <Toast msg={toast?.msg} tone={toast?.tone} onClose={() => setToast(null)} />

      <div className="page-head">
        <div>
          <div className="page-eyebrow">Account · {ROLE_LABEL[profile?.role || session?.role] || ""}</div>
          <div className="page-title">My <span className="amber">account</span></div>
          <div className="page-sub">
            Update your name, sign-in email, or password. Phone is read-only —
            ask the school office to change it.
          </div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 720 }}>
        <div className="card-head" style={{ flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              color: "var(--accent-ink, #fff)",
              display: "grid", placeItems: "center",
              fontWeight: 600, fontSize: 22,
            }}>
              {(profile?.name || session?.name || "U").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{profile?.name || session?.name}</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                {profile?.email || session?.email}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", borderBottom: "1px solid var(--rule-2)", padding: "0 18px" }}>
          <TabBtn active={tab === "profile"} onClick={() => setTab("profile")} icon="user">Profile</TabBtn>
          <TabBtn active={tab === "security"} onClick={() => setTab("security")} icon="shield">Password</TabBtn>
        </div>

        {loading ? (
          <div className="empty" style={{ padding: 40 }}>Loading…</div>
        ) : tab === "profile" ? (
          <ProfileForm
            profile={profile}
            onSaved={async (next) => {
              const emailChanged = String(profile?.email || "").toLowerCase() !== String(next?.email || "").toLowerCase();
              const nameChanged  = (profile?.name || "") !== (next?.name || "");
              setProfile(next);
              showToast(
                emailChanged && nameChanged ? `Saved · sign in with ${next.email} from now on`
                : emailChanged              ? `Saved · ${next.email} is now your sign-in email`
                                            : `Saved · "${next.name}" is now your name everywhere`,
                "ok"
              );
              // Tell AppShell to refresh data + the session payload so
              // topbar/sidebar/dashboard greeting all update live.
              try {
                await fetch("/api/auth/me", { cache: "no-store" });
              } catch {}
              await refresh?.();
              // Hard refresh to re-pull session is heavy-handed but the
              // simplest way to update session.name/email across the app today.
              setTimeout(() => window.location.reload(), 600);
            }}
            onError={(e) => showToast(e, "err")}
          />
        ) : (
          <PasswordForm
            onSaved={() => showToast("Password updated · sign out other devices for safety", "ok")}
            onError={(e) => showToast(e, "err")}
          />
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "12px 16px", border: 0, background: "transparent",
      cursor: "pointer", fontSize: 12.5, fontWeight: 500,
      color: active ? "var(--accent-2, var(--accent))" : "var(--ink-3)",
      borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
      display: "inline-flex", alignItems: "center", gap: 6,
      marginBottom: -1,
    }}>
      <Icon name={icon} size={12} />{children}
    </button>
  );
}

function ProfileForm({ profile, onSaved, onError }) {
  const [name, setName] = useState(profile?.name || "");
  const [email, setEmail] = useState(profile?.email || "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(profile?.name || ""); }, [profile?.name]);
  useEffect(() => { setEmail(profile?.email || ""); }, [profile?.email]);

  const trimmedName  = name.trim();
  const trimmedEmail = email.trim().toLowerCase();
  const nameChanged  = trimmedName  !== (profile?.name || "");
  const emailChanged = trimmedEmail !== String(profile?.email || "").toLowerCase();
  const dirty        = nameChanged || emailChanged;

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (trimmedName.length < 2) { onError?.("Name is too short"); return; }
    if (emailChanged) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        onError?.("Email format is invalid"); return;
      }
    }
    if (!dirty) { onError?.("No changes to save"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(nameChanged  ? { name:  trimmedName }  : {}),
          ...(emailChanged ? { email: trimmedEmail } : {}),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Failed");
      onSaved?.(j.profile);
    } catch (e) { onError?.(e.message); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Field label="Display name" hint="Shown in the topbar, sidebar, dashboard greeting and audit trail.">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="Your name as it should appear"
          autoFocus
        />
      </Field>
      <Field label="Email" hint="Used for sign-in. Changing this immediately updates your sign-in address — use the new one next time you log in.">
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={120}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </Field>
      <ReadOnlyField
        label="Phone"
        value={profile?.phone}
        hint={profile?.role === "parent"
          ? "On file with your child's record. Contact the office to change."
          : "On file with your staff record. Contact the office to change."}
      />
      <ReadOnlyField label="Role" value={ROLE_LABEL[profile?.role] || profile?.role} hint="Set by the admin." />
      {Array.isArray(profile?.linkedClasses) && profile.linkedClasses.length > 0 && (
        <ReadOnlyField
          label="Class teacher of"
          value={profile.linkedClasses.join(", ")}
          hint="Updated by the principal from the Classes screen."
        />
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
        <button type="submit" className="btn accent" disabled={busy || !trimmedName || !dirty}>
          <Icon name="check" size={13} />{busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function PasswordForm({ onSaved, onError }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (next.length < 6) { onError?.("New password must be at least 6 characters"); return; }
    if (next !== confirm) { onError?.("New password and confirmation don't match"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Failed");
      setCurrent(""); setNext(""); setConfirm("");
      onSaved?.();
    } catch (e) { onError?.(e.message); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5 }}>
        For your safety, please confirm your current password before setting a new one.
        Choose a password at least 6 characters long. Use something you can remember —
        the office can't recover it for you, only reset it.
      </div>
      <Field label="Current password">
        <input
          className="input"
          type={show ? "text" : "password"}
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </Field>
      <Field label="New password">
        <input
          className="input"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          minLength={6}
        />
      </Field>
      <Field label="Confirm new password">
        <input
          className="input"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-3)" }}>
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
        Show passwords while typing
      </label>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
        <button
          type="submit"
          className="btn accent"
          disabled={busy || !next || !confirm || next !== confirm}
        >
          <Icon name="check" size={13} />{busy ? "Updating…" : "Update password"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{hint}</span>}
    </label>
  );
}

function ReadOnlyField({ label, value, hint }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
      <div style={{
        padding: "9px 12px",
        background: "var(--card-2)",
        border: "1px solid var(--rule)",
        borderRadius: 9,
        fontSize: 13,
        color: value ? "var(--ink-2)" : "var(--ink-4)",
        fontFamily: /@|\d{4,}/.test(String(value || "")) ? "var(--font-mono)" : "inherit",
      }}>
        {value || "—"}
      </div>
      {hint && <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{hint}</span>}
    </div>
  );
}
