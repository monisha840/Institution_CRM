"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

// Reusable upload + list panel for ANY entity. Used inside Students profile,
// Staff profile, TC modal, etc.
//   <DocumentsPanel entityType="student" entityId="STN-9054" canEdit={true} />
export default function DocumentsPanel({ entityType, entityId, canEdit = true, compact = false }) {
  const [docs, setDocs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [labelOpen, setLabelOpen] = useState(null); // pending file awaiting label
  const inputRef = useRef(null);

  async function load() {
    setErr("");
    try {
      const r = await fetch(`/api/documents?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`, { cache: "no-store" });
      const j = await r.json();
      if (j.ok) setDocs(j.documents || []);
    } catch (e) { setErr("Couldn't load documents"); }
  }
  useEffect(() => { if (entityType && entityId) load(); /* eslint-disable-next-line */ }, [entityType, entityId]);

  function handlePick() { inputRef.current?.click(); }

  function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-pick same file
    if (!file) return;
    if (file.size > 1_800_000) {
      setErr(`File is ${(file.size / 1024).toFixed(0)}KB — keep it under 1.8MB`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLabelOpen({ file, dataUrl: reader.result, label: defaultLabel(file.name) });
    reader.onerror = () => setErr("Could not read file");
    reader.readAsDataURL(file);
  }

  async function submitUpload() {
    if (!labelOpen) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entityType, entityId,
          label: labelOpen.label || labelOpen.file.name,
          fileName: labelOpen.file.name,
          mimeType: labelOpen.file.type,
          dataUrl: labelOpen.dataUrl,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "Upload failed");
      setLabelOpen(null);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function remove(doc) {
    if (!confirm(`Remove document "${doc.label}"?`)) return;
    setBusy(true);
    try {
      const r = await fetch("/api/documents", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: doc.id }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "Failed");
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  function fmtSize(b) {
    if (!b) return "—";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  }
  function iconFor(mime) {
    if (/^image\//.test(mime)) return "image";
    if (/pdf/i.test(mime))     return "reports";
    return "reports";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {!compact && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink)" }}>Documents</div>
            <div style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{docs.length} file{docs.length === 1 ? "" : "s"}</div>
          </div>
          {canEdit && (
            <button className="btn sm" onClick={handlePick} disabled={busy}>
              <Icon name="upload" size={11} />Upload
            </button>
          )}
        </div>
      )}

      <input ref={inputRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" onChange={handleFile} />

      {err && (
        <div style={{ background: "var(--err-soft, #fbe1d8)", color: "var(--err, #b13c1c)", padding: "7px 10px", borderRadius: 6, fontSize: 11.5 }}>{err}</div>
      )}

      {labelOpen && (
        <div style={{ background: "var(--bg-2)", border: "1px dashed var(--rule)", padding: 10, borderRadius: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
            New: <b style={{ color: "var(--ink)" }}>{labelOpen.file.name}</b> · {fmtSize(labelOpen.file.size)}
          </div>
          <input
            className="input"
            value={labelOpen.label}
            onChange={(e) => setLabelOpen((s) => ({ ...s, label: e.target.value }))}
            placeholder="Label (e.g. Aadhaar, Birth certificate, Photo)"
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <button className="btn sm ghost" onClick={() => setLabelOpen(null)} disabled={busy}>Cancel</button>
            <button className="btn sm accent" onClick={submitUpload} disabled={busy}>
              <Icon name="check" size={11} />{busy ? "Uploading…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {docs.length === 0 && !labelOpen && (
        <div className="empty" style={{ padding: 14, fontSize: 12 }}>
          {canEdit ? "No documents uploaded yet. Click Upload to add one." : "No documents on file."}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {docs.map((d) => (
          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: "var(--bg-2)", borderRadius: 7 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: "var(--card)", display: "grid", placeItems: "center", color: "var(--ink-3)", flexShrink: 0 }}>
              <Icon name={iconFor(d.mimeType)} size={13} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</div>
              <div style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
                {d.fileName} · {fmtSize(d.sizeBytes)} · {new Date(d.uploadedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
              </div>
            </div>
            <a className="btn sm" href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" title="Open">
              <Icon name="download" size={11} />
            </a>
            {canEdit && (
              <button className="icon-btn" onClick={() => remove(d)} disabled={busy} title="Remove">
                <Icon name="x" size={12} />
              </button>
            )}
          </div>
        ))}
      </div>

      {compact && canEdit && !labelOpen && (
        <button className="btn sm" onClick={handlePick} disabled={busy} style={{ alignSelf: "flex-start" }}>
          <Icon name="upload" size={11} />Upload document
        </button>
      )}
    </div>
  );
}

function defaultLabel(fname) {
  const stem = fname.replace(/\.[^.]+$/, "");
  return stem.length > 40 ? stem.slice(0, 40) : stem;
}
