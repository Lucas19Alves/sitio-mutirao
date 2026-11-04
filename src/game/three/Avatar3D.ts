// Personagem no mundo 3D: modelo com esqueleto, etiqueta de nome, silhueta visível atrás de
// prédios/árvores e interpolação para jogadores remotos. Posição em tiles (x, z).
import * as THREE from 'three';
import { Character3D, type ToolKind } from './kit/character.ts';
import { blobShadowMaterial } from './kit/materials.ts';
import type { Overlay, Tag } from './Fx.ts';
import { heightAt } from './World.ts';
import { TILE } from '../../data/catalog.ts';

export const TOOL_OF: Record<string, ToolKind> = { chop: 'axe', mine: 'pickaxe', dig: 'shovel', harvest: 'sickle', build: 'hammer', plant: 'seeds' };
// silhueta: desenhada depois do cenário e ANTES do personagem; onde o corpo aparece ele a cobre,
// onde um prédio ou árvore o esconde, sobra só a silhueta
const xrayMat = new THREE.MeshBasicMaterial({ color: '#ffe7a3', depthFunc: THREE.GreaterDepth, depthWrite: false });

export class Avatar3D {
  c: Character3D;
  x = 0; z = 0; heading = 0;
  /** alvo de interpolação (remotos) */
  tx = 0; tz = 0; th = 0;
  anim = 'idle';
  lastSeen = 0;
  tag: Tag;
  private shadow: THREE.Mesh;
  private xray: THREE.SkinnedMesh;

  constructor(scene: THREE.Scene, overlay: Overlay, x: number, z: number, public name: string, look: unknown, public me: boolean) {
    this.c = new Character3D(look);
    scene.add(this.c.root);
    // silhueta: mesma malha e mesmo esqueleto, só aparece onde está escondida
    this.xray = new THREE.SkinnedMesh(this.c.mesh.geometry, xrayMat);
    this.xray.bind(this.c.mesh.skeleton, this.c.mesh.bindMatrix);
    this.xray.frustumCulled = false; this.xray.renderOrder = 9;
    this.c.mesh.renderOrder = 10;
    this.c.mesh.parent!.add(this.xray);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.34, 16), blobShadowMaterial());
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);
    this.tag = overlay.tag(escapeHtml(name), me ? 'w-name me' : 'w-name', new THREE.Vector3(), 1.75);
    this.x = this.tx = x; this.z = this.tz = z;
    this.place();
  }

  get lx() { return this.x * TILE; }
  get ly() { return this.z * TILE; }
  get pos() { return this.c.root.position; }

  setLook(look: unknown) {
    this.c.setLook(look);
    this.xray.geometry = this.c.mesh.geometry;
  }

  play(anim: string, fade = 0.18) {
    this.anim = anim;
    this.c.play(anim, fade, anim === 'run' ? 1.05 : 1);
    this.c.setTool(TOOL_OF[anim] ?? null);
  }

  place() {
    const y = Math.max(0, heightAt(this.x, this.z));
    this.c.root.position.set(this.x, y, this.z);
    this.c.root.rotation.y = this.heading;
    this.shadow.position.set(this.x, y + 0.02, this.z);
    this.tag.pos.set(this.x, y, this.z);
  }

  /** Remotos: aproxima posição e direção do último estado recebido. */
  follow(dt: number) {
    const dx = this.tx - this.x, dz = this.tz - this.z, d = Math.hypot(dx, dz);
    if (d > 8) { this.x = this.tx; this.z = this.tz; }
    else if (d > 0.01) { const k = Math.min(1, dt * 10); this.x += dx * k; this.z += dz * k; }
    let dh = this.th - this.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.heading += dh * Math.min(1, dt * 12);
    this.place();
  }

  update(dt: number) { this.c.update(dt); }

  dispose(overlay: Overlay) { this.c.dispose(); this.shadow.removeFromParent(); overlay.remove(this.tag); }
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
