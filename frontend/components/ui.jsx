"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "./Icon";

/* ==========================================================================
   Sirah CRM · shared UI kit
   --------------------------------------------------------------------------
   Presentation only. Nothing here fetches, mutates or validates — screens
   keep owning their data and their business rules; these components decide
   how that data looks.
   ========================================================================== */

/* --------------------------------------------------------------------------
   Layout primitives
   -------------------------------------------------------------------------- */

// Standard page header. `eyebrow` carries the date/context line, `title` the
// screen name, `sub` the one-line explanation, `actions` the buttons.
export const PageHeader = ({ eyebrow, title, sub, actions, children }) => (
  <div className="page-head">
    <div style={{ minWidth: 0 }}>
      {eyebrow ? <div className="page-eyebrow">{eyebrow}</div> : null}
      <div className="page-title">{title}</div>
      {sub ? <div className="page-sub">{sub}</div> : null}
      {children}
    </div>
    {actions ? <div className="page-actions">{actions}</div> : null}
  </div>
);

export const SectionHeader = ({ title, sub, actions }) => (
  <div className="section-head">
    <span className="st">{title}</span>
    {sub ? <span className="ss">{sub}</span> : null}
    {actions ? <span className="sa">{actions}</span> : null}
  </div>
);

// Card with a title row and an optional action cluster. Body is whatever
// the caller passes; `bodyPad={false}` for tables that go edge to edge.
export const ChartCard = ({ title, sub, actions, children, bodyPad = true, className = "", style }) => (
  <div className={`card ${className}`} style={style}>
    {(title || actions) && (
      <div className="card-head">
        <div style={{ minWidth: 0 }}>
          {title ? <div className="card-title">{title}</div> : null}
          {sub ? <div className="card-sub">{sub}</div> : null}
        </div>
        {actions ? <div className="card-actions">{actions}</div> : null}
      </div>
    )}
    {bodyPad ? <div className="card-body">{children}</div> : children}
  </div>
);

/* --------------------------------------------------------------------------
   KPI card — unchanged API, restyled surface.
   Pass `details` to make it clickable: clicking opens a popup with
   `details.title`, `details.sub`, and either `details.items`
   ([{ label, value, sub?, tone?, children? }]) or `details.body`.
   -------------------------------------------------------------------------- */
export const KPI = ({ label, value, unit, delta, deltaDir, sub, sparkData, puck, puckIcon, details, progress, progressTone }) => {
  const arrow = deltaDir === "up" ? "arrowUp" : deltaDir === "down" ? "arrowDown" : null;
  const [open, setOpen] = useState(false);
  const clickable = !!details;
  return (
    <>
      <div
        className={`kpi ${clickable ? "kpi-clickable" : ""}`}
        onClick={clickable ? () => setOpen(true) : undefined}
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        aria-label={clickable ? `${label}: ${value}. Open breakdown` : undefined}
        onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } } : undefined}
      >
        <div className="kpi-top">
          <div className="lbl">{label}</div>
          {puck && (
            <div className={`kpi-puck ${puck}`} aria-hidden="true">
              <Icon name={puckIcon || "spark"} size={15} />
            </div>
          )}
        </div>
        <div className="val-row">
          {/* An em-dash means "no reading yet" — render it muted so it never
              reads as a real figure. */}
          <div className="val" style={value === "—" ? { color: "var(--ink-4)" } : undefined}>
            {value}
            {unit ? <span className="unit">{unit}</span> : null}
          </div>
          {delta && (
            <span className={`delta ${deltaDir || ""}`}>
              {arrow && <Icon name={arrow} size={10} stroke={2.4} />}
              {delta}
            </span>
          )}
        </div>
        {/* Completion bar — for a share-of-total (fees collected, syllabus
            covered). Deliberately separate from `delta`, which means a
            change over time and must never be used for a ratio. */}
        {typeof progress === "number" && (
          <div className="bar" style={{ marginTop: 10 }}>
            <span
              style={{
                width: `${Math.max(0, Math.min(100, progress))}%`,
                background: progressTone === "ok" ? "var(--ok)" : progressTone === "warn" ? "var(--warn)" : "var(--accent)",
              }}
            />
          </div>
        )}
        <div className="meta">{sub && <span>{sub}</span>}</div>
        {sparkData && sparkData.length > 1 && <Sparkline data={sparkData} w={72} h={22} className="spark" />}
      </div>
      {open && clickable && (
        <KpiDetailsModal
          title={details.title || label}
          sub={details.sub}
          items={details.items}
          body={details.body}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};

// Single row inside a KPI details popup. If `item.children` is a non-empty
// array the row becomes expandable, rendering each child indented one level.
function KpiItem({ item, depth = 0 }) {
  const it = item;
  const hasChildren = Array.isArray(it.children) && it.children.length > 0;
  const [open, setOpen] = useState(false);
  const toneColor = it.tone === "ok"
    ? "var(--ok)"
    : it.tone === "bad"
      ? "var(--bad)"
      : it.tone === "warn"
        ? "var(--warn)"
        : "var(--ink)";
  return (
    <>
      <div
        onClick={hasChildren ? () => setOpen((v) => !v) : undefined}
        role={hasChildren ? "button" : undefined}
        tabIndex={hasChildren ? 0 : undefined}
        onKeyDown={hasChildren ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); } } : undefined}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "9px 11px",
          background: depth > 0 ? "var(--card)" : "var(--card-2)",
          border: "1px solid var(--rule-2)", borderRadius: "var(--radius-sm)",
          cursor: hasChildren ? "pointer" : "default",
          marginLeft: depth * 14,
        }}
      >
        {hasChildren && <Icon name={open ? "chevronDown" : "chevronRight"} size={12} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{it.label}</div>
          {it.sub && <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 1 }}>{it.sub}</div>}
        </div>
        {it.value != null && (
          <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: toneColor }}>
            {it.value}
          </span>
        )}
      </div>
      {hasChildren && open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {it.children.map((child, i) => <KpiItem key={i} item={child} depth={depth + 1} />)}
        </div>
      )}
    </>
  );
}

function KpiDetailsModal({ title, sub, items, body, onClose }) {
  return (
    <Modal title={title} sub={sub} onClose={onClose} width={480}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {body}
        {Array.isArray(items) && items.length === 0 && (
          <EmptyState
            icon="spark"
            title="Nothing to break down yet"
            body="This metric has no underlying records for the current period."
          />
        )}
        {Array.isArray(items) && items.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((it, i) => <KpiItem key={i} item={it} />)}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------------------
   Metric strip — the executive KPI row. One surface, hairline separators,
   no eight-card confetti.  items: [{ label, value, sub, delta, deltaDir,
   onClick }]
   -------------------------------------------------------------------------- */
export const MetricStrip = ({ items = [], className = "", style }) => {
  if (!items.length) return null;
  return (
    <div className={`mstrip ${className}`} style={style}>
      {items.map((m, i) => {
        const clickable = typeof m.onClick === "function";
        const arrow = m.deltaDir === "up" ? "arrowUp" : m.deltaDir === "down" ? "arrowDown" : null;
        return (
          <div
            key={m.key || m.label || i}
            className={`mstrip-item ${clickable ? "clickable" : ""}`}
            onClick={m.onClick}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); m.onClick(); } } : undefined}
          >
            <div className="mstrip-val">
              {m.value}
              {m.delta ? (
                <span className={`delta ${m.deltaDir || ""}`}>
                  {arrow && <Icon name={arrow} size={10} stroke={2.4} />}
                  {m.delta}
                </span>
              ) : null}
            </div>
            <div className="mstrip-lbl">{m.label}</div>
            {m.sub ? <div className="mstrip-sub">{m.sub}</div> : null}
          </div>
        );
      })}
    </div>
  );
};

/* --------------------------------------------------------------------------
   Empty / error states — always say what is missing, why it matters and
   what to do next.
   -------------------------------------------------------------------------- */
export const EmptyState = ({ icon = "spark", title, body, action, secondary, tone }) => (
  <div className={`empty-state ${tone === "error" ? "error" : ""}`}>
    <span className="empty-mark" aria-hidden="true">
      <Icon name={icon} size={20} />
    </span>
    <div className="empty-title">{title}</div>
    {body ? <div className="empty-body">{body}</div> : null}
    {(action || secondary) && (
      <div className="empty-actions">
        {action}
        {secondary}
      </div>
    )}
  </div>
);

// Presentation for a failure that already happened. The caller keeps its own
// error handling; this only decides how the failure reads.
export const ErrorState = ({ title = "Something went wrong", body = "We couldn't load this information.", onRetry, detail }) => (
  <EmptyState
    tone="error"
    icon="warning"
    title={title}
    body={body}
    action={onRetry ? <button className="btn sm" onClick={onRetry}><Icon name="refresh" size={12} />Try again</button> : null}
    secondary={detail ? <span className="field-hint" style={{ maxWidth: "42ch" }}>{detail}</span> : null}
  />
);

/* --------------------------------------------------------------------------
   Skeletons — shaped like the thing that is loading.
   -------------------------------------------------------------------------- */
export const Skeleton = ({ w = "100%", h = 11, r, className = "", style }) => (
  <div className={`sk ${className}`} style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />
);

export const SkeletonTable = ({ rows = 6, cols = 5 }) => (
  <div style={{ padding: "4px 0" }} aria-busy="true" aria-label="Loading table">
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} style={{ display: "flex", gap: 16, padding: "12px 16px", borderBottom: "1px solid var(--rule-2)" }}>
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} w={c === 0 ? "26%" : `${Math.round(60 / (cols - 1))}%`} h={c === 0 ? 13 : 11} />
        ))}
      </div>
    ))}
  </div>
);

export const SkeletonCards = ({ count = 4, height = 96 }) => (
  <div className="grid g-4" aria-busy="true" aria-label="Loading metrics">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="card" style={{ padding: 18, height }}>
        <Skeleton w="52%" h={10} />
        <Skeleton w="38%" h={24} style={{ marginTop: 14 }} />
        <Skeleton w="64%" h={9} style={{ marginTop: 12 }} />
      </div>
    ))}
  </div>
);

export const SkeletonChart = ({ h = 220 }) => (
  <div style={{ height: h, display: "flex", alignItems: "flex-end", gap: 10, padding: "16px 4px" }} aria-busy="true" aria-label="Loading chart">
    {[42, 68, 55, 80, 62, 92, 74, 58, 86, 70, 95, 66].map((p, i) => (
      <Skeleton key={i} w="100%" h={`${p}%`} r="var(--radius-xs)" />
    ))}
  </div>
);

/* --------------------------------------------------------------------------
   Overlays — modal, drawer, confirm. All trap Escape, restore scroll and
   close on backdrop click.
   -------------------------------------------------------------------------- */
function useOverlay(onClose) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose?.(); } };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
}

export const Modal = ({ title, sub, onClose, children, footer, width = 560, icon, tone }) => {
  useOverlay(onClose);
  return (
    <>
      <div className="overlay-backdrop" onClick={onClose} />
      <div className="modal-shell" onClick={onClose} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
        <div className="modal-panel" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
          {(title || onClose) && (
            <div className="modal-head">
              {icon && (
                <span
                  aria-hidden="true"
                  style={{
                    width: 32, height: 32, borderRadius: "var(--radius-sm)",
                    display: "grid", placeItems: "center", flexShrink: 0,
                    background: tone === "danger" ? "var(--bad-soft)" : "var(--accent-soft)",
                    color: tone === "danger" ? "var(--bad)" : "var(--accent)",
                  }}
                >
                  <Icon name={icon} size={15} />
                </span>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                {title ? <div className="modal-title">{title}</div> : null}
                {sub ? <div className="modal-sub">{sub}</div> : null}
              </div>
              <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={14} /></button>
            </div>
          )}
          <div className="modal-body">{children}</div>
          {footer ? <div className="modal-foot">{footer}</div> : null}
        </div>
      </div>
    </>
  );
};

export const Drawer = ({ title, sub, onClose, children, footer, wide = false, icon }) => {
  useOverlay(onClose);
  return (
    <>
      <div className="overlay-backdrop" onClick={onClose} />
      <aside className={`drawer-panel ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
        <div className="drawer-head">
          {icon && (
            <span
              aria-hidden="true"
              style={{
                width: 30, height: 30, borderRadius: "var(--radius-sm)",
                display: "grid", placeItems: "center", flexShrink: 0,
                background: "var(--accent-soft)", color: "var(--accent)",
              }}
            >
              <Icon name={icon} size={14} />
            </span>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {title ? <div className="modal-title" style={{ fontSize: 15 }}>{title}</div> : null}
            {sub ? <div className="modal-sub">{sub}</div> : null}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={14} /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer ? <div className="drawer-foot">{footer}</div> : null}
      </aside>
    </>
  );
};

export const ConfirmDialog = ({ title, body, confirmLabel = "Confirm", cancelLabel = "Cancel", tone = "danger", onConfirm, onClose, busy }) => (
  <Modal
    title={title}
    onClose={onClose}
    width={420}
    icon={tone === "danger" ? "warning" : "check"}
    tone={tone}
    footer={
      <>
        <button className="btn ghost" onClick={onClose} disabled={busy}>{cancelLabel}</button>
        <button className={`btn ${tone === "danger" ? "danger" : "accent"}`} onClick={onConfirm} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </button>
      </>
    }
  >
    <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>{body}</div>
  </Modal>
);

/* --------------------------------------------------------------------------
   Toast — compact, never a modal.
   -------------------------------------------------------------------------- */
export const Toast = ({ tone = "ok", title, sub, onClose, action }) => (
  <div className={`toast ${tone}`} role="status">
    <span className="toast-ico" aria-hidden="true">
      <Icon name={tone === "ok" ? "check" : tone === "bad" ? "x" : "warning"} size={12} stroke={2.4} />
    </span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="toast-title">{title}</div>
      {sub ? <div className="toast-sub">{sub}</div> : null}
      {action ? <div style={{ marginTop: 7 }}>{action}</div> : null}
    </div>
    {onClose && (
      <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={onClose} aria-label="Dismiss">
        <Icon name="x" size={11} />
      </button>
    )}
  </div>
);

/* --------------------------------------------------------------------------
   Activity timeline — grouped by day, subtle connectors.
   items: [{ day?, title, sub?, time?, tone?, icon? }]
   -------------------------------------------------------------------------- */
export const ActivityTimeline = ({ items = [], emptyTitle = "No activity yet", emptyBody }) => {
  if (!items.length) {
    return <EmptyState icon="clock" title={emptyTitle} body={emptyBody || "Actions taken across the workspace will appear here as they happen."} />;
  }
  // Group consecutive items sharing a `day` label so the rail stays unbroken
  // inside a day but the heading repeats between days.
  const groups = [];
  for (const it of items) {
    const day = it.day || "";
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(it);
    else groups.push({ day, items: [it] });
  }
  return (
    <div className="timeline">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.day ? <div className="tl-day">{g.day}</div> : null}
          {g.items.map((it, i) => (
            <div
              key={i}
              className={`tl-item ${i === 0 ? "first" : ""} ${i === g.items.length - 1 ? "last" : ""}`}
            >
              <span className={`tl-dot ${it.tone || ""}`} aria-hidden="true" />
              <div className="tl-body">
                <div className="tl-title">{it.title}</div>
                {it.sub ? <div className="tl-sub">{it.sub}</div> : null}
              </div>
              {it.time ? <span className="tl-time">{it.time}</span> : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

/* --------------------------------------------------------------------------
   Insight card — a calculated observation. Never invents a number; the
   caller passes what it computed from data already on screen.
   -------------------------------------------------------------------------- */
export const InsightCard = ({ eyebrow = "Insight", headline, body, icon = "sparkles", action }) => (
  <div className="insight">
    <span className="eyebrow"><Icon name={icon} size={11} />{eyebrow}</span>
    <div className="headline">{headline}</div>
    {body ? <div className="body">{body}</div> : null}
    {action ? <div style={{ marginTop: 10 }}>{action}</div> : null}
  </div>
);

/* --------------------------------------------------------------------------
   Toolbar bits
   -------------------------------------------------------------------------- */
export const SearchInput = ({ value, onChange, placeholder = "Search…", onClear, style, autoFocus }) => (
  <div className="search-input" style={style}>
    <Icon name="search" size={14} />
    <input
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      aria-label={placeholder}
    />
    {value ? (
      <button
        className="icon-btn"
        style={{ width: 20, height: 20 }}
        onClick={() => (onClear ? onClear() : onChange?.(""))}
        aria-label="Clear search"
      >
        <Icon name="x" size={11} />
      </button>
    ) : null}
  </div>
);

export const FilterBar = ({ children, className = "" }) => (
  <div className={`toolbar ${className}`}>{children}</div>
);

/* --------------------------------------------------------------------------
   Charts
   --------------------------------------------------------------------------
   All charts measure their container instead of stretching a fixed viewBox,
   so text and points stay circular and legible at every width. `w` is kept
   in the signature as the fallback width for the first paint.
   -------------------------------------------------------------------------- */

// Container width, tracked live. Returns [ref, width].
function useMeasuredWidth(fallback = 640) {
  const ref = useRef(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const next = el.clientWidth;
      if (next > 0) setW(next);
    };
    read();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", read);
      return () => window.removeEventListener("resize", read);
    }
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// Nice round axis maximum so the top gridline reads as a real number.
function niceMax(v) {
  if (!isFinite(v) || v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * mag;
}

function shortNum(v) {
  const n = Number(v) || 0;
  const a = Math.abs(n);
  if (a >= 1e7) return `${(n / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `${(n / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return String(Math.round(n * 10) / 10);
}

const ChartEmpty = ({ h, title, body }) => (
  <div style={{ height: h || 200, display: "grid", placeItems: "center" }}>
    <EmptyState
      icon="trending"
      title={title || "No data for this period"}
      body={body || "Once records exist for the selected range, the trend will be plotted here."}
    />
  </div>
);

export const Sparkline = ({ data, w = 100, h = 28, stroke = "var(--accent)", fill = "var(--accent-soft)", className }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (w - 2) + 1;
    const y = h - 1 - ((v - min) / range) * (h - 2);
    return [x, y];
  });
  const d = "M " + pts.map((p) => p.join(",")).join(" L ");
  const area = d + ` L ${w - 1},${h - 1} L 1,${h - 1} Z`;
  return (
    <svg className={className} width={w} height={h} aria-hidden="true">
      <path d={area} fill={fill} opacity="0.7" />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// Line (+ optional bar) chart with a hover crosshair and tooltip.
// Same props as before: data, w, h, lineKeys, barKey, xKey, palette.
export const LineBarChart = ({
  data, w = 640, h = 240,
  lineKeys = ["inc"], barKey, xKey = "w",
  palette,
  labels,
  valueFmt = shortNum,
}) => {
  const [ref, width] = useMeasuredWidth(w);
  const [hover, setHover] = useState(null);
  if (!data || data.length === 0) {
    return <div ref={ref}><ChartEmpty h={h} /></div>;
  }

  // On narrow viewports drop the left axis padding and thin out x labels
  // rather than letting them collide.
  const compact = width < 460;
  const pad = { t: 16, r: 12, b: 26, l: compact ? 34 : 44 };
  const iw = Math.max(40, width - pad.l - pad.r);
  const ih = Math.max(40, h - pad.t - pad.b);

  const vals = data.flatMap((d) => [...lineKeys.map((k) => Number(d[k]) || 0), barKey ? Number(d[barKey]) || 0 : 0]);
  const max = niceMax(Math.max(...vals, 1));
  const slot = iw / data.length;
  const bw = Math.min(22, slot * 0.42);
  const xAt = (i) => pad.l + (i + 0.5) * slot;
  const yAt = (v) => pad.t + ih - (Math.max(0, Number(v) || 0) / max) * ih;
  const ticks = [0, max / 2, max];
  // Thin x labels so they never overlap: show every nth.
  const step = Math.max(1, Math.ceil(data.length / (compact ? 4 : 8)));

  const colorOf = (i) => palette?.[i] || ["var(--accent)", "var(--teal)", "var(--warn)"][i % 3];

  return (
    <div className="chart-wrap" ref={ref}>
      <svg
        width={width}
        height={h}
        viewBox={`0 0 ${width} ${h}`}
        className="chartbox"
        role="img"
        aria-label={`Trend chart with ${data.length} points`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - box.left;
          const i = Math.round((x - pad.l) / slot - 0.5);
          setHover(i >= 0 && i < data.length ? i : null);
        }}
      >
        {/* Gridlines + y axis */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={pad.l + iw} y1={yAt(t)} y2={yAt(t)} stroke="var(--rule)" strokeDasharray="2 4" />
            <text x={pad.l - 7} y={yAt(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--ink-4)" fontFamily="var(--font-mono)">
              {valueFmt(t)}
            </text>
          </g>
        ))}

        {/* Hover crosshair sits under the marks */}
        {hover != null && (
          <line x1={xAt(hover)} x2={xAt(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--rule)" strokeWidth="1" />
        )}

        {/* Bars (secondary series) */}
        {barKey && data.map((d, i) => {
          const y = yAt(d[barKey]);
          return (
            <rect
              key={i}
              x={xAt(i) - bw / 2} y={y}
              width={bw} height={Math.max(0, pad.t + ih - y)}
              rx="2"
              fill={hover === i ? "var(--ink-4)" : "var(--rule-2)"}
            />
          );
        })}

        {/* Lines + area */}
        {lineKeys.map((k, ki) => {
          const color = colorOf(ki);
          const pts = data.map((d, i) => [xAt(i), yAt(d[k])]);
          const path = "M " + pts.map((p) => p.join(",")).join(" L ");
          const area = path + ` L ${xAt(data.length - 1)},${pad.t + ih} L ${xAt(0)},${pad.t + ih} Z`;
          return (
            <g key={k}>
              {ki === 0 && <path d={area} fill={color} opacity="0.07" />}
              <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {pts.map(([x, y], i) => (
                <circle
                  key={i}
                  cx={x} cy={y}
                  r={hover === i ? 4 : 2.5}
                  fill="var(--card)" stroke={color}
                  strokeWidth={hover === i ? 2.5 : 1.5}
                />
              ))}
            </g>
          );
        })}

        {/* X axis */}
        {data.map((d, i) => (
          i % step === 0 || i === data.length - 1 ? (
            <text key={i} x={xAt(i)} y={h - 7} textAnchor="middle" fontSize="10" fill="var(--ink-4)" fontFamily="var(--font-mono)">
              {d[xKey]}
            </text>
          ) : null
        ))}
      </svg>

      {hover != null && (
        <div className="chart-tooltip" style={{ left: xAt(hover), top: yAt(Math.max(...lineKeys.map((k) => Number(data[hover][k]) || 0))) }}>
          <div style={{ fontWeight: 600, marginBottom: 3 }}>{data[hover][xKey]}</div>
          {lineKeys.map((k, ki) => (
            <div key={k} style={{ display: "flex", gap: 8 }}>
              <span className="tt-k">{labels?.[k] || k}</span>
              <span className="tt-v" style={{ marginLeft: "auto" }}>{valueFmt(data[hover][k])}</span>
            </div>
          ))}
          {barKey && (
            <div style={{ display: "flex", gap: 8 }}>
              <span className="tt-k">{labels?.[barKey] || barKey}</span>
              <span className="tt-v" style={{ marginLeft: "auto" }}>{valueFmt(data[hover][barKey])}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const BarChart = ({ data, w = 640, h = 220, xKey, yKey, yKey2, labelFmt, palette = ["var(--accent)", "var(--rule-2)"] }) => {
  const [ref, width] = useMeasuredWidth(w);
  const [hover, setHover] = useState(null);
  if (!data || data.length === 0) {
    return <div ref={ref}><ChartEmpty h={h} /></div>;
  }
  const pad = { t: 14, r: 8, b: 30, l: 8 };
  const iw = Math.max(40, width - pad.l - pad.r);
  const ih = Math.max(30, h - pad.t - pad.b);
  const max = niceMax(Math.max(...data.map((d) => (Number(d[yKey]) || 0) + (yKey2 ? Number(d[yKey2]) || 0 : 0)), 1));
  const slot = iw / data.length;
  const bw = Math.min(40, slot * 0.6);
  const xAt = (i) => pad.l + (i + 0.5) * slot;
  const yAt = (v) => pad.t + ih - ((Number(v) || 0) / max) * ih;
  const showLabels = slot > 34;

  return (
    <div className="chart-wrap" ref={ref}>
      <svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} className="chartbox" role="img" aria-label="Bar chart">
        <line x1={pad.l} x2={pad.l + iw} y1={pad.t + ih} y2={pad.t + ih} stroke="var(--rule)" />
        {data.map((d, i) => {
          const y1 = yAt(d[yKey]);
          const y2 = yKey2 ? yAt((Number(d[yKey]) || 0) + (Number(d[yKey2]) || 0)) : y1;
          return (
            <g
              key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "default" }}
            >
              <rect x={xAt(i) - slot / 2} y={pad.t} width={slot} height={ih} fill="transparent" />
              {yKey2 && <rect x={xAt(i) - bw / 2} y={y2} width={bw} height={Math.max(0, y1 - y2)} fill={palette[1]} rx="3" />}
              <rect
                x={xAt(i) - bw / 2} y={y1}
                width={bw} height={Math.max(0, pad.t + ih - y1)}
                fill={palette[0]} rx="3"
                opacity={hover == null || hover === i ? 1 : 0.45}
                style={{ transition: "opacity 120ms" }}
              />
              {showLabels && (
                <text x={xAt(i)} y={h - 16} textAnchor="middle" fontSize="10.5" fill="var(--ink-3)">
                  {d[xKey]}
                </text>
              )}
              {showLabels && (
                <text x={xAt(i)} y={h - 4} textAnchor="middle" fontSize="9.5" fill="var(--ink-4)" fontFamily="var(--font-mono)">
                  {labelFmt ? labelFmt(d) : shortNum(d[yKey])}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="chart-tooltip" style={{ left: xAt(hover), top: yAt(data[hover][yKey]) }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{data[hover][xKey]}</div>
          <span className="tt-v">{labelFmt ? labelFmt(data[hover]) : shortNum(data[hover][yKey])}</span>
        </div>
      )}
    </div>
  );
};

// Horizontal funnel — stage name, count, share of the top stage.
export const Funnel = ({ stages = [], valueFmt = (v) => v.toLocaleString("en-IN") }) => {
  if (!stages.length) return <EmptyState icon="filter" title="No funnel data" body="Stages appear once records exist to move through them." />;
  const top = Math.max(...stages.map((s) => Number(s.value) || 0), 1);
  return (
    <div className="funnel">
      {stages.map((s, i) => {
        const v = Number(s.value) || 0;
        const pct = Math.round((v / top) * 100);
        return (
          <div className="funnel-row" key={s.label || i}>
            <div className="funnel-meta">
              <span className="fl">{s.label}</span>
              <span className="fp">{pct}%</span>
              <span className="fv">{valueFmt(v)}</span>
            </div>
            <div className="funnel-track">
              <div
                className="funnel-fill"
                style={{ width: `${Math.max(pct, v > 0 ? 2 : 0)}%`, opacity: 1 - i * 0.13 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const Ring = ({ pct, size = 72, stroke = 8, color = "var(--accent)", track = "var(--rule-2)", label, sub }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <div className="ring" style={{ width: size, height: size, position: "relative" }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 400ms cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{label}</div>
          {sub && <div style={{ color: "var(--ink-3)", fontSize: 10.5 }}>{sub}</div>}
        </div>
      </div>
    </div>
  );
};

/* --------------------------------------------------------------------------
   Status vocabulary — one status language for every entity in the product.
   -------------------------------------------------------------------------- */
const STATUS_TONE = {
  Open: "bad",
  "In Progress": "warn",
  Resolved: "ok",
  New: "info",
  Contacted: "warn",
  Converted: "ok",
  Rejected: "bad",
  paid: "ok",
  pending: "warn",
  overdue: "bad",
  running: "ok",
  delayed: "warn",
  done: "ok",
  current: "accent",
  low: "bad",
  ok: "ok",
  top: "ok",
  // Shared across leave / TC / approval flows
  approved: "ok",
  Approved: "ok",
  rejected: "bad",
  Rejected2: "bad",
  active: "ok",
  Active: "ok",
  inactive: "neutral",
  archived: "neutral",
  completed: "ok",
  Completed: "ok",
  cancelled: "bad",
  draft: "neutral",
  sent: "info",
  scheduled: "info",
  expired: "bad",
};
export const statusChip = (status) => STATUS_TONE[status] || "";

export const StatusChip = ({ status, children }) => (
  <span className={`chip ${statusChip(status)}`}>
    <span className="dot" />
    {children || status}
  </span>
);

// Alias so screens can reach for the CRM-standard name.
export const StatusBadge = StatusChip;

/* --------------------------------------------------------------------------
   Avatars
   -------------------------------------------------------------------------- */
export const AvatarChip = ({ initials, color, size }) => (
  <div className={`avatar ${size === "lg" ? "lg" : size === "sm" ? "sm" : ""}`} style={color ? { background: color } : undefined}>
    {initials}
  </div>
);

// Deterministic tint from a name, so the same person keeps the same colour.
const AVATAR_TINTS = [
  ["var(--sky)", "var(--sky-ink)"],
  ["var(--mint)", "var(--mint-ink)"],
  ["var(--peach)", "var(--peach-ink)"],
  ["var(--lilac)", "var(--lilac-ink)"],
  ["var(--cream)", "var(--cream-ink)"],
  ["var(--rose)", "var(--rose-ink)"],
];
export function initialsOf(name) {
  if (!name) return "—";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  return ((parts[0][0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}
export const Avatar = ({ name, size = "md", tinted = true }) => {
  const key = String(name || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const [bg, fg] = AVATAR_TINTS[key % AVATAR_TINTS.length];
  return (
    <div
      className={`avatar ${size === "lg" ? "lg" : size === "sm" ? "sm" : ""}`}
      style={tinted ? { background: bg, color: fg } : undefined}
      title={name || undefined}
    >
      {initialsOf(name)}
    </div>
  );
};

// Name + secondary line, the standard "who is this row about" cell.
export const IdentityCell = ({ name, sub, avatar = true }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
    {avatar ? <Avatar name={name} size="sm" /> : null}
    <div style={{ minWidth: 0 }}>
      <div className="t-primary truncate">{name || "—"}</div>
      {sub ? <div className="t-sub truncate">{sub}</div> : null}
    </div>
  </div>
);

/* --------------------------------------------------------------------------
   UPI helpers — unchanged behaviour, restyled placeholders.
   -------------------------------------------------------------------------- */

// Build the standard UPI deep-link URI from the bits the bank QR needs.
// Returns null if the payee VPA is missing — caller should render a CTA
// asking the user to configure their UPI ID instead of an unscannable QR.
export function buildUpiUri({ upiId, payeeName, amount, note, transactionRef }) {
  if (!upiId) return null;
  const params = new URLSearchParams();
  params.set("pa", upiId);
  if (payeeName) params.set("pn", payeeName);
  if (amount && Number(amount) > 0) params.set("am", String(Math.floor(Number(amount))));
  params.set("cu", "INR");
  if (note) params.set("tn", note);
  if (transactionRef) params.set("tr", transactionRef);
  return `upi://pay?${params.toString()}`;
}

export const UpiQR = ({ size = 180, uri, hint }) => {
  if (!uri) {
    return (
      <div style={{
        width: size, height: size,
        border: "1px dashed var(--rule)", borderRadius: "var(--radius)",
        display: "grid", placeItems: "center", padding: 16, textAlign: "center",
        background: "var(--card-2)", color: "var(--ink-3)", fontSize: 11.5, lineHeight: 1.55,
      }}>
        <div>
          <span style={{
            width: 32, height: 32, borderRadius: "50%", margin: "0 auto 8px",
            display: "grid", placeItems: "center",
            background: "var(--bg-2)", color: "var(--ink-4)",
          }}>
            <Icon name="qr" size={15} />
          </span>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>
            UPI not configured
          </div>
          {hint || "Add a UPI ID under Settings → Finance to make this QR scannable."}
        </div>
      </div>
    );
  }
  // Branded QR rendered server-side by /api/fees/qr-image. 2x for retina.
  const src = `/api/fees/qr-image?size=${size * 2}&data=${encodeURIComponent(uri)}`;
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt="UPI QR code"
      style={{ display: "block", borderRadius: 8, background: "#fff" }}
    />
  );
};

export const FakeQR = ({ size = 156, seed = 7 }) => {
  const n = 21;
  const cells = [];
  let s = seed;
  const next = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (next() > 0.52) cells.push([x, y]);
    }
  }
  const finder = (fx, fy) => [
    <rect key={`f1-${fx}-${fy}`} x={fx} y={fy} width="7" height="7" fill="currentColor" />,
    <rect key={`f2-${fx}-${fy}`} x={fx + 1} y={fy + 1} width="5" height="5" fill="var(--card)" />,
    <rect key={`f3-${fx}-${fy}`} x={fx + 2} y={fy + 2} width="3" height="3" fill="currentColor" />,
  ];
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} style={{ color: "var(--ink)", display: "block" }}>
      <rect width={n} height={n} fill="var(--card)" />
      {cells
        .filter(([x, y]) => !(x < 8 && y < 8) && !(x > n - 9 && y < 8) && !(x < 8 && y > n - 9))
        .map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="1" height="1" fill="currentColor" />
        ))}
      {finder(0, 0)}
      {finder(n - 7, 0)}
      {finder(0, n - 7)}
    </svg>
  );
};
