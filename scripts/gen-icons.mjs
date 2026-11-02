// Gera os ícones PNG do PWA (prato esmaltado com broto) sem dependências.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function png(size, px) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; for (let x = 0; x < size; x++) { const [r, g, b, a] = px(x / size, y / size); const o = y * (size * 4 + 1) + 1 + x * 4; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a; } }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const anil = [29, 59, 114, 255], esm = [247, 248, 244, 255], ipe = [242, 182, 50, 255], folha = [63, 143, 79, 255];
const icon = (u, v) => {
  const dx = u - 0.5, dy = v - 0.5, d = Math.hypot(dx, dy);
  if (d > 0.5) return anil;
  if (d > 0.42) return anil;
  if (d > 0.38) return ipe;
  // broto: caule + duas folhas
  if (Math.abs(dx) < 0.025 && v > 0.42 && v < 0.72) return folha;
  const l1 = Math.hypot((u - 0.4) / 0.11, (v - 0.42) / 0.06), l2 = Math.hypot((u - 0.6) / 0.11, (v - 0.38) / 0.06);
  if (l1 < 1 || l2 < 1) return folha;
  if (v > 0.7 && v < 0.76 && Math.abs(dx) < 0.18) return [160, 103, 58, 255];
  return esm;
};
for (const s of [192, 512]) writeFileSync(new URL(`../public/icons/icon-${s}.png`, import.meta.url), png(s, icon));
console.log('ícones gerados');
