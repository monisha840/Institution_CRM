"use client";

import { useState } from "react";

const TYPES = [
  { k: "one_time", label: "One-time gift" },
  { k: "monthly",  label: "Monthly recurring" },
  { k: "annual",   label: "Annual pledge" },
];

export default function DonorFormClient({ school }) {
  const [form, setForm] = useState({
    donorName: "", phone: "", email: "",
    donationType: "one_time", donationAmount: "", message: "",
  });
  const [busy, setBusy]   = useState(false);
  const [done, setDone]   = useState(false);
  const [err, setErr]     = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/donor-form", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          donationAmount: form.donationAmount ? Number(String(form.donationAmount).replace(/\D/g, "")) : null,
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
    <div className="df-shell">
      <div className="df-card">
        <header className="df-head">
          <img src="/logo.png" alt="" className="df-logo" />
          <div className="df-trust">{school.trustName}</div>
        </header>

        {!done ? (
          <>
            <h1 className="df-title">Support our students</h1>
            <p className="df-sub">
              Your contribution funds scholarships, classroom resources, and infrastructure.
              Tell us how you'd like to give and our team will reach out within 48 hours.
            </p>

            <form onSubmit={submit} className="df-form">
              <Field label="Your name *" required>
                <input
                  className="df-input" autoFocus required
                  value={form.donorName}
                  onChange={(e) => set("donorName", e.target.value)}
                  placeholder="As you'd like it on the receipt"
                />
              </Field>

              <div className="df-row">
                <Field label="Phone">
                  <input
                    className="df-input" type="tel"
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    placeholder="+91 …"
                  />
                </Field>
                <Field label="Email">
                  <input
                    className="df-input" type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="you@example.com"
                  />
                </Field>
              </div>

              <Field label="How would you like to give?">
                <div className="df-segmented">
                  {TYPES.map((t) => (
                    <button
                      key={t.k} type="button"
                      className={form.donationType === t.k ? "active" : ""}
                      onClick={() => set("donationType", t.k)}
                    >{t.label}</button>
                  ))}
                </div>
              </Field>

              <Field label="Indicative amount (₹)" hint="Optional — gives us a sense of scale.">
                <input
                  className="df-input" inputMode="numeric"
                  value={form.donationAmount}
                  onChange={(e) => set("donationAmount", e.target.value.replace(/\D/g, ""))}
                  placeholder="50000"
                />
              </Field>

              <Field label="Message" hint="Anything you'd like the team to know.">
                <textarea
                  className="df-input df-textarea"
                  rows={4}
                  value={form.message}
                  onChange={(e) => set("message", e.target.value.slice(0, 2000))}
                  placeholder="In memory of … / Earmark for science lab / etc."
                />
              </Field>

              {err && <div className="df-err">{err}</div>}

              <button type="submit" className="df-submit" disabled={busy || !form.donorName.trim()}>
                {busy ? "Sending…" : "Send enquiry"}
              </button>
            </form>
          </>
        ) : (
          <div className="df-done">
            <div className="df-tick" aria-hidden>✓</div>
            <h2>Thank you, {form.donorName}!</h2>
            <p>
              Your enquiry has reached our team. We'll be in touch on the contact you shared
              within the next 48 hours with bank / UPI details, 80G certification info, and
              a formal acknowledgement letter.
            </p>
            {school.contact && (
              <p className="df-contact">
                Need to reach us first? <strong>{school.contact}</strong>
              </p>
            )}
          </div>
        )}

        <footer className="df-foot">
          {school.regNo && <span>Reg No · {school.regNo}</span>}
          {school.pan80g && <span>PAN / 80G · {school.pan80g}</span>}
          <span>© {new Date().getFullYear()} {school.trustName}</span>
        </footer>
      </div>

      <style jsx>{`
        .df-shell {
          min-height: 100vh;
          padding: 32px 16px;
          background: linear-gradient(140deg, #f7f5ee 0%, #e6ebf5 100%);
          display: grid; place-items: center;
          font-family: var(--font-sans, system-ui, sans-serif);
        }
        .df-card {
          width: 100%; max-width: 560px;
          background: #ffffff;
          border-radius: 18px;
          border: 1px solid rgba(15, 23, 42, 0.06);
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04), 0 24px 60px -28px rgba(31, 63, 139, 0.28);
          padding: 28px 30px;
        }
        .df-head {
          display: flex; align-items: center; gap: 14px;
          padding-bottom: 20px;
          border-bottom: 1px solid rgba(15, 23, 42, 0.08);
        }
        .df-logo { width: 48px; height: 48px; border-radius: 10px; object-fit: contain; }
        .df-trust {
          display: inline-flex;
          align-items: center;
          padding: 8px 16px;
          font-size: 14px;
          font-weight: 700;
          color: #ffffff;
          background: linear-gradient(135deg, #1f3f8b 0%, #e8530e 100%);
          border-radius: 999px;
          letter-spacing: 0.02em;
          line-height: 1.2;
          box-shadow: 0 4px 12px -4px rgba(31, 63, 139, 0.35);
        }
        .df-title { margin: 22px 0 4px; font-size: 24px; font-weight: 800; color: #1d2433; letter-spacing: -0.02em; }
        .df-sub { margin: 0 0 22px; font-size: 13px; line-height: 1.6; color: #5b5e64; font-weight: 600; }
        .df-form { display: flex; flex-direction: column; gap: 14px; }
        .df-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .df-input {
          width: 100%; padding: 11px 13px;
          border: 1px solid rgba(15, 23, 42, 0.14);
          border-radius: 9px;
          font-size: 13px; font-weight: 700;
          background: #fbfaf6;
          color: #1d2433;
          transition: border .15s, background .15s;
        }
        .df-input:focus { outline: none; border-color: #1f3f8b; background: #ffffff; }
        .df-textarea { resize: vertical; font-family: inherit; line-height: 1.5; }
        .df-segmented {
          display: flex; gap: 4px; padding: 3px;
          background: #f1ede1; border-radius: 9px;
          border: 1px solid rgba(15, 23, 42, 0.06);
        }
        .df-segmented button {
          flex: 1; padding: 8px 10px;
          background: transparent; border: 0; border-radius: 7px;
          font-size: 12px; font-weight: 700;
          color: #6b6e74; cursor: pointer;
          transition: background .15s, color .15s;
        }
        .df-segmented button.active {
          background: #ffffff; color: #1f3f8b;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
        }
        .df-err {
          background: #fbe1d8; color: #b13c1c;
          padding: 10px 12px; border-radius: 7px;
          font-size: 12px; font-weight: 700;
        }
        .df-submit {
          margin-top: 4px;
          padding: 12px 18px;
          background: linear-gradient(135deg, #1f3f8b 0%, #e8530e 100%);
          color: #ffffff;
          border: 0; border-radius: 9px;
          font-size: 14px; font-weight: 800;
          cursor: pointer;
          transition: transform .15s, box-shadow .15s;
        }
        .df-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 12px 24px -10px rgba(31, 63, 139, 0.45);
        }
        .df-submit:disabled { opacity: 0.5; cursor: not-allowed; }
        .df-done { padding: 20px 0; text-align: center; }
        .df-tick {
          width: 56px; height: 56px; border-radius: 50%;
          background: #1f7a3a; color: #fff;
          display: grid; place-items: center;
          font-size: 28px; font-weight: 800;
          margin: 0 auto 18px;
        }
        .df-done h2 { font-size: 22px; font-weight: 800; color: #1d2433; margin: 0 0 12px; }
        .df-done p { font-size: 13px; line-height: 1.6; color: #5b5e64; font-weight: 600; margin: 0 0 12px; }
        .df-contact { padding: 12px 14px; background: #f7f5ee; border-radius: 8px; }
        .df-foot {
          margin-top: 24px; padding-top: 16px;
          border-top: 1px solid rgba(15, 23, 42, 0.08);
          display: flex; flex-wrap: wrap; gap: 14px;
          font-size: 11px; color: #888;
          font-weight: 700;
        }
        @media (max-width: 520px) {
          .df-card { padding: 22px 20px; }
          .df-title { font-size: 22px; }
          .df-row { grid-template-columns: 1fr; }
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
