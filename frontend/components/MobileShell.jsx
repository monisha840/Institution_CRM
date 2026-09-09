"use client";

import Icon from "./Icon";

const TABS = {
  parent: [
    { id: "dashboard", label: "Home", icon: "home" },
    { id: "academic", label: "Academics", icon: "academic" },
    { id: "fees", label: "Fees", icon: "fees" },
    { id: "communication", label: "Messages", icon: "megaphone" },
    { id: "transport", label: "Bus", icon: "bus" },
  ],
  teacher: [
    { id: "dashboard", label: "Today", icon: "dashboard" },
    { id: "academic", label: "Classes", icon: "academic" },
    { id: "students", label: "Students", icon: "students" },
    { id: "communication", label: "Messages", icon: "megaphone" },
    { id: "complaints", label: "Tickets", icon: "complaint" },
  ],
  principal: [
    { id: "dashboard", label: "Today", icon: "dashboard" },
    { id: "fees", label: "Fees", icon: "fees" },
    { id: "students", label: "People", icon: "students" },
    { id: "transport", label: "Transport", icon: "bus" },
    { id: "communication", label: "Messages", icon: "megaphone" },
  ],
  super: [
    { id: "trust", label: "Trust", icon: "shield" },
    { id: "schools", label: "Schools", icon: "school" },
    { id: "money", label: "Finance", icon: "money" },
    { id: "donors", label: "Donors", icon: "donors" },
    { id: "settings", label: "More", icon: "settings" },
  ],
};

export default function MobileShell({ current, setCurrent, role, children }) {
  const tabs = TABS[role] || TABS.principal;
  return (
    <div className="ios-frame" style={{ width: 390, height: 844 }}>
      <div className="ios-frame-screen" style={{ width: "100%", height: "100%" }}>
        <div className="ios-notch" />
        <div className="ios-statusbar">
          <div className="time">9:41</div>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor">
              <rect x="0" y="7" width="3" height="4" rx="0.5" />
              <rect x="4.5" y="5" width="3" height="6" rx="0.5" />
              <rect x="9" y="3" width="3" height="8" rx="0.5" />
              <rect x="13.5" y="0" width="3" height="11" rx="0.5" />
            </svg>
            <svg width="16" height="11" viewBox="0 0 16 11" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M1 5.5 A7 7 0 0 1 15 5.5" />
              <path d="M4 7.5 A4 4 0 0 1 12 7.5" />
              <circle cx="8" cy="9.5" r="1" fill="currentColor" />
            </svg>
            <svg width="24" height="11" viewBox="0 0 24 11" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="0.5" y="0.5" width="21" height="10" rx="2.5" />
              <rect x="2" y="2" width="16" height="7" rx="1.2" fill="currentColor" />
              <rect x="22" y="4" width="1.5" height="3" rx="0.5" fill="currentColor" />
            </svg>
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            top: 54,
            left: 0,
            right: 0,
            bottom: 80,
            overflowY: "auto",
            overflowX: "hidden",
            background: "var(--bg)",
          }}
        >
          {children}
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            background: "var(--card)",
            borderTop: "1px solid var(--rule)",
            padding: "8px 4px 20px",
            display: "flex",
            justifyContent: "space-around",
          }}
        >
          {tabs.map((t) => {
            const active = current === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setCurrent(t.id)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  color: active ? "var(--accent)" : "var(--ink-3)",
                  fontSize: 10.5,
                  fontWeight: 500,
                  padding: "6px 8px",
                  flex: 1,
                  maxWidth: 72,
                }}
              >
                <Icon name={t.icon} size={20} />
                <span style={{ whiteSpace: "nowrap" }}>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: "50%",
            transform: "translateX(-50%)",
            width: 134,
            height: 5,
            background: "var(--ink)",
            borderRadius: 999,
            opacity: 0.4,
          }}
        />
      </div>
    </div>
  );
}
