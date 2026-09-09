// Server-side PNG renderer for the Sanfort fee receipt. Draws the receipt
// straight to a canvas (no HTML / browser needed) and returns a base64
// data-URI so we can ship it directly through the n8n webhook → Evolution
// API → WhatsApp without needing a publicly-reachable URL.

import { createCanvas } from "@napi-rs/canvas";
import { feeTypeLabel } from "./format.js";

// Sanfort theme colours — kept in sync with the on-screen receipt preview.
const NAVY = "#1f3a8a";
const RED  = "#c11d1d";
const INK  = "#000000";
const GREY = "#5a5a5a";
const BG   = "#ffffff";

function fmtINR(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }
function dot(s, max) {
  const t = String(s || "");
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

// Render the full receipt to a PNG buffer. Returns a base64 data-URI string
// that the WhatsApp Cloud / Evolution API will accept directly as `media`.
export function renderReceiptPng({
  schoolName = "SANFORT INTERNATIONAL SCHOOL",
  trustName  = "Sanvi Educational and Charitable Trust",
  regNo      = "SIS/2026",
  address    = "No.45, MG Road, Chennai - 600 001.",
  phone      = "9876 543 210",
  // receipt-specific
  admissionNo,
  studentName,
  cls,
  monthLabel,
  dateStr,
  slNo,
  receiptId,
  method,
  feeType,
  amount,            // integer paise/rupees (we treat as rupees)
  totalDue,          // integer (line-item total before any balance adjustments)
  balancePending,    // integer (0 if fully paid)
  cashier,
} = {}) {
  // Canvas size — A6-ish, scaled up for clarity. WhatsApp embeds at ~screen
  // width so 600×850 keeps the text crisp without being huge.
  const W = 600;
  const H = 900;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Background + outer border
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, W - 16, H - 16);

  // ---- Header: school name, trust, reg no, address, phone ----
  ctx.fillStyle = NAVY;
  ctx.textAlign = "center";
  ctx.font = "bold 22px Arial, sans-serif";
  ctx.fillText(schoolName, W / 2, 50);
  ctx.font = "bold 13px Arial, sans-serif";
  ctx.fillText(trustName, W / 2, 72);
  ctx.font = "bold 12px Arial, sans-serif";
  ctx.fillText(`Reg No: ${regNo}/${slNo}`, W / 2, 95);
  ctx.fillText(address, W / 2, 115);
  ctx.fillText(`Cell: ${phone}`, W / 2, 133);

  // Divider under header
  ctx.beginPath();
  ctx.moveTo(20, 150); ctx.lineTo(W - 20, 150);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // ---- Meta grid: Adm No, SL No (red), Name, Class, Month, Date ----
  ctx.textAlign = "left";
  ctx.font = "bold 13px Arial, sans-serif";
  ctx.fillStyle = NAVY;

  // Row 1 — Adm No + SL No
  ctx.fillText("Adm. No :", 30, 180);
  ctx.fillStyle = INK;
  ctx.font = "13px Arial, sans-serif";
  ctx.fillText(dot(admissionNo, 18), 110, 180);
  // SL No on the right
  ctx.fillStyle = NAVY; ctx.font = "bold 13px Arial, sans-serif";
  ctx.fillText("SL.No.", 380, 180);
  ctx.fillStyle = RED; ctx.font = "bold 22px Arial, sans-serif";
  ctx.fillText(slNo, 450, 184);

  // Row 2 — Name + Class
  ctx.fillStyle = NAVY; ctx.font = "bold 13px Arial, sans-serif";
  ctx.fillText("Name    :", 30, 210);
  ctx.fillStyle = INK; ctx.font = "13px Arial, sans-serif";
  ctx.fillText(dot(studentName, 22), 110, 210);
  ctx.fillStyle = NAVY; ctx.font = "bold 13px Arial, sans-serif";
  ctx.fillText("Class & Sec :", 350, 210);
  ctx.fillStyle = INK; ctx.font = "13px Arial, sans-serif";
  ctx.fillText(dot(cls || "—", 8), 460, 210);

  // Row 3 — Month + Date
  ctx.fillStyle = NAVY; ctx.font = "bold 13px Arial, sans-serif";
  ctx.fillText("Month   :", 30, 240);
  ctx.fillStyle = INK; ctx.font = "13px Arial, sans-serif";
  ctx.fillText(dot(monthLabel, 18), 110, 240);
  ctx.fillStyle = NAVY; ctx.font = "bold 13px Arial, sans-serif";
  ctx.fillText("Date :", 350, 240);
  ctx.fillStyle = INK; ctx.font = "13px Arial, sans-serif";
  ctx.fillText(dateStr, 400, 240);

  // ---- Particulars table ----
  const tableTop = 270;
  const tableLeft = 30;
  const tableRight = W - 30;
  const tableW = tableRight - tableLeft;
  const colSno = tableLeft;
  const colPart = tableLeft + 70;
  const colAmt = tableRight - 100;
  const rowH = 38;
  const headerH = 36;

  // Header row
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 1.2;
  ctx.fillStyle = "#fafbff";
  ctx.fillRect(tableLeft, tableTop, tableW, headerH);
  ctx.strokeRect(tableLeft, tableTop, tableW, headerH);
  // Col separators
  ctx.beginPath();
  ctx.moveTo(colPart, tableTop); ctx.lineTo(colPart, tableTop + headerH);
  ctx.moveTo(colAmt,  tableTop); ctx.lineTo(colAmt,  tableTop + headerH);
  ctx.stroke();

  ctx.fillStyle = NAVY;
  ctx.font = "bold 12px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("S.No.",       colSno + 35,            tableTop + 22);
  ctx.fillText("Particulars", colPart + (colAmt - colPart) / 2, tableTop + 22);
  ctx.fillText("Amount",      colAmt + 50,            tableTop + 16);
  ctx.font = "11px Arial, sans-serif";
  ctx.fillText("Rs.",         colAmt + 50,            tableTop + 30);

  // Data rows — pad to 5 rows for the consistent receipt-book look.
  const lines = [
    { label: feeTypeLabel(feeType), amt: amount },
  ];
  if (balancePending && balancePending > 0) {
    // (No extra line — balance shows below total.)
  }
  const minRows = 5;
  while (lines.length < minRows) lines.push({ label: "", amt: null });

  ctx.font = "13px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = INK;

  let y = tableTop + headerH;
  lines.forEach((row, i) => {
    ctx.strokeRect(tableLeft, y, tableW, rowH);
    // Col separators
    ctx.beginPath();
    ctx.moveTo(colPart, y); ctx.lineTo(colPart, y + rowH);
    ctx.moveTo(colAmt,  y); ctx.lineTo(colAmt,  y + rowH);
    ctx.stroke();
    if (row.label) {
      ctx.textAlign = "center";
      ctx.fillStyle = INK; ctx.font = "bold 13px Arial, sans-serif";
      ctx.fillText(`${i + 1}.`, colSno + 35, y + 24);
      ctx.textAlign = "left";
      ctx.font = "13px Arial, sans-serif";
      ctx.fillText(dot(row.label, 30), colPart + 12, y + 24);
      // Dotted leader line
      ctx.save();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = "#888";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(colPart + 18 + ctx.measureText(dot(row.label, 30)).width + 10, y + 28);
      ctx.lineTo(colAmt - 8, y + 28);
      ctx.stroke();
      ctx.restore();
      // Amount
      if (row.amt !== null) {
        ctx.textAlign = "right";
        ctx.font = "bold 13px Arial, sans-serif";
        ctx.fillStyle = INK;
        ctx.fillText(Number(row.amt).toLocaleString("en-IN"), colAmt + 90, y + 24);
      }
    }
    y += rowH;
  });

  // TOTAL row
  ctx.strokeRect(tableLeft, y, tableW, rowH);
  ctx.beginPath();
  ctx.moveTo(colAmt, y); ctx.lineTo(colAmt, y + rowH);
  ctx.stroke();
  ctx.fillStyle = "#fafbff";
  ctx.fillRect(tableLeft + 1, y + 1, tableW - 2, rowH - 2);
  ctx.strokeRect(tableLeft, y, tableW, rowH);
  ctx.beginPath();
  ctx.moveTo(colAmt, y); ctx.lineTo(colAmt, y + rowH);
  ctx.stroke();
  ctx.fillStyle = NAVY;
  ctx.font = "bold 14px Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("TOTAL", colAmt - 16, y + 24);
  ctx.textAlign = "right";
  ctx.fillText(Number(amount).toLocaleString("en-IN"), colAmt + 90, y + 24);
  y += rowH;

  // Balance pending line (only if partial)
  if (balancePending && balancePending > 0) {
    ctx.fillStyle = "#a06820";
    ctx.font = "bold 12px Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`Balance pending: ${fmtINR(balancePending)}`, tableRight, y + 22);
    y += 26;
  }

  // Footer — Paid via + Cashier
  ctx.fillStyle = INK;
  ctx.font = "italic 11px Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`Paid via ${method || "—"}  ·  ${cashier || "Cashier"}`, tableRight, H - 30);

  // Receipt id watermark on bottom-left
  ctx.fillStyle = GREY;
  ctx.font = "10px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Receipt: ${receiptId}`, 30, H - 30);

  // Return RAW base64 (no "data:image/png;base64," prefix). Evolution API's
  // sendMedia endpoint rejects the data: URI form with
  //   "Owned media must be a url or base64"
  // — it accepts a URL OR a raw base64 string, nothing else.
  const buffer = canvas.toBuffer("image/png");
  return buffer.toString("base64");
}
