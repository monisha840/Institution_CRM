"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import { money, feeTypeLabel, formatClassLabel } from "@/lib/format";

// "Fees collected today" — the students who paid today, with amount, fee type,
// method and time, plus the day's total. Driven by paid receipts (recent_fees)
// using each receipt's payment timestamp. Shown to staff, not parents.
export default function TodayFeesCard({ E, setCurrent, role }) {
  if (role === "parent") return null;

  const [today, setToday] = useState("");
  useEffect(() => { setToday(new Date().toISOString().slice(0, 10)); }, []);

  const list = (E.RECENT_FEES || [])
    .filter((f) => String(f.paidAt || f.paid_at || "").slice(0, 10) === today)
    .sort((a, b) => String(b.paidAt || b.paid_at || "").localeCompare(String(a.paidAt || a.paid_at || "")));
  const total = list.reduce((a, f) => a + (Number(f.amount) || 0), 0);
  const timeOf = (f) => {
    const iso = f.paidAt || f.paid_at;
    if (!iso) return "";
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  };

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-head">
        <div>
          <div className="card-title">Fees collected today</div>
          <div className="card-sub">{list.length} payment{list.length === 1 ? "" : "s"} · {money(total)}</div>
        </div>
        {setCurrent && (
          <button className="btn sm" onClick={() => setCurrent("fees")} title="Open Fees & UPI">
            <Icon name="fees" size={12} />Open Fees &amp; UPI
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <div className="empty" style={{ padding: 20 }}>No fees collected yet today.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Class</th>
                <th>Fee type</th>
                <th>Method</th>
                <th className="num">Amount</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 20).map((f, i) => (
                <tr key={f.id || i}>
                  <td style={{ fontSize: 12.5, fontWeight: 500 }}>{f.name || "—"}</td>
                  <td>{f.cls ? <span className="chip">{formatClassLabel(f.cls)}</span> : "—"}</td>
                  <td><span className="chip" style={{ background: "var(--accent-soft)", color: "var(--accent-2)" }}>{feeTypeLabel(f.feeType)}</span></td>
                  <td style={{ fontSize: 12, color: "var(--ink-3)" }}>{f.method || "—"}</td>
                  <td className="num" style={{ fontWeight: 600, color: "var(--ok)" }}>{money(f.amount || 0)}</td>
                  <td style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{timeOf(f)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length > 20 && (
            <div style={{ padding: "8px 14px", fontSize: 11.5, color: "var(--ink-4)" }}>+{list.length - 20} more · open Fees &amp; UPI for the full list</div>
          )}
        </div>
      )}
    </div>
  );
}
