// Ambientação: marcos no mapa (lampiões nas estradas, placas nas encruzilhadas, bancos, espantalhos,
// fardos de feno, píer, mirante, gazebo), ciclo de dia e noite compartilhado (hora do servidor)
// e vaga-lumes à noite. Tudo é decoração: não mexe no progresso.
import * as THREE from 'three';
import { PATH_TILES, PATHS, REGIONS, FIELDS, LAKE, PONDS, RIVER, WATERFALL, MAP_W, MAP_H, regionAt, isWater } from '../../data/catalog.ts';
import { Kit } from './kit/geo.ts';
import { matVC, labelTexture } from './kit/materials.ts';
import { heightAt } from './World.ts';
import type { Engine } from './Engine.ts';
import { gfx } from '../gfx.ts';

/** Um dia de jogo dura 24 minutos; todos veem a mesma hora (relógio do servidor). */
export const DAY_MS = 24 * 60_000;
/** 0 = dia pleno, 1 = noite plena. Amanhecer e entardecer suaves. */
export function nightOf(now: number) {
  const t = (now % DAY_MS) / DAY_MS; // 0 = amanhecer
  if (t < 0.62) return 0;
  if (t < 0.7) return (t - 0.62) / 0.08;
  if (t < 0.92) return 1;
  return 1 - (t - 0.92) / 0.08;
}
/** Quanto de "luz dourada" (entardecer e amanhecer). */
export function duskOf(now: number) {
  const t = (now % DAY_MS) / DAY_MS;
  const d = Math.min(Math.abs(t - 0.64), Math.abs(t - 0.96), Math.abs(t + 0.04));
  return Math.max(0, 1 - d / 0.05);
}

const WOOD = '#8d5a33', WOOD_L = '#c9935a', STONE = '#9aa0a6';

export class Scenery {
  private glow: THREE.MeshStandardMaterial;
  private flies: THREE.Points | null = null;
  private flyBase: Float32Array = new Float32Array();
  private sunDay = new THREE.Color('#fff1d6'); private sunDusk = new THREE.Color('#ffb070'); private sunNight = new THREE.Color('#9fb4ff');
  private hemiDay = new THREE.Color('#dff3ff'); private hemiNight = new THREE.Color('#7f98c8');
  private groundDay = new THREE.Color('#6d8f45'); private groundNight = new THREE.Color('#2c3b3a');
  private fogDay = new THREE.Color('#bfe3ef'); private fogDusk = new THREE.Color('#f2c7a0'); private fogNight = new THREE.Color('#22324d');
  private skyTex: THREE.Texture | THREE.Color | null;
  night = 0;

  constructor(private eng: Engine) {
    this.skyTex = eng.scene.background as THREE.Texture | null;
    this.glow = new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffcc66', emissiveIntensity: 0 });
    const k = new Kit(), lamps = new Kit();
    this.lampposts(k, lamps);
    this.signposts(eng.scene);
    this.props(k);
    const m = new THREE.Mesh(k.build(), matVC); m.castShadow = true; m.receiveShadow = true; m.name = 'scenery';
    eng.scene.add(m);
    const g = new THREE.Mesh(lamps.build(), this.glow); g.name = 'lamps';
    eng.scene.add(g);
    this.fireflies();
  }

  // ---------------------------------------------------------------- lampiões ao longo das estradas
  private lampposts(k: Kit, lamps: Kit) {
    const seen = new Set<string>();
    let n = 0;
    for (const line of PATHS) for (let s = 0; s < line.length - 1; s++) {
      const [ax, ay] = line[s], [bx, by] = line[s + 1];
      const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      for (let t = 4; t < steps; t += 9) {
        const x = Math.round(ax + ((bx - ax) * t) / steps), y = Math.round(ay + ((by - ay) * t) / steps);
        const horiz = Math.abs(bx - ax) > Math.abs(by - ay);
        const px = horiz ? x + 0.5 : x + 1.15, pz = horiz ? y + 1.15 : y + 0.5;
        const key = `${Math.round(px / 4)},${Math.round(pz / 4)}`;
        if (seen.has(key) || isWater(Math.floor(px), Math.floor(pz)) || PATH_TILES.has(`${Math.floor(px)},${Math.floor(pz)}`) || !regionAt(Math.floor(px), Math.floor(pz))) continue;
        seen.add(key); n++;
        const h = heightAt(px, pz);
        k.cyl(0.05, 0.07, 1.6, '#3e3a36', { p: [px, h + 0.8, pz] }, 6);
        k.box(0.22, 0.05, 0.22, '#3e3a36', { p: [px, h + 1.62, pz] }, 0.01);
        k.cone(0.16, 0.14, '#3e3a36', { p: [px, h + 1.95, pz] }, 4);
        lamps.box(0.16, 0.22, 0.16, '#fff3c4', { p: [px, h + 1.76, pz] }, 0.02);
      }
    }
    return n;
  }

  // ---------------------------------------------------------------- placas nas entradas das regiões
  private signposts(scene: THREE.Scene) {
    const posts = new Kit();
    const boards: THREE.Mesh[] = [];
    for (const r of REGIONS) {
      if (r.id === 'sitio') continue;
      // placa no ponto de estrada dentro da região mais perto do centro do mapa
      let best: [number, number] | null = null, bd = 1e9;
      for (const key of PATH_TILES) {
        const [x, y] = key.split(',').map(Number);
        if (regionAt(x, y) !== r.id) continue;
        const d = Math.hypot(x - 32, y - 24);
        if (d < bd) { bd = d; best = [x, y]; }
      }
      if (!best) continue;
      const px = best[0] + 1.3, pz = best[1] - 0.2, h = heightAt(px, pz);
      posts.cyl(0.06, 0.07, 1.5, WOOD, { p: [px, h + 0.75, pz] }, 6);
      posts.box(1.25, 0.42, 0.06, WOOD_L, { p: [px, h + 1.32, pz] }, 0.02);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.36), new THREE.MeshBasicMaterial({ map: labelTexture([r.name], { w: 512, h: 160, font: 70 }), transparent: true }));
      b.position.set(px, h + 1.32, pz + 0.035);
      boards.push(b);
    }
    const m = new THREE.Mesh(posts.build(), matVC); m.castShadow = true;
    scene.add(m, ...boards);
  }

  // ---------------------------------------------------------------- adereços espalhados
  private props(k: Kit) {
    const put = (fn: (x: number, z: number, h: number) => void, x: number, z: number) => { if (!isWater(Math.floor(x), Math.floor(z)) && !PATH_TILES.has(`${Math.floor(x)},${Math.floor(z)}`)) fn(x, z, heightAt(x, z)); };
    const bench = (x: number, z: number, h: number) => { k.box(1.1, 0.07, 0.36, WOOD_L, { p: [x, h + 0.42, z] }, 0.02); k.box(1.1, 0.3, 0.06, WOOD_L, { p: [x, h + 0.62, z - 0.16] }, 0.02); for (const s of [-0.45, 0.45]) k.box(0.07, 0.42, 0.32, WOOD, { p: [x + s, h + 0.21, z] }, 0.01); };
    const hay = (x: number, z: number, h: number) => k.cyl(0.42, 0.42, 0.7, '#e9c46a', { p: [x, h + 0.42, z], r: [Math.PI / 2, 0, 0.3], jitter: 0.12 }, 12);
    const scarecrow = (x: number, z: number, h: number) => {
      k.cyl(0.05, 0.05, 1.7, WOOD, { p: [x, h + 0.85, z] }, 6); k.box(1.1, 0.06, 0.06, WOOD, { p: [x, h + 1.25, z] }, 0.01);
      k.box(0.5, 0.55, 0.22, '#c0504d', { p: [x, h + 1.15, z] }, 0.05); k.sphere(0.2, '#e9c46a', { p: [x, h + 1.62, z] }, 8, 6);
      k.cyl(0.36, 0.38, 0.03, '#d9a441', { p: [x, h + 1.78, z] }, 12); k.cyl(0.18, 0.2, 0.16, '#e9c46a', { p: [x, h + 1.86, z] }, 10);
    };
    const flowerbox = (x: number, z: number, h: number) => { k.box(0.9, 0.25, 0.35, WOOD, { p: [x, h + 0.13, z] }, 0.03); for (let i = 0; i < 6; i++) k.sphere(0.07, ['#ef5b8e', '#ffd54f', '#ffffff'][i % 3], { p: [x - 0.35 + i * 0.14, h + 0.33, z + (i % 2 ? 0.06 : -0.06)], wind: 1 }, 6, 5); };
    // bancos: casa, lago, cachoeira e lagoa da várzea
    for (const [x, z] of [[30, 22.5], [LAKE.cx - 2, LAKE.cy + LAKE.ry + 1.6], [WATERFALL.x - 4, WATERFALL.z + 6], [PONDS[2].cx + 7, PONDS[2].cy], [48, 12], [20, 30]] as [number, number][]) put(bench, x, z);
    // espantalho em cada campo (no canto de fora da cerca)
    for (const f of FIELDS) put(scarecrow, f.x + f.cols * 2 + 0.9, f.y + 0.5);
    // fardos de feno pela pastagem e floreiras pelo vale e várzea
    for (let i = 0; i < 14; i++) put(hay, 4 + ((i * 37) % 44), 72 + ((i * 53) % 16));
    for (let i = 0; i < 10; i++) put(flowerbox, 36 + ((i * 29) % 24), 4 + ((i * 17) % 12));
    for (let i = 0; i < 12; i++) put(flowerbox, 6 + ((i * 47) % 118), 95 + ((i * 13) % 6));
    // píer no lago
    { const x0 = LAKE.cx - 1, z0 = LAKE.cy + LAKE.ry - 0.2; for (let i = 0; i < 9; i++) k.box(1.3, 0.07, 0.32, i % 2 ? WOOD_L : '#b9824e', { p: [x0, 0.12, z0 - i * 0.34], jitter: 0.08 }, 0.01); for (const s of [-0.6, 0.6]) for (let i = 0; i < 3; i++) k.cyl(0.06, 0.07, 0.9, WOOD, { p: [x0 + s, -0.2, z0 - i * 1.3] }, 6); }
    // mirante na serra: deck elevado com guarda-corpo
    { const x = 120, z = 40, h = heightAt(x, z); k.box(2.4, 0.12, 2.4, WOOD_L, { p: [x, h + 1.2, z] }, 0.03); for (const [dx, dz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) k.cyl(0.08, 0.1, 1.2, WOOD, { p: [x + dx, h + 0.6, z + dz] }, 6); for (const dz of [-1.15, 1.15]) k.box(2.4, 0.06, 0.06, WOOD, { p: [x, h + 1.7, z + dz] }, 0.01); for (const dx of [-1.15, 1.15]) k.box(0.06, 0.06, 2.4, WOOD, { p: [x + dx, h + 1.7, z] }, 0.01); for (let i = 0; i < 5; i++) k.box(0.9, 0.06, 0.28, WOOD, { p: [x, h + 0.2 + i * 0.22, z + 1.4 + i * 0.25] }, 0.01); }
    // gazebo no vale
    { const x = 56, z = 14, h = heightAt(x, z); k.cyl(1.4, 1.4, 0.15, STONE, { p: [x, h + 0.07, z] }, 8); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.cyl(0.07, 0.07, 1.8, '#f6f1e4', { p: [x + Math.cos(a) * 1.2, h + 1, z + Math.sin(a) * 1.2] }, 6); } k.cone(1.7, 0.9, '#c0504d', { p: [x, h + 2.35, z] }, 6); k.sphere(0.12, '#f6c445', { p: [x, h + 2.85, z] }, 6, 5); }
    // muretas de pedra na serra
    for (let i = 0; i < 18; i++) { const x = 110 + ((i * 7) % 16), z = 4 + ((i * 11) % 38); put((xx, zz, h) => { for (let j = 0; j < 3; j++) k.box(0.55, 0.35, 0.4, j % 2 ? STONE : '#868c92', { p: [xx + j * 0.5, h + 0.18, zz], jitter: 0.1 }, 0.06); }, x, z); }
    // pedras e respingos em volta da cachoeira
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI + Math.PI, x = WATERFALL.x + Math.cos(a) * 3.6, z = WATERFALL.z + 1 + Math.sin(a) * 1.6; k.ico(0.35 + (i % 3) * 0.12, '#8e9499', { p: [x, heightAt(x, z) + 0.15, z] }, 0); }
    void RIVER; void MAP_W; void MAP_H;
  }

  // ---------------------------------------------------------------- vaga-lumes (perto da câmera, só à noite)
  private fireflies() {
    const n = 70;
    const g = new THREE.BufferGeometry();
    this.flyBase = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { this.flyBase[i * 3] = (Math.random() - 0.5) * 26; this.flyBase[i * 3 + 1] = 0.3 + Math.random() * 1.6; this.flyBase[i * 3 + 2] = (Math.random() - 0.5) * 20; }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.flies = new THREE.Points(g, new THREE.PointsMaterial({ color: '#f8ff9c', size: 0.16, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.flies.frustumCulled = false;
    this.eng.scene.add(this.flies);
  }

  /** Atualiza luz, céu, neblina, lampiões e vaga-lumes conforme a hora. */
  update(now: number, t: number, focus: THREE.Vector3) {
    const n = nightOf(now), d = duskOf(now);
    this.night = n;
    const { sun, hemi, scene } = this.eng;
    sun.intensity = 2.4 * (1 - 0.72 * n) * (1 - 0.15 * d);
    sun.color.copy(this.sunDay).lerp(this.sunDusk, d * 0.8).lerp(this.sunNight, n);
    hemi.intensity = 1.35 * (1 - 0.42 * n);
    hemi.color.copy(this.hemiDay).lerp(this.hemiNight, n);
    hemi.groundColor.copy(this.groundDay).lerp(this.groundNight, n * 0.8);
    const fog = scene.fog as THREE.Fog;
    fog.color.copy(this.fogDay).lerp(this.fogDusk, d * 0.6).lerp(this.fogNight, n);
    // céu: a textura de dia; com o pôr do sol vira cor sólida que escurece
    if (n > 0.02 || d > 0.3) scene.background = fog.color; else scene.background = this.skyTex as THREE.Texture;
    this.glow.emissiveIntensity = n * 2.2;
    if (this.flies) {
      const m = this.flies.material as THREE.PointsMaterial;
      m.opacity = gfx.quality === 'low' ? 0 : n * 0.95;
      if (m.opacity > 0.01) {
        const pos = this.flies.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          const bx = this.flyBase[i * 3], by = this.flyBase[i * 3 + 1], bz = this.flyBase[i * 3 + 2];
          pos.setXYZ(i, focus.x + bx + Math.sin(t * 0.7 + i) * 0.6, by + Math.sin(t * 1.3 + i * 2.1) * 0.25, focus.z + bz + Math.cos(t * 0.6 + i * 1.7) * 0.6);
        }
        pos.needsUpdate = true;
        m.size = 0.12 + Math.abs(Math.sin(t * 3)) * 0.06;
      }
    }
  }
}
