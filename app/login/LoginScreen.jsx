"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import InstitutionSwitch from "./InstitutionSwitch";

// What each institution puts on its brand panel. Keyed by tenant, because
// the school and the college genuinely sell different things: a school talks
// to parents about their child's day, a college talks to a department about
// semesters, credits and results.
const HIGHLIGHTS = {
  school: [
    { icon: "fees", title: "Fees & receipts", blurb: "Term fees, UPI collection, instant receipts on WhatsApp." },
    { icon: "academic", title: "Daily classroom log", blurb: "Attendance, classwork and homework — visible to every parent." },
    { icon: "bus", title: "Transport tracking", blurb: "Live boarding alerts so parents know the bus reached the stop." },
    { icon: "shield", title: "Role-based access", blurb: "Principal, teacher, office and parent each see only their own view." },
  ],
  college: [
    { icon: "fees", title: "Semester fees", blurb: "Semester-wise dues, online payment, receipts and reconciliation." },
    { icon: "reports", title: "Internals & results", blurb: "Internal assessments, end-semester marks, credit-weighted GPA." },
    { icon: "academic", title: "Attendance & shortage", blurb: "Daily attendance ranked against the exam bar, with a condonation list per semester." },
    { icon: "shield", title: "Department access", blurb: "Dean, HOD, faculty and office each scoped to what they administer." },
  ],
};

export default function LoginScreen({ institutions, initialTenant, next }) {
  const [tenant, setTenant] = useState(initialTenant);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const active = useMemo(
    () => institutions.find((i) => i.id === tenant) || institutions[0],
    [institutions, tenant]
  );
  const highlights = HIGHLIGHTS[active.id] || HIGHLIGHTS.school;

  // Paint the accent from the chosen institution. The palette keys off
  // data-institution (see globals.css), and the login screen lives outside
  // AppShell, so it has to stamp the attribute itself — otherwise switching
  // to the college would change the words but not the colour.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-institution");
    root.setAttribute("data-institution", active.id);
    return () => {
      if (previous) root.setAttribute("data-institution", previous);
      else root.removeAttribute("data-institution");
    };
  }, [active.id]);

  // Clear a stale "invalid password" when the person switches institution —
  // the credentials they just tried belong to the other one, so the error no
  // longer describes anything true.
  function pickTenant(id) {
    if (id === tenant) return;
    setTenant(id);
    setErr("");
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, tenant: active.id }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.ok) throw new Error(json.error || "Sign in failed");
      window.location.href = next || "/";
    } catch (e) {
      setErr(e.message || String(e));
      setBusy(false);
    }
  }

  const year = new Date().getFullYear();

  return (
    <div className="login-shell">
      {/* Left: brand showcase ------------------------------------------------ */}
      <aside className="login-pane-left">
        <div className="lp-bg-grid" aria-hidden />
        <div className="lp-bg-glow" aria-hidden />
        <div className="lp-inner">
          <div className="lp-brand">
            <img src="/logo.png" alt="" className="lp-logo" />
            <div className="lp-brand-text">
              <div className="lp-school">{active.name}</div>
              <div className="lp-trust">{active.city} · {active.tagline}</div>
            </div>
          </div>

          <InstitutionSwitch institutions={institutions} active={active} onPick={pickTenant} tone="dark" />

          <div className="lp-headline">
            <h1>{active.headline}</h1>
            <p>{active.blurb}</p>
          </div>

          <ul className="lp-features">
            {highlights.map((h) => (
              <li key={h.title}>
                <span className="lp-ic"><Icon name={h.icon} size={16} /></span>
                <div>
                  <div className="lp-ft-title">{h.title}</div>
                  <div className="lp-ft-blurb">{h.blurb}</div>
                </div>
              </li>
            ))}
          </ul>

          <div className="lp-foot">
            {active.affiliation}
            <br />© {year} {active.name}
          </div>
        </div>
      </aside>

      {/* Right: sign-in panel ------------------------------------------------- */}
      <main className="login-pane-right">
        <div className="lp-form-wrap">
          {/* Compact brand for mobile (left pane is hidden) */}
          <div className="lp-brand-mobile">
            <img src="/logo.png" alt="" />
            <div>
              <div className="lp-school">{active.name}</div>
              <div className="lp-sub-mobile">{active.city} · {active.tagline}</div>
            </div>
          </div>

          <InstitutionSwitch institutions={institutions} active={active} onPick={pickTenant} tone="light" />

          <div className="lp-card">
            <header className="lp-form-head">
              <h2>Sign in</h2>
              <p>Use the account issued to you by the {active.id === "college" ? "college" : "school"} office.</p>
            </header>

            <form onSubmit={submit} className="lp-form" autoComplete="on">
              <label className="lp-field">
                <span>Email address</span>
                <div className="lp-input-wrap">
                  <span className="lp-input-ic" aria-hidden><Icon name="mail" size={15} /></span>
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={`you@${active.emailDomain}`}
                  />
                </div>
              </label>

              <label className="lp-field">
                <span>Password</span>
                <div className="lp-input-wrap">
                  <span className="lp-input-ic" aria-hidden><Icon name="lock" size={15} /></span>
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="lp-eye"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>

              {err && (
                <div className="lp-err" role="alert">
                  <Icon name="warning" size={12} />
                  <span>{err}</span>
                </div>
              )}

              <button className="lp-submit" type="submit" disabled={busy}>
                {busy
                  ? <><span className="lp-spinner" aria-hidden /> Signing in…</>
                  : <>Sign in to {active.label} <Icon name="arrowRight" size={13} /></>}
              </button>

              <div className="lp-help">
                Forgotten your password? The {active.id === "college" ? "college" : "school"} office
                can reset it — {active.emailDomain.replace(/^/, "office@")}
              </div>
            </form>
          </div>

          <div className="lp-credit-line">
            Developed by{" "}
            <a href="https://sirahdigital.in/" target="_blank" rel="noopener noreferrer" className="lp-credit">
              Sirah Digital
            </a>
          </div>

          <div className="lp-foot-mobile">© {year} {active.name}</div>
        </div>
      </main>

      <style jsx>{`
        .login-shell {
          min-height: 100vh;
          min-height: 100dvh;
          display: grid;
          grid-template-columns: 1.05fr 1fr;
          /* Nothing on this page may scroll sideways. */
          overflow-x: hidden;
          background: var(--bg);
          color: var(--ink);
        }

        /* ===== Left: brand panel ============================================ */
        .login-pane-left {
          position: relative;
          overflow: hidden;
          min-width: 0;
          background:
            radial-gradient(1200px 800px at -10% -10%, rgba(255,255,255,0.08), transparent 55%),
            radial-gradient(900px 700px at 110% 110%, var(--ring), transparent 55%),
            linear-gradient(160deg, var(--brand) 0%, var(--brand-2) 100%);
          color: #fff;
          padding: 48px 56px;
          display: flex;
          align-items: center;
        }
        .lp-bg-grid {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px);
          background-size: 32px 32px;
          mask-image: radial-gradient(900px 600px at 30% 50%, #000 30%, transparent 75%);
          opacity: 0.5;
          pointer-events: none;
        }
        .lp-bg-glow {
          position: absolute; right: -180px; bottom: -180px;
          width: 540px; height: 540px; border-radius: 50%;
          background: radial-gradient(circle, var(--ring-strong), transparent 70%);
          filter: blur(20px);
          pointer-events: none;
        }
        .lp-inner {
          position: relative; z-index: 1;
          max-width: 520px; width: 100%;
          display: flex; flex-direction: column; gap: 28px;
        }
        .lp-brand { display: flex; align-items: center; gap: 14px; }
        .lp-logo {
          width: 56px; height: 56px; border-radius: 12px;
          background: #fff; padding: 4px; object-fit: contain;
          box-shadow: 0 8px 24px -12px rgba(0,0,0,0.5);
          flex-shrink: 0;
        }
        .lp-school {
          font-family: var(--font-serif, Georgia, serif);
          font-size: 22px; font-weight: 600; letter-spacing: -0.01em;
          line-height: 1.15;
        }
        .lp-trust {
          font-size: 11.5px; color: rgba(255,255,255,0.68);
          letter-spacing: 0.04em; text-transform: uppercase; margin-top: 4px;
        }
        .lp-headline h1 {
          font-family: var(--font-serif, Georgia, serif);
          font-size: 36px; line-height: 1.14; margin: 0 0 12px;
          letter-spacing: -0.02em; font-weight: 600;
        }
        .lp-headline p {
          font-size: 14px; line-height: 1.6; margin: 0;
          color: rgba(255,255,255,0.78); max-width: 440px;
        }
        .lp-features {
          list-style: none; padding: 0; margin: 0;
          display: grid; grid-template-columns: 1fr; gap: 12px;
        }
        .lp-features li {
          display: flex; gap: 12px; align-items: flex-start;
          padding: 12px 14px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 10px;
        }
        .lp-ic {
          width: 32px; height: 32px; border-radius: 8px;
          background: rgba(255,255,255,0.14); color: #fff;
          display: grid; place-items: center; flex-shrink: 0;
          border: 1px solid rgba(255,255,255,0.22);
        }
        .lp-ft-title { font-size: 13px; font-weight: 600; }
        .lp-ft-blurb {
          font-size: 11.5px; line-height: 1.5;
          color: rgba(255,255,255,0.72); margin-top: 2px;
        }
        .lp-foot {
          font-size: 11px; color: rgba(255,255,255,0.55);
          letter-spacing: 0.02em; line-height: 1.7;
        }
        .lp-credit { color: var(--accent); font-weight: 600; text-decoration: none; }
        .lp-credit:hover { text-decoration: underline; }

        /* ===== Right: sign-in panel ========================================= */
        .login-pane-right {
          display: flex; align-items: center; justify-content: center;
          padding: 48px 32px;
          background: var(--bg);
          /* Grid items default to min-width:auto and refuse to shrink below
             their content, which pushed the form off the side of a phone. */
          min-width: 0;
        }
        .lp-form-wrap {
          width: 100%; max-width: 420px; min-width: 0;
          display: flex; flex-direction: column; gap: 16px;
        }

        .lp-brand-mobile {
          display: none;
          align-items: center; gap: 12px;
        }
        .lp-brand-mobile :global(img) {
          width: 44px; height: 44px; border-radius: 10px;
          background: #fff; padding: 3px; object-fit: contain;
          border: 1px solid var(--rule); flex-shrink: 0;
        }
        .lp-brand-mobile .lp-school { color: var(--ink); font-size: 17px; }
        .lp-sub-mobile {
          font-size: 11px; color: var(--ink-3); margin-top: 2px;
          letter-spacing: 0.03em; text-transform: uppercase;
        }

        .lp-card {
          min-width: 0;
          background: var(--card);
          border: 1px solid var(--rule);
          border-radius: 16px;
          padding: 28px 26px 24px;
          box-shadow:
            0 18px 40px -28px rgba(15, 30, 70, 0.18),
            0 6px 14px -10px rgba(15, 30, 70, 0.08);
        }

        .lp-form-head { margin-bottom: 20px; }
        .lp-form-head h2 {
          font-family: var(--font-serif, Georgia, serif);
          font-size: 22px; font-weight: 600; margin: 0 0 4px;
          letter-spacing: -0.02em; color: var(--ink);
        }
        .lp-form-head p {
          font-size: 13px; color: var(--ink-3); margin: 0; line-height: 1.5;
        }

        .lp-form { display: flex; flex-direction: column; gap: 14px; }
        .lp-field { display: flex; flex-direction: column; gap: 6px; }
        .lp-field > span {
          font-size: 11.5px; color: var(--ink-2);
          font-weight: 600; letter-spacing: 0.02em;
        }

        .lp-input-wrap {
          position: relative;
          display: flex; align-items: center;
          background: var(--card);
          border: 1px solid var(--rule);
          border-radius: 10px;
          transition: border-color .12s ease, box-shadow .12s ease;
        }
        .lp-input-wrap:hover { border-color: var(--ink-4); }
        .lp-input-wrap:focus-within {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--ring);
        }
        .lp-input-ic {
          display: grid; place-items: center;
          width: 38px; align-self: stretch;
          color: var(--ink-4); flex-shrink: 0;
        }
        .lp-input-wrap:focus-within .lp-input-ic { color: var(--accent); }
        .lp-input-wrap input {
          flex: 1; min-width: 0;
          /* 16px keeps iOS from zooming the viewport on focus. */
          padding: 12px 12px 12px 0;
          font-size: 16px; color: var(--ink);
          background: transparent;
          border: 0; outline: none;
          font-family: inherit;
        }
        .lp-input-wrap input::placeholder { color: var(--ink-4); font-size: 14px; }

        /* Kill the browser's autofill tint, which otherwise paints a yellow
           or grey block over a themed input. The long transition is the
           standard trick: the swap is delayed past any realistic session. */
        .lp-input-wrap input:-webkit-autofill,
        .lp-input-wrap input:-webkit-autofill:hover,
        .lp-input-wrap input:-webkit-autofill:focus {
          -webkit-text-fill-color: var(--ink);
          -webkit-box-shadow: 0 0 0 1000px var(--card) inset;
          transition: background-color 5000s ease-in-out 0s;
          caret-color: var(--ink);
        }

        .lp-eye {
          background: transparent; border: 0; cursor: pointer;
          font-size: 11.5px; font-weight: 600;
          color: var(--accent); letter-spacing: 0.02em;
          padding: 10px 12px; margin-right: 2px;
          border-radius: 6px; min-height: 40px;
        }
        .lp-eye:hover { background: var(--accent-soft); }

        .lp-err {
          background: var(--err-soft); color: var(--err);
          padding: 10px 12px; border-radius: 8px;
          font-size: 12px; line-height: 1.45;
          display: flex; align-items: center; gap: 8px;
          border: 1px solid var(--err);
        }

        .lp-submit {
          margin-top: 4px;
          min-height: 46px;
          padding: 12px 16px; font-size: 14px; font-weight: 600;
          background: var(--accent); color: var(--accent-ink);
          border: 0; border-radius: 10px; cursor: pointer;
          transition: background .15s ease;
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        }
        .lp-submit:hover { background: var(--accent-2); }
        .lp-submit:disabled { opacity: 0.7; cursor: wait; }

        .lp-spinner {
          width: 12px; height: 12px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.35);
          border-top-color: #fff;
          animation: spin .7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .lp-help {
          font-size: 11.5px; color: var(--ink-4); text-align: center;
          margin-top: 2px; line-height: 1.6;
          /* The support address is one long unbroken token; without this it
             sets the container's minimum width and overflows a phone. */
          overflow-wrap: anywhere;
        }
        .lp-credit-line {
          font-size: 11.5px; color: var(--ink-3);
          text-align: center; letter-spacing: 0.02em;
        }
        .lp-foot-mobile {
          display: none;
          font-size: 10.5px; color: var(--ink-4);
          text-align: center; line-height: 1.6;
        }

        /* ===== Responsive ===================================================
           Below 900px the brand panel goes and the form owns the screen, with
           the institution switch promoted to the top so the choice is still
           the first thing on the page. */
        @media (max-width: 900px) {
          .login-shell { grid-template-columns: 1fr; }
          .login-pane-left { display: none; }
          .login-pane-right {
            padding: 28px 20px calc(28px + env(safe-area-inset-bottom));
            align-items: flex-start;
          }
          .lp-form-wrap { margin-top: 8px; }
          .lp-brand-mobile { display: flex; }
          .lp-foot-mobile { display: block; }
          .lp-card { padding: 24px 20px 20px; border-radius: 14px; }
        }
        @media (max-width: 400px) {
          .login-pane-right { padding: 20px 14px calc(20px + env(safe-area-inset-bottom)); }
          .lp-card { padding: 20px 16px 18px; }
          .lp-form-head h2 { font-size: 20px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .lp-spinner { animation-duration: 1.5s; }
        }
      `}</style>
    </div>
  );
}
