"use client";

import Icon from "../Icon";
import { KPI } from "../ui";
import { money, moneyK, formatClassLabel } from "@/lib/format";
import { openPrintWindow } from "./Reports";
import QuickAccessRecent from "../QuickAccessRecent";
import AttendanceTodayCard from "../AttendanceTodayCard";
import TodayFeesCard from "../TodayFeesCard";

export default function ScreenTrust({ E, setCurrent, role, session, onOpenItem }) {
  const isTrustOnly = role === "trust_accountant";
  // Defaults on every destructured array — when the trust accountant
  // role (or any role without the Schools feature) lands here, json
  // doesn't include SCHOOLS / COMPLIANCE and accessing `.length`
  // would crash the whole render. Defaulting to [] keeps the page
  // alive and the headline simply reads "0 schools".
  const { SCHOOLS = [], COMPLIANCE = [],
          DONORS = [], DONOR_RECEIPTS = [], CAMPAIGNS = [], EXPENSES = [] } = E;

  // Builds a trust-focused PDF: KPIs, donations roll-up, top donors,
  // active campaigns, and trust-scope expenses. Uses the same printable HTML
  // helper as the Reports screen.
  function downloadBoardPack() {
    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
    const rcptTotal = DONOR_RECEIPTS.reduce((a, r) => a + (r.amount || 0), 0);
    const trustExp  = EXPENSES.filter((e) => e.scope === "trust");
    const trustExpTotal = trustExp.reduce((a, e) => a + (e.amount || 0), 0);
    const byType = (() => {
      const m = new Map();
      for (const d of DONORS) {
        if (!m.has(d.type)) m.set(d.type, { type: d.type, donors: 0, ytd: 0 });
        const e = m.get(d.type);
        e.donors += 1;
        e.ytd += d.ytd || 0;
      }
      return [...m.values()].sort((a, b) => b.ytd - a.ytd);
    })();
    const topDonors = [...DONORS].sort((a, b) => (b.ytd || 0) - (a.ytd || 0)).slice(0, 10);
    const activeCampaigns = CAMPAIGNS.filter((c) => c.status !== "completed");

    let body = "";

    // Headline strip
    body += `<div class="sum-row"><div class="sum-title">Trust headline</div><div class="sum-cells">
      <div class="sum-cell"><div class="sum-lbl">Schools</div><div class="sum-val">${SCHOOLS.length}</div></div>
      <div class="sum-cell"><div class="sum-lbl">Donors on file</div><div class="sum-val">${DONORS.length}</div></div>
      <div class="sum-cell"><div class="sum-lbl">Raised YTD</div><div class="sum-val">${money(rcptTotal)}</div></div>
      <div class="sum-cell"><div class="sum-lbl">Trust expenses YTD</div><div class="sum-val">${money(trustExpTotal)}</div></div>
      <div class="sum-cell"><div class="sum-lbl">Net trust position</div><div class="sum-val">${money(rcptTotal - trustExpTotal)}</div></div>
    </div></div>`;

    body += `<h3 style="margin-top:24px">Donations by type</h3>`;
    body += renderTbl(
      ["Type", "Donors", "YTD raised", "Share %"],
      byType.length === 0 ? [] : byType.map((r) => {
        const pct = rcptTotal > 0 ? Math.round((r.ytd / rcptTotal) * 100) : 0;
        return [r.type, r.donors, money(r.ytd), `${pct}%`];
      }),
      ["", "num", "num", "num"],
    );

    body += `<h3 style="margin-top:24px">Top 10 donors · YTD</h3>`;
    body += renderTbl(
      ["#", "Donor", "Type", "Last gift", "YTD"],
      topDonors.map((d, i) => [i + 1, d.name, d.type, d.last || "—", money(d.ytd || 0)]),
      ["num", "", "", "", "num"],
    );

    body += `<h3 style="margin-top:24px">Active campaigns</h3>`;
    body += renderTbl(
      ["Campaign", "Goal", "Raised", "Coverage", "Window"],
      activeCampaigns.map((c) => {
        const pct = c.goal > 0 ? Math.round((c.raised / c.goal) * 100) : 0;
        const win = (c.starts || c.ends) ? `${c.starts || "—"} → ${c.ends || "—"}` : "—";
        return [c.name, money(c.goal), money(c.raised), `${pct}%`, win];
      }),
      ["", "num", "num", "num", ""],
    );

    body += `<h3 style="margin-top:24px">Trust-scope expenses</h3>`;
    body += renderTbl(
      ["Date", "Category", "Vendor", "Amount", "Memo"],
      [...trustExp].sort((a, b) => (b.date || "").localeCompare(a.date || ""))
                   .slice(0, 25)
                   .map((e) => [e.date, e.category, e.vendor || "—", money(e.amount), e.memo || "—"]),
      ["", "", "", "num", ""],
    );

    if (Array.isArray(COMPLIANCE) && COMPLIANCE.length > 0) {
      body += `<h3 style="margin-top:24px">Compliance status</h3>`;
      body += renderTbl(
        ["Item", "Status"],
        COMPLIANCE.map((c) => [c.name || c.item || "—", c.status || "—"]),
      );
    }

    openPrintWindow("Trust Board Pack", today, body);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            {isTrustOnly
              ? `Trust overview · ${DONORS.length} donor${DONORS.length === 1 ? "" : "s"} on file`
              : `School overview · ${SCHOOLS.length} school${SCHOOLS.length === 1 ? "" : "s"}`}
          </div>
          <div className="page-title">
            {isTrustOnly ? <>Trust <span className="amber">overview</span></>
                         : <>School <span className="amber">overview</span></>}
          </div>
          <div className="page-sub">
            {isTrustOnly
              ? "Trust ledger roll-up — donors, donations, trust expenses."
              : "Roll-up view across the school."}
          </div>
        </div>
        <div className="page-actions">
          <div className="segmented">
            {["This week", "This term", "YTD"].map((r, i) => (
              <button key={r} className={i === 0 ? "active" : ""}>
                {r}
              </button>
            ))}
          </div>
          <button className="btn accent" onClick={downloadBoardPack}>
            <Icon name="download" size={13} />
            Board pack PDF
          </button>
        </div>
      </div>

      <QuickAccessRecent role={role} session={session} onOpenItem={onOpenItem} />

      {!isTrustOnly && <AttendanceTodayCard E={E} role={role} setCurrent={setCurrent} />}

      {!isTrustOnly && <TodayFeesCard E={E} role={role} setCurrent={setCurrent} />}

      {isTrustOnly && (() => {
        // Trust Accountant overview — strictly trust ledger numbers. No
        // students / fees / transport.
        const donorReceipts = DONOR_RECEIPTS || [];
        const donations = donorReceipts.reduce((a, r) => a + (r.amount || 0), 0);
        const trustExp  = (EXPENSES || []).filter((e) => e.scope === "trust");
        const trustExpTotal = trustExp.reduce((a, e) => a + (e.amount || 0), 0);
        const activeCampaigns = (CAMPAIGNS || []).filter((c) => c.status !== "completed");
        const net = donations - trustExpTotal;
        const topDonors = [...DONORS].sort((a, b) => (b.ytd || 0) - (a.ytd || 0)).slice(0, 8);
        return (
          <div className="grid g-4" style={{ marginBottom: 20 }}>
            <KPI
              label="Donors on file" value={DONORS.length}
              sub={`${(activeCampaigns || []).length} active campaign${activeCampaigns.length === 1 ? "" : "s"}`}
              puck="cream" puckIcon="donors"
              details={{
                title: `Donors · ${DONORS.length} on file`,
                sub: "Top donors · YTD",
                items: topDonors.map((d) => ({
                  label: d.name, value: money(d.ytd || 0),
                  sub: `${d.type || "—"}${d.last ? ` · last ${d.last}` : ""}`,
                  tone: "ok",
                })),
              }}
            />
            <KPI
              label="Donations YTD" value={moneyK(donations)}
              sub={`${donorReceipts.length} receipt${donorReceipts.length === 1 ? "" : "s"}`}
              puck="mint" puckIcon="donors"
              details={{
                title: `Donations YTD · ${money(donations)}`,
                sub: "Newest receipts first",
                items: donorReceipts.slice(0, 8).map((r) => ({
                  label: r.donorName || r.donor || "Anonymous",
                  value: money(r.amount || 0),
                  sub: `${r.method || "—"} · ${r.issuedAtLabel || ""}`,
                  tone: "ok",
                })),
              }}
            />
            <KPI
              label="Trust expenses YTD" value={moneyK(trustExpTotal)}
              sub={`${trustExp.length} entr${trustExp.length === 1 ? "y" : "ies"}`}
              puck="peach" puckIcon="money"
              details={{
                title: `Trust expenses · ${money(trustExpTotal)}`,
                sub: "Most recent first",
                items: [...trustExp]
                  .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
                  .slice(0, 8)
                  .map((e) => ({
                    label: e.category || "—",
                    value: money(e.amount || 0),
                    sub: `${e.vendor || "—"} · ${e.date || ""}`,
                    tone: "bad",
                  })),
              }}
            />
            <KPI
              label="Net trust position" value={moneyK(net)}
              sub={net >= 0 ? "in surplus" : "in deficit"}
              puck={net >= 0 ? "sky" : "rose"} puckIcon="trending"
              details={{
                title: `Net · ${money(net)}`,
                sub: "Donations YTD minus trust expenses YTD",
                items: [
                  { label: "Donations", value: money(donations), tone: "ok",
                    sub: `${donorReceipts.length} receipt${donorReceipts.length === 1 ? "" : "s"}` },
                  { label: "Trust expenses", value: money(trustExpTotal), tone: "bad",
                    sub: `${trustExp.length} entr${trustExp.length === 1 ? "y" : "ies"}` },
                ],
              }}
            />
          </div>
        );
      })()}

      {!isTrustOnly && (() => {
        // Compute trust KPIs from actual school data — TRUST_KPIS in
        // STATIC_EMPTIES is a static placeholder that never gets updated,
        // which is why the dashboard was stuck on 0 / 0% / ₹0.
        const students = E.ADDED_STUDENTS || [];
        const studentCount = students.length;
        const studentsByClass = {};
        for (const s of students) studentsByClass[s.cls] = (studentsByClass[s.cls] || 0) + 1;

        const recentFees = E.RECENT_FEES || [];
        const pendingFees = E.PENDING_FEES || [];
        const collected = recentFees.reduce((a, f) => a + (f.amount || 0), 0);
        const pending   = pendingFees.reduce((a, f) => a + (f.amount || 0), 0);
        const billed    = collected + pending;
        const collectedPct = billed > 0 ? Math.round((collected / billed) * 100) : 0;

        const donorReceipts = E.DONOR_RECEIPTS || [];
        const donations = donorReceipts.reduce((a, r) => a + (r.amount || 0), 0);
        const donorsCount = (E.DONORS || []).length;

        // Transport — count routes (buses) and the stops they cover. Used
        // for the fourth KPI card on the school overview.
        const routes = E.ROUTES || [];
        const routeCount = routes.length;
        const stopsCount = routes.reduce((a, r) => a + ((r.stops || []).length), 0);
        const delayedCount = routes.filter((r) => r.status === "delayed").length;

        return (
          <div className="grid g-4" style={{ marginBottom: 20 }}>
            <KPI
              label="Students" value={studentCount} sub="on roll"
              puck="mint" puckIcon="students"
              details={{
                title: `Students · ${studentCount} on roll`,
                sub: "Breakdown by class-section",
                items: Object.entries(studentsByClass)
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([cls, n]) => ({ label: formatClassLabel(String(cls)), value: n, sub: `${n} student${n === 1 ? "" : "s"}` })),
              }}
            />
            <KPI
              label="Fee collection" value={`${collectedPct}%`}
              sub={billed > 0 ? `${moneyK(collected)} of ${moneyK(billed)} billed` : "no fees billed yet"}
              puck="peach" puckIcon="fees"
              details={{
                title: `Fee collection · ${collectedPct}%`,
                sub: `${moneyK(collected)} collected · ${moneyK(pending)} still outstanding`,
                items: [
                  { label: "Collected", value: money(collected), tone: "ok",
                    sub: `${recentFees.length} receipt${recentFees.length === 1 ? "" : "s"}` },
                  { label: "Outstanding", value: money(pending), tone: pending > 0 ? "bad" : "",
                    sub: `${pendingFees.length} pending row${pendingFees.length === 1 ? "" : "s"}` },
                  { label: "Total billed", value: money(billed),
                    sub: `${collectedPct}% covered` },
                ],
              }}
            />
            <KPI
              label="Donations YTD" value={moneyK(donations)}
              sub={`${donorReceipts.length} receipt${donorReceipts.length === 1 ? "" : "s"}`}
              puck="cream" puckIcon="donors"
              details={{
                title: `Donations YTD · ${money(donations)}`,
                sub: `${donorsCount} donor${donorsCount === 1 ? "" : "s"} on file · newest first`,
                items: donorReceipts.slice(0, 8).map((r) => ({
                  label: r.donorName || r.donor || "Anonymous",
                  value: money(r.amount || 0),
                  sub: `${r.method || "—"} · ${r.issuedAtLabel || ""}`,
                  tone: "ok",
                })),
              }}
            />
            <KPI
              label="Transport" value={routeCount}
              sub={routeCount > 0 ? `${stopsCount} stop${stopsCount === 1 ? "" : "s"} · ${delayedCount} delayed` : "no routes yet"}
              puck="sky" puckIcon="bus"
              details={{
                title: `Transport · ${routeCount} bus${routeCount === 1 ? "" : "es"}`,
                sub: routeCount > 0 ? `${stopsCount} stops covered` : "Add routes from the Transport screen",
                items: routes.map((r) => ({
                  label: `${r.code || r.name || "Route"}${r.driver ? ` · ${r.driver}` : ""}`,
                  value: `${(r.stops || []).length} stop${(r.stops || []).length === 1 ? "" : "s"}`,
                  sub: r.status === "delayed" ? "delayed" : "on time",
                  tone: r.status === "delayed" ? "bad" : "ok",
                })),
              }}
            />
          </div>
        );
      })()}

      {!isTrustOnly && (() => {
        // "Things needing attention" — single roll-up card so the principal
        // sees what to act on first thing in the morning. Each row links
        // out to the relevant screen by virtue of being self-explanatory;
        // routing isn't wired (sidebar is one click away). Rows with nothing
        // pending render as a green "all clear" line; the whole card is
        // hidden if every row is clear.
        const pendingFees = E.PENDING_FEES || [];
        const overdueFees = pendingFees.filter((f) => f.overdue);
        const complaintsOpen = (E.COMPLAINTS || []).filter((c) => c.status === "Open");
        const tcWaiting = (E.TC_REQUESTS || []).filter((t) => t.status === "requested");
        const lowAttStudents = (E.ADDED_STUDENTS || []).filter((s) => (Number(s.attendance) || 0) < 75);
        const enquiriesNew = (E.ENQUIRIES || []).filter((e) => e.status === "New");
        const donorPending = (E.DONOR_FORM_SUBMISSIONS || []).filter((s) => s.status === "pending");
        const leavePending = (E.LEAVE_REQUESTS || []).filter((r) => r.approvalStatus === "pending");
        const govDocs = E.GOVERNMENT_DOCUMENTS || [];
        const _now = new Date();
        const govExpiring = govDocs.filter((d) => {
          if (!d.expiryDate) return false;
          const exp = new Date(`${d.expiryDate}T00:00:00`);
          if (Number.isNaN(exp.getTime())) return false;
          const days = Math.round((exp - _now) / 86_400_000);
          return days <= 30;
        });

        const items = [
          pendingFees.length > 0 && {
            icon: "fees", tone: overdueFees.length ? "bad" : "warn",
            title: "Pending fees",
            count: pendingFees.length,
            sub: `₹${pendingFees.reduce((a, f) => a + (f.amount || 0), 0).toLocaleString("en-IN")} outstanding${overdueFees.length ? ` · ${overdueFees.length} overdue` : ""}`,
            screen: "Fees & UPI", screenId: "fees",
          },
          complaintsOpen.length > 0 && {
            icon: "complaint", tone: "bad",
            title: "Open complaints",
            count: complaintsOpen.length,
            sub: `${complaintsOpen.length} ticket${complaintsOpen.length === 1 ? "" : "s"} awaiting first response`,
            screen: "Complaints", screenId: "complaints",
          },
          tcWaiting.length > 0 && {
            icon: "reports", tone: "warn",
            title: "Transfer certificate requests",
            count: tcWaiting.length,
            sub: `${tcWaiting.length} awaiting principal approval`,
            screen: "Transfer certificates", screenId: "tc",
          },
          lowAttStudents.length > 0 && {
            icon: "warning", tone: "warn",
            title: "Low-attendance students",
            count: lowAttStudents.length,
            sub: `Below 75% — ${lowAttStudents.slice(0, 3).map((s) => s.name).join(", ")}${lowAttStudents.length > 3 ? `, +${lowAttStudents.length - 3} more` : ""}`,
            screen: "Students", screenId: "students",
          },
          enquiriesNew.length > 0 && {
            icon: "enquiry", tone: "info",
            title: "New admission enquiries",
            count: enquiriesNew.length,
            sub: `${enquiriesNew.length} prospect${enquiriesNew.length === 1 ? "" : "s"} need a first call`,
            screen: "Admissions", screenId: "enquiries",
          },
          donorPending.length > 0 && {
            icon: "donors", tone: "info",
            title: "Donor form submissions",
            count: donorPending.length,
            sub: `${donorPending.length} pending review · ${donorPending.slice(0, 3).map((s) => s.donorName).join(", ")}${donorPending.length > 3 ? `, +${donorPending.length - 3} more` : ""}`,
            screen: "Donors", screenId: "donors",
          },
          leavePending.length > 0 && {
            icon: "calendar", tone: "warn",
            title: "Leave requests",
            count: leavePending.length,
            sub: `${leavePending.length} awaiting approval${leavePending.some((r) => r.requesterType === "teacher") ? " · includes staff" : ""}`,
            screen: "Leave requests", screenId: "leave",
          },
          govExpiring.length > 0 && {
            icon: "warning",
            tone: govExpiring.some((d) => new Date(`${d.expiryDate}T00:00:00`) < _now) ? "bad" : "warn",
            title: "Government documents expiring",
            count: govExpiring.length,
            sub: `${govExpiring.length} due within 30d · ${govExpiring.slice(0, 3).map((d) => d.title).join(", ")}${govExpiring.length > 3 ? `, +${govExpiring.length - 3} more` : ""}`,
            screen: "Government documents", screenId: "government_documents",
          },
        ].filter(Boolean);

        return (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-head">
              <div>
                <div className="card-title">Things needing attention</div>
                <div className="card-sub">
                  {items.length === 0
                    ? "Nothing on the to-do list right now"
                    : `${items.length} area${items.length === 1 ? "" : "s"} to look at`}
                </div>
              </div>
              {items.length > 0 && (
                <span className="chip warn">
                  <span className="dot" />
                  {items.reduce((a, it) => a + (it.count || 0), 0)} item{items.reduce((a, it) => a + (it.count || 0), 0) === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {items.length === 0 ? (
              <div className="empty" style={{ padding: 36, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <Icon name="check" size={22} style={{ color: "var(--ok)" }} />
                <div>All clear · no pending items.</div>
                <div style={{ fontSize: 11, color: "var(--ink-4)" }}>
                  Fees, complaints, TC requests and admissions are all up to date.
                </div>
              </div>
            ) : (
              <div>
                {items.map((it, i) => {
                  const canNav = typeof setCurrent === "function" && it.screenId;
                  return (
                    <div
                      key={i}
                      className="lrow attn-row"
                      role={canNav ? "button" : undefined}
                      tabIndex={canNav ? 0 : undefined}
                      onClick={canNav ? () => setCurrent(it.screenId) : undefined}
                      onKeyDown={canNav ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setCurrent(it.screenId);
                        }
                      } : undefined}
                      style={canNav ? { cursor: "pointer" } : undefined}
                      title={canNav ? `Open ${it.screen}` : undefined}
                    >
                      <div className={`act-ico ${it.tone}`}>
                        <Icon name={it.icon} size={14} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{it.title}</span>
                          <span className={`chip ${it.tone}`} style={{ fontSize: 10.5 }}>
                            <span className="dot" />{it.count}
                          </span>
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                          {it.sub}
                        </div>
                      </div>
                      <div className="attn-cta" style={{
                        fontSize: 11,
                        color: canNav ? "var(--accent, #1f3f8b)" : "var(--ink-4)",
                        whiteSpace: "nowrap",
                        fontWeight: canNav ? 600 : 400,
                      }}>
                        Open {it.screen} →
                      </div>
                    </div>
                  );
                })}
                <style jsx>{`
                  .attn-row {
                    transition: background 0.15s ease;
                    border-radius: 8px;
                  }
                  .attn-row[role="button"]:hover {
                    background: var(--bg-2, #f7f5ee);
                  }
                  .attn-row[role="button"]:hover .attn-cta {
                    text-decoration: underline;
                  }
                  .attn-row[role="button"]:focus-visible {
                    outline: 2px solid var(--accent, #1f3f8b);
                    outline-offset: 2px;
                  }
                `}</style>
              </div>
            )}
          </div>
        );
      })()}

    </div>
  );
}

// Tiny self-contained HTML table builder used only by the Board pack PDF.
function renderTbl(headers, rows, aligns = []) {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const thead = headers.map((h, i) => `<th style="text-align:${aligns[i] === "num" ? "right" : "left"}">${esc(h)}</th>`).join("");
  const tbody = rows.length === 0
    ? `<tr><td colspan="${headers.length}" style="text-align:center;color:#888;padding:18px">No data on file.</td></tr>`
    : rows.map((row) => {
        const cells = row.map((v, i) => {
          const align = aligns[i] === "num" ? "right" : "left";
          return `<td style="text-align:${align}">${esc(v)}</td>`;
        }).join("");
        return `<tr>${cells}</tr>`;
      }).join("");
  return `<table class="rpt"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;
}
