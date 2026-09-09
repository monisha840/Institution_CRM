"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import { formatClassLabel } from "@/lib/format";

// SCALE quick access — always-visible shortcuts to the SCALE session and SCALE
// report screens, plus (when there's history) chips for the students whose
// reports this user opened most recently. Recent history is written by
// ScaleReport.jsx into localStorage (`scaleRecent:<uid>`), per user.
//
// Only teachers and admins use SCALE, so the whole card is gated to them.
export default function QuickAccessRecent({ role, session, onOpenItem }) {
  const enabled = role === "teacher" || role === "admin";
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    if (!enabled) return;
    try {
      const uid = session?.sub || session?.id || "anon";
      const arr = JSON.parse(localStorage.getItem(`scaleRecent:${uid}`) || "[]");
      setRecent(Array.isArray(arr) ? arr.filter(Boolean).slice(0, 6) : []);
    } catch { setRecent([]); }
  }, [enabled, session]);

  if (!enabled) return null;

  const go = (screen) => onOpenItem?.({ screen });

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-head">
        <div>
          <div className="card-title">SCALE · Quick access</div>
          <div className="card-sub">Open a SCALE session or report without navigating the menu.</div>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => go("scale")}>
            <Icon name="academic" size={13} />SCALE session
          </button>
          <button type="button" className="btn accent" onClick={() => go("scale_report")}>
            <Icon name="reports" size={13} />SCALE reports
          </button>
        </div>
      </div>

      {recent.length > 0 && (
        <div style={{ padding: "12px 14px 14px", borderTop: "1px solid var(--line, #eee)" }}>
          <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.6, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
            Recently viewed
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {recent.map((r) => (
              <button
                key={r.id}
                type="button"
                className="btn"
                title={`Open ${r.name}'s SCALE report`}
                onClick={() => onOpenItem?.({ screen: "scale_report", type: "scale", id: r.id, title: r.name, cls: r.cls })}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <span style={{ width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg, var(--accent), var(--accent-2))", color: "#fff", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 600 }}>
                  {(r.name || "?").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                </span>
                <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.15 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500 }}>{r.name}</span>
                  {r.cls ? <span style={{ fontSize: 10, opacity: 0.65 }}>{formatClassLabel(r.cls)}</span> : null}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
