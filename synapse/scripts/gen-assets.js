/**
 * Procedural brand assets for Synapse — no design files needed.
 * Draws the "pulse chain" glyph (rising pixel staircase + center node,
 * Marathon-style glitch satellites) and encodes PNGs with zero deps.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------- minimal PNG encoder ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, pixelAt) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelAt(x, y);
      raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- the glyph, in a 16x16 design space ----------
const ACID = [200, 240, 60];
const VOID = [6, 7, 11];
// rising pulse chain: 2x2 steps, 3x3 center node, dim glitch pixels
const CELLS = [
  { x: 2, y: 11, w: 2, h: 2, a: 255 },
  { x: 4.5, y: 9, w: 2, h: 2, a: 255 },
  { x: 7, y: 6.5, w: 3, h: 3, a: 255 }, // the node
  { x: 10.5, y: 4.5, w: 2, h: 2, a: 255 },
  { x: 13, y: 2.5, w: 2, h: 2, a: 255 },
  { x: 12.5, y: 10.5, w: 1, h: 1, a: 120 }, // glitch satellites
  { x: 3, y: 4, w: 1, h: 1, a: 120 },
  { x: 10, y: 12.5, w: 1, h: 1, a: 70 },
];
function glyphAlpha(u, v) {
  for (const c of CELLS) {
    if (u >= c.x && u < c.x + c.w && v >= c.y && v < c.y + c.h) return c.a;
  }
  return 0;
}

function render(size, glyphFrac, opaqueBg) {
  const glyphPx = size * glyphFrac;
  const scale = glyphPx / 16;
  const off = (size - glyphPx) / 2;
  return encodePng(size, size, (x, y) => {
    const a = glyphAlpha((x - off) / scale, (y - off) / scale);
    if (a > 0) {
      if (!opaqueBg) return [ACID[0], ACID[1], ACID[2], a];
      const t = a / 255; // blend dim satellites against void
      return [
        Math.round(ACID[0] * t + VOID[0] * (1 - t)),
        Math.round(ACID[1] * t + VOID[1] * (1 - t)),
        Math.round(ACID[2] * t + VOID[2] * (1 - t)),
        255,
      ];
    }
    return opaqueBg ? [VOID[0], VOID[1], VOID[2], 255] : [0, 0, 0, 0];
  });
}

const out = path.join(__dirname, '..', 'assets');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon.png'), render(1024, 0.62, true));
fs.writeFileSync(path.join(out, 'adaptive-icon.png'), render(1024, 0.44, false));
fs.writeFileSync(path.join(out, 'splash-icon.png'), render(512, 0.8, false));
fs.writeFileSync(path.join(out, 'favicon.png'), render(48, 0.85, true));
console.log('assets generated:', fs.readdirSync(out).join(', '));
