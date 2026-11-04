// Construções 3D por especificação: fundação, paredes com textura em relevo (tábuas, tijolo,
// reboco com enxaimel, pedra), telhado de telhas em fileiras, portas, janelas com floreiras,
// chaminé, placa do produto e adereços de cada ofício. Origem = canto do lote (x, z), frente em +z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Kit, rng, tint, type V3 } from './geo.ts';
import type { BuildingDef } from '../../../data/catalog.ts';

type Roof = 'gable' | 'hip' | 'barn' | 'shed' | 'flat' | 'dome';
type Mat = 'plank' | 'brick' | 'plaster' | 'stone';
interface Spec { roof: Roof; mat: Mat; wallH: number; chimney?: boolean }
const SPECS: Record<string, Spec> = {
  farmhouse: { roof: 'gable', mat: 'plank', wallH: 1.45, chimney: true },
  barn: { roof: 'barn', mat: 'plank', wallH: 1.5 },
  sawmill: { roof: 'shed', mat: 'plank', wallH: 1.25 },
  bakery: { roof: 'gable', mat: 'plaster', wallH: 1.35, chimney: true },
  carpentry: { roof: 'gable', mat: 'plank', wallH: 1.2 },
  kitchen: { roof: 'gable', mat: 'plaster', wallH: 1.3, chimney: true },
  weaving: { roof: 'hip', mat: 'plaster', wallH: 1.3 },
  toolshed: { roof: 'shed', mat: 'plank', wallH: 1.1 },
  pottery: { roof: 'dome', mat: 'brick', wallH: 1.1, chimney: true },
  glassworks: { roof: 'flat', mat: 'brick', wallH: 1.5, chimney: true },
  oil_press: { roof: 'gable', mat: 'stone', wallH: 1.25 },
  warehouse: { roof: 'barn', mat: 'brick', wallH: 1.55 },
  foundry: { roof: 'flat', mat: 'brick', wallH: 1.45, chimney: true },
  smithy: { roof: 'gable', mat: 'stone', wallH: 1.25, chimney: true },
  great_workshop: { roof: 'barn', mat: 'plank', wallH: 1.8 },
  florist: { roof: 'gable', mat: 'plaster', wallH: 1.3 },
  jewelry: { roof: 'hip', mat: 'stone', wallH: 1.35 },
};

export interface BuildingModel {
  opaque: THREE.BufferGeometry;
  glass?: THREE.BufferGeometry;
  /** peças animadas (pás do moinho) com seu pivô */
  blades?: { geo: THREE.BufferGeometry; pivot: V3 };
  anchors: { smoke?: V3; top: V3; door: V3; sign?: V3 };
  /** caixa de colisão em coordenadas locais [x0, z0, x1, z1] */
  solid: [number, number, number, number];
}

const WOOD = '#a8713f', WOOD_D = '#7a4b2a', WOOD_L = '#c9935a', STONE = '#9aa0a6', WHITE = '#f6f1e4';

class B {
  k = new Kit();
  g = new Kit();
  r: () => number;
  constructor(seed: number) { this.r = rng(seed); }
}

// ---------------------------------------------------------------- peças
function windowAt(b: B, x: number, y: number, z: number, face: 'front' | 'side', sideSign = 1, shutter = '#3f8a4a', w = 0.42, h = 0.46) {
  const rot: V3 = face === 'front' ? [0, 0, 0] : [0, sideSign * Math.PI / 2, 0];
  const off = (dx: number, dy: number, dz: number): V3 => face === 'front' ? [x + dx, y + dy, z + dz] : [x + dz * sideSign, y + dy, z - dx * sideSign];
  b.k.box(w + 0.1, h + 0.1, 0.06, WHITE, { p: off(0, 0, 0.01), r: rot }, 0.02);
  b.g.box(w - 0.04, h - 0.04, 0.03, '#ffffff', { p: off(0, 0, 0.035), r: rot }, 0);
  b.k.box(0.03, h - 0.04, 0.03, WHITE, { p: off(0, 0, 0.05), r: rot }, 0);
  b.k.box(w - 0.04, 0.03, 0.03, WHITE, { p: off(0, 0, 0.05), r: rot }, 0);
  for (const s of [-1, 1]) b.k.box(0.17, h + 0.04, 0.04, shutter, { p: off(s * (w / 2 + 0.12), 0, 0.03), r: rot }, 0.015);
  // floreira
  b.k.box(w + 0.12, 0.1, 0.14, WOOD_D, { p: off(0, -h / 2 - 0.07, 0.09), r: rot }, 0.02);
  for (let i = 0; i < 4; i++) b.k.sphere(0.05, ['#e2574c', '#f6c445', '#f28cb1', '#ffffff'][i], { p: off(-w / 2 + 0.06 + i * (w - 0.1) / 3, -h / 2 + 0.0, 0.1), wind: 0.4 }, 6, 5);
}

function doorAt(b: B, x: number, z: number, col: string, w = 0.5, h = 0.86, awning?: string) {
  b.k.box(w + 0.14, h + 0.08, 0.08, WOOD_D, { p: [x, 0.18 + h / 2 + 0.02, z + 0.01] }, 0.02);
  b.k.box(w, h, 0.07, col, { p: [x, 0.18 + h / 2, z + 0.04] }, 0.02);
  for (const dx of [-w / 4, w / 4]) b.k.box(0.02, h - 0.1, 0.02, tint(col, -0.25), { p: [x + dx, 0.18 + h / 2, z + 0.08] }, 0);
  b.k.sphere(0.035, '#f4c84a', { p: [x + w * 0.32, 0.18 + h * 0.48, z + 0.1] }, 6, 5);
  b.k.box(w + 0.3, 0.07, 0.34, STONE, { p: [x, 0.04, z + 0.22] }, 0.03);
  if (awning) b.k.box(w + 0.34, 0.06, 0.32, awning, { p: [x, 0.18 + h + 0.12, z + 0.15], r: [0.32, 0, 0] }, 0.02);
}

function wallTexture(b: B, mat: Mat, col: string, x0: number, x1: number, z0: number, z1: number, h: number) {
  const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, y0 = 0.18;
  if (mat === 'plank') {
    for (let y = y0 + 0.16; y < y0 + h - 0.05; y += 0.17) {
      b.k.box(W + 0.02, 0.018, 0.02, tint(col, -0.18), { p: [cx, y, z1 + 0.005] }, 0);
      b.k.box(0.02, 0.018, D + 0.02, tint(col, -0.18), { p: [x0 - 0.005, y, cz] }, 0);
      b.k.box(0.02, 0.018, D + 0.02, tint(col, -0.18), { p: [x1 + 0.005, y, cz] }, 0);
    }
  } else if (mat === 'brick') {
    for (let row = 0, y = y0 + 0.1; y < y0 + h - 0.06; y += 0.13, row++) {
      b.k.box(W + 0.015, 0.012, 0.015, tint(col, 0.35), { p: [cx, y, z1 + 0.004] }, 0);
      for (let xx = x0 + (row % 2 ? 0.16 : 0.32); xx < x1 - 0.05; xx += 0.32) b.k.box(0.012, 0.12, 0.015, tint(col, 0.35), { p: [xx, y + 0.065, z1 + 0.004] }, 0);
    }
  } else if (mat === 'plaster') {
    const beam = '#7a4b2a';
    b.k.box(W + 0.02, 0.07, 0.04, beam, { p: [cx, y0 + h * 0.52, z1 + 0.01] }, 0.01);
    for (const xx of [x0 + 0.05, x1 - 0.05]) b.k.box(0.08, h, 0.04, beam, { p: [xx, y0 + h / 2, z1 + 0.012] }, 0.01);
    b.k.box(0.06, h * 0.55, 0.035, beam, { p: [x0 + W * 0.22, y0 + h * 0.26, z1 + 0.012], r: [0, 0, 0.6] }, 0.01);
    b.k.box(0.06, h * 0.55, 0.035, beam, { p: [x1 - W * 0.22, y0 + h * 0.26, z1 + 0.012], r: [0, 0, -0.6] }, 0.01);
  } else {
    const r = b.r;
    for (let i = 0; i < Math.round(W * 6); i++) {
      const xx = x0 + 0.1 + r() * (W - 0.2), y = y0 + 0.1 + r() * (h - 0.2);
      b.k.box(0.16 + r() * 0.1, 0.1 + r() * 0.06, 0.05, tint(col, (r() - 0.5) * 0.25), { p: [xx, y, z1 + 0.01] }, 0.02);
    }
  }
  // cantos e rodapé
  for (const [xx, zz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) b.k.box(0.1, h + 0.02, 0.1, mat === 'plank' ? WOOD_D : tint(col, -0.22), { p: [xx, y0 + h / 2, zz] }, 0.02);
}

/** Telhado de duas águas com telhas em fileiras (cumeeira ao longo de x). */
function gableRoof(b: B, x0: number, x1: number, z0: number, z1: number, y: number, rise: number, col: string) {
  const W = x1 - x0 + 0.36, D = z1 - z0 + 0.5, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const half = D / 2, slope = Math.atan2(rise, half), len = Math.hypot(half, rise);
  b.k.prism(D - 0.4, rise - 0.05, W - 0.5, tint(col, -0.1), { p: [cx, y, cz], r: [0, Math.PI / 2, 0] });
  const rows = 6;
  for (const s of [-1, 1]) for (let i = 0; i < rows; i++) {
    const t = (i + 0.5) / rows;
    const zz = cz + s * half * (1 - t), yy = y + rise * t;
    b.k.box(W, 0.06, len / rows + 0.06, tint(col, (i % 2 ? -0.05 : 0.04) + (s > 0 ? 0.02 : -0.08)), { p: [cx, yy + 0.02, zz], r: [s * slope, 0, 0], jitter: 0.05 }, 0.025);
  }
  b.k.box(W + 0.04, 0.09, 0.14, tint(col, -0.3), { p: [cx, y + rise + 0.03, cz] }, 0.04);
  // oitões
  for (const s of [-1, 1]) b.k.prism(D - 0.5, rise - 0.08, 0.06, tint(col, -0.2), { p: [cx + s * (x1 - x0) / 2, y, cz], r: [0, Math.PI / 2, 0] });
}

function hipRoof(b: B, x0: number, x1: number, z0: number, z1: number, y: number, rise: number, col: string) {
  const W = x1 - x0 + 0.4, D = z1 - z0 + 0.5, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1); g.rotateY(Math.PI / 4);
  b.k.add(g, col, { p: [cx, y + rise / 2, cz], s: [W, rise, D], flat: true, jitter: 0.06 });
  for (let i = 1; i < 4; i++) { const t = i / 4; b.k.box(W * (1 - t) + 0.02, 0.04, D * (1 - t) + 0.02, tint(col, -0.12), { p: [cx, y + rise * t - 0.02, cz] }, 0.01); }
  b.k.sphere(0.07, tint(col, -0.3), { p: [cx, y + rise, cz] }, 6, 5);
}

function barnRoof(b: B, x0: number, x1: number, z0: number, z1: number, y: number, rise: number, col: string) {
  const W = x1 - x0 + 0.3, D = z1 - z0 + 0.4, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const pts: [number, number][] = [[-W / 2 - 0.1, 0], [-W / 2 * 0.72, rise * 0.62], [0, rise], [W / 2 * 0.72, rise * 0.62], [W / 2 + 0.1, 0], [W / 2 - 0.05, 0], [W / 2 * 0.68, rise * 0.56], [0, rise - 0.1], [-W / 2 * 0.68, rise * 0.56], [-W / 2 + 0.05, 0]];
  b.k.extrude(pts, D, col, { p: [cx, y, cz], jitter: 0.04 });
  // fachada do oitão (parede) e friso branco
  b.k.extrude([[-W / 2 + 0.1, 0], [-W / 2 * 0.68, rise * 0.54], [0, rise - 0.14], [W / 2 * 0.68, rise * 0.54], [W / 2 - 0.1, 0]], D - 0.3, tint(col, 0.05), { p: [cx, y, cz] });
  for (const s of [-1, 1]) {
    b.k.box(W * 0.42, 0.06, 0.05, WHITE, { p: [cx + s * W * 0.18, y + rise * 0.81, cz + D / 2 + 0.01], r: [0, 0, s * -0.43] }, 0.01);
    b.k.box(W * 0.33, 0.06, 0.05, WHITE, { p: [cx + s * W * 0.43, y + rise * 0.31, cz + D / 2 + 0.01], r: [0, 0, s * -1.08] }, 0.01);
  }
  // janela do sótão
  b.k.box(0.5, 0.42, 0.05, WHITE, { p: [cx, y + rise * 0.45, cz + D / 2 - 0.1] }, 0.02);
  b.k.box(0.4, 0.32, 0.05, '#5a3820', { p: [cx, y + rise * 0.45, cz + D / 2 - 0.08] }, 0.01);
}

function shedRoof(b: B, x0: number, x1: number, z0: number, z1: number, y: number, rise: number, col: string) {
  const W = x1 - x0 + 0.4, D = z1 - z0 + 0.6, cx = (x0 + x1) / 2;
  const a = Math.atan2(rise, D);
  for (let i = 0; i < 5; i++) b.k.box(W, 0.07, D / 5 + 0.05, tint(col, i % 2 ? -0.05 : 0.03), { p: [cx, y + rise * (1 - (i + 0.5) / 5) + 0.04, z0 - 0.3 + (i + 0.5) * D / 5], r: [a, 0, 0] }, 0.02);
}

function chimney(b: B, x: number, y: number, z: number, h = 0.7): V3 {
  b.k.box(0.26, h, 0.26, '#b65a3c', { p: [x, y + h / 2, z], jitter: 0.08 }, 0.03);
  b.k.box(0.32, 0.08, 0.32, '#8d4a32', { p: [x, y + h + 0.02, z] }, 0.02);
  return [x, y + h + 0.15, z];
}

function hay(b: B, x: number, z: number) {
  b.k.cyl(0.24, 0.24, 0.42, '#e9c46a', { p: [x, 0.24, z], r: [0, 0, Math.PI / 2], jitter: 0.12 }, 12);
  b.k.torus(0.24, 0.015, '#c08a3a', { p: [x - 0.1, 0.24, z], r: [0, Math.PI / 2, 0] });
  b.k.torus(0.24, 0.015, '#c08a3a', { p: [x + 0.1, 0.24, z], r: [0, Math.PI / 2, 0] });
}
function crate(b: B, x: number, z: number, s = 0.3, y = 0) {
  b.k.box(s, s, s, WOOD_L, { p: [x, y + s / 2, z], jitter: 0.06 }, 0.02);
  b.k.box(s + 0.01, 0.04, s + 0.01, WOOD_D, { p: [x, y + s * 0.5, z] }, 0.005);
}
function barrel(b: B, x: number, z: number) {
  b.k.lathe([[0, 0], [0.16, 0], [0.19, 0.18], [0.16, 0.38], [0, 0.38]], WOOD, { p: [x, 0, z] }, 10);
  for (const y of [0.07, 0.31]) b.k.torus(0.172, 0.012, '#5d6166', { p: [x, y, z], r: [Math.PI / 2, 0, 0] });
}
function pot(b: B, x: number, z: number, plant = true) {
  b.k.lathe([[0, 0], [0.1, 0], [0.13, 0.18], [0.12, 0.2], [0, 0.2]], '#c4683f', { p: [x, 0, z] }, 10);
  if (plant) b.k.sphere(0.12, '#5da443', { p: [x, 0.28, z], wind: 0.4 }, 8, 6);
}
function fenceRail(b: B, x0: number, x1: number, z: number) {
  for (let x = x0; x <= x1 + 0.01; x += 0.5) b.k.box(0.07, 0.42, 0.07, WOOD_L, { p: [x, 0.21, z] }, 0.015);
  for (const y of [0.18, 0.34]) b.k.box(x1 - x0, 0.05, 0.04, WOOD_L, { p: [(x0 + x1) / 2, y, z] }, 0.01);
}

// ---------------------------------------------------------------- casas genéricas
function house(def: BuildingDef, b: B, spec: Spec): BuildingModel {
  const W = def.spot.w, D = def.spot.h;
  const wallCol = def.wall, roofCol = def.roof;
  const x0 = 0.18, x1 = W - 0.18, z0 = 0.35, z1 = D - 0.38;
  const h = spec.wallH, y0 = 0.18, cx = W / 2;
  b.k.box(W - 0.1, 0.2, D - 0.42, '#a3a7a2', { p: [cx, 0.1, (z0 + z1) / 2], jitter: 0.1 }, 0.04);
  b.k.box(x1 - x0, h, z1 - z0, wallCol, { p: [cx, y0 + h / 2, (z0 + z1) / 2], ao: 0.25, jitter: 0.04 }, 0.05);
  wallTexture(b, spec.mat, wallCol, x0, x1, z0, z1, h);
  const doorX = Math.floor(W / 2) + 0.5;
  const top = y0 + h;
  let rise = Math.min(1.3, 0.55 + (z1 - z0) * 0.32);
  const anchors: BuildingModel['anchors'] = { top: [cx, top + rise + 0.4, (z0 + z1) / 2], door: [doorX, 0, D + 0.1] };
  if (spec.roof === 'gable') gableRoof(b, x0, x1, z0, z1, top, rise, roofCol);
  else if (spec.roof === 'hip') hipRoof(b, x0, x1, z0, z1, top, rise, roofCol);
  else if (spec.roof === 'barn') { rise = Math.min(1.9, (x1 - x0) * 0.42); barnRoof(b, x0, x1, z0, z1, top, rise, roofCol); anchors.top = [cx, top + rise + 0.4, (z0 + z1) / 2]; }
  else if (spec.roof === 'shed') { rise = 0.55; shedRoof(b, x0, x1, z0, z1, top, rise, roofCol); }
  else if (spec.roof === 'flat') { b.k.box(x1 - x0 + 0.24, 0.14, z1 - z0 + 0.24, roofCol, { p: [cx, top + 0.07, (z0 + z1) / 2] }, 0.03); b.k.box(x1 - x0 + 0.3, 0.1, 0.12, tint(roofCol, -0.2), { p: [cx, top + 0.18, z1 + 0.1] }, 0.02); rise = 0.2; }
  else if (spec.roof === 'dome') { b.k.add(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), roofCol, { p: [cx, top - 0.05, (z0 + z1) / 2], s: [(x1 - x0) / 2 + 0.15, 0.9, (z1 - z0) / 2 + 0.15], jitter: 0.06 }); rise = 0.9; }
  if (spec.chimney) anchors.smoke = chimney(b, x1 - 0.45, top + rise * 0.45, (z0 + z1) / 2 - 0.15, spec.roof === 'flat' ? 1.1 : 0.8);
  // fachada: porta e janelas
  const barnDoor = spec.roof === 'barn';
  if (barnDoor) {
    const dw = Math.min(1.3, W * 0.32), dh = Math.min(1.35, h * 0.85);
    b.k.box(dw + 0.12, dh + 0.1, 0.06, WHITE, { p: [doorX, y0 + dh / 2, z1 + 0.02] }, 0.02);
    b.k.box(dw, dh, 0.06, tint(roofCol, -0.15), { p: [doorX, y0 + dh / 2, z1 + 0.04] }, 0.02);
    for (const s of [-1, 1]) b.k.box(0.07, Math.hypot(dw, dh) * 0.95, 0.04, WHITE, { p: [doorX, y0 + dh / 2, z1 + 0.08], r: [0, 0, s * Math.atan2(dw, dh)] }, 0.01);
    b.k.box(0.5, 0.07, 0.34, STONE, { p: [doorX, 0.04, z1 + 0.3] }, 0.02);
  } else doorAt(b, doorX, z1, tint(roofCol, -0.25), 0.5, Math.min(0.9, h * 0.66), def.id === 'bakery' || def.id === 'florist' ? '#e2574c' : undefined);
  const wy = y0 + h * 0.58;
  const slots = [doorX - 1, doorX + 1].filter((x) => x > x0 + 0.35 && x < x1 - 0.35);
  if (!barnDoor) for (const x of slots) windowAt(b, x, wy, z1, 'front');
  else for (const x of [x0 + 0.55, x1 - 0.55]) windowAt(b, x, wy, z1, 'front', 1, WHITE, 0.36, 0.36);
  if (D >= 3) for (const s of [-1, 1]) windowAt(b, s < 0 ? x0 : x1, wy, (z0 + z1) / 2, 'side', s);
  anchors.sign = [doorX + 0.75, y0 + h * 0.88, z1 + 0.12];
  return { opaque: b.k.build(), glass: b.g.empty ? undefined : b.g.build(), anchors, solid: [0.1, z0 - 0.05, W - 0.1, z1 + 0.05] };
}

// ---------------------------------------------------------------- especiais
function special(def: BuildingDef, b: B): BuildingModel | null {
  const W = def.spot.w, D = def.spot.h, cx = W / 2, cz = D / 2;
  const roof = def.roof, body = def.wall;
  const done = (anchors: BuildingModel['anchors'], solid: BuildingModel['solid'], blades?: BuildingModel['blades']): BuildingModel =>
    ({ opaque: b.k.build(), glass: b.g.empty ? undefined : b.g.build(), anchors, solid, blades });
  switch (def.id) {
    case 'well': {
      b.k.cyl(0.62, 0.68, 0.6, STONE, { p: [cx, 0.3, cz], jitter: 0.12, ao: 0.3, flat: true }, 12);
      b.k.cyl(0.5, 0.5, 0.02, '#3b86b5', { p: [cx, 0.52, cz] }, 12);
      b.k.torus(0.62, 0.07, tint(STONE, -0.1), { p: [cx, 0.6, cz], r: [Math.PI / 2, 0, 0] });
      for (const s of [-1, 1]) b.k.box(0.1, 1.35, 0.1, WOOD, { p: [cx + s * 0.55, 0.95, cz] }, 0.02);
      b.k.cyl(0.05, 0.05, 1.2, WOOD_D, { p: [cx, 1.35, cz], r: [0, 0, Math.PI / 2] }, 8);
      b.k.box(0.06, 0.25, 0.06, WOOD_D, { p: [cx + 0.68, 1.25, cz + 0.1] }, 0.01);
      b.k.cyl(0.11, 0.09, 0.16, '#8d5a33', { p: [cx, 0.95, cz] }, 10);
      b.k.cyl(0.005, 0.005, 0.35, '#d9c9a0', { p: [cx, 1.15, cz] }, 4);
      gableRoof(b, cx - 0.62, cx + 0.62, cz - 0.5, cz + 0.5, 1.55, 0.55, roof);
      return done({ top: [cx, 2.4, cz], door: [cx, 0, D + 0.1] }, [cx - 0.7, cz - 0.7, cx + 0.7, cz + 0.7]);
    }
    case 'workbench': {
      b.k.box(2.0, 0.12, 0.9, WOOD_L, { p: [cx, 0.85, cz], jitter: 0.08 }, 0.03);
      for (const [dx, dz] of [[-0.9, -0.35], [0.9, -0.35], [-0.9, 0.35], [0.9, 0.35]]) b.k.box(0.1, 0.8, 0.1, WOOD, { p: [cx + dx, 0.4, cz + dz] }, 0.02);
      b.k.box(1.9, 0.06, 0.8, WOOD_D, { p: [cx, 0.3, cz] }, 0.02);
      b.k.box(0.5, 0.08, 0.2, '#8e979e', { p: [cx - 0.45, 0.95, cz + 0.1] }, 0.02);
      b.k.cyl(0.18, 0.18, 0.03, '#c9d0d6', { p: [cx + 0.5, 0.92, cz], r: [Math.PI / 2, 0, 0] }, 14);
      for (let i = 0; i < 3; i++) b.k.box(0.7, 0.05, 0.12, WOOD_L, { p: [cx + 0.1, 0.35 + i * 0.06, cz - 0.1] }, 0.01);
      for (const s of [-1, 1]) b.k.box(0.1, 1.9, 0.1, WOOD_D, { p: [cx + s * 1.15, 0.95, cz - 0.5] }, 0.02);
      shedRoof(b, cx - 1.2, cx + 1.2, cz - 0.6, cz + 0.4, 1.85, 0.25, roof);
      return done({ top: [cx, 2.5, cz], door: [cx + 0.5, 0, D + 0.1] }, [cx - 1.1, cz - 0.5, cx + 1.1, cz + 0.5]);
    }
    case 'sales_cart': case 'market': {
      const big = def.id === 'market';
      const w = big ? 2.6 : 2.2;
      b.k.box(w, 0.5, 1.0, WOOD_L, { p: [cx, 0.6, cz], jitter: 0.08 }, 0.04);
      b.k.box(w + 0.1, 0.08, 1.1, WOOD_D, { p: [cx, 0.87, cz] }, 0.02);
      for (let i = 0; i < (big ? 4 : 3); i++) {
        const x = cx - w / 2 + 0.38 + i * ((w - 0.76) / ((big ? 4 : 3) - 1));
        crate(b, x, cz + 0.15, 0.36, 0.9);
        for (let j = 0; j < 5; j++) b.k.sphere(0.07, ['#e53935', '#f6c445', '#7cb342', '#fb8c00'][i % 4], { p: [x - 0.1 + (j % 3) * 0.1, 1.3 + Math.floor(j / 3) * 0.06, cz + 0.08 + (j % 2) * 0.12] }, 6, 5);
      }
      if (!big) for (const s of [-1, 1]) { b.k.cyl(0.32, 0.32, 0.08, WOOD_D, { p: [cx + s * 0.75, 0.32, cz + 0.55], r: [Math.PI / 2, 0, 0] }, 12); b.k.cyl(0.08, 0.08, 0.1, '#5d6166', { p: [cx + s * 0.75, 0.32, cz + 0.58], r: [Math.PI / 2, 0, 0] }, 8); }
      else for (const [dx, dz] of [[-1.2, -0.45], [1.2, -0.45], [-1.2, 0.45], [1.2, 0.45]]) b.k.box(0.12, 0.4, 0.12, WOOD, { p: [cx + dx, 0.2, cz + dz] }, 0.02);
      for (const s of [-1, 1]) for (const dz of [-0.45, 0.45]) b.k.box(0.07, 1.5, 0.07, WOOD_D, { p: [cx + s * (w / 2 - 0.05), 1.55, cz + dz] }, 0.015);
      // toldo listrado
      const n = big ? 10 : 8;
      for (let i = 0; i < n; i++) b.k.box(w / n + 0.01, 0.05, 1.4, i % 2 ? WHITE : roof, { p: [cx - w / 2 + (i + 0.5) * w / n, 2.35, cz + 0.15], r: [0.28, 0, 0] }, 0.01);
      for (let i = 0; i < n; i++) b.k.cone(w / n / 2, 0.16, i % 2 ? WHITE : roof, { p: [cx - w / 2 + (i + 0.5) * w / n, 2.08, cz + 0.84], r: [Math.PI, 0, 0] }, 6);
      if (big) { barrel(b, cx + 1.55, cz + 0.3); crate(b, cx - 1.6, cz + 0.35, 0.34); crate(b, cx - 1.6, cz - 0.1, 0.3); }
      return done({ top: [cx, 2.9, cz], door: [cx, 0, D + 0.1], sign: [cx, 2.55, cz + 0.85] }, [cx - w / 2, cz - 0.5, cx + w / 2, cz + 0.55]);
    }
    case 'order_board': {
      // balcão de atendimento: bancada com toldo listrado, sino, caixa e mercadorias
      b.k.box(1.8, 0.75, 0.6, WOOD, { p: [cx, 0.38, cz + 0.15], jitter: 0.08 }, 0.04);
      b.k.box(1.95, 0.08, 0.72, WOOD_L, { p: [cx, 0.79, cz + 0.15] }, 0.02);
      for (let i = 0; i < 5; i++) b.k.box(0.03, 0.6, 0.02, WOOD_D, { p: [cx - 0.72 + i * 0.36, 0.38, cz + 0.46] }, 0.005);
      for (const s of [-1, 1]) for (const dz of [-0.35, 0.45]) b.k.box(0.1, 2.0, 0.1, WOOD_D, { p: [cx + s * 0.9, 1.0, cz + dz] }, 0.02);
      const n = 8;
      for (let i = 0; i < n; i++) b.k.box(2.0 / n + 0.01, 0.05, 1.2, i % 2 ? WHITE : roof, { p: [cx - 1 + (i + 0.5) * 2 / n, 2.05, cz + 0.1], r: [0.22, 0, 0] }, 0.01);
      for (let i = 0; i < n; i++) b.k.cone(2 / n / 2, 0.14, i % 2 ? WHITE : roof, { p: [cx - 1 + (i + 0.5) * 2 / n, 1.84, cz + 0.68], r: [Math.PI, 0, 0] }, 6);
      b.k.cyl(0.07, 0.11, 0.1, '#e0a81c', { p: [cx + 0.55, 0.88, cz + 0.25] }, 10); b.k.sphere(0.025, '#e0a81c', { p: [cx + 0.55, 0.96, cz + 0.25] }, 6, 5);
      b.k.box(0.32, 0.18, 0.24, '#5b8c3a', { p: [cx - 0.5, 0.92, cz + 0.12] }, 0.03);
      for (let i = 0; i < 5; i++) b.k.sphere(0.06, ['#e2574c', '#f28a24', '#f6c445'][i % 3], { p: [cx - 0.6 + (i % 3) * 0.1, 1.04, cz + 0.06 + Math.floor(i / 3) * 0.12] }, 6, 5);
      crate(b, cx + 1.25, cz + 0.2, 0.3); crate(b, cx - 1.25, cz + 0.25, 0.34);
      b.k.box(1.2, 0.36, 0.05, WOOD_L, { p: [cx, 2.3, cz + 0.72], r: [-0.2, 0, 0] }, 0.02);
      return done({ top: [cx, 2.7, cz], door: [cx, 0, D + 0.1], sign: [cx, 2.3, cz + 0.76] }, [cx - 0.95, cz - 0.15, cx + 0.95, cz + 0.45]);
    }
    case 'apiary': {
      for (const [dx, dz] of [[-0.8, -0.3], [0, 0.1], [0.8, -0.3]]) {
        b.k.box(0.12 * 4, 0.12, 0.45, WOOD_D, { p: [cx + dx, 0.06, cz + dz] }, 0.02);
        for (let i = 0; i < 3; i++) b.k.box(0.5, 0.2, 0.5, i % 2 ? '#f6c445' : '#fff3c4', { p: [cx + dx, 0.22 + i * 0.21, cz + dz] }, 0.03);
        b.k.prism(0.62, 0.2, 0.62, roof, { p: [cx + dx, 0.85, cz + dz], r: [0, Math.PI / 2, 0] });
      }
      for (let i = 0; i < 8; i++) { const a = i * 0.8; b.k.sphere(0.06, ['#f28cb1', '#fff176', '#c9a7ff'][i % 3], { p: [cx + Math.cos(a) * 1.25, 0.12, cz + 0.7 + Math.sin(a) * 0.25], wind: 1 }, 6, 5); }
      return done({ top: [cx, 1.6, cz], door: [cx, 0, D + 0.1] }, [cx - 1.1, cz - 0.6, cx + 1.1, cz + 0.4]);
    }
    case 'greenhouse': {
      const x0 = 0.25, x1 = W - 0.25, z0 = 0.4, z1 = D - 0.35;
      b.k.box(x1 - x0, 0.25, z1 - z0, '#a3a7a2', { p: [cx, 0.12, (z0 + z1) / 2] }, 0.03);
      b.g.box(x1 - x0 - 0.04, 1.3, z1 - z0 - 0.04, '#ffffff', { p: [cx, 0.9, (z0 + z1) / 2] }, 0.02);
      b.g.prism(z1 - z0, 0.8, x1 - x0, '#ffffff', { p: [cx, 1.55, (z0 + z1) / 2], r: [0, Math.PI / 2, 0] });
      for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 5) for (const z of [z0, z1]) b.k.box(0.05, 1.32, 0.05, WHITE, { p: [x, 0.9, z] }, 0.01);
      for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 5) b.k.box(0.05, 0.05, z1 - z0 + 0.04, WHITE, { p: [x, 1.56, (z0 + z1) / 2] }, 0.01);
      b.k.box(x1 - x0 + 0.06, 0.06, 0.06, WHITE, { p: [cx, 2.35, (z0 + z1) / 2] }, 0.01);
      for (let i = 0; i < 6; i++) b.k.sphere(0.2, '#5da443', { p: [x0 + 0.4 + i * (x1 - x0 - 0.8) / 5, 0.45, (z0 + z1) / 2 + (i % 2 ? 0.25 : -0.25)] }, 8, 6);
      doorAt(b, Math.floor(W / 2) + 0.5, z1, '#cfe9f2', 0.5, 0.9);
      return done({ top: [cx, 2.8, cz], door: [Math.floor(W / 2) + 0.5, 0, D + 0.1] }, [0.15, z0, W - 0.15, z1]);
    }
    case 'toolshed': {
      const m = house(def, b, SPECS.toolshed);
      return m;
    }
    case 'mill': {
      const r0 = 1.05, h = 2.6;
      b.k.lathe([[0, 0], [r0 + 0.12, 0], [r0 + 0.08, 0.25], [r0, 0.3], [r0 * 0.82, h], [0, h]], body, { p: [cx, 0, cz + 0.05], jitter: 0.06, ao: 0.25 }, 16);
      for (let y = 0.6; y < h; y += 0.45) b.k.torus(r0 * (1 - (y / h) * 0.18) + 0.01, 0.025, tint(body, -0.18), { p: [cx, y, cz + 0.05], r: [Math.PI / 2, 0, 0] });
      b.k.cone(r0 * 0.95, 1.1, roof, { p: [cx, h + 0.55, cz + 0.05], jitter: 0.06 }, 16);
      doorAt(b, cx, cz + r0 - 0.1, tint(roof, -0.2), 0.5, 0.82);
      windowAt(b, cx, 1.7, cz + r0 * 0.88, 'front', 1, '#3f8a4a', 0.34, 0.38);
      b.k.cyl(0.14, 0.14, 0.4, WOOD_D, { p: [cx, h - 0.15, cz + r0 * 0.85], r: [Math.PI / 2, 0, 0] }, 10);
      const bk = new Kit();
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        bk.box(0.12, 1.75, 0.08, WOOD_D, { p: [Math.cos(a + Math.PI / 2) * 0.88, Math.sin(a + Math.PI / 2) * 0.88, 0], r: [0, 0, a] }, 0.02);
        bk.box(0.42, 1.35, 0.03, WHITE, { p: [Math.cos(a + Math.PI / 2) * 1.0 + Math.cos(a) * 0.24, Math.sin(a + Math.PI / 2) * 1.0 + Math.sin(a) * 0.24, 0.03], r: [0, 0, a] }, 0.01);
      }
      bk.cyl(0.16, 0.16, 0.16, WOOD_D, { p: [0, 0, 0.04], r: [Math.PI / 2, 0, 0] }, 10);
      return done({ top: [cx, h + 1.4, cz], door: [cx, 0, D + 0.1] }, [cx - r0, cz - r0 + 0.05, cx + r0, cz + r0 + 0.05], { geo: bk.build(), pivot: [cx, h - 0.15, cz + r0 * 0.85 + 0.25] });
    }
  }
  return null;
}

function props(def: BuildingDef, b: B, m: BuildingModel) {
  const W = def.spot.w, D = def.spot.h, k = b.k;
  const front = D - 0.25;
  switch (def.id) {
    case 'farmhouse':
      fenceRail(b, 0.35, Math.floor(W / 2) - 0.1, front); fenceRail(b, Math.floor(W / 2) + 1.1, W - 0.35, front);
      k.box(0.8, 0.07, 0.3, WOOD, { p: [W - 0.9, 0.35, front - 0.25] }, 0.02); for (const s of [-1, 1]) k.box(0.06, 0.32, 0.25, WOOD_D, { p: [W - 0.9 + s * 0.35, 0.16, front - 0.25] }, 0.01);
      pot(b, 0.6, front - 0.1); break;
    case 'barn': hay(b, W - 0.45, D - 0.45); hay(b, W - 0.45, D - 1.05); hay(b, 0.45, D - 0.45); break;
    case 'sawmill': {
      k.cyl(0.15, 0.15, 1.2, WOOD, { p: [W - 0.5, 0.15, D - 0.35], r: [0, 0, Math.PI / 2] }, 9);
      k.cyl(0.15, 0.15, 1.2, WOOD, { p: [W - 0.5, 0.15, D - 0.7], r: [0, 0, Math.PI / 2] }, 9);
      k.cyl(0.15, 0.15, 1.2, WOOD, { p: [W - 0.5, 0.42, D - 0.52], r: [0, 0, Math.PI / 2] }, 9);
      k.cyl(0.3, 0.3, 0.03, '#c9d0d6', { p: [0.55, 0.65, D - 0.3], r: [Math.PI / 2, 0, 0] }, 16);
      k.box(0.8, 0.5, 0.4, WOOD_D, { p: [0.55, 0.25, D - 0.3] }, 0.02); break;
    }
    case 'bakery': barrel(b, 0.5, D - 0.3); crate(b, W - 0.5, D - 0.3); break;
    case 'carpentry': for (let i = 0; i < 4; i++) k.box(1.0, 0.06, 0.2, WOOD_L, { p: [W - 0.75, 0.05 + i * 0.07, D - 0.25] }, 0.01); k.box(0.3, 0.45, 0.3, WOOD_D, { p: [0.4, 0.22, D - 0.25] }, 0.02); break;
    case 'kitchen': barrel(b, 0.45, D - 0.25); pot(b, W - 0.45, D - 0.25); break;
    case 'weaving': for (let i = 0; i < 3; i++) k.cyl(0.09, 0.09, 0.24, ['#f28cb1', '#7cc3ee', '#f6c445'][i], { p: [W - 0.4 - i * 0.24, 0.12, D - 0.28] }, 10); break;
    case 'pottery': for (let i = 0; i < 3; i++) pot(b, 0.4 + i * 0.32, D - 0.25, false); break;
    case 'glassworks': for (let i = 0; i < 4; i++) b.g.cyl(0.06, 0.08, 0.26, '#ffffff', { p: [W - 0.4 - i * 0.2, 0.13, D - 0.25] }, 8); break;
    case 'oil_press': barrel(b, 0.45, D - 0.3); barrel(b, 0.85, D - 0.3); break;
    case 'warehouse': crate(b, 0.45, D - 0.3, 0.4); crate(b, 0.45, D - 0.3, 0.32, 0.4); crate(b, W - 0.45, D - 0.3, 0.4); barrel(b, W - 0.9, D - 0.3); break;
    case 'foundry': k.box(0.6, 0.4, 0.4, '#3a3a3f', { p: [0.5, 0.2, D - 0.3] }, 0.04); k.box(0.4, 0.06, 0.3, '#ff8a3c', { p: [0.5, 0.41, D - 0.3] }, 0.01); break;
    case 'smithy': k.box(0.42, 0.18, 0.2, '#4a5056', { p: [W - 0.55, 0.55, D - 0.3] }, 0.03); k.box(0.2, 0.36, 0.16, '#4a5056', { p: [W - 0.55, 0.28, D - 0.3] }, 0.02); k.box(0.3, 0.4, 0.3, WOOD_D, { p: [0.45, 0.2, D - 0.3] }, 0.02); break;
    case 'great_workshop': k.torus(0.32, 0.08, '#c9a227', { p: [W / 2, 2.6, D - 0.36] }); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; k.box(0.12, 0.12, 0.12, '#c9a227', { p: [W / 2 + Math.cos(a) * 0.42, 2.6 + Math.sin(a) * 0.42, D - 0.36], r: [0, 0, a] }, 0.01); } crate(b, 0.5, D - 0.3, 0.4); crate(b, W - 0.5, D - 0.3, 0.4); break;
    case 'florist': for (let i = 0; i < 4; i++) { pot(b, 0.4 + i * 0.3, D - 0.22, false); k.sphere(0.1, ['#f28cb1', '#e2574c', '#fff176', '#c9a7ff'][i], { p: [0.4 + i * 0.3, 0.3, D - 0.22], wind: 0.5 }, 8, 6); } break;
    case 'jewelry': k.box(def.spot.w - 0.3, 0.08, 0.08, '#f6c445', { p: [W / 2, 0.18 + SPECS.jewelry.wallH, D - 0.36] }, 0.02); break;
    case 'toolshed': k.box(0.06, 0.6, 0.06, WOOD, { p: [W - 0.35, 0.5, D - 0.3], r: [0, 0, 0.3] }, 0.01); k.box(0.2, 0.08, 0.05, '#aeb7be', { p: [W - 0.25, 0.78, D - 0.3] }, 0.01); break;
  }
  void m;
}

export function buildingModel(def: BuildingDef): BuildingModel {
  const b = new B(def.id.length * 7 + def.spot.x);
  const m = special(def, b) ?? house(def, b, SPECS[def.id] ?? { roof: 'gable', mat: 'plank', wallH: 1.25 });
  // adereços entram numa segunda passada e se juntam ao modelo
  const extra = new B(3);
  props(def, extra, m);
  if (!extra.k.empty) {
    m.opaque = mergeColored(m.opaque, extra.k.build());
  }
  if (!extra.g.empty) m.glass = m.glass ? mergeColored(m.glass, extra.g.build()) : extra.g.build();
  return m;
}

function mergeColored(a: THREE.BufferGeometry, b: THREE.BufferGeometry) { const g = mergeGeometries([a, b], false)!; g.computeBoundingSphere(); return g; }

/** Obra em andamento: andaimes, tábuas e paredes pela metade. */
export function constructionModel(w: number, h: number): THREE.BufferGeometry {
  const b = new B(w * 10 + h);
  const k = b.k;
  k.box(w - 0.2, 0.15, h - 0.4, '#a3a7a2', { p: [w / 2, 0.08, h / 2] }, 0.03);
  k.box(w - 0.5, 0.6, 0.12, WOOD_L, { p: [w / 2, 0.45, 0.4] }, 0.02);
  k.box(0.12, 0.6, h - 0.8, WOOD_L, { p: [0.3, 0.45, h / 2] }, 0.02);
  for (const x of [0.15, w / 2, w - 0.15]) for (const z of [0.25, h - 0.25]) k.box(0.07, 2.0, 0.07, '#c9a46e', { p: [x, 1.0, z] }, 0.01);
  for (const y of [0.9, 1.7]) { k.box(w - 0.2, 0.05, 0.05, '#c9a46e', { p: [w / 2, y, h - 0.25] }, 0.01); k.box(w - 0.2, 0.07, 0.32, WOOD, { p: [w / 2, y + 0.04, h - 0.42] }, 0.01); }
  k.box(0.05, Math.hypot(w - 0.3, 0.8), 0.05, '#c9a46e', { p: [w / 2, 1.3, h - 0.22], r: [0, 0, Math.atan2(w - 0.3, 0.8)] }, 0.01);
  for (let i = 0; i < 4; i++) k.box(1.0, 0.06, 0.22, WOOD_L, { p: [w - 0.8, 0.05 + i * 0.07, h - 0.6] }, 0.01);
  crate(b, 0.5, h - 0.6, 0.34);
  k.cone(0.12, 0.3, '#f6a33c', { p: [w - 0.3, 0.15, 0.3] }, 8); k.cone(0.12, 0.3, '#f6a33c', { p: [0.3, 0.15, h - 0.35] }, 8);
  return k.build();
}

/** Lote livre: estacas nos cantos, corda e placa. */
export function lotModel(w: number, h: number): THREE.BufferGeometry {
  const k = new Kit();
  const pts: [number, number][] = [[0.2, 0.2], [w - 0.2, 0.2], [w - 0.2, h - 0.2], [0.2, h - 0.2]];
  for (const [x, z] of pts) { k.box(0.07, 0.42, 0.07, '#c9a46e', { p: [x, 0.21, z] }, 0.01); k.cone(0.045, 0.08, '#f6a33c', { p: [x, 0.46, z] }, 6); }
  for (let i = 0; i < 4; i++) { const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % 4]; k.box(Math.hypot(bx - ax, bz - az), 0.015, 0.015, '#f6e2b0', { p: [(ax + bx) / 2, 0.36, (az + bz) / 2], r: [0, -Math.atan2(bz - az, bx - ax), 0] }, 0); }
  k.box(0.07, 0.85, 0.07, WOOD, { p: [w / 2, 0.42, h / 2 + 0.3] }, 0.01);
  k.box(0.62, 0.42, 0.06, '#f3d9a8', { p: [w / 2, 0.86, h / 2 + 0.32] }, 0.03);
  k.box(0.26, 0.07, 0.07, '#3f8a4a', { p: [w / 2, 0.86, h / 2 + 0.36] }, 0.01); k.box(0.07, 0.26, 0.07, '#3f8a4a', { p: [w / 2, 0.86, h / 2 + 0.36] }, 0.01);
  return k.build();
}
