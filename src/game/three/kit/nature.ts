// Natureza em 3D low-poly: árvores, frutíferas, pedras e minérios, capim, ervas, cogumelos,
// argila, areia, cristais e decoração. Cada tipo é uma geometria única (instanciável).
// Origem no centro da base; 1 unidade = 1 tile.
import * as THREE from 'three';
import { Kit, rng, tint } from './geo.ts';

/** Desloca vértices por ruído determinístico (posições iguais movem igual: sem rachaduras). */
function lumpy(g: THREE.BufferGeometry, amt: number, seed = 1) {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = Math.sin(x * 12.99 + y * 78.23 + z * 37.72 + seed * 9.1) * 43758.55;
    const k = 1 + ((h - Math.floor(h)) - 0.5) * amt;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}
const blob = (r: number, amt = 0.28, seed = 1, detail = 1) => lumpy(new THREE.IcosahedronGeometry(r, detail), amt, seed);

const BARK = '#8a5a35', BARK_D = '#6b4226';

function trunk(k: Kit, h: number, r: number, col = BARK) {
  k.cyl(r * 0.8, r, h, col, { p: [0, h / 2, 0], ao: 0.35, jitter: 0.08 }, 9);
  for (let i = 0; i < 4; i++) { const a = i * 1.7 + 0.4; k.cone(r * 0.45, r * 1.3, BARK_D, { p: [Math.cos(a) * r * 0.9, r * 0.35, Math.sin(a) * r * 0.9], r: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9] }, 5); }
}
function canopy(k: Kit, seed: number, cx: number, cy: number, R: number, col: string, n = 6, lite = false) {
  const r = rng(seed);
  const det = lite ? 0 : 1;
  k.add(blob(R, 0.25, seed, det), col, { p: [cx, cy, 0], wind: 0.18, jitter: 0.12 });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r(), e = r() * 0.8 - 0.1;
    const rr = R * (0.5 + r() * 0.25);
    k.add(blob(rr, 0.25, seed + i + 1, det), tint(col, (r() - 0.4) * 0.22), { p: [cx + Math.cos(a) * R * 0.72, cy + e * R * 0.6, Math.sin(a) * R * 0.72], wind: 0.18, jitter: 0.12 });
  }
  k.add(blob(R * 0.55, 0.2, seed + 50, det), tint(col, 0.18), { p: [cx - R * 0.15, cy + R * 0.62, R * 0.1], wind: 0.18 });
}

export function oak(seed = 3, col = '#5da443', fruit?: string, big = false, lite = false): THREE.BufferGeometry {
  const k = new Kit();
  const s = big ? 1.35 : 1;
  trunk(k, 1.0 * s, 0.17 * s, big ? '#7a4d2d' : BARK);
  k.cyl(0.05 * s, 0.07 * s, 0.6 * s, BARK, { p: [0.22 * s, 1.05 * s, 0], r: [0, 0, -0.7] }, 6);
  canopy(k, seed, 0, 1.45 * s, 0.62 * s, col, lite ? 4 : big ? 8 : 6, lite);
  if (fruit) {
    const r = rng(seed + 7);
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2, e = r() * 1.2 - 0.3;
      k.sphere(0.075, fruit, { p: [Math.cos(a) * Math.cos(e) * 0.72, 1.45 + Math.sin(e) * 0.55, Math.sin(a) * Math.cos(e) * 0.72], wind: 0.18 }, 8, 6);
    }
  }
  return k.build();
}

export function pine(seed = 4, col = '#2f6b45'): THREE.BufferGeometry {
  const k = new Kit();
  trunk(k, 0.6, 0.13, BARK_D);
  const r = rng(seed);
  for (let i = 0; i < 4; i++) {
    const y = 0.55 + i * 0.42, rad = 0.78 - i * 0.16;
    k.add(lumpy(new THREE.ConeGeometry(rad, 0.75, 8, 1), 0.12, seed + i), tint(col, i * 0.06 + (r() - 0.5) * 0.06), { p: [0, y + 0.3, 0], r: [0, r() * 3, 0], wind: 0.12, flat: true });
  }
  return k.build();
}

export function stump(big = false): THREE.BufferGeometry {
  const k = new Kit(); const s = big ? 1.35 : 1;
  k.cyl(0.16 * s, 0.2 * s, 0.28 * s, BARK, { p: [0, 0.14 * s, 0], ao: 0.4 }, 9);
  k.cyl(0.155 * s, 0.155 * s, 0.02, '#e2b27a', { p: [0, 0.285 * s, 0] }, 9);
  k.torus(0.08 * s, 0.008, '#c08a52', { p: [0, 0.297 * s, 0], r: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 3; i++) { const a = i * 2.1; k.cone(0.07, 0.2, BARK_D, { p: [Math.cos(a) * 0.17 * s, 0.05, Math.sin(a) * 0.17 * s], r: [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2] }, 5); }
  k.add(blob(0.07, 0.3, 3), '#5da443', { p: [0.14 * s, 0.3 * s, 0.05], wind: 0.2 });
  return k.build();
}

export function rock(r = 0.42, col = '#a7adb2', seed = 1, vein?: string): THREE.BufferGeometry {
  const k = new Kit();
  k.add(blob(r, 0.35, seed, 1), col, { p: [0, r * 0.55, 0], s: [1.15, 0.8, 1], jitter: 0.1, ao: 0.3, flat: true });
  k.add(blob(r * 0.5, 0.3, seed + 3, 0), tint(col, -0.08), { p: [r * 0.8, r * 0.25, r * 0.3], jitter: 0.1, flat: true });
  k.add(blob(r * 0.35, 0.3, seed + 5, 0), tint(col, 0.06), { p: [-r * 0.75, r * 0.2, -r * 0.2], flat: true });
  if (vein) {
    const rnd = rng(seed + 11);
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2, e = rnd() * 0.9;
      k.add(new THREE.OctahedronGeometry(r * 0.17, 0), vein, { p: [Math.cos(a) * Math.cos(e) * r * 0.95, r * 0.55 + Math.sin(e) * r * 0.6, Math.sin(a) * Math.cos(e) * r * 0.9], r: [rnd() * 3, rnd() * 3, 0], flat: true });
    }
  }
  return k.build();
}

export function rubble(col = '#a7adb2'): THREE.BufferGeometry {
  const k = new Kit(); const r = rng(9);
  for (let i = 0; i < 5; i++) k.add(blob(0.09 + r() * 0.06, 0.4, i, 0), tint(col, (r() - 0.5) * 0.2), { p: [(r() - 0.5) * 0.6, 0.05, (r() - 0.5) * 0.5], flat: true });
  return k.build();
}

export function crystal(): THREE.BufferGeometry {
  const k = new Kit();
  k.add(blob(0.36, 0.3, 4, 1), '#7d7a86', { p: [0, 0.18, 0], s: [1.2, 0.6, 1], flat: true, ao: 0.3 });
  for (const [x, z, h, a, c] of [[0, 0, 0.8, 0, '#8fdcff'], [0.18, 0.08, 0.55, 0.5, '#b3ecff'], [-0.16, 0.05, 0.6, -0.45, '#7fd6ff'], [0.02, -0.16, 0.45, -0.3, '#c9f3ff']] as const) {
    k.cyl(0.07, 0.09, h, c, { p: [x, 0.25 + h / 2, z], r: [a * 0.6, 0, a], flat: true }, 6);
    k.cone(0.07, 0.14, tint(c, 0.25), { p: [x + Math.sin(a) * -h * 0.5 * 0.6, 0.25 + h + 0.06, z], r: [a * 0.6, 0, a], flat: true }, 6);
  }
  return k.build();
}

export function tuft(col = '#8fcf4a', h = 0.42, n = 11, seed = 1, top?: string): THREE.BufferGeometry {
  const k = new Kit(); const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = r() * 0.16, hh = h * (0.6 + r() * 0.5);
    k.cone(0.035, hh, tint(col, (r() - 0.5) * 0.25), { p: [Math.cos(a) * d, hh / 2, Math.sin(a) * d], r: [(r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5], wind: 1.2, ao: 0.45 }, 4);
    if (top && i % 2 === 0) k.capsule(0.025, 0.08, top, { p: [Math.cos(a) * d, hh + 0.02, Math.sin(a) * d], wind: 1.2 });
  }
  return k.build();
}

export function herbBush(full: boolean): THREE.BufferGeometry {
  const k = new Kit();
  for (let i = 0; i < 5; i++) { const a = i * 1.26; k.add(blob(0.18, 0.3, i), i % 2 ? '#4f9a44' : '#5fae4c', { p: [Math.cos(a) * 0.16, 0.18, Math.sin(a) * 0.16], wind: 0.4, jitter: 0.1 }); }
  if (full) for (let i = 0; i < 7; i++) { const a = i * 0.9; k.sphere(0.04, '#c9a7ff', { p: [Math.cos(a) * 0.22, 0.32 + (i % 3) * 0.03, Math.sin(a) * 0.22], wind: 0.4 }, 6, 5); }
  return k.build();
}

export function mushrooms(): THREE.BufferGeometry {
  const k = new Kit();
  for (const [x, z, s, c] of [[0, 0, 1, '#d8434b'], [0.18, 0.1, 0.7, '#e06a4a'], [-0.15, 0.12, 0.6, '#d8434b']] as const) {
    k.cyl(0.05 * s, 0.06 * s, 0.18 * s, '#f3ead6', { p: [x, 0.09 * s, z] }, 8);
    k.add(new THREE.SphereGeometry(0.14 * s, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), c, { p: [x, 0.16 * s, z], s: [1, 0.8, 1] });
    for (let i = 0; i < 4; i++) { const a = i * 1.6; k.sphere(0.022 * s, '#fffaf0', { p: [x + Math.cos(a) * 0.08 * s, 0.25 * s, z + Math.sin(a) * 0.08 * s] }, 5, 4); }
  }
  return k.build();
}

export function mound(col: string, full: boolean): THREE.BufferGeometry {
  const k = new Kit();
  if (full) {
    k.add(lumpy(new THREE.SphereGeometry(0.45, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0.2, 3), col, { p: [0, 0, 0], s: [1, 0.55, 0.9], jitter: 0.12, ao: 0.3 });
    k.add(blob(0.12, 0.3, 2, 0), tint(col, -0.15), { p: [0.25, 0.08, 0.2], flat: true });
  } else {
    k.cyl(0.36, 0.3, 0.04, tint(col, -0.35), { p: [0, 0.01, 0] }, 12);
    k.torus(0.36, 0.06, col, { p: [0, 0.02, 0], r: [Math.PI / 2, 0, 0] });
  }
  return k.build();
}

export function wildflowers(full: boolean): THREE.BufferGeometry {
  const k = new Kit(); const r = rng(5);
  for (let i = 0; i < 9; i++) {
    const x = (r() - 0.5) * 0.7, z = (r() - 0.5) * 0.6, h = 0.18 + r() * 0.14;
    k.cyl(0.01, 0.012, h, '#5a9a3a', { p: [x, h / 2, z], wind: 1 }, 4);
    if (full) { const c = ['#f28cb1', '#fff176', '#ffffff', '#c9a7ff'][i % 4]; k.cyl(0.055, 0.04, 0.025, c, { p: [x, h, z], wind: 1 }, 6); k.cyl(0.02, 0.02, 0.03, '#f5b82e', { p: [x, h + 0.01, z], wind: 1 }, 5); }
    else k.sphere(0.025, '#7fb04a', { p: [x, h, z], wind: 1 }, 5, 4);
  }
  return k.build();
}

export function bush(berries?: string, seed = 6): THREE.BufferGeometry {
  const k = new Kit(); const r = rng(seed);
  for (let i = 0; i < 5; i++) { const a = i * 1.3 + r(); k.add(blob(0.26, 0.28, seed + i), tint('#4f9a44', (r() - 0.5) * 0.2), { p: [Math.cos(a) * 0.22, 0.24 + r() * 0.08, Math.sin(a) * 0.18], wind: 0.3, jitter: 0.1 }); }
  k.add(blob(0.25, 0.25, seed + 9), '#5aa94b', { p: [0, 0.42, 0], wind: 0.3 });
  if (berries) for (let i = 0; i < 8; i++) { const a = r() * 6.28; k.sphere(0.045, berries, { p: [Math.cos(a) * 0.36, 0.25 + r() * 0.3, Math.sin(a) * 0.3], wind: 0.3 }, 6, 5); }
  return k.build();
}

export function logPile(): THREE.BufferGeometry {
  const k = new Kit();
  for (const [x, y, z] of [[-0.14, 0.1, 0], [0.14, 0.1, 0], [0, 0.27, 0]] as const) {
    k.cyl(0.1, 0.1, 0.8, BARK, { p: [x, y, z], r: [Math.PI / 2, 0, 0], jitter: 0.06 }, 9);
    k.cyl(0.085, 0.085, 0.805, '#e2b27a', { p: [x, y, z], r: [Math.PI / 2, 0, 0] }, 9);
  }
  return k.build();
}

export function pebbles(): THREE.BufferGeometry {
  const k = new Kit(); const r = rng(8);
  for (let i = 0; i < 4; i++) k.add(blob(0.06 + r() * 0.05, 0.3, i, 0), tint('#b7bcc0', (r() - 0.5) * 0.2), { p: [(r() - 0.5) * 0.5, 0.03, (r() - 0.5) * 0.4], s: [1, 0.6, 1], flat: true });
  return k.build();
}

export function fern(): THREE.BufferGeometry {
  const k = new Kit();
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; k.box(0.08, 0.02, 0.42, i % 2 ? '#4f9a44' : '#5fae4c', { p: [Math.cos(a) * 0.17, 0.14, Math.sin(a) * 0.17], r: [0.6, -a + Math.PI / 2, 0], wind: 1.4 }, 0); }
  return k.build();
}

export function lily(): THREE.BufferGeometry {
  const k = new Kit();
  k.cyl(0.22, 0.22, 0.02, '#5fa83e', { p: [0, 0, 0] }, 12);
  k.sphere(0.05, '#f7a6c4', { p: [0.06, 0.04, 0.02], s: [1, 0.7, 1] }, 6, 5);
  return k.build();
}

/** Tipos de nó do mundo → [cheio, esgotado]. */
export function nodeGeometries(): Record<string, [THREE.BufferGeometry, THREE.BufferGeometry]> {
  return {
    tree_oak: [oak(3), stump()],
    tree_big: [oak(9, '#3f8a3e', undefined, true), stump(true)],
    apple_tree: [oak(5, '#6fb04c', '#e53935'), oak(5, '#6fb04c')],
    orange_tree: [oak(6, '#5d9e45', '#fb8c00'), oak(6, '#5d9e45')],
    peach_tree: [oak(8, '#7cb85a', '#ffab91'), oak(8, '#7cb85a')],
    grass: [tuft('#8fcf4a', 0.5, 14, 1), tuft('#8fcf4a', 0.12, 8, 2)],
    reeds: [tuft('#7d9a3a', 0.8, 12, 3, '#8d5a33'), tuft('#7d9a3a', 0.15, 8, 4)],
    herb_bush: [herbBush(true), herbBush(false)],
    mushroom: [mushrooms(), pebbles()],
    clay: [mound('#c97b4a', true), mound('#c97b4a', false)],
    sand: [mound('#ead69e', true), mound('#ead69e', false)],
    rock_small: [rock(0.36, '#a7adb2', 1), rubble('#a7adb2')],
    rock_big: [rock(0.6, '#959ba2', 2), rubble('#959ba2')],
    coal: [rock(0.4, '#7a7c82', 4, '#2b2b30'), rubble('#7a7c82')],
    copper: [rock(0.4, '#9aa0a6', 5, '#e08a42'), rubble('#9aa0a6')],
    iron: [rock(0.4, '#958d88', 6, '#dfe5ea'), rubble('#958d88')],
    gold: [rock(0.55, '#8e877a', 7, '#f6c445'), rubble('#8e877a')],
    crystal: [crystal(), rubble('#7d7a86')],
    wildflower: [wildflowers(true), wildflowers(false)],
  };
}

/** Decoração (não interativa). */
export function decorGeometries(): Record<string, THREE.BufferGeometry> {
  return {
    pine: pine(4), pine2: pine(6, '#3b7a4e'), oak_d: oak(12, '#58a040', undefined, false, true), oak_d2: oak(14, '#64aa48', undefined, false, true),
    bush: bush(), berrybush: bush('#7b3fa0', 7), flowers: wildflowers(true), pebbles: pebbles(), fern: fern(),
    log: logPile(), mush: mushrooms(), stone: rock(0.22, '#adb2b7', 21), lily: lily(),
    tuft: tuft('#86c457', 0.3, 7, 11), tuft2: tuft('#9ad15f', 0.24, 6, 12),
  };
}
