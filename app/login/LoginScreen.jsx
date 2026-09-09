"use client";

import { useState } from "react";
import Icon from "@/components/Icon";

// Brand-side highlights shown on the left pane. The right pane is now a
// single email + password form — role is resolved server-side from the
// user record, so no tile picker is needed.
const HIGHLIGHTS = [
  { icon: "fees",        title: "Fees & receipts",     blurb: "UPI collection, online payments, auto receipts on WhatsApp." },
  { icon: "academic",    title: "Daily classroom log", blurb: "Attendance, classwork, homework — visible to every parent." },
  { icon: "megaphone",   title: "Parent communication",blurb: "In-app messages, broadcasts, fee reminders, exam alerts." },
  { icon: "shield",      title: "Role-based access",   blurb: "Each role sees exactly what it needs — nothing more." },
];

export default function LoginScreen({ next }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
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
              <div className="lp-school">Sanfort <span>International</span></div>
            </div>
          </div>

          <div className="lp-headline">
            <h1>One login for the entire school.</h1>
            <p>Fees, attendance, timetables, parent messaging — everything your team and families need, in one place.</p>
          </div>

          <ul className="lp-features">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title}>
                <span className="lp-ic"><Icon name={h.icon} size={16} /></span>
                <div>
                  <div className="lp-ft-title">{h.title}</div>
                  <div className="lp-ft-blurb">{h.blurb}</div>
                </div>
              </li>
            ))}
          </ul>

          <div className="lp-foot">© {year} Sanfort International School · All rights reserved</div>
        </div>
      </aside>

      {/* Right: sign-in panel ------------------------------------------------- */}
      <main className="login-pane-right">
        <div className="lp-form-wrap">
          {/* Compact brand for mobile (left pane is hidden) */}
          <div className="lp-brand-mobile">
            <img src="/logo.png" alt="" />
            <div>
              <div className="lp-school">Sanfort <span>International</span></div>
            </div>
          </div>

          <div className="lp-card">
            <header className="lp-form-head">
              <div className="lp-greet-ic" aria-hidden>
                <Icon name="user" size={18} />
              </div>
              <h2>Welcome back</h2>
              <p>Sign in with your school email and password.</p>
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
                    placeholder="you@school.com"
                  />
                </div>
              </label>

              <label className="lp-field">
                <span>Password</span>
                <div className="lp-input-wrap">
                  <span className="lp-input-ic" aria-hidden><Icon name="shield" size={15} /></span>
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
                  : <>Sign in <Icon name="arrowRight" size={13} /></>}
              </button>

              <div className="lp-help">
                Trouble signing in? Contact the school office.
              </div>
            </form>
          </div>

          <div className="lp-credit-line">
            Developed by{" "}
            <a href="https://sirahdigital.in/" target="_blank" rel="noopener noreferrer" className="lp-credit">
              Sirah Digital
            </a>
          </div>

          <div className="lp-foot-mobile">© {year} Sanfort International School</div>
        </div>
      </main>

      <style jsx>{`
        .login-shell {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1.05fr 1fr;
          background: var(--bg);
          color: var(--ink);
        }

        /* ===== Left: brand panel (unchanged) ================================== */
        .login-pane-left {
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(1200px 800px at -10% -10%, rgba(255,255,255,0.08), transparent 55%),
            radial-gradient(900px 700px at 110% 110%, rgba(232,83,14,0.18), transparent 55%),
            linear-gradient(160deg, var(--brand-blue, #1f3f8b) 0%, var(--brand-blue-2, #15306b) 100%);
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
          background: radial-gradient(circle, rgba(232,83,14,0.40), transparent 70%);
          filter: blur(20px);
          pointer-events: none;
        }
        .lp-inner {
          position: relative; z-index: 1;
          max-width: 520px; width: 100%;
          display: flex; flex-direction: column; gap: 36px;
        }
        .lp-brand { display: flex; align-items: center; gap: 14px; }
        .lp-logo {
          width: 56px; height: 56px; border-radius: 12px;
          background: #fff; padding: 4px; object-fit: contain;
          box-shadow: 0 8px 24px -12px rgba(0,0,0,0.5);
        }
        .lp-school {
          font-family: var(--font-serif, Georgia, serif);
          font-size: 22px; font-weight: 600; letter-spacing: -0.01em;
          line-height: 1.1;
        }
        .lp-school :global(span) { color: #ffd5bd; font-style: italic; }
        .lp-trust {
          font-size: 11.5px; color: rgba(255,255,255,0.72);
          letter-spacing: 0.04em; text-transform: uppercase; margin-top: 4px;
        }
        .lp-headline h1 {
          font-family: var(--font-serif, Georgia, serif);
          font-size: 38px; line-height: 1.12; margin: 0 0 12px;
          letter-spacing: -0.02em; font-weight: 600;
        }
        .lp-headline p {
          font-size: 14px; line-height: 1.6; margin: 0;
          color: rgba(255,255,255,0.78); max-width: 440px;
        }
        .lp-features {
          list-style: none; padding: 0; margin: 0;
          display: grid; grid-template-columns: 1fr; gap: 14px;
        }
        .lp-features li {
          display: flex; gap: 12px; align-items: flex-start;
          padding: 12px 14px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 10px;
          backdrop-filter: blur(6px);
        }
        .lp-ic {
          width: 32px; height: 32px; border-radius: 8px;
          background: rgba(232,83,14,0.18); color: #ffd5bd;
          display: grid; place-items: center; flex-shrink: 0;
          border: 1px solid rgba(232,83,14,0.28);
        }
        .lp-ft-title { font-size: 13px; font-weight: 600; }
        .lp-ft-blurb {
          font-size: 11.5px; line-height: 1.5;
          color: rgba(255,255,255,0.72); margin-top: 2px;
        }
        .lp-foot {
          font-size: 11px; color: rgba(255,255,255,0.55);
          letter-spacing: 0.02em;
          line-height: 1.6;
        }
        .lp-credit {
          color: var(--accent);
          font-weight: 600;
          text-decoration: none;
        }
        .lp-credit:hover { text-decoration: underline; }

        /* ===== Right: sign-in panel =========================================== */
        .login-pane-right {
          display: flex; align-items: center; justify-content: center;
          padding: 48px 32px;
          background: var(--bg);
          position: relative;
        }
        .lp-form-wrap {
          width: 100%; max-width: 420px;
          display: flex; flex-direction: column; gap: 18px;
          animation: lp-rise 0.45s cubic-bezier(0.2, 0.7, 0.2, 1) both;
        }
        @keyframes lp-rise {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: none; }
        }

        .lp-brand-mobile {
          display: none;
          align-items: center; gap: 12px;
          padding-bottom: 4px;
        }
        .lp-brand-mobile :global(img) {
          width: 44px; height: 44px; border-radius: 10px;
          background: #fff; padding: 3px; object-fit: contain;
          border: 1px solid var(--rule, #e5dfd1);
        }
        .lp-brand-mobile .lp-school { color: var(--brand-blue); font-size: 17px; }
        .lp-brand-mobile .lp-school :global(span) { color: var(--accent); font-style: italic; }

        /* Card wrapper — a softer container around the form so the right pane
           doesn't read as a flat slab. Subtle lift, no heavy border. */
        .lp-card {
          background: var(--card, #fff);
          border: 1px solid var(--rule, #e5dfd1);
          border-radius: 16px;
          padding: 30px 28px 26px;
          box-shadow:
            0 1px 0 rgba(255,255,255,0.6) inset,
            0 18px 40px -28px rgba(15, 30, 70, 0.18),
            0 6px 14px -10px rgba(15, 30, 70, 0.08);
        }

        .lp-form-head {
          display: flex; flex-direction: column; align-items: center;
          text-align: center; gap: 6px;
          margin-bottom: 22px;
        }
        .lp-greet-ic {
          width: 44px; height: 44px; border-radius: 12px;
          background: linear-gradient(160deg, var(--accent-soft, #fde6d6), rgba(232,83,14,0.08));
          color: var(--accent, #e8530e);
          display: grid; place-items: center;
          margin-bottom: 6px;
          border: 1px solid rgba(232,83,14,0.18);
        }
        .lp-form-head h2 {
          font-family: var(--font-serif, Georgia, serif);
          font-size: 24px; font-weight: 600; margin: 0;
          letter-spacing: -0.02em; color: var(--ink);
        }
        .lp-form-head p {
          font-size: 13px; color: var(--ink-3); margin: 0; line-height: 1.5;
        }

        /* form ----------------------------------------------------------------- */
        .lp-form { display: flex; flex-direction: column; gap: 14px; }

        .lp-field { display: flex; flex-direction: column; gap: 6px; }
        .lp-field > span {
          font-size: 11.5px; color: var(--ink-2);
          font-weight: 600; letter-spacing: 0.02em;
        }

        /* Input wrapper — owns the border + focus ring so we can sit icon and
           "Show" button cleanly inside. Keeps the field looking like one piece. */
        .lp-input-wrap {
          position: relative;
          display: flex; align-items: center;
          background: var(--card, #fff);
          border: 1px solid var(--rule, #e5dfd1);
          border-radius: 10px;
          transition: border-color .12s ease, box-shadow .12s ease;
        }
        .lp-input-wrap:hover { border-color: var(--ink-4); }
        .lp-input-wrap:focus-within {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(232,83,14,0.15);
        }
        .lp-input-ic {
          display: grid; place-items: center;
          width: 38px; height: 100%;
          color: var(--ink-4);
          flex-shrink: 0;
        }
        .lp-input-wrap:focus-within .lp-input-ic { color: var(--accent); }
        .lp-input-wrap input {
          flex: 1; min-width: 0;
          padding: 11px 12px 11px 0;
          font-size: 13.5px; color: var(--ink);
          background: transparent;
          border: 0; outline: none;
          font-family: inherit;
        }
        .lp-input-wrap input::placeholder { color: var(--ink-4); }

        /* Kill Chrome / Edge / Safari autofill background — the browser
           paints a yellow/grey tint on inputs it thinks are autofilled
           (saved password or text matching a saved entry). The 5000s
           transition is the standard trick: it delays the browser's
           background swap long enough that the user never sees it. */
        .lp-input-wrap input:-webkit-autofill,
        .lp-input-wrap input:-webkit-autofill:hover,
        .lp-input-wrap input:-webkit-autofill:focus,
        .lp-input-wrap input:-webkit-autofill:active {
          -webkit-text-fill-color: var(--ink);
          -webkit-box-shadow: 0 0 0 1000px var(--card, #fff) inset;
          box-shadow: 0 0 0 1000px var(--card, #fff) inset;
          transition: background-color 5000s ease-in-out 0s, color 5000s ease-in-out 0s;
          caret-color: var(--ink);
        }

        .lp-eye {
          background: transparent; border: 0; cursor: pointer;
          font-size: 11.5px; font-weight: 600;
          color: var(--accent); letter-spacing: 0.02em;
          padding: 6px 12px; margin-right: 2px;
          border-radius: 6px;
        }
        .lp-eye:hover { background: var(--accent-soft, rgba(232,83,14,0.08)); }

        .lp-err {
          background: var(--err-soft, #fbe1d8); color: var(--err, #b13c1c);
          padding: 10px 12px; border-radius: 8px;
          font-size: 12px; line-height: 1.45;
          display: flex; align-items: center; gap: 8px;
          border: 1px solid rgba(177,60,28,0.18);
          animation: lp-shake 0.3s ease;
        }
        @keyframes lp-shake {
          0%, 100% { transform: translateX(0); }
          25%      { transform: translateX(-3px); }
          75%      { transform: translateX(3px); }
        }

        .lp-submit {
          margin-top: 6px;
          padding: 12px 16px; font-size: 13.5px; font-weight: 600;
          background: var(--accent); color: var(--accent-ink, #fff);
          border: 0; border-radius: 10px; cursor: pointer;
          transition: background .15s ease, transform .15s ease, box-shadow .15s ease;
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          box-shadow: 0 6px 18px -10px rgba(232,83,14,0.5);
        }
        .lp-submit:hover { background: var(--accent-2); transform: translateY(-1px); box-shadow: 0 10px 22px -12px rgba(232,83,14,0.55); }
        .lp-submit:active { transform: translateY(0); }
        .lp-submit:disabled { opacity: 0.7; cursor: wait; transform: none; box-shadow: none; }

        .lp-spinner {
          width: 12px; height: 12px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.35);
          border-top-color: #fff;
          animation: spin .7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .lp-help {
          font-size: 11.5px; color: var(--ink-4); text-align: center;
          margin-top: 2px;
        }

        /* "Developed by Sirah Digital" — sits below the card. */
        .lp-credit-line {
          margin-top: 4px;
          font-size: 11.5px; color: var(--ink-3);
          text-align: center; letter-spacing: 0.02em;
        }

        .lp-foot-mobile {
          display: none;
          font-size: 10.5px; color: var(--ink-4);
          text-align: center; margin-top: 4px;
          line-height: 1.6;
        }

        /* ===== Responsive ===================================================== */
        @media (max-width: 880px) {
          .login-shell { grid-template-columns: 1fr; }
          .login-pane-left { display: none; }
          .login-pane-right { padding: 28px 20px; min-height: 100vh; }
          .lp-brand-mobile { display: flex; }
          .lp-foot-mobile { display: block; }
          .lp-card { padding: 26px 22px 22px; border-radius: 14px; }
        }
        @media (max-width: 420px) {
          .lp-card { padding: 22px 18px 20px; }
          .lp-form-head h2 { font-size: 22px; }
        }
      `}</style>
    </div>
  );
}
