"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import { AvatarChip } from "../ui";

// Parent ↔ Staff direct messaging. Two layouts off the same component:
//   - Parent: single locked-in thread with the admin desk (parent
//             messages always route to the first available admin /
//             principal account on the server).
//   - Staff (admin, principal, academic_director, teacher,
//            school_accountant): inbox of parent threads on the left,
//            active conversation on the right. Non-admin staff can
//            only message parents (server enforces).

export default function ScreenMessages({ role, session }) {
  // Staff layout for any non-parent role with access to this screen.
  // The server limits non-admin staff to messaging parents only — this
  // flag just toggles the UI.
  const STAFF_ROLES = new Set([
    "admin", "principal", "academic_director", "teacher", "school_accountant",
  ]);
  const isStaff = STAFF_ROLES.has(role);
  // Kept under the old name so the rest of the file (button labels,
  // inbox vs. single-thread switch) doesn't need rewriting.
  const isAdmin = isStaff;
  const [threads, setThreads] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState("");
  const scrollRef = useRef(null);

  async function loadThreads() {
    try {
      const r = await fetch("/api/messages", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!j?.ok) return;
      setThreads(j.threads || []);
      // Auto-pick a thread for parents (only one will exist).
      if (!activeId && (j.threads || [])[0]) setActiveId(j.threads[0].otherId);
    } catch {}
  }

  async function loadConversation(otherId) {
    if (!otherId) return;
    try {
      const r = await fetch(`/api/messages?with=${encodeURIComponent(otherId)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!j?.ok) return;
      setMessages(j.messages || []);
      // Mark thread read so the badge clears.
      try {
        await fetch("/api/messages", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ with: otherId }),
        });
      } catch {}
    } catch {}
  }

  useEffect(() => { loadThreads(); }, []);
  useEffect(() => {
    if (activeId) loadConversation(activeId);
    else setMessages([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Lightweight 15s polling so a parent sees an admin reply roughly live
  // and vice versa. Real apps use websockets; this is sufficient here.
  useEffect(() => {
    const t = setInterval(() => {
      loadThreads();
      if (activeId) loadConversation(activeId);
    }, 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Auto-scroll the message column to the latest entry whenever
  // messages change.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  async function send(e) {
    e?.preventDefault?.();
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true); setErr("");
    try {
      const payload = { message: body };
      if (isAdmin) payload.receiverId = activeId;
      const r = await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Failed");
      setDraft("");
      // Optimistically append, then refresh from server to keep ids in sync.
      setMessages((m) => [...m, j.message]);
      loadThreads();
    } catch (ex) {
      setErr(ex.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  const totalUnread = useMemo(() => threads.reduce((a, t) => a + (t.unread || 0), 0), [threads]);
  const activeThread = threads.find((t) => t.otherId === activeId);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Communication</div>
          <div className="page-title">
            {isAdmin ? <>Parent <span className="amber">messages</span></> : <>Message <span className="amber">admin</span></>}
          </div>
          <div className="page-sub">
            {isAdmin
              ? `${threads.length} thread${threads.length === 1 ? "" : "s"} · ${totalUnread} unread`
              : "Direct line to the school office. Replies usually within a working day."}
          </div>
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden", padding: 0 }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: isAdmin ? "320px 1fr" : "1fr",
          minHeight: 540,
        }}>
          {isAdmin && (
            <div style={{ borderRight: "1px solid var(--rule)", overflowY: "auto", maxHeight: 640 }}>
              <div style={{
                padding: "10px 14px", borderBottom: "1px solid var(--rule)",
                fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--ink-3)",
              }}>Inbox · {threads.length}</div>
              {threads.length === 0 ? (
                <div className="empty" style={{ padding: 24, fontSize: 12 }}>
                  No parent messages yet. They'll appear here when a parent writes in.
                </div>
              ) : threads.map((t) => {
                const active = t.otherId === activeId;
                return (
                  <button
                    key={t.otherId}
                    onClick={() => setActiveId(t.otherId)}
                    style={{
                      width: "100%", padding: "12px 14px",
                      background: active ? "var(--accent-soft)" : "transparent",
                      border: 0, borderBottom: "1px solid var(--rule-2, var(--rule))",
                      textAlign: "left", cursor: "pointer",
                      display: "flex", gap: 10, alignItems: "flex-start",
                    }}
                  >
                    <AvatarChip initials={(t.otherName || "??").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.otherName}
                        </span>
                        {t.unread > 0 && (
                          <span style={{
                            minWidth: 18, padding: "1px 6px", borderRadius: 10,
                            background: "var(--accent)", color: "#fff",
                            fontSize: 10, fontWeight: 800, textAlign: "center",
                          }}>{t.unread}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.lastMessage}
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 3 }}>
                        {t.otherRole && <span className="chip">{t.otherRole}</span>}
                        <span style={{ marginLeft: 6 }}>{relativeTime(t.lastAt)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Conversation pane */}
          <div style={{ display: "flex", flexDirection: "column", minHeight: 540 }}>
            {isAdmin && !activeThread ? (
              <div className="empty" style={{ padding: 60, flex: 1, display: "grid", placeItems: "center" }}>
                Pick a thread on the left to read it.
              </div>
            ) : (
              <>
                {isAdmin && activeThread && (
                  <div style={{
                    padding: "12px 16px", borderBottom: "1px solid var(--rule)",
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <AvatarChip initials={(activeThread.otherName || "??").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{activeThread.otherName}</div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                        {activeThread.otherRole} · {activeThread.otherEmail || activeThread.otherId}
                      </div>
                    </div>
                  </div>
                )}

                <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 8, maxHeight: 480 }}>
                  {messages.length === 0 ? (
                    <div className="empty" style={{ padding: 30, alignSelf: "center", color: "var(--ink-3)", fontSize: 12 }}>
                      {isAdmin
                        ? "No messages in this thread yet."
                        : "Start the conversation — anything you'd like the school office to know."}
                    </div>
                  ) : messages.map((m) => {
                    const mine = m.senderId === session?.sub;
                    return (
                      <div key={m.id} style={{
                        alignSelf: mine ? "flex-end" : "flex-start",
                        maxWidth: "78%",
                        padding: "9px 13px",
                        borderRadius: mine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                        background: mine ? "var(--accent)" : "var(--bg-2)",
                        color: mine ? "var(--accent-ink, #fff)" : "var(--ink)",
                        fontSize: 13, lineHeight: 1.45,
                        boxShadow: mine ? "0 4px 14px -8px rgba(232, 83, 14, 0.4)" : "none",
                        whiteSpace: "pre-wrap", wordBreak: "break-word",
                      }}>
                        {m.message}
                        <div style={{
                          fontSize: 9.5, opacity: 0.7, marginTop: 4, fontWeight: 600,
                          color: mine ? "rgba(255,255,255,0.85)" : "var(--ink-4)",
                        }}>
                          {new Date(m.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form onSubmit={send} style={{
                  borderTop: "1px solid var(--rule)",
                  padding: "10px 12px",
                  display: "flex", gap: 8, alignItems: "flex-end",
                }}>
                  <textarea
                    className="input"
                    rows={2}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value.slice(0, 4000))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    placeholder={isAdmin ? "Reply to this parent…" : "Type your message to the school office…"}
                    style={{ flex: 1, resize: "vertical", fontFamily: "inherit", minHeight: 44 }}
                  />
                  <button type="submit" className="btn accent" disabled={busy || !draft.trim() || (isAdmin && !activeId)}>
                    {busy ? "Sending…" : <><Icon name="send" size={13} />Send</>}
                  </button>
                </form>
                {err && (
                  <div style={{ padding: "0 14px 10px", fontSize: 11.5, color: "var(--bad, #b13c1c)", fontWeight: 700 }}>{err}</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function relativeTime(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)        return "just now";
  if (ms < 3_600_000)     return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000)    return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}
