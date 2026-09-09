// Server-side branded QR renderer for Sanfort.
//
// Builds the QR matrix with the `qrcode` npm package, then draws it to a
// @napi-rs/canvas with our blue + orange theme and overlays the school
// logo in the center. Returns a PNG buffer or a raw base64 string.
//
//   - Data modules:   blue   #1f3f8b
//   - Finder patterns (3 corner squares) and inner alignment: orange #e8530e
//   - Logo:           public/logo.png, centered, on a white circle
//
// Error correction is forced to "H" (~30%) so the logo cutout in the middle
// doesn't break scannability.

import QRCode from "qrcode";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import path from "path";
import fs from "fs";

const BLUE   = "#1f3f8b";
const ORANGE = "#e8530e";
const WHITE  = "#ffffff";

// Cached logo so we don't re-read disk on every QR.
let _logoPromise = null;
function loadLogo() {
  if (_logoPromise) return _logoPromise;
  const p = path.join(process.cwd(), "public", "logo.png");
  if (!fs.existsSync(p)) {
    _logoPromise = Promise.resolve(null);
    return _logoPromise;
  }
  _logoPromise = loadImage(p).catch(() => null);
  return _logoPromise;
}

// True for cells inside any of the three 7×7 finder patterns
// (top-left, top-right, bottom-left). These get the orange tint so the
// QR has the blue+orange branding without hurting scan reliability.
function isFinderCell(r, c, size) {
  const inBox = (r0, c0) => r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7;
  return inBox(0, 0) || inBox(0, size - 7) || inBox(size - 7, 0);
}

export async function renderBrandedQrBuffer(uri, opts = {}) {
  const pixelSize = opts.size || 600;       // output PNG dimensions
  const margin   = opts.margin ?? 4;        // quiet zone in modules
  const qr = QRCode.create(uri || "", { errorCorrectionLevel: "H" });
  const modules = qr.modules;
  const size = modules.size;
  const data = modules.data;

  // Total grid we draw is `size + 2*margin` modules wide.
  const totalModules = size + margin * 2;
  const cell = Math.floor(pixelSize / totalModules);
  const drawSize = cell * totalModules;

  const canvas = createCanvas(drawSize, drawSize);
  const ctx = canvas.getContext("2d");

  // White background
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, drawSize, drawSize);

  // Draw modules
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const on = data[r * size + c];
      if (!on) continue;
      ctx.fillStyle = isFinderCell(r, c, size) ? ORANGE : BLUE;
      const x = (c + margin) * cell;
      const y = (r + margin) * cell;
      ctx.fillRect(x, y, cell, cell);
    }
  }

  // Logo overlay — centered, on a white circle with an orange ring.
  // Cap the logo at ~22% of the canvas so we stay within the H-level
  // correction budget (~30%).
  const logo = await loadLogo();
  if (logo) {
    const logoBox = Math.floor(drawSize * 0.22);
    const cx = drawSize / 2;
    const cy = drawSize / 2;
    const ringRadius  = logoBox / 2 + 6;
    const innerRadius = logoBox / 2;

    // Orange ring
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
    ctx.fillStyle = ORANGE;
    ctx.fill();

    // White cutout the logo sits on
    ctx.beginPath();
    ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
    ctx.fillStyle = WHITE;
    ctx.fill();

    // Logo (preserves aspect ratio inside a square)
    const lw = logo.width;
    const lh = logo.height;
    const scale = Math.min((logoBox * 0.85) / lw, (logoBox * 0.85) / lh);
    const w = lw * scale;
    const h = lh * scale;
    ctx.drawImage(logo, cx - w / 2, cy - h / 2, w, h);
  }

  return canvas.toBuffer("image/png");
}

// Same as renderBrandedQrBuffer but returns raw base64 (no `data:` prefix),
// matching what Evolution API's sendMedia accepts.
export async function renderBrandedQrBase64(uri, opts = {}) {
  const buf = await renderBrandedQrBuffer(uri, opts);
  return buf.toString("base64");
}
