// Efeitos: partículas em pool (lascas, folhas, poeira, confete), itens 3D que saltam e voam até
// a mochila, e a camada DOM de rótulos/números flutuantes projetados sobre a cena.
import * as THREE from 'three';
import { Kit } from './kit/geo.ts';
import { matVC } from './kit/materials.ts';
import { ITEM_BY_ID } from '../../data/catalog.ts';
import { gfx } from '../gfx.ts';

// ---------------------------------------------------------------- camada DOM
export interface Tag { el: HTMLDivElement; pos: THREE.Vector3; dy: number; on: boolean }
export class Overlay {
  root: HTMLDivElement;
  private tags = new Set<Tag>();
  private v = new THREE.Vector3();
  constructor(host: HTMLElement, private camera: THREE.Camera) {
    this.root = document.createElement('div');
    this.root.className = 'w-overlay';
    host.appendChild(this.root);
  }
  tag(html: string, cls: string, pos: THREE.Vector3, dy = 0): Tag {
    const el = document.createElement('div'); el.className = cls; el.innerHTML = html;
    this.root.appendChild(el);
    const t: Tag = { el, pos, dy, on: true };
    this.tags.add(t);
    return t;
  }
  remove(t: Tag) { t.el.remove(); this.tags.delete(t); }
  /** Texto que sobe e some (CSS). */
  float(text: string, pos: THREE.Vector3, cls = 'w-float') {
    const t = this.tag(text, cls, pos.clone(), 0);
    setTimeout(() => this.remove(t), 1400);
  }
  update() {
    const w = this.root.clientWidth, h = this.root.clientHeight;
    for (const t of this.tags) {
      if (!t.on) { t.el.style.display = 'none'; continue; }
      this.v.copy(t.pos); this.v.y += t.dy;
      this.v.project(this.camera);
      const vis = this.v.z < 1 && Math.abs(this.v.x) < 1.2 && Math.abs(this.v.y) < 1.2;
      t.el.style.display = vis ? '' : 'none';
      if (vis) t.el.style.transform = `translate(${((this.v.x + 1) / 2) * w}px, ${((1 - this.v.y) / 2) * h}px)`;
    }
  }
  dispose() { this.root.remove(); }
}

// ---------------------------------------------------------------- partículas
interface P { on: boolean; p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; w: THREE.Vector3; life: number; max: number; s: number; g: number }
const N = 260;
export class Particles {
  mesh: THREE.InstancedMesh;
  private ps: P[] = [];
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private sc = new THREE.Vector3(); private c = new THREE.Color();
  constructor(scene: THREE.Scene) {
    const k = new Kit(); k.box(0.1, 0.1, 0.1, '#ffffff', {}, 0.02);
    this.mesh = new THREE.InstancedMesh(k.build(), matVC, N);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < N; i++) { this.ps.push({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0, max: 1, s: 1, g: 9 }); this.mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); this.mesh.setColorAt(i, this.c.set('#ffffff')); }
    scene.add(this.mesh);
  }
  burst(at: THREE.Vector3, color: string | string[], n: number, o: { speed?: number; up?: number; size?: number; life?: number; gravity?: number } = {}) {
    if (!gfx.effects) return;
    n = Math.round(n * (gfx.quality === 'low' ? 0.5 : 1));
    for (let k = 0; k < n; k++) {
      const i = this.ps.findIndex((p) => !p.on);
      if (i < 0) return;
      const p = this.ps[i];
      const a = Math.random() * Math.PI * 2, sp = (o.speed ?? 2.2) * (0.5 + Math.random() * 0.7);
      p.on = true; p.p.copy(at); p.v.set(Math.cos(a) * sp, (o.up ?? 3) * (0.6 + Math.random() * 0.6), Math.sin(a) * sp);
      p.r.set(Math.random() * 6, Math.random() * 6, 0); p.w.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, 0);
      p.life = 0; p.max = (o.life ?? 0.75) * (0.7 + Math.random() * 0.5); p.s = (o.size ?? 0.8) * (0.6 + Math.random() * 0.6); p.g = o.gravity ?? 9;
      this.mesh.setColorAt(i, this.c.set(Array.isArray(color) ? color[k % color.length] : color));
    }
    this.mesh.instanceColor!.needsUpdate = true;
  }
  update(dt: number) {
    let any = false;
    this.ps.forEach((p, i) => {
      if (!p.on) return;
      any = true;
      p.life += dt;
      if (p.life >= p.max) { p.on = false; this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0)); return; }
      p.v.y -= p.g * dt; p.p.addScaledVector(p.v, dt);
      if (p.p.y < 0.03) { p.p.y = 0.03; p.v.multiplyScalar(0.5); p.v.y = Math.abs(p.v.y) * 0.3; }
      p.r.x += p.w.x * dt; p.r.y += p.w.y * dt;
      const k = p.s * (1 - Math.pow(p.life / p.max, 3));
      this.q.setFromEuler(p.r); this.sc.setScalar(k);
      this.mesh.setMatrixAt(i, this.m.compose(p.p, this.q, this.sc));
    });
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- itens que voam para a mochila
const itemGeo = new Map<string, THREE.BufferGeometry>();
/** Pequeno modelo 3D do item (tora, pedra, fruta, caixote…). */
export function itemModel(id: string): THREE.BufferGeometry {
  const hit = itemGeo.get(id); if (hit) return hit;
  const def = ITEM_BY_ID[id];
  const col = def?.icon.c ?? '#c99a5c';
  const k = new Kit();
  if (id === 'wood' || id === 'hardwood') { k.cyl(0.08, 0.08, 0.3, id === 'wood' ? '#9b6a3e' : '#6b4226', { r: [0, 0, Math.PI / 2] }, 8); k.cyl(0.07, 0.07, 0.305, '#e2b27a', { r: [0, 0, Math.PI / 2] }, 8); }
  else if (/stone|ore|coal|crystal|clay|sand/.test(id)) k.ico(0.1, col, {}, 0);
  else if (def?.cat === 'fruit' || /tomato|apple|orange|peach|strawberry|grape/.test(id)) { k.sphere(0.1, col, {}, 8, 6); k.box(0.02, 0.05, 0.02, '#5d4037', { p: [0, 0.1, 0] }, 0); }
  else if (def?.cat === 'crop' || def?.cat === 'flower') { k.capsule(0.05, 0.12, col, { r: [0, 0, 0.6] }); k.cone(0.05, 0.1, '#6fb043', { p: [0.08, 0.08, 0], r: [0, 0, -0.8] }, 5); }
  else if (id === 'fiber' || id === 'petals' || id === 'herbs') { for (let i = 0; i < 4; i++) k.cone(0.02, 0.22, col, { r: [0, 0, (i - 1.5) * 0.3] }, 4); }
  else { k.box(0.2, 0.2, 0.2, col, {}, 0.03); k.box(0.21, 0.04, 0.21, def?.icon.c2 ?? '#7a4b2a', {}, 0.01); }
  const g = k.build(); itemGeo.set(id, g); return g;
}

interface Drop { m: THREE.Mesh; t: number; from: THREE.Vector3; mid: THREE.Vector3; to: () => THREE.Vector3; dur: number; done?: () => void }
export class Drops {
  private list: Drop[] = [];
  constructor(private scene: THREE.Scene) {}
  /** Item salta do recurso, quica e é atraído até o destino (mochila do jogador). */
  spawn(item: string, n: number, from: THREE.Vector3, to: () => THREE.Vector3, onEach?: () => void) {
    for (let i = 0; i < Math.min(n, 6); i++) {
      const m = new THREE.Mesh(itemModel(item), matVC); m.castShadow = true;
      m.position.copy(from); this.scene.add(m);
      const a = Math.random() * Math.PI * 2;
      const mid = from.clone().add(new THREE.Vector3(Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7)); mid.y = 0.12;
      this.list.push({ m, t: -i * 0.06, from: from.clone(), mid, to, dur: 0.95, done: i === 0 ? onEach : undefined });
    }
  }
  update(dt: number) {
    this.list = this.list.filter((d) => {
      d.t += dt;
      if (d.t < 0) return true;
      const u = d.t / d.dur;
      if (u < 0.42) { // salto até o chão
        const k = u / 0.42;
        d.m.position.lerpVectors(d.from, d.mid, k); d.m.position.y = d.from.y + (d.mid.y - d.from.y) * k + Math.sin(k * Math.PI) * 0.9;
      } else if (u < 0.55) { d.m.position.y = d.mid.y + Math.sin(((u - 0.42) / 0.13) * Math.PI) * 0.12; }
      else { // ímã até o jogador
        const k = Math.min(1, (u - 0.55) / 0.45), e = k * k;
        const to = d.to();
        d.m.position.lerpVectors(d.mid, to, e); d.m.position.y += Math.sin(k * Math.PI) * 0.4;
        d.m.scale.setScalar(1 - e * 0.6);
      }
      d.m.rotation.y += dt * 8; d.m.rotation.x += dt * 3;
      if (u >= 1) { d.m.removeFromParent(); d.done?.(); return false; }
      return true;
    });
  }
}

// ---------------------------------------------------------------- fumaça (sprites suaves)
let puffTex: THREE.Texture | null = null;
function puffTexture() {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d')!; const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.6, 'rgba(240,240,236,0.6)'); g.addColorStop(1, 'rgba(240,240,236,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(c); return puffTex;
}
export class Smoke {
  private puffs: { s: THREE.Sprite; t: number; v: THREE.Vector3 }[] = [];
  constructor(private scene: THREE.Scene) {}
  emit(at: THREE.Vector3, tint = '#ffffff', scale = 0.5) {
    if (this.puffs.length > 80) return;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), color: tint, transparent: true, depthWrite: false, opacity: 0.85 }));
    s.position.copy(at); s.scale.setScalar(scale * 0.5); this.scene.add(s);
    this.puffs.push({ s, t: 0, v: new THREE.Vector3(0.25 + Math.random() * 0.2, 0.9, 0.1) });
  }
  update(dt: number) {
    this.puffs = this.puffs.filter((p) => {
      p.t += dt; p.s.position.addScaledVector(p.v, dt);
      const k = p.t / 2.4; p.s.scale.setScalar(0.25 + k * 0.9);
      (p.s.material as THREE.SpriteMaterial).opacity = 0.85 * (1 - k);
      if (k >= 1) { p.s.removeFromParent(); (p.s.material as THREE.Material).dispose(); return false; }
      return true;
    });
  }
}
