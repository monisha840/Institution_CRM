// Regenerate the browser/app icons from public/logo.png.
//
//   node scripts/make-icons.js
//
// Run this whenever the logo changes. The source logo is a wide PNG with
// transparent margins, and a browser asked to draw that at 16px squashes it,
// so this crops to the tight ink bounds and re-centres the mark in square
// canvases:
//
//   app/icon.png        512  transparent  — Next file convention, the tab icon
//   app/apple-icon.png  180  white bg     — iOS composites transparency on black
//   public/favicon.ico  16/32/48          — the bare /favicon.ico probe
//
// app/layout.jsx deliberately sets no `icons` metadata: doing so would
// override the file convention above.

const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs'), path = require('path');
const ROOT = process.cwd();

(async () => {
  const img = await loadImage(path.join(ROOT, 'public', 'logo.png'));
  // --- find the tight ink bounds so the mark fills the square instead of
  // floating inside the source file's transparent margins ---
  const probe = createCanvas(img.width, img.height);
  const pc = probe.getContext('2d');
  pc.drawImage(img, 0, 0);
  const d = pc.getImageData(0, 0, img.width, img.height).data;
  let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (d[(y * img.width + x) * 4 + 3] > 12) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  console.log(`source ${img.width}x${img.height} -> ink bounds ${cw}x${ch} at (${minX},${minY})`);

  // draw the cropped mark centred in a square, preserving aspect
  function square(size, pad = 0.08, bg = null) {
    const c = createCanvas(size, size), g = c.getContext('2d');
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, size, size); }
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    const avail = size * (1 - pad * 2);
    const scale = Math.min(avail / cw, avail / ch);
    const dw = cw * scale, dh = ch * scale;
    g.drawImage(img, minX, minY, cw, ch, (size - dw) / 2, (size - dh) / 2, dw, dh);
    return c;
  }

  const out = [];
  const write = (p, buf) => { fs.writeFileSync(path.join(ROOT, p), buf); out.push(`${p}  ${buf.length}B`); };

  // Next.js app-router conventions (auto-wired, and new URLs bust the cache)
  write('app/icon.png',       square(512).toBuffer('image/png'));
  write('app/apple-icon.png', square(180, 0.12, '#ffffff').toBuffer('image/png')); // iOS composites on black otherwise

  // classic /favicon.ico probe — multi-size ICO with embedded PNGs
  const sizes = [16, 32, 48];
  const pngs = sizes.map(s => square(s, s <= 16 ? 0.02 : 0.05).toBuffer('image/png'));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const dirs = sizes.map((s, i) => {
    const e = Buffer.alloc(16);
    e[0] = s >= 256 ? 0 : s; e[1] = s >= 256 ? 0 : s; e[2] = 0; e[3] = 0;
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    return e;
  });
  write('public/favicon.ico', Buffer.concat([header, ...dirs, ...pngs]));

  console.log(out.join('\n'));
})();
