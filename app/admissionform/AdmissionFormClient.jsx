"use client";

import { useState } from "react";

// Same class set the rest of the app uses. PRE-MONT / MONT I / MONT II
// for pre-school, Roman numerals for primary. Parent picks the class
// they're enquiring for — staff can still change it during the
// convert-to-admission step on the Enquiries screen.
const CLASS_OPTIONS = [
  { value: "PRE-MONT", label: "PRE-MONT" },
  { value: "MONT I",   label: "MONT I" },
  { value: "MONT II",  label: "MONT II" },
  { value: "I",        label: "Class I" },
  { value: "II",       label: "Class II" },
  { value: "III",      label: "Class III" },
  { value: "IV",       label: "Class IV" },
  { value: "V",        label: "Class V" },
  { value: "VI",       label: "Class VI" },
  { value: "VII",      label: "Class VII" },
  { value: "VIII",     label: "Class VIII" },
];

export default function AdmissionFormClient({ school }) {
  const [form, setForm] = useState({
    studentName: "",
    dob: "",
    cls: "I",
    parentName: "",
    phoneDigits: "",
    email: "",
    address: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr]   = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // 10-digit Indian mobile validation — same rule the rest of the app
  // uses everywhere else. We require the phone here (unlike the donor
  // form) because parents are most easily reached by SMS / WhatsApp.
  const phoneOk = form.phoneDigits.length === 10 && /^[6-9]/.test(form.phoneDigits);
  const phoneError = !form.phoneDigits
    ? null
    : form.phoneDigits.length !== 10
      ? "Phone must be exactly 10 digits"
      : !/^[6-9]/.test(form.phoneDigits)
        ? "Indian mobile numbers start with 6, 7, 8 or 9"
        : null;
  const formValid = form.studentName.trim() && form.parentName.trim() && phoneOk;

  async function submit(e) {
    e.preventDefault();
    if (busy || !formValid) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/admissions/public", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentName: form.studentName.trim(),
          dob: form.dob || null,
          cls: form.cls,
          parentName: form.parentName.trim(),
          phone: form.phoneDigits ? `+91 ${form.phoneDigits.slice(0, 5)} ${form.phoneDigits.slice(5)}` : "",
          email: form.email.trim() || null,
          address: form.address.trim() || null,
          notes: form.notes.trim() || null,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Submission failed");
      setDone(true);
    } catch (ex) {
      setErr(ex.message || String(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="af-shell">
      <div className="af-card">
        <header className="af-head">
          <img src="/logo.png" alt="" className="af-logo" />
          <div className="af-trust">{school.trustName}</div>
        </header>

        {!done ? (
          <>
            <h1 className="af-title">Admission enquiry</h1>
            <p className="af-sub">
              Looking to enrol your child at {school.name}? Share a few details below and
              our admissions team will reach out within 48 hours with seat availability,
              fee structure, and next steps.
            </p>

            <form onSubmit={submit} className="af-form">
              <div className="af-section">
                <div className="af-section-label">Student details</div>

                <Field label="Child's full name *">
                  <input
                    className="af-input" autoFocus required
                    value={form.studentName}
                    onChange={(e) => set("studentName", e.target.value)}
                    placeholder="e.g. Anaika Sharma"
                  />
                </Field>

                <div className="af-row">
                  <Field label="Date of birth">
                    <input
                      className="af-input" type="date"
                      value={form.dob}
                      onChange={(e) => set("dob", e.target.value)}
                    />
                  </Field>
                  <Field label="Class applying for *">
                    <select
                      className="af-input"
                      value={form.cls}
                      onChange={(e) => set("cls", e.target.value)}
                    >
                      {CLASS_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>

              <div className="af-section">
                <div className="af-section-label">Parent / guardian details</div>

                <Field label="Parent / guardian name *">
                  <input
                    className="af-input" required
                    value={form.parentName}
                    onChange={(e) => set("parentName", e.target.value)}
                    placeholder="e.g. Priya Sharma"
                  />
                </Field>

                <Field label="Mobile number (10 digits) *">
                  <div className="af-phone" style={phoneError ? { borderColor: "#b13c1c" } : undefined}>
                    <span className="af-phone-prefix">+91</span>
                    <input
                      className="af-phone-input"
                      type="tel" inputMode="numeric" maxLength={10}
                      value={form.phoneDigits}
                      onChange={(e) => set("phoneDigits", e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="98765 43210"
                      required
                    />
                    <span className="af-phone-count" style={{ color: phoneOk ? "#1f7a3a" : "#888" }}>
                      {form.phoneDigits.length}/10
                    </span>
                  </div>
                  {phoneError && <span className="af-field-err">{phoneError}</span>}
                </Field>

                <Field label="Email" hint="Optional — we'll send a copy of the brochure here.">
                  <input
                    className="af-input" type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="you@example.com"
                  />
                </Field>

                <Field label="Home address" hint="Helps us suggest the nearest school bus route.">
                  <textarea
                    className="af-input af-textarea"
                    rows={2}
                    value={form.address}
                    onChange={(e) => set("address", e.target.value.slice(0, 500))}
                    placeholder="House / street / area / pincode"
                  />
                </Field>
              </div>

              <Field label="Anything else you'd like us to know?" hint="Optional.">
                <textarea
                  className="af-input af-textarea"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value.slice(0, 1500))}
                  placeholder="Previous school, sibling already enrolled, special needs, preferred contact time, etc."
                />
              </Field>

              {err && <div className="af-err">{err}</div>}

              <button type="submit" className="af-submit" disabled={busy || !formValid}>
                {busy ? "Sending…" : "Send enquiry"}
              </button>
            </form>
          </>
        ) : (
          <div className="af-done">
            <div className="af-tick" aria-hidden>✓</div>
            <h2>Thank you, {form.parentName}!</h2>
            <p>
              Your admission enquiry for <strong>{form.studentName}</strong> has reached our
              team. We'll be in touch on <strong>+91 {form.phoneDigits.slice(0, 5)} {form.phoneDigits.slice(5)}</strong> within 48 hours with seat
              availability, fee structure, and next steps.
            </p>
            {school.contact && (
              <p className="af-contact">
                Need to reach us first? <strong>{school.contact}</strong>
              </p>
            )}
          </div>
        )}

        <footer className="af-foot">
          {school.regNo && <span>Reg No · {school.regNo}</span>}
          <span>© {new Date().getFullYear()} {school.trustName}</span>
        </footer>
      </div>

      <style jsx>{`
        .af-shell {
          min-height: 100vh;
          padding: 32px 16px;
          background: linear-gradient(140deg, #f7f5ee 0%, #e6ebf5 100%);
          display: grid; place-items: center;
          font-family: var(--font-sans, system-ui, sans-serif);
        }
        .af-card {
          width: 100%; max-width: 580px;
          background: #ffffff;
          border-radius: 18px;
          border: 1px solid rgba(15, 23, 42, 0.06);
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04), 0 24px 60px -28px rgba(31, 63, 139, 0.28);
          padding: 28px 30px;
        }
        .af-head {
          display: flex; align-items: center; gap: 14px;
          padding-bottom: 20px;
          border-bottom: 1px solid rgba(15, 23, 42, 0.08);
        }
        .af-logo { width: 48px; height: 48px; border-radius: 10px; object-fit: contain; }
        .af-trust {
          display: inline-flex; align-items: center;
          padding: 8px 16px;
          font-size: 14px; font-weight: 700;
          color: #ffffff;
          background: linear-gradient(135deg, #1f3f8b 0%, #e8530e 100%);
          border-radius: 999px;
          letter-spacing: 0.02em; line-height: 1.2;
          box-shadow: 0 4px 12px -4px rgba(31, 63, 139, 0.35);
        }
        .af-title {
          margin: 22px 0 4px;
          font-size: 24px; font-weight: 800;
          color: #1d2433; letter-spacing: -0.02em;
        }
        .af-sub {
          margin: 0 0 22px;
          font-size: 13px; line-height: 1.6;
          color: #5b5e64; font-weight: 600;
        }
        .af-form { display: flex; flex-direction: column; gap: 16px; }
        .af-section {
          display: flex; flex-direction: column; gap: 12px;
          padding: 14px 16px;
          background: #fbfaf6;
          border: 1px solid rgba(15, 23, 42, 0.06);
          border-radius: 12px;
        }
        .af-section-label {
          font-size: 10.5px; font-weight: 800;
          color: #1f3f8b;
          text-transform: uppercase; letter-spacing: 0.08em;
        }
        .af-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .af-input {
          width: 100%; padding: 11px 13px;
          border: 1px solid rgba(15, 23, 42, 0.14);
          border-radius: 9px;
          font-size: 13px; font-weight: 700;
          background: #ffffff;
          color: #1d2433;
          transition: border .15s, background .15s;
        }
        .af-input:focus { outline: none; border-color: #1f3f8b; }
        .af-textarea { resize: vertical; font-family: inherit; line-height: 1.5; }
        .af-phone {
          display: flex;
          border: 1px solid rgba(15, 23, 42, 0.14);
          border-radius: 9px;
          background: #ffffff;
          overflow: hidden;
          height: 38px;
        }
        .af-phone-prefix {
          display: inline-flex; align-items: center;
          padding: 0 12px;
          background: #f7f5ee;
          border-right: 1px solid rgba(15, 23, 42, 0.08);
          font-family: var(--font-mono, monospace);
          font-size: 13px; color: #5b5e64; font-weight: 700;
        }
        .af-phone-input {
          flex: 1; border: 0; background: transparent; outline: none;
          padding: 0 12px;
          font-size: 13px; font-weight: 700;
          font-family: var(--font-mono, monospace); letter-spacing: 0.05em;
          color: #1d2433;
        }
        .af-phone-count {
          display: inline-flex; align-items: center;
          padding: 0 12px;
          font-size: 11px; font-weight: 700;
          font-family: var(--font-mono, monospace);
        }
        .af-field-err { font-size: 11px; color: #b13c1c; font-weight: 700; }
        .af-err {
          background: #fbe1d8; color: #b13c1c;
          padding: 10px 12px; border-radius: 7px;
          font-size: 12px; font-weight: 700;
        }
        .af-submit {
          margin-top: 4px;
          padding: 13px 18px;
          background: linear-gradient(135deg, #1f3f8b 0%, #e8530e 100%);
          color: #ffffff;
          border: 0; border-radius: 9px;
          font-size: 14px; font-weight: 800;
          cursor: pointer;
          transition: transform .15s, box-shadow .15s;
        }
        .af-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 12px 24px -10px rgba(31, 63, 139, 0.45);
        }
        .af-submit:disabled { opacity: 0.5; cursor: not-allowed; }
        .af-done { padding: 20px 0; text-align: center; }
        .af-tick {
          width: 56px; height: 56px; border-radius: 50%;
          background: #1f7a3a; color: #fff;
          display: grid; place-items: center;
          font-size: 28px; font-weight: 800;
          margin: 0 auto 18px;
        }
        .af-done h2 { font-size: 22px; font-weight: 800; color: #1d2433; margin: 0 0 12px; }
        .af-done p { font-size: 13px; line-height: 1.6; color: #5b5e64; font-weight: 600; margin: 0 0 12px; }
        .af-contact { padding: 12px 14px; background: #f7f5ee; border-radius: 8px; }
        .af-foot {
          margin-top: 24px; padding-top: 16px;
          border-top: 1px solid rgba(15, 23, 42, 0.08);
          display: flex; flex-wrap: wrap; gap: 14px;
          font-size: 11px; color: #888; font-weight: 700;
        }
        @media (max-width: 520px) {
          .af-card { padding: 22px 20px; }
          .af-title { font-size: 22px; }
          .af-row { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#5b5e64" }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 10.5, color: "#888", fontWeight: 700 }}>{hint}</span>}
    </label>
  );
}
