"use client";

const PATHS = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>,
  students: <><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3.3-6 6.5-6s6 2.5 6.5 6"/><circle cx="17" cy="10" r="2.5"/><path d="M15 14.5c1.8-.5 4.5.5 5.5 3"/></>,
  academic: <><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M7 9v5c0 1.5 2.2 3 5 3s5-1.5 5-3V9"/><path d="M21 7v6"/></>,
  fees: <><rect x="2.5" y="5.5" width="19" height="13" rx="1.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v6M18 9v6"/></>,
  money: <><path d="M6 3h11l-2 4H6zM9 3v18M6 7h10M6 11h10"/></>,
  inventory: <><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4"/><path d="M3 17l9 4 9-4"/></>,
  bus: <><rect x="3" y="5" width="15" height="12" rx="2"/><path d="M3 12h15"/><circle cx="7" cy="19" r="1.5"/><circle cx="14" cy="19" r="1.5"/><path d="M18 8h3v6h-3"/></>,
  staff: <><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/></>,
  megaphone: <><path d="M3 10v4a1 1 0 0 0 1 1h2l5 4V5l-5 4H4a1 1 0 0 0-1 1z"/><path d="M16 8s2 1.5 2 4-2 4-2 4"/></>,
  complaint: <><path d="M5 4h14v12h-8l-5 4V4z"/><path d="M12 8v4M12 14h.01"/></>,
  enquiry: <><circle cx="12" cy="12" r="9"/><path d="M9 10a3 3 0 1 1 4 2.8c-.7.3-1 .8-1 1.7M12 18h.01"/></>,
  donors: <><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.7A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></>,
  hr: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M8 14h3"/></>,
  automation: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></>,
  wrench: <><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5z"/></>,
  reports: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.2 4.2l1.5 1.5M18.3 18.3l1.5 1.5M2 12h2M20 12h2M4.2 19.8l1.5-1.5M18.3 5.7l1.5-1.5"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></>,
  bell: <><path d="M6 16V10a6 6 0 1 1 12 0v6l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  arrowUp: <><path d="M12 19V5M5 12l7-7 7 7"/></>,
  arrowDown: <><path d="M12 5v14M5 12l7 7 7-7"/></>,
  arrowRight: <><path d="M5 12h14M12 5l7 7-7 7"/></>,
  arrowLeft: <><path d="M19 12H5M12 19l-7-7 7-7"/></>,
  chevronDown: <><path d="M6 9l6 6 6-6"/></>,
  chevronRight: <><path d="M9 6l6 6-6 6"/></>,
  filter: <><path d="M3 5h18l-7 8v6l-4 2v-8z"/></>,
  download: <><path d="M12 3v13M5 11l7 6 7-6M4 21h16"/></>,
  upload: <><path d="M12 21V8M5 13l7-6 7 6M4 3h16"/></>,
  check: <><path d="M4 12l5 5L20 6"/></>,
  x: <><path d="M6 6l12 12M18 6L6 18"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  phone: <><path d="M4 4h4l2 5-3 2a11 11 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 2 6a2 2 0 0 1 2-2z"/></>,
  whatsapp: <><path d="M3 21l1.8-5A8 8 0 1 1 8 20z"/><path d="M8.5 10.5c.4 2 2 3.6 4 4l1-1.5 2.5 1v1.5c-.3.6-1 1-2 1-3 0-7-4-7-7 0-1 .5-1.7 1-2h1.5z"/></>,
  sms: <><path d="M3 5h18v12H7l-4 4z"/></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 7 9-7"/></>,
  warning: <><path d="M12 3L2 20h20L12 3z"/><path d="M12 10v5M12 18h.01"/></>,
  spark: <><path d="M12 3l2.5 6 6.5.8-5 4.3 1.5 6.5-6-3.5-6 3.5 1.5-6.5-5-4.3 6.5-.8z"/></>,
  book: <><path d="M4 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H4z"/><path d="M20 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/></>,
  pencil: <><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M13 7l4 4"/></>,
  route: <><circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M6 7v4a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4"/></>,
  mapPin: <><path d="M12 22s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM17 17h4v4h-4zM21 14v2M14 21h2"/></>,
  copy: <><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.2 4.2l1.5 1.5M18.3 18.3l1.5 1.5M2 12h2M20 12h2M4.2 19.8l1.5-1.5M18.3 5.7l1.5-1.5"/></>,
  moon: <><path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z"/></>,
  sliders: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></>,
  play: <><path d="M6 4l14 8-14 8z"/></>,
  pause: <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>,
  zap: <><path d="M13 2L3 14h8l-1 8 10-12h-8z"/></>,
  link: <><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 1 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></>,
  trending: <><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></>,
  box: <><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/></>,
  heart: <><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.7A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></>,
  flag: <><path d="M5 21V4h12l-2 4 2 4H5"/></>,
  sparkles: <><path d="M10 3l1.5 4.5L16 9l-4.5 1.5L10 15l-1.5-4.5L4 9l4.5-1.5zM18 14l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z"/></>,
  send: <><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></>,
  target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></>,
  shield: <><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
  refresh: <><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></>,
  school: <><path d="M3 10l9-5 9 5-9 5z"/><path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5"/><path d="M3 10v5"/></>,
  home: <><path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2z"/></>,
  pin: <><path d="M12 22s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></>,
  users: <><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3.3-6 6.5-6s6 2.5 6.5 6"/><circle cx="17" cy="10" r="2.5"/><path d="M15 14.5c1.8-.5 4.5.5 5.5 3"/></>,
  audit: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/><circle cx="17" cy="17" r="2.5"/></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
};

export default function Icon({ name, size = 16, stroke = 1.5, className = "", style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {PATHS[name] || null}
    </svg>
  );
}
