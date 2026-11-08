// Mundo 3D estático: terreno com relevo e cores por região, caminhos de terra, rio escavado com
// água animada, pontes, cercas e decoração instanciada. 1 unidade = 1 tile (32 px lógicos).
import * as THREE from 'three';
import {
  MAP_W, MAP_H, RIVER, BRIDGES, LAKE, PONDS, WATERFALL, PATH_TILES, FIELDS, BUILDINGS, WORLD_NODES, SPAWN, REGIONS, regionAt, isWater,
} from '../../data/catalog.ts';
import { Kit, rng, tint } from './kit/geo.ts';
import { matVC, labelTexture } from './kit/materials.ts';
import { decorGeometries, mountain } from './kit/nature.ts';
import { gfx } from '../gfx.ts';

export const MARGIN = 18;
const BIOME: Record<string, string> = {
  sitio: '#86bf5a', pomar: '#8fc462', bosque: '#679c4d', rio: '#92c667', colinas: '#a6ad68', vale: '#98cc70', planalto: '#b3a76e', pasto: '#9fd06a', lago: '#94c973', cafezal: '#86b257', mata: '#5f9a48', serra: '#88a86a', varzea: '#a6d47a', border: '#5a8a48',
};
const PATH_C = new THREE.Color('#d9b98a').convertSRGBToLinear(), BANK_C = new THREE.Color('#c8b37a').convertSRGBToLinear();
const SOIL_C = FIELDS.map((f) => new THREE.Color(f.soil).convertSRGBToLinear());

const hash = (x: number, y: number) => { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); };
function noise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Altura do terreno em (x, z) em tiles; usada também para pousar objetos. */
export function heightAt(x: number, z: number): number {
  for (const p of PONDS) { const ld = Math.hypot((x - p.cx) / p.rx, (z - p.cy) / p.ry); if (ld < 1.12) return -Math.min(0.6, (1.12 - ld) * 1.9); }
  // penhasco atrás da cachoeira
  { const dx = (x - WATERFALL.x) / 3.4, dz = (z - (WATERFALL.z - 1.6)) / 1.6; const d = dx * dx + dz * dz; if (d < 1) return (1 - d) * 3.2; }
  const inRiver = z > RIVER.y0 - 0.2 && z < RIVER.y1 + 1.2;
  if (inRiver) {
    const onBridge = BRIDGES.some((b) => x > b.x0 - 0.2 && x < b.x1 + 1.2);
    const t = Math.min(z - (RIVER.y0 - 0.2), RIVER.y1 + 1.2 - z);
    if (!onBridge) return -Math.min(0.55, t * 0.9);
  }
  const outside = x < 0 || z < 0 || x > MAP_W || z > MAP_H;
  const amp = outside ? 0.5 : 0.07;
  return (noise(x * 0.35, z * 0.35) - 0.5) * amp + (outside ? Math.min(2.2, Math.max(-x, -z, x - MAP_W, z - MAP_H, 0) * 0.12) : 0);
}

function pathFactor(x: number, z: number) {
  let best = 0;
  const tx = Math.floor(x), tz = Math.floor(z);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const k = `${tx + dx},${tz + dz}`;
    if (!PATH_TILES.has(k) || !regionAt(tx + dx, tz + dz)) continue;
    const d = Math.hypot(x - (tx + dx + 0.5), z - (tz + dz + 0.5));
    best = Math.max(best, 1 - Math.max(0, d - 0.35) / 0.4);
  }
  return Math.max(0, Math.min(1, best));
}

function terrain(): THREE.Mesh {
  const W = MAP_W + MARGIN * 2, H = MAP_H + MARGIN * 2, S = 2;
  const g = new THREE.PlaneGeometry(W, H, W * S, H * S);
  g.rotateX(-Math.PI / 2);
  g.translate(MAP_W / 2, 0, MAP_H / 2);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color(), tmp = new THREE.Color();
  const biome = (x: number, z: number) => BIOME[regionAt(Math.floor(x), Math.floor(z)) ?? 'border'];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    // mistura suave entre regiões (média de amostras vizinhas)
    c.setRGB(0, 0, 0);
    for (const [dx, dz] of [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]) c.add(tmp.set(biome(x + dx, z + dz)).convertSRGBToLinear());
    c.multiplyScalar(1 / 5);
    const n = noise(x * 0.9, z * 0.9) * 0.16 + noise(x * 3.1, z * 3.1) * 0.08 - 0.12;
    c.multiplyScalar(1 + n);
    const fi = FIELDS.findIndex((f) => x > f.x - 0.3 && x < f.x + f.cols * 2 + 0.3 && z > f.y - 0.3 && z < f.y + f.rows * 2 + 0.3);
    if (fi >= 0) c.lerp(SOIL_C[fi], 0.55);
    const p = pathFactor(x, z);
    if (p > 0) c.lerp(tmp.copy(PATH_C).multiplyScalar(0.96 + noise(x * 4, z * 4) * 0.08), p);
    const y = pos.getY(i);
    if (y < -0.05) c.lerp(BANK_C, Math.min(1, -y * 3));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('wind', new THREE.BufferAttribute(new Float32Array(pos.count), 1));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, matVC);
  m.receiveShadow = true;
  m.name = 'terrain';
  return m;
}

function water(): THREE.Mesh {
  const W = MAP_W + MARGIN * 2, D = RIVER.y1 - RIVER.y0 + 1.6;
  const g = new THREE.PlaneGeometry(W, D, 1, 1);
  g.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true, fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: { value: 0 }, uDeep: { value: new THREE.Color('#2f8fc4') }, uShallow: { value: new THREE.Color('#6fd0e6') } },
    vertexShader: `varying vec2 vW; varying float vEdge;
      #include <fog_pars_vertex>
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xz; vEdge = abs(uv.y - 0.5) * 2.0;
        vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; varying vec2 vW; varying float vEdge;
      #include <fog_pars_fragment>
      void main(){
        float r = sin(vW.x * 1.7 + uTime * 1.3 + sin(vW.y * 2.3 + uTime) * 1.4) * 0.5 + 0.5;
        float r2 = sin(vW.x * 4.1 - uTime * 2.0 + vW.y * 3.0) * 0.5 + 0.5;
        vec3 c = mix(uDeep, uShallow, smoothstep(0.35, 1.0, vEdge) * 0.8 + r * 0.12);
        float foam = smoothstep(0.82, 1.0, vEdge) + step(0.965, r2) * 0.5 * (1.0 - vEdge);
        c = mix(c, vec3(0.95, 0.99, 1.0), clamp(foam, 0.0, 0.85));
        gl_FragColor = vec4(c, 0.88);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.position.set(MAP_W / 2, -0.16, (RIVER.y0 + RIVER.y1 + 1) / 2);
  m.name = 'water';
  return m;
}

function bridges(broken: boolean): THREE.Mesh {
  const k = new Kit();
  const rr = rng(broken ? 5 : 3);
  for (const b of BRIDGES) {
    const x0 = b.x0, x1 = b.x1 + 1, z0 = RIVER.y0 - 0.4, z1 = RIVER.y1 + 1.4, cx = (x0 + x1) / 2;
    for (let z = z0; z < z1; z += 0.26) {
      if (broken && (rr() < 0.55 || (z > z0 + 0.6 && z < z1 - 0.6 && rr() < 0.5))) continue;
      k.box(x1 - x0 + 0.2, 0.08, 0.23, tint(broken ? '#8d6a48' : '#b9824e', (hash(z, x0) - 0.5) * 0.2), { p: [cx, 0.04 - (broken ? rr() * 0.12 : 0), z + 0.12], r: broken ? [rr() * 0.3 - 0.15, 0, rr() * 0.3 - 0.15] : undefined, jitter: 0.08 }, 0.02);
    }
    for (const s of [x0 - 0.05, x1 + 0.05]) {
      k.box(0.16, 0.12, z1 - z0, '#7a4b2a', { p: [s, -0.02, (z0 + z1) / 2] }, 0.03);
      for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / 4) k.box(0.1, 0.55, 0.1, '#8d5a33', { p: [s, 0.27, z] }, 0.02);
      if (!broken) k.box(0.09, 0.07, z1 - z0, '#a8713f', { p: [s, 0.5, (z0 + z1) / 2] }, 0.02);
      for (let z = z0 + 0.3; z < z1; z += (z1 - z0) / 4) k.cyl(0.08, 0.1, 0.9, '#6b4226', { p: [s, -0.45, z] }, 8);
    }
  }
  const m = new THREE.Mesh(k.build(), matVC);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function fieldFences(): THREE.Mesh {
  const k = new Kit();
  for (const f of FIELDS) {
    const x0 = f.x - 0.25, x1 = f.x + f.cols * 2 + 0.25, z0 = f.y - 0.25, z1 = f.y + f.rows * 2 + 0.25;
    const gap = f.x + f.cols;
    const post = (x: number, z: number) => k.box(0.1, 0.5, 0.1, '#c79359', { p: [x, 0.25, z] }, 0.02);
    const rail = (ax: number, az: number, bx: number, bz: number) => { for (const y of [0.2, 0.38]) k.box(Math.max(0.04, Math.abs(bx - ax)), 0.05, Math.max(0.04, Math.abs(bz - az)), y > 0.3 ? f.color : '#d3a265', { p: [(ax + bx) / 2, y, (az + bz) / 2] }, 0.01); };
    for (let x = x0; x <= x1 + 0.01; x += 1) { if (Math.abs(x - gap) < 0.9) continue; post(x, z1); post(x, z0); }
    for (let z = z0; z <= z1 + 0.01; z += 1) { post(x0, z); post(x1, z); }
    rail(x0, z1, gap - 0.9, z1); rail(gap + 0.9, z1, x1, z1); rail(x0, z0, gap - 0.9, z0); rail(gap + 0.9, z0, x1, z0);
    rail(x0, z0, x0, z1); rail(x1, z0, x1, z1);
  }
  const m = new THREE.Mesh(k.build(), matVC); m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** Cerca, sombra e placa de uma região ainda fechada. */
export function regionLock(id: string): THREE.Group {
  const r = REGIONS.find((x) => x.id === id)!.rect;
  const grp = new THREE.Group();
  const k = new Kit();
  const per: [number, number][] = [];
  for (let x = r.x; x <= r.x + r.w; x += 1.5) { per.push([x, r.y]); per.push([x, r.y + r.h]); }
  for (let z = r.y; z <= r.y + r.h; z += 1.5) { per.push([r.x, z]); per.push([r.x + r.w, z]); }
  for (const [x, z] of per) { if (isWater(Math.floor(x), Math.floor(z))) continue; k.box(0.09, 0.55, 0.09, '#a8713f', { p: [x, heightAt(x, z) + 0.25, z] }, 0.02); k.cone(0.06, 0.12, '#f6a33c', { p: [x, heightAt(x, z) + 0.58, z] }, 6); }
  const posts = new THREE.Mesh(k.build(), matVC); posts.castShadow = true;
  grp.add(posts);
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.h), new THREE.MeshBasicMaterial({ color: '#1d2b18', transparent: true, opacity: 0.34, depthWrite: false }));
  shade.rotation.x = -Math.PI / 2; shade.position.set(r.x + r.w / 2, 0.6, r.y + r.h / 2);
  shade.renderOrder = 2;
  grp.add(shade);
  const sign = new THREE.Group();
  const sk = new Kit();
  for (const s of [-0.7, 0.7]) sk.box(0.12, 1.6, 0.12, '#8d5a33', { p: [s, 0.8, 0] }, 0.02);
  sign.add(new THREE.Mesh(sk.build(), matVC));
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.05), new THREE.MeshBasicMaterial({ map: labelTexture(['…']), transparent: true }));
  board.position.set(0, 1.55, 0.08);
  board.name = 'board';
  sign.add(board);
  sign.position.set(r.x + r.w / 2, 0, r.y + r.h / 2);
  sign.rotation.x = -0.2;
  grp.add(sign);
  grp.userData = { shade, sign, board };
  return grp;
}

/** Decoração instanciada e determinística (mesma para todos os jogadores). */
/** Raio de colisão de cada decoração alta (o resto é atravessável: grama, flores, samambaia). */
const SOLID_R: Record<string, number> = { arauc: 0.2, ipe_pink: 0.3, ipe_purple: 0.3, pine: 0.3, pine2: 0.3, oak_d: 0.34, oak_d2: 0.34, bush: 0.26, berrybush: 0.26, log: 0.32, stone: 0.2, palm: 0.14, banana: 0.18, bamboo_d: 0.3 };

function decor(scene: THREE.Scene, solids: Map<number, [number, number, number][]>) {
  const blocked = new Set<string>();
  const mark = (x: number, y: number) => blocked.add(`${x},${y}`);
  for (const k of PATH_TILES) blocked.add(k);
  for (const b of BUILDINGS) for (let y = b.spot.y - 1; y <= b.spot.y + b.spot.h + 1; y++) for (let x = b.spot.x - 1; x <= b.spot.x + b.spot.w; x++) mark(x, y);
  for (const f of FIELDS) for (let y = f.y - 2; y <= f.y + f.rows * 2 + 1; y++) for (let x = f.x - 1; x <= f.x + f.cols * 2; x++) mark(x, y);
  for (const n of WORLD_NODES) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mark(n.x + dx, n.y + dy);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(SPAWN.x + dx, SPAWN.y + dy);
  const TABLE: Record<string, [string, number][]> = {
    border: [['pine', 0.16], ['pine2', 0.13], ['oak_d', 0.12], ['oak_d2', 0.1], ['bush', 0.06], ['fern', 0.04]],
    sitio: [['flowers', 0.03], ['tuft', 0.06], ['tuft2', 0.05], ['pebbles', 0.012], ['bush', 0.01]],
    pomar: [['flowers', 0.035], ['tuft', 0.05], ['bush', 0.02], ['berrybush', 0.012]],
    bosque: [['pine', 0.05], ['pine2', 0.04], ['fern', 0.07], ['mush', 0.025], ['log', 0.01], ['bush', 0.035], ['tuft', 0.05]],
    rio: [['stone', 0.03], ['flowers', 0.02], ['fern', 0.03], ['tuft2', 0.05]],
    colinas: [['stone', 0.06], ['pebbles', 0.06], ['bush', 0.015], ['tuft2', 0.03]],
    vale: [['flowers', 0.1], ['tuft', 0.05], ['bush', 0.02], ['berrybush', 0.015]],
    planalto: [['stone', 0.05], ['pebbles', 0.05], ['pine2', 0.02]],
    pasto: [['flowers', 0.04], ['tuft', 0.07], ['tuft2', 0.06], ['bush', 0.012], ['oak_d', 0.008]],
    lago: [['cattail', 0.05], ['flowers', 0.03], ['tuft2', 0.05], ['stone', 0.015], ['oak_d2', 0.01]],
    cafezal: [['banana', 0.025], ['palm', 0.01], ['fern', 0.05], ['tuft', 0.05], ['bush', 0.02]],
    mata: [['bamboo_d', 0.02], ['palm', 0.025], ['fern', 0.09], ['pine', 0.02], ['mush', 0.03], ['bush', 0.03], ['log', 0.008]],
    serra: [['arauc', 0.03], ['pine', 0.03], ['stone', 0.05], ['pebbles', 0.04], ['fern', 0.03], ['tuft2', 0.04]],
    varzea: [['ipe_pink', 0.012], ['ipe_purple', 0.01], ['flowers', 0.12], ['tuft', 0.05], ['cattail', 0.015]],
  };
  const geos = decorGeometries();
  const lists: Record<string, THREE.Matrix4[]> = {};
  const r = rng(77), dens = gfx.density;
  const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const put = (kind: string, x: number, z: number, sc: number, rot: number) => {
    e.set(0, rot, 0); q.setFromEuler(e); v.set(x, heightAt(x, z), z); s.setScalar(sc);
    (lists[kind] ??= []).push(new THREE.Matrix4().compose(v, q, s));
  };
  for (let ty = -MARGIN + 2; ty < MAP_H + MARGIN - 2; ty++) for (let tx = -MARGIN + 2; tx < MAP_W + MARGIN - 2; tx++) {
    const roll = r(), jx = r(), jy = r(), sc = r();
    if (blocked.has(`${tx},${ty}`)) continue;
    if (PONDS.some((p) => Math.hypot((tx + 0.5 - p.cx) / p.rx, (ty + 0.5 - p.cy) / p.ry) < 1.15)) { if (roll < 0.06 * dens) put('lily', tx + jx, ty + jy, 0.8 + sc * 0.5, jx * 6); continue; }
    if (ty >= RIVER.y0 - 1 && ty <= RIVER.y1 + 1) {
      if (isWater(tx, ty) && roll < 0.05 * dens) put('lily', tx + jx, ty + 0.3 + jy * 0.5, 0.8 + sc * 0.4, jx * 6);
      continue;
    }
    const reg = regionAt(tx, ty) ?? 'border';
    const big = reg === 'border';
    if (big && (tx < -6 || ty < -6 || tx > MAP_W + 5 || ty > MAP_H + 5) && roll > 0.55) continue;
    let acc = 0;
    for (const [k, p] of TABLE[reg] ?? []) {
      const tree = /pine|oak|arauc|ipe/.test(k);
      acc += big || tree ? p : p * dens;
      if (roll >= acc) continue;
      const px = tx + 0.2 + jx * 0.6, pz = ty + 0.2 + jy * 0.6, psc = tree ? 0.85 + sc * 0.45 : 0.8 + sc * 0.5;
      put(k, px, pz, psc, jx * 6.28);
      if (SOLID_R[k] && tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H) { const cell = ty * MAP_W + tx; (solids.get(cell) ?? solids.set(cell, []).get(cell)!).push([px, pz, SOLID_R[k] * psc]); }
      break;
    }
  }
  // instâncias em blocos de 12×12 tiles: o que está fora da câmera (e da sombra) nem é desenhado
  const metas: { mesh: THREE.InstancedMesh; tall: boolean }[] = [];
  const chunks: Record<string, THREE.Matrix4[]> = {};
  const tv = new THREE.Vector3();
  for (const [kind, mats] of Object.entries(lists)) for (const m of mats) { tv.setFromMatrixPosition(m); (chunks[`${kind}|${Math.floor(tv.x / 12)}|${Math.floor(tv.z / 12)}`] ??= []).push(m); }
  for (const [key, mats] of Object.entries(chunks)) {
    const kind = key.split('|')[0];
    const im = new THREE.InstancedMesh(geos[kind], matVC, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    const tall = /pine|oak|bush|log|stone|palm|banana|bamboo|arauc|ipe/.test(kind);
    im.castShadow = tall && gfx.quality === 'high'; im.receiveShadow = true;
    im.computeBoundingSphere();
    im.name = `decor_${kind}`;
    scene.add(im);
    metas.push({ mesh: im, tall });
  }
  return metas;
}

export class World {
  /** obstáculos da decoração por tile (x, z, raio) */
  solids = new Map<number, [number, number, number][]>();
  terrain: THREE.Mesh;
  water: THREE.Mesh;
  private fall: THREE.ShaderMaterial | null = null;
  private bridgeOk: THREE.Mesh;
  private bridgeBroken: THREE.Mesh;
  constructor(scene: THREE.Scene) {
    this.terrain = terrain();
    this.water = water();
    this.bridgeOk = bridges(false); this.bridgeBroken = bridges(true);
    this.bridgeOk.visible = false;
    // Lago das Garças: mesma água animada do rio
    const wm = this.water.material as THREE.ShaderMaterial, lm = wm.clone();
    lm.vertexShader = wm.vertexShader.replace('vEdge = abs(uv.y - 0.5) * 2.0;', 'vEdge = length(uv - 0.5) * 2.0;');
    lm.fragmentShader = wm.fragmentShader.replace('step(0.965, r2) * 0.5', 'step(0.99, r2) * 0.08');
    lm.uniforms.uTime = wm.uniforms.uTime; // mesma animação do rio
    for (const p of PONDS) {
      const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 40), lm);
      lake.rotation.x = -Math.PI / 2; lake.scale.set(p.rx + 0.4, p.ry + 0.4, 1); lake.position.set(p.cx, -0.16, p.cy);
      lake.name = 'lake';
      scene.add(lake);
    }
    void LAKE;
    // cachoeira: lâmina de água animada caindo do penhasco no poço, com espuma embaixo
    this.fall = new THREE.ShaderMaterial({
      transparent: true, uniforms: { uTime: wm.uniforms.uTime },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main(){ float s = sin(vUv.x * 40.0 + sin(vUv.x * 7.0) * 3.0) * 0.5 + 0.5; float f = fract(vUv.y * 3.0 + uTime * 1.6 + s * 0.3);
          vec3 c = mix(vec3(0.55, 0.82, 0.95), vec3(1.0), smoothstep(0.55, 1.0, f) * 0.8 + (1.0 - vUv.y) * 0.1);
          float a = 0.85 * smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
          gl_FragColor = vec4(c, a);
          #include <colorspace_fragment>
        }`,
    });
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(WATERFALL.w, WATERFALL.h, 1, 1), this.fall);
    fall.position.set(WATERFALL.x, WATERFALL.h / 2 - 0.25, WATERFALL.z); fall.rotation.x = -0.12;
    scene.add(fall);
    // montanhas no horizonte, em volta do mapa (fora da área jogável)
    const mk = new THREE.Group();
    const cols = ['#7a9e6a', '#6f9460', '#8aa877', '#769a8a'];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2, rx = MAP_W / 2 + MARGIN + 6, rz = MAP_H / 2 + MARGIN + 6;
      const h = 6 + ((i * 37) % 9);
      const m = new THREE.Mesh(mountain(i + 3, h, cols[i % 4], h > 12), matVC);
      m.position.set(MAP_W / 2 + Math.cos(a) * rx, -0.5, MAP_H / 2 + Math.sin(a) * rz);
      m.rotation.y = a; mk.add(m);
    }
    scene.add(mk);
    scene.add(this.terrain, this.water, this.bridgeOk, this.bridgeBroken, fieldFences());
    decor(scene, this.solids);
  }
  /** Pontes inteiras só depois da obra coletiva. */
  setBridges(fixed: boolean) { this.bridgeOk.visible = fixed; this.bridgeBroken.visible = !fixed; }
  update(_dt: number, t: number) { ((this.water.material as THREE.ShaderMaterial).uniforms.uTime.value = t); }
}
