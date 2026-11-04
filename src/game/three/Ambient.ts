// Vida no mundo: galinhas que ciscam e passeiam, borboletas nas flores e pássaros que cruzam o céu.
import * as THREE from 'three';
import { Kit } from './kit/geo.ts';
import { matVC } from './kit/materials.ts';
import { heightAt } from './World.ts';
import { gfx } from '../gfx.ts';

function henGeo() {
  const body = new Kit();
  body.sphere(0.2, '#fbf8ef', { p: [0, 0.3, 0], s: [1, 0.85, 1.25] }, 10, 8);
  body.sphere(0.1, '#f4efe2', { p: [0, 0.4, -0.22], s: [1, 1.4, 0.6] }, 8, 6);
  body.sphere(0.1, '#ece4d0', { p: [0.16, 0.32, 0], s: [0.4, 0.7, 1] }, 8, 6);
  body.sphere(0.1, '#ece4d0', { p: [-0.16, 0.32, 0], s: [0.4, 0.7, 1] }, 8, 6);
  for (const s of [-1, 1]) body.cyl(0.012, 0.012, 0.16, '#e0a21c', { p: [s * 0.07, 0.09, 0] }, 4);
  const head = new Kit();
  head.sphere(0.1, '#fbf8ef', { p: [0, 0, 0] }, 8, 6);
  head.cone(0.03, 0.08, '#f2a62c', { p: [0, -0.01, 0.11], r: [Math.PI / 2, 0, 0] }, 5);
  for (let i = 0; i < 3; i++) head.sphere(0.03, '#e2473e', { p: [0, 0.09, 0.02 - i * 0.035] }, 6, 5);
  head.sphere(0.022, '#e2473e', { p: [0, -0.07, 0.07] }, 5, 4);
  for (const s of [-1, 1]) head.sphere(0.014, '#2b1d14', { p: [s * 0.06, 0.02, 0.06] }, 5, 4);
  return { body: body.build(), head: head.build() };
}

function butterflyGeo(col: string) {
  const k = new Kit();
  k.capsule(0.012, 0.06, '#3b2c22', { r: [Math.PI / 2, 0, 0] });
  const wing = new Kit();
  wing.add(new THREE.CircleGeometry(0.07, 8), col, { p: [0.06, 0, 0], r: [-Math.PI / 2, 0, 0], s: [1, 1.2, 1] });
  return { body: k.build(), wing: wing.build() };
}

interface Hen { g: THREE.Group; head: THREE.Object3D; x: number; z: number; tx: number; tz: number; home: [number, number]; t: number; peck: number }
interface Bfly { g: THREE.Group; l: THREE.Object3D; r: THREE.Object3D; c: THREE.Vector3; ph: number }

export class Ambient {
  private hens: Hen[] = [];
  private bflies: Bfly[] = [];
  private birds: { g: THREE.Group; v: THREE.Vector3; t: number; wings: THREE.Object3D[] }[] = [];
  private birdAt = 6;
  constructor(private scene: THREE.Scene, home: [number, number], flowers: [number, number][]) {
    const hg = henGeo();
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(hg.body, matVC); b.castShadow = true;
      const head = new THREE.Mesh(hg.head, matVC); head.position.set(0, 0.5, 0.2); head.castShadow = true;
      g.add(b, head); g.scale.setScalar(0.85);
      scene.add(g);
      const x = home[0] + (i - 1.5) * 0.8, z = home[1] + (i % 2) * 0.7;
      this.hens.push({ g, head, x, z, tx: x, tz: z, home: [home[0], home[1]], t: Math.random() * 2, peck: 0 });
    }
    const cols = ['#f6c445', '#f29bc0', '#7fc6ee', '#ffffff'];
    flowers.slice(0, 10).forEach(([x, z], i) => {
      const bg = butterflyGeo(cols[i % cols.length]);
      const g = new THREE.Group();
      const l = new THREE.Mesh(bg.wing, matVC), r = new THREE.Mesh(bg.wing, matVC); r.scale.x = -1;
      g.add(new THREE.Mesh(bg.body, matVC), l, r);
      scene.add(g);
      this.bflies.push({ g, l, r, c: new THREE.Vector3(x, 0.8, z), ph: Math.random() * 10 });
    });
  }

  private spawnBirds(center: THREE.Vector3) {
    const dir = new THREE.Vector3(Math.random() < 0.5 ? 1 : -1, 0, (Math.random() - 0.5) * 0.4).normalize();
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const k = new Kit(); k.capsule(0.05, 0.12, '#3f4b5c', { r: [Math.PI / 2, 0, 0] });
      const wk = new Kit(); wk.box(0.3, 0.02, 0.1, '#4f5d70', { p: [0.15, 0, 0] }, 0.01);
      const wg = wk.build();
      const wl = new THREE.Mesh(wg, matVC), wr = new THREE.Mesh(wg, matVC); wr.scale.x = -1;
      g.add(new THREE.Mesh(k.build(), matVC), wl, wr);
      g.position.copy(center).addScaledVector(dir, -22).add(new THREE.Vector3(i * -0.7, 6 + i * 0.3, i * 0.6));
      g.lookAt(g.position.clone().add(dir));
      this.scene.add(g);
      this.birds.push({ g, v: dir.clone().multiplyScalar(5), t: 0, wings: [wl, wr] });
    }
  }

  update(dt: number, t: number, focus: THREE.Vector3) {
    const calm = gfx.reduceMotion || gfx.quality === 'low';
    for (const h of this.hens) {
      h.t -= dt;
      if (h.t <= 0) {
        if (Math.random() < 0.45) { h.peck = 1.2; h.t = 1.4 + Math.random() * 1.5; }
        else { h.tx = h.home[0] + (Math.random() - 0.5) * 4; h.tz = h.home[1] + (Math.random() - 0.5) * 2.5; h.t = 2 + Math.random() * 2; }
      }
      const dx = h.tx - h.x, dz = h.tz - h.z, d = Math.hypot(dx, dz);
      if (h.peck > 0) { h.peck -= dt; h.head.position.y = 0.5 - Math.max(0, Math.sin(h.peck * 14)) * 0.18; }
      else if (d > 0.05) { const s = Math.min(d, dt * 0.9); h.x += (dx / d) * s; h.z += (dz / d) * s; h.g.rotation.y = Math.atan2(dx, dz); h.head.position.y = 0.5 + Math.sin(t * 16) * 0.02; }
      h.g.position.set(h.x, heightAt(h.x, h.z) + (d > 0.05 && h.peck <= 0 ? Math.abs(Math.sin(t * 12)) * 0.03 : 0), h.z);
    }
    for (const b of this.bflies) {
      b.g.visible = !calm;
      if (calm) continue;
      const p = t * 0.6 + b.ph;
      b.g.position.set(b.c.x + Math.sin(p) * 1.2, b.c.y + Math.sin(p * 2.3) * 0.25, b.c.z + Math.cos(p * 0.8) * 0.9);
      b.g.rotation.y = p + Math.PI / 2;
      const f = Math.sin(t * 22 + b.ph) * 1.1;
      b.l.rotation.z = f; b.r.rotation.z = -f;
    }
    if (!calm) { this.birdAt -= dt; if (this.birdAt <= 0) { this.birdAt = 14 + Math.random() * 12; this.spawnBirds(focus); } }
    this.birds = this.birds.filter((b) => {
      b.t += dt; b.g.position.addScaledVector(b.v, dt);
      const f = Math.sin(b.t * 12) * 0.7; b.wings[0].rotation.z = f; b.wings[1].rotation.z = -f;
      if (b.t > 9) { b.g.removeFromParent(); return false; }
      return true;
    });
  }
}
