// Montador de modelos procedurais: junta várias peças (com cor por vértice, transformação,
// peso de vento e osso) numa única BufferGeometry. Um modelo inteiro = 1 draw call.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export type V3 = [number, number, number];
export interface PartOpts {
  p?: V3;            // posição
  r?: V3;            // rotação (euler XYZ, rad)
  s?: V3 | number;   // escala
  wind?: number;     // 0 = rígido, 1 = balança com o vento (proporcional à altura)
  bone?: number;     // índice do osso (modelos com esqueleto)
  ao?: number;       // escurecimento na base da peça (0..1)
  jitter?: number;   // variação de cor por vértice
  flat?: boolean;    // normais por face (visual facetado)
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpC = new THREE.Color();

export class Kit {
  private parts: THREE.BufferGeometry[] = [];
  skinned = false;
  windy = false;

  add(src: THREE.BufferGeometry, color: THREE.ColorRepresentation, o: PartOpts = {}) {
    let g = src.index ? src.toNonIndexed() : src.clone();
    g.deleteAttribute('uv');
    if (g.getAttribute('uv1')) g.deleteAttribute('uv1');
    const s = typeof o.s === 'number' ? [o.s, o.s, o.s] as V3 : (o.s ?? [1, 1, 1]);
    tmpE.set(...(o.r ?? [0, 0, 0]));
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(new THREE.Vector3(...(o.p ?? [0, 0, 0])), tmpQ, new THREE.Vector3(...s));
    g.applyMatrix4(tmpM);
    if (o.flat) g.computeVertexNormals();
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const n = pos.count;
    const col = new Float32Array(n * 3);
    tmpC.set(color).convertSRGBToLinear();
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) { const y = pos.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const h = Math.max(1e-4, maxY - minY);
    for (let i = 0; i < n; i++) {
      let k = 1;
      if (o.ao) k *= 1 - o.ao * (1 - Math.min(1, (pos.getY(i) - minY) / h));
      if (o.jitter) { const r = Math.sin(pos.getX(i) * 12.9898 + pos.getZ(i) * 78.233 + pos.getY(i) * 37.719) * 43758.5453; k *= 1 + ((r - Math.floor(r)) - 0.5) * o.jitter; }
      col[i * 3] = tmpC.r * k; col[i * 3 + 1] = tmpC.g * k; col[i * 3 + 2] = tmpC.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const wind = new Float32Array(n);
    if (o.wind) { this.windy = true; for (let i = 0; i < n; i++) wind[i] = o.wind * Math.max(0, pos.getY(i)); }
    g.setAttribute('wind', new THREE.BufferAttribute(wind, 1));
    if (o.bone !== undefined) {
      this.skinned = true;
      const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { si[i * 4] = o.bone; sw[i * 4] = 1; }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    }
    this.parts.push(g);
    return this;
  }

  /** Junta uma geometria já montada por outro Kit (mantém cores e vento), só transformando. */
  addBuilt(src: THREE.BufferGeometry, o: Pick<PartOpts, 'p' | 'r' | 's'> = {}) {
    const g = src.clone();
    const s = typeof o.s === 'number' ? [o.s, o.s, o.s] as V3 : (o.s ?? [1, 1, 1]);
    tmpE.set(...(o.r ?? [0, 0, 0])); tmpQ.setFromEuler(tmpE);
    tmpM.compose(new THREE.Vector3(...(o.p ?? [0, 0, 0])), tmpQ, new THREE.Vector3(...s));
    g.applyMatrix4(tmpM);
    if (g.getAttribute('wind')) this.windy = true;
    this.parts.push(g);
    return this;
  }

  // atalhos de primitivas
  box(w: number, h: number, d: number, color: THREE.ColorRepresentation, o: PartOpts = {}, radius = Math.min(w, h, d) * 0.12) {
    const g = radius > 0.001 ? new RoundedBoxGeometry(w, h, d, 1, radius) : new THREE.BoxGeometry(w, h, d);
    return this.add(g, color, o);
  }
  cyl(rt: number, rb: number, h: number, color: THREE.ColorRepresentation, o: PartOpts = {}, seg = 12) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1), color, o); }
  sphere(r: number, color: THREE.ColorRepresentation, o: PartOpts = {}, ws = 10, hs = 7) { return this.add(new THREE.SphereGeometry(r, ws, hs), color, o); }
  ico(r: number, color: THREE.ColorRepresentation, o: PartOpts = {}, detail = 1) { return this.add(new THREE.IcosahedronGeometry(r, detail), color, { flat: true, ...o }); }
  capsule(r: number, len: number, color: THREE.ColorRepresentation, o: PartOpts = {}) { return this.add(new THREE.CapsuleGeometry(r, len, 3, 8), color, o); }
  cone(r: number, h: number, color: THREE.ColorRepresentation, o: PartOpts = {}, seg = 10) { return this.add(new THREE.ConeGeometry(r, h, seg, 1), color, o); }
  torus(r: number, t: number, color: THREE.ColorRepresentation, o: PartOpts = {}, arc = Math.PI * 2) { return this.add(new THREE.TorusGeometry(r, t, 6, 16, arc), color, o); }
  /** Prisma triangular (telhado de duas águas): largura w (x), altura h, profundidade d (z). */
  prism(w: number, h: number, d: number, color: THREE.ColorRepresentation, o: PartOpts = {}) {
    const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2);
    return this.add(g, color, o);
  }
  /** Extrusão de um contorno 2D (x, y) com profundidade d em z. */
  extrude(pts: [number, number][], d: number, color: THREE.ColorRepresentation, o: PartOpts = {}, bevel = 0) {
    const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 6 });
    g.translate(0, 0, -d / 2);
    return this.add(g, color, o);
  }
  /** Torno: perfil (raio, altura). */
  lathe(profile: [number, number][], color: THREE.ColorRepresentation, o: PartOpts = {}, seg = 14) {
    return this.add(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg), color, o);
  }

  get empty() { return this.parts.length === 0; }

  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false)!;
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

/** Gerador pseudoaleatório determinístico (mesmo mundo para todos). */
export function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Clareia (k > 0) ou escurece (k < 0) uma cor hex. */
export function tint(hex: string, k: number) {
  const c = new THREE.Color(hex);
  if (k >= 0) c.lerp(new THREE.Color('#ffffff'), k); else c.multiplyScalar(1 + k);
  return '#' + c.getHexString();
}
