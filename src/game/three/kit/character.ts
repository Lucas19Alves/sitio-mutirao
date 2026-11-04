// Personagem 3D chibi com esqueleto real (19 ossos) e animações esqueléticas com crossfade.
// Todas as peças (corpo, roupa, cabelo, chapéu, acessórios) viram UMA SkinnedMesh com cor por
// vértice; cada peça é presa (peso 1) ao osso que a move. A aparência é a mesma `Look` salva
// no Supabase.
import * as THREE from 'three';
import { Kit, tint } from './geo.ts';
import { matSkin, matVC, matMetal } from './materials.ts';
import { SKINS, HAIR_COLORS, CLOTH_COLORS, PANTS_COLORS, SHOE_COLORS, lookKey, normalizeLook, type Look } from '../../art/characters.ts';

// ---------------------------------------------------------------- esqueleto (pose de repouso, metros)
const BONES: [name: string, parent: number, x: number, y: number, z: number][] = [
  ['root', -1, 0, 0, 0],
  ['hips', 0, 0, 0.5, 0],
  ['spine', 1, 0, 0.1, 0],
  ['chest', 2, 0, 0.15, 0],
  ['neck', 3, 0, 0.13, 0],
  ['head', 4, 0, 0.04, 0],
  ['shL', 3, 0.15, 0.09, 0], ['armL', 6, 0.06, 0, 0], ['foreL', 7, 0, -0.17, 0], ['handL', 8, 0, -0.15, 0],
  ['shR', 3, -0.15, 0.09, 0], ['armR', 10, -0.06, 0, 0], ['foreR', 11, 0, -0.17, 0], ['handR', 12, 0, -0.15, 0],
  ['thighL', 1, 0.09, -0.03, 0], ['shinL', 14, 0, -0.21, 0], ['footL', 15, 0, -0.2, 0],
  ['thighR', 1, -0.09, -0.03, 0], ['shinR', 17, 0, -0.21, 0], ['footR', 18, 0, -0.2, 0],
];
const BI = Object.fromEntries(BONES.map((b, i) => [b[0], i])) as Record<string, number>;
// posições de mundo de cada osso em repouso
const WP: THREE.Vector3[] = [];
BONES.forEach(([, p, x, y, z], i) => { WP[i] = new THREE.Vector3(x, y, z).add(p >= 0 ? WP[p] : new THREE.Vector3()); });
const at = (b: string, dx = 0, dy = 0, dz = 0): [number, number, number] => [WP[BI[b]].x + dx, WP[BI[b]].y + dy, WP[BI[b]].z + dz];

const HEAD_C = at('head', 0, 0.23, 0);
const HR = 0.26;

/** Modela o corpo inteiro para uma aparência. */
function buildGeometry(L: Look): THREE.BufferGeometry {
  const k = new Kit();
  const skin = SKINS[L.skin], hairC = HAIR_COLORS[L.hairColor], shirtC = CLOTH_COLORS[L.shirtColor], pantsC = PANTS_COLORS[L.pants], hatC = CLOTH_COLORS[L.hatColor];
  const b = (n: string) => BI[n];
  const [hx, hy, hz] = HEAD_C;
  // corpo masculino (ombros largos, quadril estreito) ou feminino (cintura marcada, quadril largo)
  const fem = L.body === 1;
  const SHOE = SHOE_COLORS[L.shoes] ?? SHOE_COLORS[0];
  const sh = fem ? 0.3 : 0.36, waist = fem ? 0.26 : 0.32, hipW = fem ? 0.33 : 0.3;

  // quadril e tronco
  k.box(hipW, 0.17, 0.21, pantsC, { p: at('hips', 0, -0.01), bone: b('hips') }, 0.06);
  k.box(waist, 0.16, 0.21, L.shirt === 2 ? pantsC : shirtC, { p: at('spine', 0, 0.02), bone: b('spine') }, 0.07);
  k.box(sh, 0.2, fem ? 0.22 : 0.24, shirtC, { p: at('chest', 0, 0.02), bone: b('chest') }, 0.08);
  if (fem && L.shirt !== 2) k.cyl(0.17, 0.235, 0.15, tint(L.shirt === 3 ? pantsC : shirtC, -0.08), { p: at('hips', 0, -0.06), bone: b('hips') }, 14);
  if (!fem) k.box(0.37, 0.05, 0.24, tint(shirtC, -0.06), { p: at('chest', 0, 0.1), bone: b('chest') }, 0.02);
  if (L.shirt === 1) { // xadrez: faixas mais escuras
    for (const dx of [-0.1, 0, 0.1]) k.box(0.025, 0.2, 0.235, tint(shirtC, -0.3), { p: at('chest', dx, 0.02), bone: b('chest') }, 0.005);
    for (const dy of [-0.04, 0.05]) k.box(0.345, 0.022, 0.235, tint(shirtC, -0.25), { p: at('chest', 0, dy), bone: b('chest') }, 0.005);
  }
  if (L.shirt === 2) { // macacão: peitilho, alças e botões
    k.box(0.2, 0.14, 0.03, pantsC, { p: at('chest', 0, 0, 0.115), bone: b('chest') }, 0.01);
    for (const s of [-1, 1]) { k.box(0.04, 0.16, 0.03, pantsC, { p: at('chest', s * 0.1, 0.06, 0.112), bone: b('chest') }, 0.01); k.sphere(0.018, '#f4c84a', { p: at('chest', s * 0.08, 0.05, 0.13), bone: b('chest') }, 8, 6); }
  }
  if (L.acc === 4) k.box(0.26, 0.3, 0.025, '#f7f3e8', { p: at('spine', 0, 0.02, 0.118), bone: b('spine') }, 0.01);
  k.cyl(0.06, 0.07, 0.08, skin, { p: at('neck', 0, 0.02), bone: b('neck') });
  if (L.acc === 2) k.torus(0.085, 0.03, CLOTH_COLORS[(L.shirtColor + 3) % CLOTH_COLORS.length], { p: at('neck', 0, 0.0), r: [Math.PI / 2, 0, 0], bone: b('neck') });

  // mochila (todo mundo carrega a sua; o acessório "Mochila" é uma maior e colorida)
  const big = L.acc === 3;
  const bagC = big ? CLOTH_COLORS[(L.shirtColor + 5) % CLOTH_COLORS.length] : '#a8713f';
  k.box(big ? 0.3 : 0.25, big ? 0.32 : 0.26, 0.13, bagC, { p: at('chest', 0, -0.02, -0.18), bone: b('chest') }, 0.05);
  k.box(big ? 0.3 : 0.25, 0.07, 0.15, tint(bagC, -0.2), { p: at('chest', 0, big ? 0.13 : 0.1, -0.175), bone: b('chest') }, 0.03);
  k.box(0.12, 0.1, 0.04, tint(bagC, 0.15), { p: at('chest', 0, -0.07, -0.25), bone: b('chest') }, 0.02);
  for (const s of [-1, 1]) k.box(0.035, 0.24, 0.02, '#6b4426', { p: at('chest', s * 0.1, 0.0, 0.118), bone: b('chest') }, 0.008);

  // braços
  for (const [side, s] of [['L', 1], ['R', -1]] as const) {
    const sleeve = L.shirt === 3 ? skin : shirtC;
    k.sphere(0.07, sleeve, { p: at(`sh${side}`, s * 0.02, 0), bone: b(`arm${side}`) }, 10, 8);
    k.capsule(0.055, 0.1, sleeve, { p: at(`arm${side}`, 0, -0.08), bone: b(`arm${side}`) });
    k.capsule(0.048, 0.09, skin, { p: at(`fore${side}`, 0, -0.07), bone: b(`fore${side}`) });
    k.sphere(0.062, skin, { p: at(`hand${side}`, 0, -0.02), bone: b(`hand${side}`) }, 10, 8);
    // pernas
    k.capsule(0.072, 0.1, pantsC, { p: at(`thigh${side}`, 0, -0.1), bone: b(`thigh${side}`) });
    k.capsule(0.062, 0.1, pantsC, { p: at(`shin${side}`, 0, -0.1), bone: b(`shin${side}`) });
    k.box(0.12, 0.08, 0.2, SHOE, { p: at(`foot${side}`, 0, -0.01, 0.035), bone: b(`foot${side}`) }, 0.035);
    k.box(0.125, 0.025, 0.205, tint(SHOE, -0.35), { p: at(`foot${side}`, 0, -0.045, 0.035), bone: b(`foot${side}`) }, 0.008);
  }

  // cabeça e rosto
  const H = b('head');
  if (L.hair === 5) k.add(new THREE.SphereGeometry(0.37, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), hairC, { p: [hx, hy + 0.05, hz - 0.05], r: [-0.55, 0, 0], bone: H });
  k.sphere(HR, skin, { p: HEAD_C, s: [1, 0.96, 0.95], bone: H }, 14, 10);
  for (const s of [-1, 1]) k.sphere(0.055, tint(skin, -0.06), { p: [hx + s * 0.25, hy - 0.01, hz], s: [0.6, 1, 0.9], bone: H }, 8, 6);
  for (const s of [-1, 1]) {
    k.sphere(0.042, '#2b1d14', { p: [hx + s * 0.088, hy + 0.0, hz + 0.228], s: [1, 1.32, 0.55], bone: H }, 10, 8);
    k.sphere(0.014, '#ffffff', { p: [hx + s * 0.088 + 0.012, hy + 0.025, hz + 0.25], bone: H }, 6, 5);
    k.sphere(0.04, '#f19a92', { p: [hx + s * 0.15, hy - 0.07, hz + 0.19], s: [1, 0.55, 0.4], bone: H }, 8, 6);
    k.box(0.07, fem ? 0.012 : 0.022, 0.02, tint(hairC, -0.25), { p: [hx + s * 0.09, hy + 0.08, hz + 0.232], r: [0, 0, s * (fem ? -0.2 : -0.08)], bone: H }, 0.006);
    if (fem) for (const j of [-1, 0, 1]) k.box(0.012, 0.03, 0.01, '#2b1d14', { p: [hx + s * (0.088 + 0.03) + j * 0.014 * s, hy + 0.05, hz + 0.236], r: [0, 0, s * (0.5 + j * 0.25)], bone: H }, 0.003);
  }
  k.sphere(0.024, tint(skin, -0.12), { p: [hx, hy - 0.035, hz + 0.255], bone: H }, 8, 6);
  k.torus(0.04, fem ? 0.012 : 0.009, fem ? '#c2465a' : '#7a2c22', { p: [hx, hy - 0.075, hz + 0.236], r: [0.25, 0, Math.PI], bone: H }, Math.PI);
  if (L.acc === 1) for (const s of [-1, 1]) {
    k.torus(0.055, 0.009, '#3a2a22', { p: [hx + s * 0.088, hy + 0.0, hz + 0.245], bone: H });
    if (s === 1) k.box(0.06, 0.012, 0.012, '#3a2a22', { p: [hx, hy + 0.005, hz + 0.25], bone: H }, 0.004);
  }

  // cabelo
  const cap = (r: number, tilt: number, col: string, len = 0.56) => k.add(new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI * len), col, { p: [hx, hy + 0.01, hz - 0.01], r: [-tilt, 0, 0], bone: H });
  if (L.hair === 4) cap(HR * 1.025, 0.38, tint(hairC, 0.1), 0.5);
  else if (L.hair !== 5) {
    cap(HR * 1.07, 0.42, hairC);
    for (const dx of [-0.11, 0, 0.11]) k.sphere(0.075, hairC, { p: [hx + dx, hy + 0.15, hz + 0.17], s: [1.1, 0.7, 0.8], bone: H }, 10, 8);
  } else for (let i = 0; i < 7; i++) { const a = -0.9 + i * 0.3; k.sphere(0.09, hairC, { p: [hx + Math.sin(a) * 0.2, hy + 0.18 + Math.cos(a) * 0.04, hz + 0.16], bone: H }, 10, 8); }
  if (L.hair === 1) for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, e = 0.25 + (i % 3) * 0.22;
    k.sphere(0.075, hairC, { p: [hx + Math.cos(a) * Math.cos(e) * 0.27, hy + 0.06 + Math.sin(e) * 0.24, hz - 0.03 + Math.sin(a) * Math.cos(e) * 0.25], bone: H }, 9, 7);
  }
  if (L.hair === 2) { k.capsule(0.07, 0.18, hairC, { p: [hx, hy - 0.06, hz - 0.3], r: [0.5, 0, 0], bone: H }); k.torus(0.05, 0.016, CLOTH_COLORS[L.shirtColor], { p: [hx, hy + 0.05, hz - 0.27], r: [0.9, 0, 0], bone: H }); }
  if (L.hair === 3) for (const s of [-1, 1]) {
    for (let j = 0; j < 4; j++) k.sphere(0.058 - j * 0.005, hairC, { p: [hx + s * 0.22, hy - 0.12 - j * 0.085, hz - 0.04], bone: H }, 9, 7);
    k.sphere(0.03, CLOTH_COLORS[L.shirtColor], { p: [hx + s * 0.22, hy - 0.46, hz - 0.04], bone: H }, 8, 6);
  }

  // chapéu
  const top = hy + 0.2;
  if (L.hat === 1 || L.hat === 4) {
    k.cyl(0.43, 0.44, 0.025, '#e9c46a', { p: [hx, top - 0.01, hz], r: [-0.08, 0, 0], bone: H }, 20);
    k.cyl(0.2, 0.23, 0.15, '#f1d283', { p: [hx, top + 0.07, hz - 0.01], r: [-0.08, 0, 0], bone: H }, 16);
    k.cyl(0.232, 0.232, 0.045, hatC, { p: [hx, top + 0.025, hz - 0.01], r: [-0.08, 0, 0], bone: H }, 16);
    if (L.hat === 4) { for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; k.sphere(0.035, '#ef5b8e', { p: [hx + 0.2 + Math.cos(a) * 0.04, top + 0.06 + Math.sin(a) * 0.04, hz + 0.1], bone: H }, 8, 6); } k.sphere(0.025, '#ffd54f', { p: [hx + 0.2, top + 0.06, hz + 0.12], bone: H }, 8, 6); }
  } else if (L.hat === 2) {
    k.add(new THREE.SphereGeometry(0.285, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), hatC, { p: [hx, hy + 0.07, hz], s: [1, 0.78, 1], bone: H });
    k.box(0.27, 0.025, 0.2, tint(hatC, -0.15), { p: [hx, hy + 0.08, hz + 0.3], r: [-0.12, 0, 0], bone: H }, 0.012);
    k.sphere(0.03, tint(hatC, -0.2), { p: [hx, hy + 0.3, hz], bone: H }, 8, 6);
  } else if (L.hat === 3) {
    k.add(new THREE.SphereGeometry(0.29, 14, 7, 0, Math.PI * 2, 0, Math.PI * 0.52), hatC, { p: [hx, hy + 0.02, hz - 0.01], r: [-0.3, 0, 0], bone: H });
    k.sphere(0.06, hatC, { p: [hx, hy - 0.02, hz - 0.29], bone: H }, 8, 6);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; k.sphere(0.018, '#ffffff', { p: [hx + Math.cos(a) * 0.2, hy + 0.2, hz + Math.sin(a) * 0.2], bone: H }, 6, 5); }
  } else if (L.hat === 5) {
    k.add(new THREE.SphereGeometry(0.295, 14, 7, 0, Math.PI * 2, 0, Math.PI * 0.55), hatC, { p: [hx, hy + 0.03, hz - 0.01], r: [-0.25, 0, 0], bone: H });
    k.torus(0.27, 0.045, tint(hatC, -0.15), { p: [hx, hy + 0.07, hz + 0.02], r: [Math.PI / 2 - 0.25, 0, 0], bone: H });
    k.sphere(0.07, '#f7f6ef', { p: [hx, hy + 0.32, hz - 0.06], bone: H }, 10, 8);
  }
  return k.build();
}

// ---------------------------------------------------------------- animações
type Key = [t: number, x: number, y?: number, z?: number];
const E = new THREE.Euler(), Q = new THREE.Quaternion();
function clip(name: string, dur: number, rot: Record<string, Key[]>, hipsY?: [number, number][]) {
  const tracks: THREE.KeyframeTrack[] = [];
  for (const [bone, keys] of Object.entries(rot)) {
    const times: number[] = [], vals: number[] = [];
    for (const [t, x, y = 0, z = 0] of keys) { times.push(t * dur); E.set(x, y, z); Q.setFromEuler(E); vals.push(Q.x, Q.y, Q.z, Q.w); }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, vals));
  }
  if (hipsY) tracks.push(new THREE.VectorKeyframeTrack('hips.position', hipsY.map(([t]) => t * dur), hipsY.flatMap(([, y]) => [0, WP[BI.hips].y - WP[0].y + y, 0])));
  return new THREE.AnimationClip(name, dur, tracks);
}
/** Ciclo de pernas e braços (caminhada/corrida/carregar). */
function gait(a: number, knee: number, arm: number, lean: number, bob: number, carry = false) {
  const r: Record<string, Key[]> = {
    thighL: [[0, -a], [0.25, 0], [0.5, a], [0.75, 0], [1, -a]],
    thighR: [[0, a], [0.25, 0], [0.5, -a], [0.75, 0], [1, a]],
    shinL: [[0, 0.15], [0.25, 0.3], [0.5, knee], [0.75, 0.35], [1, 0.15]],
    shinR: [[0, knee], [0.25, 0.35], [0.5, 0.15], [0.75, 0.3], [1, knee]],
    spine: [[0, lean], [1, lean]],
    chest: [[0, 0, 0.08], [0.5, 0, -0.08], [1, 0, 0.08]],
    head: [[0, -lean * 0.6], [1, -lean * 0.6]],
  };
  if (carry) Object.assign(r, { armL: [[0, -1.45, 0, 0.18]], armR: [[0, -1.45, 0, -0.18]], foreL: [[0, -0.5]], foreR: [[0, -0.5]] });
  else Object.assign(r, {
    armL: [[0, arm, 0, 0.1], [0.5, -arm, 0, 0.1], [1, arm, 0, 0.1]], armR: [[0, -arm, 0, -0.1], [0.5, arm, 0, -0.1], [1, -arm, 0, -0.1]],
    foreL: [[0, -0.35 - arm * 0.5]], foreR: [[0, -0.35 - arm * 0.5]],
  });
  return { r, h: [[0, 0], [0.25, bob], [0.5, 0], [0.75, bob], [1, 0]] as [number, number][] };
}
const crouch = { hips: -0.17, thigh: -1.2, shin: 1.65, foot: -0.42, chest: 0.55 };
function crouchClip(name: string, dur: number, armsL: Key[], armsR: Key[]) {
  return clip(name, dur, {
    thighL: [[0, crouch.thigh, 0, 0.12]], thighR: [[0, crouch.thigh, 0, -0.12]], shinL: [[0, crouch.shin]], shinR: [[0, crouch.shin]],
    footL: [[0, crouch.foot]], footR: [[0, crouch.foot]], spine: [[0, 0.3]], chest: [[0, crouch.chest * 0.5]], head: [[0, -0.35]],
    armL: armsL, armR: armsR, foreL: [[0, -0.3]], foreR: [[0, -0.3]],
  }, [[0, crouch.hips], [1, crouch.hips]]);
}

let CLIPS: Record<string, THREE.AnimationClip> | null = null;
export function clips() {
  if (CLIPS) return CLIPS;
  const w = gait(0.55, 0.8, 0.45, 0.05, 0.025), rn = gait(0.9, 1.35, 0.8, 0.2, 0.045), cw = gait(0.5, 0.75, 0, 0.04, 0.022, true);
  CLIPS = {
    idle: clip('idle', 2.4, {
      chest: [[0, 0], [0.5, 0.035], [1, 0]], head: [[0, 0], [0.5, -0.03, 0.04], [1, 0]],
      armL: [[0, 0.04, 0, 0.09], [0.5, 0.0, 0, 0.12], [1, 0.04, 0, 0.09]], armR: [[0, 0.04, 0, -0.09], [0.5, 0.0, 0, -0.12], [1, 0.04, 0, -0.09]],
      foreL: [[0, -0.15]], foreR: [[0, -0.15]],
    }, [[0, 0], [0.5, -0.008], [1, 0]]),
    walk: clip('walk', 0.62, w.r, w.h),
    run: clip('run', 0.44, rn.r, rn.h),
    carry: clip('carry', 0.66, cw.r, cw.h),
    chop: clip('chop', 0.72, {
      armR: [[0, -2.55, 0.2, -0.2], [0.55, -0.45, -0.1, -0.15], [0.7, -0.5, -0.1, -0.15], [1, -2.55, 0.2, -0.2]],
      armL: [[0, -2.3, -0.3, 0.3], [0.55, -0.4, 0.2, 0.35], [0.7, -0.45, 0.2, 0.35], [1, -2.3, -0.3, 0.3]],
      foreR: [[0, -0.4], [0.55, -0.15], [1, -0.4]], foreL: [[0, -0.6], [0.55, -0.3], [1, -0.6]],
      chest: [[0, -0.12, 0.45], [0.55, 0.32, -0.25], [0.7, 0.3, -0.25], [1, -0.12, 0.45]],
      thighL: [[0, -0.2]], thighR: [[0, 0.15]], shinR: [[0, 0.2]],
    }, [[0, 0], [0.55, -0.03], [1, 0]]),
    mine: clip('mine', 0.78, {
      armR: [[0, -2.9, 0, -0.1], [0.56, -0.35, 0, -0.1], [0.72, -0.4, 0, -0.1], [1, -2.9, 0, -0.1]],
      armL: [[0, -2.8, 0, 0.1], [0.56, -0.3, 0, 0.1], [0.72, -0.35, 0, 0.1], [1, -2.8, 0, 0.1]],
      foreR: [[0, -0.3], [0.56, -0.1], [1, -0.3]], foreL: [[0, -0.3], [0.56, -0.1], [1, -0.3]],
      chest: [[0, -0.2], [0.56, 0.5], [0.72, 0.48], [1, -0.2]], head: [[0, 0.1], [0.56, -0.2], [1, 0.1]],
      thighL: [[0, -0.35]], thighR: [[0, 0.25]], shinL: [[0, 0.35]], shinR: [[0, 0.3]],
    }, [[0, 0], [0.56, -0.05], [1, 0]]),
    dig: clip('dig', 0.8, {
      armR: [[0, -1.1, 0, -0.1], [0.5, -0.45, 0, -0.1], [1, -1.1, 0, -0.1]], armL: [[0, -0.9, 0, 0.15], [0.5, -0.3, 0, 0.15], [1, -0.9, 0, 0.15]],
      foreR: [[0, -0.7]], foreL: [[0, -0.9]], chest: [[0, 0.55], [0.5, 0.2], [1, 0.55]],
      thighR: [[0, -0.55], [0.5, -0.2], [1, -0.55]], shinR: [[0, 0.7], [0.5, 0.2], [1, 0.7]],
    }, [[0, -0.02], [0.5, 0.01], [1, -0.02]]),
    harvest: crouchClip('harvest', 0.9, [[0, -1.0, 0, 0.2], [0.5, -0.6, 0, 0.3], [1, -1.0, 0, 0.2]], [[0, -0.6, 0, -0.3], [0.5, -1.0, 0, -0.2], [1, -0.6, 0, -0.3]]),
    plant: crouchClip('plant', 1.0, [[0, -0.5, 0, 0.25]], [[0, -1.1, 0, -0.1], [0.4, -0.7, 0, -0.1], [0.7, -1.15, 0, -0.1], [1, -1.1, 0, -0.1]]),
    pickup: crouchClip('pickup', 0.5, [[0, -1.2, 0, 0.2]], [[0, -1.2, 0, -0.2]]),
    deposit: clip('deposit', 0.7, {
      armL: [[0, -1.6, 0, 0.15], [0.5, -0.6, 0, 0.2], [1, -1.6, 0, 0.15]], armR: [[0, -1.6, 0, -0.15], [0.5, -0.6, 0, -0.2], [1, -1.6, 0, -0.15]],
      foreL: [[0, -0.5]], foreR: [[0, -0.5]], chest: [[0, 0.1], [0.5, 0.3], [1, 0.1]],
    }),
    sell: clip('sell', 0.9, {
      armR: [[0, -1.5, 0, -0.2], [0.5, -1.7, 0.3, -0.4], [1, -1.5, 0, -0.2]], foreR: [[0, -0.6], [0.5, -0.9], [1, -0.6]],
      armL: [[0, 0.1, 0, 0.12]], chest: [[0, 0.08, 0.1], [0.5, 0.08, -0.1], [1, 0.08, 0.1]], head: [[0, 0, 0.1], [0.5, -0.05, -0.1], [1, 0, 0.1]],
    }),
    build: clip('build', 0.5, {
      armR: [[0, -2.1, 0, -0.2], [0.5, -0.55, 0, -0.2], [1, -2.1, 0, -0.2]], foreR: [[0, -0.6], [0.5, -0.2], [1, -0.6]],
      armL: [[0, -0.7, 0, 0.3]], foreL: [[0, -0.6]], chest: [[0, 0.15], [0.5, 0.35], [1, 0.15]],
    }),
    celebrate: clip('celebrate', 0.9, {
      armL: [[0, 0, 0, 2.5], [0.5, 0, 0, 2.8], [1, 0, 0, 2.5]], armR: [[0, 0, 0, -2.5], [0.5, 0, 0, -2.8], [1, 0, 0, -2.5]],
      foreL: [[0, 0, 0, 0.3]], foreR: [[0, 0, 0, -0.3]],
      thighL: [[0, 0], [0.5, -0.45], [1, 0]], thighR: [[0, 0], [0.5, -0.45], [1, 0]], shinL: [[0, 0], [0.5, 0.8], [1, 0]], shinR: [[0, 0], [0.5, 0.8], [1, 0]],
      head: [[0, -0.15], [0.5, -0.25], [1, -0.15]], chest: [[0, -0.1]],
    }, [[0, 0], [0.5, 0.17], [1, 0]]),
    interact: clip('interact', 1.1, {
      armR: [[0, 0, 0, -2.3], [0.25, 0, 0, -2.6], [0.5, 0, 0, -2.3], [0.75, 0, 0, -2.6], [1, 0, 0, -2.3]], foreR: [[0, 0, 0, -0.4]],
      head: [[0, 0, 0.12]], chest: [[0, 0, 0.08]],
    }),
  };
  return CLIPS;
}

/** Momento do golpe dentro de cada clipe de trabalho (0..1), para sincronizar impacto e efeitos. */
export const IMPACT: Record<string, number> = { chop: 0.55, mine: 0.56, dig: 0.5, harvest: 0.5, plant: 0.4, build: 0.5 };
export const CLIP_LEN = () => Object.fromEntries(Object.entries(clips()).map(([k, c]) => [k, c.duration])) as Record<string, number>;

// ---------------------------------------------------------------- ferramentas (presas à mão direita)
export type ToolKind = 'axe' | 'pickaxe' | 'sickle' | 'shovel' | 'hammer' | 'seeds' | null;
const toolGeo: Partial<Record<Exclude<ToolKind, null>, THREE.BufferGeometry>> = {};
function toolGeometry(t: Exclude<ToolKind, null>) {
  if (toolGeo[t]) return toolGeo[t]!;
  const k = new Kit();
  const wood = '#9b6a3e';
  if (t === 'seeds') { k.box(0.13, 0.12, 0.09, '#d9b377', { p: [0, -0.06, 0.05] }, 0.03); k.box(0.13, 0.03, 0.09, '#b98a50', { p: [0, 0.01, 0.05] }, 0.01); }
  else {
    // cabo ao longo de +z (perpendicular ao antebraço)
    k.cyl(0.018, 0.022, 0.5, wood, { p: [0, -0.02, 0.18], r: [Math.PI / 2, 0, 0] }, 8);
    if (t === 'axe') { k.extrude([[0, -0.07], [0.13, -0.11], [0.15, 0.09], [0, 0.05]], 0.035, '#c9d0d6', { p: [0.0, -0.02, 0.4], r: [Math.PI / 2, Math.PI / 2, 0] }, 0.006); }
    if (t === 'pickaxe') { k.add(new THREE.TorusGeometry(0.17, 0.022, 6, 14, Math.PI * 0.9), '#aeb7be', { p: [0, 0.06, 0.42], r: [0, Math.PI / 2, -Math.PI * 0.45] }); }
    if (t === 'sickle') { k.add(new THREE.TorusGeometry(0.13, 0.016, 5, 14, Math.PI * 1.2), '#cfd6db', { p: [0, 0.1, 0.42], r: [0, Math.PI / 2, 0] }); }
    if (t === 'shovel') { k.box(0.16, 0.02, 0.2, '#b8c0c6', { p: [0, -0.02, 0.5] }, 0.02); }
    if (t === 'hammer') { k.box(0.07, 0.07, 0.16, '#8e979e', { p: [0, -0.02, 0.42], r: [0, Math.PI / 2, 0] }, 0.015); }
  }
  toolGeo[t] = k.build();
  return toolGeo[t]!;
}
void matMetal;

// ---------------------------------------------------------------- instância
const geoCache = new Map<string, THREE.BufferGeometry>();

export class Character3D {
  root = new THREE.Group();
  mesh: THREE.SkinnedMesh;
  bones: THREE.Bone[] = [];
  mixer: THREE.AnimationMixer;
  private actions: Record<string, THREE.AnimationAction> = {};
  current = '';
  private tool: THREE.Mesh | null = null;
  private toolKind: ToolKind = null;
  private pile: THREE.Group;
  lookKey = '';

  constructor(look: unknown) {
    const L = normalizeLook(look);
    this.lookKey = lookKey(L);
    BONES.forEach(([name, p, x, y, z], i) => {
      const bone = new THREE.Bone(); bone.name = name; bone.position.set(x, y, z);
      if (p >= 0) this.bones[p].add(bone);
      this.bones[i] = bone;
    });
    this.mesh = new THREE.SkinnedMesh(this.geometry(L), matSkin);
    this.mesh.add(this.bones[0]);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    this.root.scale.setScalar(0.9);
    this.mixer = new THREE.AnimationMixer(this.mesh);
    for (const [k, c] of Object.entries(clips())) this.actions[k] = this.mixer.clipAction(c);
    // pilha de coisas na mochila (cresce com a ocupação)
    this.pile = new THREE.Group();
    this.bones[BI.chest].add(this.pile);
    this.pile.position.set(0, 0.17, -0.18);
    this.play('idle', 0);
  }

  private geometry(L: Look) {
    const key = lookKey(L);
    let g = geoCache.get(key);
    if (!g) { g = buildGeometry(L); geoCache.set(key, g); }
    return g;
  }

  setLook(look: unknown) {
    const L = normalizeLook(look);
    const key = lookKey(L);
    if (key === this.lookKey) return;
    this.lookKey = key;
    this.mesh.geometry = this.geometry(L);
  }

  /** Troca de animação com mistura suave. */
  play(name: string, fade = 0.18, speed = 1) {
    const next = this.actions[name] ?? this.actions.idle;
    next.timeScale = speed;
    if (this.current === name) return;
    const prev = this.actions[this.current];
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (prev) prev.fadeOut(fade);
    this.current = name;
  }

  /** Fase (0..1) do clipe atual, para sincronizar efeitos de impacto. */
  phase() { const a = this.actions[this.current]; return a ? (a.time % a.getClip().duration) / a.getClip().duration : 0; }

  setTool(t: ToolKind) {
    if (t === this.toolKind) return;
    this.toolKind = t;
    if (this.tool) { this.tool.removeFromParent(); this.tool = null; }
    if (!t) return;
    this.tool = new THREE.Mesh(toolGeometry(t), matVC);
    this.tool.castShadow = true;
    this.bones[BI.handR].add(this.tool);
    this.tool.position.set(0, -0.03, 0);
  }

  /** Mostra itens empilhados na mochila (0..1). */
  setPile(fill: number, colors: string[]) {
    const n = Math.min(6, Math.ceil(fill * 6));
    while (this.pile.children.length > n) this.pile.children.pop()!.removeFromParent();
    while (this.pile.children.length < n) {
      const i = this.pile.children.length;
      const m = new THREE.Mesh(pileGeo(), pileMat(colors[i % Math.max(1, colors.length)] ?? '#b9824e'));
      m.position.set(((i % 2) - 0.5) * 0.1, Math.floor(i / 2) * 0.07, (i % 3) * 0.01);
      m.rotation.set(0, i * 0.7, Math.PI / 2);
      m.castShadow = true;
      this.pile.add(m);
    }
  }

  update(dt: number) { this.mixer.update(dt); }

  dispose() { this.mixer.stopAllAction(); this.root.removeFromParent(); }
}

const pileMats = new Map<string, THREE.MeshStandardMaterial>();
const pileMat = (c: string) => { let m = pileMats.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }); pileMats.set(c, m); } return m; };
let _pile: THREE.BufferGeometry | null = null;
const pileGeo = () => (_pile ??= new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8));
