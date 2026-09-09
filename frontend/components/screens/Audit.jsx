"use client";

import { useMemo, useState } from "react";
import Icon from "../Icon";
import { KPI, AvatarChip } from "../ui";
import { resolveSchool, downloadPdf } from "@/lib/export";

function toneFor(action = "") {
  const a = action.toLowerCase();
  if (a.includes("paid") || a.includes("receipt") || a.includes("board")) return "ok";
  if (a.includes("resolved") || a.includes("converted")) return "ok";
  if (a.includes("absent") || a.includes("complaint")) return "bad";
  if (a.includes("progress") || a.includes("contacted") || a.includes("late")) return "warn";
  if (a.includes("created") || a.includes("enquiry") || a.includes("viewed")) return "info";
  return "accent";
}

const FIN_RE  = /paid|receipt|reminder|donation/i;
const PERM_RE = /role|user/i;

export default function ScreenAudit({ E, session }) {
  const [filter, setFilter] = useState("all");
  const school = useMemo(() => resolveSchool(E.SETTINGS), [E.SETTINGS]);
  const actor  = session?.name || null;

  // Live audit events from the DB only — newest first.
  const allEvents = (E.AUDIT || []).map((a) => ({
    t: a.when,
    who: a.who,
    action: a.action,
    entity: a.entity,
    meta: a.entity,
    ip: a.ip || "",
    tone: toneFor(a.action),
  }));

  const events = useMemo(() => {
    if (filter === "financial")   return allEvents.filter((e) => FIN_RE.test(e.action || ""));
    if (filter === "permissions") return allEvents.filter((e) => PERM_RE.test(e.action || ""));
    return allEvents;
  }, [allEvents, filter]);

  function exportPdf() {
    const filterLabel = ({
      all: "All events",
      financial: "Financial",
      permissions: "Permissions",
    })[filter] || "All events";
    downloadPdf({
      title: `Audit Log · ${filterLabel}`,
      subtitle: `${events.length} event${events.length === 1 ? "" : "s"} captured`,
      school, actor,
      dateRange: filterLabel,
      orientation: "landscape",
      summary: [
        { label: "Events shown", value: events.length },
        { label: "Distinct users", value: new Set(events.map((e) => e.who).filter(Boolean)).size },
        { label: "Filter", value: filterLabel },
      ],
      columns: [
        { key: "i",      label: "#",      align: "right",  width: "32px" },
        { key: "t",      label: "Time",   align: "right",  width: "150px" },
        { key: "who",    label: "Who",    width: "150px" },
        { key: "action", label: "Action" },
        { key: "entity", label: "Entity" },
        { key: "ip",     label: "IP",     align: "right", width: "110px" },
      ],
      rows: events.map((e, i) => ({
        i: i + 1,
        t: e.t || "—", who: e.who || "—",
        action: e.action || "—", entity: e.entity || "—",
        ip: e.ip || "—",
      })),
      filename: `${school.name.replace(/\s+/g, "-").toLowerCase()}-audit-${filter}-${new Date().toISOString().slice(0, 10)}`,
    });
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Governance</div>
          <div className="page-title">Audit <span className="amber">log</span></div>
          <div className="page-sub">Every sensitive action is captured — financial writes, permission changes, and parent-facing messages.</div>
        </div>
        <div className="page-actions">
          <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All events</option>
            <option value="financial">Financial</option>
            <option value="permissions">Permissions</option>
          </select>
          <button className="btn" onClick={exportPdf} disabled={events.length === 0} title={events.length === 0 ? "No events to export" : `Open a printable, branded PDF report (${events.length} events)`}><Icon name="download" size={13} />Export PDF</button>
        </div>
      </div>

      <div className="grid g-4" style={{ marginBottom: 18 }}>
        {(() => {
          const fin  = allEvents.filter((e) => FIN_RE.test(e.action || ""));
          const perm = allEvents.filter((e) => PERM_RE.test(e.action || ""));
          const itemFor = (e, tone) => ({
            label: e.action || "—",
            value: e.t || "",
            sub: `${e.who || "—"}${e.entity ? ` · ${e.entity}` : ""}`,
            tone,
          });
          return (
            <>
              <KPI
                label="Events · total" value={allEvents.length} sub="all-time"
                puck="mint" puckIcon="audit"
                details={{
                  title: `Audit events · ${allEvents.length}`,
                  sub: "Most recent first",
                  items: allEvents.slice(0, 12).map((e) => itemFor(e, "")),
                }}
              />
              <KPI
                label="Financial writes" value={fin.length} sub="fee/donation actions"
                puck="peach" puckIcon="money"
                details={{
                  title: `Financial writes · ${fin.length}`,
                  sub: "Fee, receipt, reminder, donation actions",
                  items: fin.slice(0, 12).map((e) => itemFor(e, "ok")),
                }}
              />
              <KPI
                label="Permission changes" value={perm.length} sub="user/role updates"
                puck="cream" puckIcon="shield"
                details={{
                  title: `Permission changes · ${perm.length}`,
                  sub: "User and role-related actions",
                  items: perm.slice(0, 12).map((e) => itemFor(e, "warn")),
                }}
              />
              <KPI
                label="Failed attempts" value={0} sub="locked after 5"
                puck="rose" puckIcon="warning"
                details={{
                  title: "Failed sign-in attempts",
                  sub: "Tracking will appear here once authentication failures are surfaced to the audit log.",
                  items: [],
                }}
              />
            </>
          );
        })()}
      </div>

      <div className="card">
        <div className="card-head">
          <div><div className="card-title">Recent activity</div><div className="card-sub">Last 24h · chronological</div></div>
          <div className="card-actions">
            <span className="chip teal"><span className="pulse-dot" />Streaming</span>
          </div>
        </div>
        <div>
          {events.length === 0 && (
            <div className="empty">No events yet. Actions across the app will appear here as you work.</div>
          )}
          {events.map((e, i) => (
            <div key={i} className="lrow">
              <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)", width: 54, flexShrink: 0 }}>{e.t}</div>
              <AvatarChip initials={e.who === "System" ? "SY" : e.who === "Parent Portal" ? "PP" : e.who.split(" ").map((n) => n[0]).join("")} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13 }}>{e.action}</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{e.who} · {e.meta}</div>
              </div>
              <span className={`chip ${e.tone}`}><span className="dot" />{e.tone}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

