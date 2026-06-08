/*
 * Génère les icônes PWA d'App Couple sans dépendance externe (zlib intégré).
 *
 * Dessin : cœur crème (paper) centré sur fond brique, coins arrondis.
 * Rendu supersamplé x4 puis moyenné → anti-aliasing propre.
 *
 * Usage : node scripts/generate-pwa-icons.mjs
 * Régénère public/icons/*.png. À relancer si la charte change.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "icons");
mkdirSync(OUT_DIR, { recursive: true });

// Palette Sauge & Brique (cf. globals.css)
const BRIQUE = [0xc5, 0x59, 0x4a];
const PAPER = [0xf0, 0xe5, 0xd0];

// CRC32 pour les chunks PNG
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
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgb) {
  // rgb : Uint8ClampedArray RGBA de taille*taille*4
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // couleur RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter none
    if (rgb.copy) {
      rgb.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
    } else {
      Buffer.from(rgb.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
    }
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Cœur : équation implicite (x²+y²-1)³ - x²y³ ≤ 0
function inHeart(nx, ny) {
  const x = nx;
  const y = -ny; // y vers le haut
  const a = x * x + y * y - 1;
  return a * a * a - x * x * y * y * y <= 0;
}

function render(size, { pad, bg, heart, rounded }) {
  const SS = 4; // supersampling
  const W = size * SS;
  const out = new Uint8ClampedArray(size * size * 4);
  const radius = rounded * SS; // rayon coins arrondis en px supersamplés
  // boîte du cœur : carré centré occupant (1 - 2*pad) de la largeur
  const heartHalf = (W * (1 - 2 * pad)) / 2;
  const cx = W / 2;
  const cy = W / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x * SS + sx + 0.5;
          const py = y * SS + sy + 0.5;
          // hors du carré à coins arrondis → transparent
          if (!insideRounded(px, py, W, radius)) continue;
          // dans le cœur ?
          const nx = (px - cx) / heartHalf;
          const ny = (py - cy) / heartHalf;
          const col = inHeart(nx, ny * 1.12) ? heart : bg;
          r += col[0]; g += col[1]; b += col[2]; count++;
        }
      }
      const total = SS * SS;
      const i = (y * size + x) * 4;
      if (count === 0) {
        out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0;
      } else {
        out[i] = r / count;
        out[i + 1] = g / count;
        out[i + 2] = b / count;
        out[i + 3] = Math.round((count / total) * 255);
      }
    }
  }
  return encodePng(size, Buffer.from(out.buffer));
}

function insideRounded(px, py, W, radius) {
  if (radius <= 0) return true;
  const minX = radius, maxX = W - radius;
  const minY = radius, maxY = W - radius;
  let dx = 0, dy = 0;
  if (px < minX) dx = minX - px; else if (px > maxX) dx = px - maxX;
  if (py < minY) dy = minY - py; else if (py > maxY) dy = py - maxY;
  return dx * dx + dy * dy <= radius * radius;
}

const targets = [
  // any : coins arrondis ~22%, cœur généreux
  { name: "icon-192.png", size: 192, pad: 0.18, rounded: 42, bg: BRIQUE, heart: PAPER },
  { name: "icon-512.png", size: 512, pad: 0.18, rounded: 112, bg: BRIQUE, heart: PAPER },
  // maskable : pleine bleed (pas de coins), cœur dans la safe zone (plus de pad)
  { name: "icon-maskable-512.png", size: 512, pad: 0.28, rounded: 0, bg: BRIQUE, heart: PAPER },
  // apple-touch : pleine bleed carré (iOS arrondit lui-même)
  { name: "apple-touch-icon.png", size: 180, pad: 0.2, rounded: 0, bg: BRIQUE, heart: PAPER },
];

for (const t of targets) {
  const png = render(t.size, t);
  writeFileSync(join(OUT_DIR, t.name), png);
  console.log(`✓ ${t.name} (${png.length} o)`);
}
console.log("Icônes PWA générées dans public/icons/");
