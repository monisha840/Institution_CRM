"use client";

import Icon from "./Icon";

// Roles list is no longer toggleable here — the signed-in role comes from the
// server session. Kept exported for screens that still import it for labels.
const ROLES = [
  { k: "admin",             label: "Admin",             icon: "shield" },
  { k: "academic_director", label: "Academic Director", icon: "academic" },
  { k: "principal",         label: "Principal",         icon: "school" },
  { k: "teacher",           label: "Teacher",           icon: "book" },
  { k: "parent",            label: "Parent",            icon: "heart" },
];

export default function Tweaks({ show, settings, setSetting }) {
  if (!show) return null;
  return (
    <div className="tweaks">
      <div className="tweaks-head">
        <Icon name="sliders" size={14} />
        <div className="t">Tweaks</div>
        <div className="k">⌘K</div>
      </div>
      <div className="tweaks-body">
        <div className="tweak-row">
          <div className="lbl">View</div>
          <div className="segmented">
            <button className={settings.view === "desktop" ? "active" : ""} onClick={() => setSetting("view", "desktop")}>
              Desktop
            </button>
            <button className={settings.view === "mobile" ? "active" : ""} onClick={() => setSetting("view", "mobile")}>
              Mobile
            </button>
          </div>
        </div>
        <div className="tweak-row">
          <div className="lbl">Theme</div>
          <div className="segmented">
            <button className={settings.theme === "light" ? "active" : ""} onClick={() => setSetting("theme", "light")}>
              <Icon name="sun" size={11} />
              Light
            </button>
            <button className={settings.theme === "dark" ? "active" : ""} onClick={() => setSetting("theme", "dark")}>
              <Icon name="moon" size={11} />
              Dark
            </button>
          </div>
        </div>
        <div className="tweak-row">
          <div className="lbl">Density</div>
          <div className="segmented">
            <button className={settings.density === "compact" ? "active" : ""} onClick={() => setSetting("density", "compact")}>
              Compact
            </button>
            <button className={settings.density === "balanced" ? "active" : ""} onClick={() => setSetting("density", "balanced")}>
              Balanced
            </button>
            <button className={settings.density === "spacious" ? "active" : ""} onClick={() => setSetting("density", "spacious")}>
              Spacious
            </button>
          </div>
        </div>
        <div className="tweak-row">
          <div className="lbl">Sidebar</div>
          <div className="segmented">
            <button className={settings.sidebar === "expanded" ? "active" : ""} onClick={() => setSetting("sidebar", "expanded")}>
              Expanded
            </button>
            <button className={settings.sidebar === "collapsed" ? "active" : ""} onClick={() => setSetting("sidebar", "collapsed")}>
              Icons only
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { ROLES };
