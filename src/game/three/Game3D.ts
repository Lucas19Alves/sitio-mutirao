// O jogo 3D: liga o estado da fazenda (Supabase) à cena Three.js. Movimento é a ação principal;
// cortar, minerar, ceifar, colher e plantar acontecem sozinhos por proximidade; prédios abrem
// seus painéis quando o personagem chega perto e fecham quando ele se afasta.
import * as THREE from 'three';
import {
  BUILDINGS, BUILDING_BY_ID, REGIONS, WORLD_NODES, NODE_BY_ID, CROP_BY_ID, ITEM_BY_ID, TOOL_BY_ID, WORKER_BY_ID,
  MAP_W, MAP_H, TILE, FIELD, PLOT_COUNT, SPAWN, plotTile, doorTile, buildWalkGrid, regionAt, isWater, workerPeriodMs,
  type WorldNode, type ToolId,
} from '../../data/catalog.ts';
import { store } from '../state/store.ts';
import { bus } from '../bus.ts';
import { realtime, type PosMsg, type PresenceMeta } from '../multiplayer/realtime.ts';
import { findPath } from '../systems/pathfinding.ts';
import { growMs, plotCount, capacity } from '../rules.ts';
import { errorText } from '../../utils/errors.ts';
import { play } from '../audio.ts';
import { gfx } from '../gfx.ts';
import { iconUrl } from '../art/icons.ts';
import { Engine } from './Engine.ts';
import { World, regionLock, heightAt } from './World.ts';
import { matVC, matGlass, labelTexture } from './kit/materials.ts';
import { nodeGeometries } from './kit/nature.ts';
import { buildingModel, constructionModel, lotModel, type BuildingModel } from './kit/buildings.ts';
import { soilGeometry, cropGeometry, stageOf } from './kit/crops.ts';
import { IMPACT, clips } from './kit/character.ts';
import { Avatar3D, escapeHtml } from './Avatar3D.ts';
import { Overlay, Particles, Drops, Smoke, type Tag } from './Fx.ts';
import { Ambient } from './Ambient.ts';
import { minimapCanvas } from './minimap.ts';
import { shared } from '../shared.ts';

const SPEED = 4.3;          // tiles/s
const R_PLAYER = 0.27;
const WORK_CLIP: Record<string, string> = { axe: 'chop', pickaxe: 'mine', shovel: 'dig', sickle: 'harvest' };
const RADIUS: Record<string, number> = { tree_oak: 0.3, tree_big: 0.42, apple_tree: 0.32, orange_tree: 0.32, peach_tree: 0.32, rock_small: 0.32, rock_big: 0.5, coal: 0.36, copper: 0.36, iron: 0.36, gold: 0.46, crystal: 0.36 };
const CHIP: Record<string, string[]> = { axe: ['#d9a766', '#a8713f', '#7cb342'], pickaxe: ['#a7adb2', '#868c92', '#cfd4d8'], shovel: ['#c97b4a', '#ead69e'], sickle: ['#8fcf4a', '#6fb043'] };
const ENTER_R = 1.55, EXIT_R = 2.35, CLOSE_MS = 650;

export type Target = { kind: 'node'; id: string } | { kind: 'building'; id: string } | { kind: 'plot'; e: 'field'; i: number } | { kind: 'sign'; region: string };
export type Zone = { k: 'b'; id: string } | { k: 'field' } | { k: 'region'; id: string } | null;

interface NodeView { n: WorldNode; def: (typeof NODE_BY_ID)[string]; idx: number; x: number; z: number; rot: number; sc: number; off: boolean; anim: number; kind: 'shake' | 'pop' | ''; r: number }
interface BView { def: (typeof BUILDINGS)[number]; g: THREE.Group; main: THREE.Group; site: THREE.Mesh; lot: THREE.Mesh; blades?: THREE.Mesh; model: BuildingModel; built: boolean | null; smokeAt: number; ready: Tag; badge: Tag; bar: Tag; pop: number }
interface Work { kind: 'node' | 'plot'; nv?: NodeView; plot?: number; action?: 'reap' | 'plant'; clip: string; hits: number; need: number; last: number; x: number; z: number; reach: number }
interface Helper { id: string; av: Avatar3D; path: [number, number][]; state: 'go' | 'work' | 'back' | 'drop'; t: number; node: [number, number]; home: [number, number] }

export interface WorldInit { me: { id: string; name: string; look: Record<string, number> } }

export class Game3D {
  eng: Engine;
  me!: Avatar3D;
  private overlay: Overlay;
  private world: World;
  private fx: Particles;
  private drops: Drops;
  private smoke: Smoke;
  private ambient: Ambient;
  private remotes = new Map<string, Avatar3D>();
  private nodes = new Map<string, NodeView>();
  private nodeCells = new Map<number, NodeView[]>();
  private inst = new Map<string, { full: THREE.InstancedMesh; off: THREE.InstancedMesh; list: NodeView[] }>();
  private pending = new Set<string>();
  private pendingPlots = new Set<number>();
  private plots: { g: THREE.Group; crop: THREE.Mesh; key: string; pop: number }[] = [];
  private bviews: Record<string, BView> = {};
  private locks: Record<string, THREE.Group> = {};
  private signs: Record<string, THREE.Vector3> = {};
  private helpers = new Map<string, Helper>();
  private grid = new Uint8Array(MAP_W * MAP_H);
  private move = new Uint8Array(MAP_W * MAP_H);
  private boxes: [number, number, number, number][] = [];
  private keys = new Set<string>();
  private joy = { x: 0, y: 0 };
  private path: [number, number][] = [];
  private onArrive: (() => void) | null = null;
  private forced: string | null = null;
  private work: Work | null = null;
  private cool = 0;
  private pose: { name: string; until: number } | null = null;
  /** zona atual (prédio, campo ou placa de região) — lida pelos testes */
  zone: Zone = null;
  private zoneKey = '';
  private zoneLeft = 0;
  private bubble: Tag;
  private bubbleUntil = 0;
  private camTarget = new THREE.Vector3();
  private camFocus: { p: THREE.Vector3; until: number } | null = null;
  private dist = 13;
  /** desloca a câmera quando um painel de prédio ocupa o topo da tela (celular) */
  private viewShift = 0;
  private ctxOpen = false;
  private shake = 0;
  private vel = new THREE.Vector2();
  private lastSig = '';
  private moving = false;
  private firstRefresh = true;
  private seed = '';
  private offs: (() => void)[] = [];
  private timers: number[] = [];
  private tmp = new THREE.Vector3();
  private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private s3 = new THREE.Vector3(); private p3 = new THREE.Vector3();

  constructor(host: HTMLElement, private meInfo: WorldInit['me']) {
    this.eng = new Engine(host);
    shared.ground ??= minimapCanvas();
    this.overlay = new Overlay(host, this.eng.camera);
    this.world = new World(this.eng.scene);
    this.fx = new Particles(this.eng.scene);
    this.drops = new Drops(this.eng.scene);
    this.smoke = new Smoke(this.eng.scene);
    this.bubble = this.overlay.tag('', 'w-bubble', new THREE.Vector3(), 2.15); this.bubble.on = false;
    try { this.seed = localStorage.getItem('sm-seed') ?? ''; } catch { /* sem storage */ }

    this.buildNodes();
    this.buildPlots();
    this.buildBuildings();
    this.buildLocks();
    const fh = BUILDING_BY_ID.farmhouse.spot;
    const flowers = WORLD_NODES.filter((n) => n.t === 'wildflower' || n.t === 'grass').slice(0, 10).map((n) => [n.x + 0.5, n.y + 0.5] as [number, number]);
    this.ambient = new Ambient(this.eng.scene, [fh.x - 1.2, fh.y + fh.h + 0.8], [[FIELD.x - 1, FIELD.y + 2], [FIELD.x + 9, FIELD.y + 1], ...flowers]);

    const saved = this.loadPos();
    this.me = new Avatar3D(this.eng.scene, this.overlay, saved.x, saved.z, meInfo.name, meInfo.look, true);
    this.camTarget.set(this.me.x, 0, this.me.z);
    this.dist = this.defaultDist();
    this.setupInput();
    this.refreshAll();

    this.offs.push(
      bus.on('state:delta', () => this.refreshAll()),
      bus.on('state:reset', () => this.refreshAll()),
      bus.on('regions', () => { play('build'); this.celebrate(); }),
      bus.on('levelup', () => { play('level'); this.celebrate(); }),
      bus.on('cheer', () => this.celebrate(false)),
      bus.on('net:pos', (p: PosMsg) => this.onRemotePos(p)),
      bus.on('net:presence', (metas: PresenceMeta[]) => this.onPresence(metas)),
      bus.on('net:need-pos', () => this.sendPos(true)),
      bus.on('net:emote', (e: { u: string; k: string }) => { const a = this.remotes.get(e.u); if (a) this.overlay.float(escapeHtml(e.k), a.pos.clone().setY(2.1), 'w-float emote'); }),
      bus.on('emote', (k: string) => { realtime.emote(k); this.overlay.float(escapeHtml(k), this.me.pos.clone().setY(2.1), 'w-float emote'); }),
      bus.on('zoom', (f: number) => this.setDist(this.dist / f)),
      bus.on('joy', (v: { x: number; y: number }) => { this.joy = v; }),
      bus.on('look', (look: Record<string, number>) => this.me.setLook(look)),
      bus.on('seed', (c: string) => { this.seed = c; }),
      bus.on('focus', (t: { x: number; y: number }) => { this.camFocus = { p: new THREE.Vector3(t.x, 0, t.y), until: performance.now() + 2600 }; }),
      bus.on('recenter', () => { this.camFocus = null; }),
      bus.on('ctxpanel', (on: boolean) => { this.ctxOpen = on; }),
      bus.on('pose', (n: string) => this.setPose(n, 1100)),
      gfx.subscribe(() => this.eng.applyQuality()),
    );
    this.onPresence(realtime.metas, true);
    for (const p of realtime.lastPos.values()) this.onRemotePos(p);
    this.sendPos(true);
    this.timers.push(window.setInterval(() => this.tick500(), 500));
    this.timers.push(window.setInterval(() => this.claimHelpers(), 20000));
    this.eng.add({ update: (dt, t) => this.update(dt, t) });
    this.eng.start();
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__mutirao = { store, scene: this, remotes: () => [...this.remotes.entries()].map(([u, a]) => ({ u, x: a.lx, y: a.ly })) };
    }
    (window as unknown as Record<string, unknown>).__THREE_GAME_DIAGNOSTICS__ = { renderer: this.eng.renderer.info, get state() { return { player: 'ok' }; } };
    bus.emit('world:ready');
  }

  // ================================================================ construção da cena
  private buildNodes() {
    const geos = nodeGeometries();
    const byType = new Map<string, WorldNode[]>();
    for (const n of WORLD_NODES) (byType.get(n.t) ?? byType.set(n.t, []).get(n.t)!).push(n);
    for (const [t, list] of byType) {
      const [gFull, gOff] = geos[t];
      const full = new THREE.InstancedMesh(gFull, matVC, list.length), off = new THREE.InstancedMesh(gOff, matVC, list.length);
      for (const m of [full, off]) { m.castShadow = true; m.receiveShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.eng.scene.add(m); }
      const views: NodeView[] = list.map((n, idx) => {
        const h = Math.sin(n.x * 12.9 + n.y * 78.2) * 43758.5; const r = h - Math.floor(h);
        const def = NODE_BY_ID[n.t];
        const v: NodeView = { n, def, idx, x: n.x + 0.5, z: n.y + 0.55, rot: r * Math.PI * 2, sc: 0.9 + r * 0.22, off: false, anim: 0, kind: '', r: def.solid ? (RADIUS[n.t] ?? 0.3) : 0 };
        this.nodes.set(n.id, v);
        const cell = n.y * MAP_W + n.x;
        (this.nodeCells.get(cell) ?? this.nodeCells.set(cell, []).get(cell)!).push(v);
        return v;
      });
      this.inst.set(t, { full, off, list: views });
      views.forEach((v) => this.writeNode(v));
      full.computeBoundingSphere(); off.computeBoundingSphere();
    }
  }

  private writeNode(v: NodeView) {
    const I = this.inst.get(v.n.t)!;
    const y = heightAt(v.x, v.z);
    let sc = v.sc, tilt = 0;
    if (v.kind === 'shake') tilt = Math.sin(v.anim * 40) * 0.08 * v.anim / 0.3;
    if (v.kind === 'pop') sc = v.sc * (0.3 + 0.7 * easeBack(1 - v.anim / 0.45));
    this.e.set(tilt, v.rot, tilt * 0.6); this.q.setFromEuler(this.e);
    this.p3.set(v.x, y, v.z);
    this.s3.setScalar(v.off ? 0 : sc);
    if (v.kind === 'shake' && !v.off) this.s3.set(sc * (1 + v.anim * 0.25), sc * (1 - v.anim * 0.2), sc * (1 + v.anim * 0.25));
    I.full.setMatrixAt(v.idx, this.m4.compose(this.p3, this.q, this.s3));
    this.s3.setScalar(v.off ? v.sc : 0);
    I.off.setMatrixAt(v.idx, this.m4.compose(this.p3, this.q, this.s3));
    I.full.instanceMatrix.needsUpdate = true; I.off.instanceMatrix.needsUpdate = true;
  }

  private buildPlots() {
    const soil = soilGeometry(false), locked = soilGeometry(true);
    for (let i = 0; i < PLOT_COUNT; i++) {
      const t = plotTile(i);
      const g = new THREE.Group(); g.position.set(t.x, 0, t.y);
      const s = new THREE.Mesh(soil, matVC); s.receiveShadow = true; s.name = 'soil';
      const l = new THREE.Mesh(locked, matVC); l.name = 'locked'; l.visible = false; l.castShadow = true;
      const crop = new THREE.Mesh(soil, matVC); crop.castShadow = true; crop.visible = false;
      g.add(s, l, crop);
      this.eng.scene.add(g);
      this.plots.push({ g, crop, key: '', pop: 0 });
    }
  }

  private buildBuildings() {
    const sizes = new Map<string, [THREE.BufferGeometry, THREE.BufferGeometry]>();
    for (const def of BUILDINGS) {
      const { x, y, w, h } = def.spot;
      const key = `${w}x${h}`;
      if (!sizes.has(key)) sizes.set(key, [constructionModel(w, h), lotModel(w, h)]);
      const [cg, lg] = sizes.get(key)!;
      const model = buildingModel(def);
      const g = new THREE.Group(); g.position.set(x, 0, y);
      const main = new THREE.Group();
      const o = new THREE.Mesh(model.opaque, matVC); o.castShadow = true; o.receiveShadow = true; main.add(o);
      if (model.glass) main.add(new THREE.Mesh(model.glass, matGlass));
      let blades: THREE.Mesh | undefined;
      if (model.blades) { blades = new THREE.Mesh(model.blades.geo, matVC); blades.castShadow = true; blades.position.set(...model.blades.pivot); main.add(blades); }
      const site = new THREE.Mesh(cg, matVC); site.castShadow = true;
      const lot = new THREE.Mesh(lg, matVC); lot.castShadow = true;
      g.add(main, site, lot);
      this.eng.scene.add(g);
      const top = new THREE.Vector3(x + model.anchors.top[0], model.anchors.top[1], y + model.anchors.top[2]);
      const ready = this.overlay.tag('', 'w-ready', top.clone(), 0.2); ready.on = false;
      const badge = this.overlay.tag('', 'w-badge', new THREE.Vector3(x + w - 0.4, 0.2, y + h), 0); badge.on = false;
      const bar = this.overlay.tag('<i></i>', 'w-bar', new THREE.Vector3(x + w / 2, 2.3, y + h / 2), 0); bar.on = false;
      this.bviews[def.id] = { def, g, main, site, lot, blades, model, built: null, smokeAt: 0, ready, badge, bar, pop: 0 };
    }
  }

  private buildLocks() {
    for (const r of REGIONS) {
      if (r.id === 'sitio') continue;
      const grp = regionLock(r.id);
      this.eng.scene.add(grp);
      this.locks[r.id] = grp;
      // a placa fica na borda da região mais próxima do sítio (alcançável a pé)
      const { x, y, w, h } = r.rect;
      const cx = Math.max(x + 1, Math.min(x + w - 1, SPAWN.x)), cz = Math.max(y + 1, Math.min(y + h - 1, SPAWN.y));
      const edge = [[cx, y - 0.6], [cx, y + h + 0.6], [x - 0.6, cz], [x + w + 0.6, cz]] as [number, number][];
      const best = edge.sort((a, b) => Math.hypot(a[0] - SPAWN.x, a[1] - SPAWN.y) - Math.hypot(b[0] - SPAWN.x, b[1] - SPAWN.y))[0];
      const sign = grp.userData.sign as THREE.Group;
      sign.position.set(best[0], heightAt(best[0], best[1]), best[1]);
      this.signs[r.id] = sign.position.clone();
    }
  }

  // ================================================================ entrada
  private setupInput() {
    const el = this.eng.renderer.domElement;
    const down = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.closest?.('input,textarea,select')) return; this.keys.add(e.key.toLowerCase()); };
    const up = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
    const blur = () => this.keys.clear();
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    this.offs.push(() => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); });
    const pts = new Map<number, { x: number; y: number; sx: number; sy: number }>();
    let pinch = 0, pinchD = 0;
    el.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); pinchD = this.dist; } });
    el.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return; p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; this.setDist(pinchD * pinch / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y))); }
    });
    const end = (e: PointerEvent) => {
      const p = pts.get(e.pointerId); pts.delete(e.pointerId);
      if (pts.size < 2) pinch = 0;
      if (!p || pinchD && pts.size) return;
      if (Math.hypot(p.x - p.sx, p.y - p.sy) < 10) this.tap(e.clientX, e.clientY);
      if (!pts.size) pinchD = 0;
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', (e) => pts.delete(e.pointerId));
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.setDist(this.dist * (e.deltaY > 0 ? 1.1 : 0.9)); }, { passive: false });
  }

  private ray = new THREE.Raycaster();
  /** Toque/clique no chão: anda até lá (o resto acontece por proximidade). */
  private tap(cx: number, cy: number) {
    const r = this.eng.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.eng.camera);
    const hit = this.ray.intersectObject(this.world.terrain, false)[0];
    if (!hit) return;
    const tx = Math.floor(hit.point.x), tz = Math.floor(hit.point.z);
    // tocou num recurso ou prédio: vai até ele
    const nv = this.nodeCells.get(tz * MAP_W + tx)?.[0];
    if (nv) { this.interact({ kind: 'node', id: nv.n.id }); return; }
    const b = BUILDINGS.find((b) => tx >= b.spot.x && tx < b.spot.x + b.spot.w && tz >= b.spot.y && tz < b.spot.y + b.spot.h);
    if (b) { this.interact({ kind: 'building', id: b.id }); return; }
    this.walkTo(tx, tz);
  }

  private setDist(d: number) { this.dist = Math.max(6.5, Math.min(24, d)); }
  private defaultDist() { const a = this.eng.camera.aspect; return a < 0.8 ? 15.5 : a < 1.3 ? 14 : 12.5; }

  // ================================================================ movimento
  private walkable(tx: number, ty: number) { return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && !!this.grid[ty * MAP_W + tx]; }

  walkTo(tx: number, ty: number, then?: () => void) {
    if (!this.walkable(tx, ty)) {
      const r = regionAt(tx, ty);
      if (r && !store.hasRegion(r)) bus.emit('toast', { kind: 'info', text: `${REGIONS.find((x) => x.id === r)!.name} ainda está fechado. Veja o projeto na placa.` });
      return false;
    }
    const p = findPath(this.grid, MAP_W, MAP_H, Math.floor(this.me.x), Math.floor(this.me.z), tx, ty);
    if (!p) return false;
    this.cancelWork();
    this.path = p; this.onArrive = then ?? null;
    if (!then) this.overlay.float('●', new THREE.Vector3(tx + 0.5, 0.2, ty + 0.5), 'w-float mark');
    if (!p.length) this.arrive();
    return true;
  }

  private arrive() { const cb = this.onArrive; this.onArrive = null; cb?.(); }

  private approach(cells: { x: number; y: number }[], then: () => void) {
    const hx = Math.floor(this.me.x), hz = Math.floor(this.me.z);
    if (cells.some((c) => c.x === hx && c.y === hz)) { this.path = []; then(); return; }
    const ok = cells.filter((c) => this.walkable(c.x, c.y)).sort((a, b) => Math.hypot(a.x - hx, a.y - hz) - Math.hypot(b.x - hx, b.y - hz));
    for (const c of ok.slice(0, 4)) if (this.walkTo(c.x, c.y, then)) return;
  }

  /** Vai até um alvo (toque, minimapa ou testes). Chegando perto, a ação acontece sozinha. */
  interact(t: Target) {
    if (t.kind === 'node') {
      const v = this.nodes.get(t.id); if (!v) return;
      const n = v.n, cells: { x: number; y: number }[] = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy || !v.def.solid) cells.push({ x: n.x + dx, y: n.y + dy });
      this.forced = t.id;
      this.approach(cells, () => { this.forced = t.id; });
    } else if (t.kind === 'building') {
      const d = doorTile(BUILDING_BY_ID[t.id].spot);
      this.approach([d, { x: d.x - 1, y: d.y }, { x: d.x + 1, y: d.y }, { x: d.x, y: d.y + 1 }], () => {});
    } else if (t.kind === 'plot') {
      const p = plotTile(t.i); this.walkTo(p.x, p.y + 1);
    } else { const s = this.signs[t.region]; if (s) this.walkTo(Math.floor(s.x), Math.floor(s.z)); }
  }

  /** Empurra o círculo do jogador para fora de tiles bloqueados, prédios e troncos/pedras. */
  private resolve(x: number, z: number): [number, number] {
    for (let it = 0; it < 3; it++) {
      const tx = Math.floor(x), tz = Math.floor(z);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const cx = tx + dx, cz = tz + dz;
        const blocked = cx < 0 || cz < 0 || cx >= MAP_W || cz >= MAP_H || !this.move[cz * MAP_W + cx];
        if (blocked) [x, z] = pushBox(x, z, cx, cz, cx + 1, cz + 1);
        for (const v of this.nodeCells.get(cz * MAP_W + cx) ?? []) {
          if (!v.r) continue;
          const r = v.off ? 0.2 : v.r * v.sc;
          const ddx = x - v.x, ddz = z - v.z, d = Math.hypot(ddx, ddz), min = r + R_PLAYER;
          if (d < min && d > 1e-4) { x = v.x + (ddx / d) * min; z = v.z + (ddz / d) * min; }
        }
      }
      for (const b of this.boxes) if (x > b[0] - 1 && x < b[2] + 1 && z > b[1] - 1 && z < b[3] + 1) [x, z] = pushBox(x, z, b[0], b[1], b[2], b[3]);
    }
    return [x, z];
  }

  // ================================================================ laço
  private update(dt: number, t: number) {
    const me = this.me;
    let ix = 0, iz = 0;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) ix -= 1;
    if (k.has('d') || k.has('arrowright')) ix += 1;
    if (k.has('w') || k.has('arrowup')) iz -= 1;
    if (k.has('s') || k.has('arrowdown')) iz += 1;
    if (!ix && !iz) { ix = this.joy.x; iz = this.joy.y; }
    const mag = Math.min(1, Math.hypot(ix, iz));
    let moved = false, speed = 0;
    if (mag > 0.08) {
      this.path = []; this.onArrive = null; this.forced = null; this.camFocus = null;
      const nx = ix / Math.hypot(ix, iz), nz = iz / Math.hypot(ix, iz);
      speed = SPEED * (0.35 + 0.65 * mag);
      const [x, z] = this.resolve(me.x + nx * speed * dt, me.z + nz * speed * dt);
      moved = Math.hypot(x - me.x, z - me.z) > 1e-4;
      me.x = x; me.z = z;
      me.heading = turn(me.heading, Math.atan2(nx, nz), dt * 14);
      this.vel.set(nx * speed, nz * speed);
    } else if (this.path.length) {
      const [tx, tz] = this.path[0];
      const gx = tx + 0.5, gz = tz + 0.5, dx = gx - me.x, dz = gz - me.z, d = Math.hypot(dx, dz);
      speed = SPEED;
      const step = speed * dt;
      if (d <= step) { me.x = gx; me.z = gz; this.path.shift(); if (!this.path.length) this.arrive(); }
      else { const [x, z] = this.resolve(me.x + (dx / d) * step, me.z + (dz / d) * step); me.x = x; me.z = z; }
      me.heading = turn(me.heading, Math.atan2(dx, dz), dt * 12);
      this.vel.set((dx / d) * speed, (dz / d) * speed);
      moved = true;
    } else if (this.forced && !this.work) {
      // aproximação final: depois do caminho em tiles, encosta no alvo até ficar ao alcance
      const v = this.nodes.get(this.forced);
      const dx = v ? v.x - me.x : 0, dz = v ? v.z - me.z : 0, d = Math.hypot(dx, dz), reach = v ? this.reachOf(v) * 0.85 : 0;
      if (!v || v.off || d <= reach) this.vel.multiplyScalar(0.8);
      else {
        const step = Math.min(d - reach, SPEED * 0.8 * dt);
        const [x, z] = this.resolve(me.x + (dx / d) * step, me.z + (dz / d) * step);
        if (Math.hypot(x - me.x, z - me.z) < step * 0.2) this.forced = null; // preso: desiste
        me.x = x; me.z = z; me.heading = turn(me.heading, Math.atan2(dx, dz), dt * 12); moved = true; speed = SPEED * 0.8;
      }
    } else this.vel.multiplyScalar(0.8);
    me.place();

    // trabalho automático por proximidade
    this.cool = Math.max(0, this.cool - dt);
    if (this.work) this.stepWork(dt, moved, ix, iz);
    else if (this.cool <= 0) this.pickWork(moved, mag > 0.08 ? [ix, iz] : null);

    // animação
    const carrying = store.bagUsed() >= store.bagCap() * 0.85 && store.bagUsed() > 0;
    let anim = moved ? (carrying ? 'carry' : speed > 3 ? 'run' : 'walk') : 'idle';
    if (this.work && !moved) anim = this.work.clip;
    if (!moved && this.pose && performance.now() < this.pose.until) anim = this.pose.name;
    if (me.anim !== anim) me.play(anim);
    me.update(dt);
    const sig = `${anim}${Math.round(me.heading * 10)}`;
    if (moved || sig !== this.lastSig) { this.sendPos(sig.slice(0, -1) !== this.lastSig.slice(0, -1)); this.lastSig = sig; }
    if (this.moving && !moved) this.sendPos(true);
    this.moving = moved;

    for (const a of this.remotes.values()) { a.follow(dt); a.update(dt); }
    this.stepHelpers(dt);
    this.updateZones();
    this.animateNodes(dt);
    this.animatePlots(dt);
    this.animateBuildings(dt, t);
    this.fx.update(dt); this.drops.update(dt); this.smoke.update(dt);
    this.world.update(dt, t);
    this.ambient.update(dt, t, this.camTarget);
    this.updateCamera(dt);
    this.bubble.pos.set(me.x, 0, me.z);
    if (this.bubble.on && performance.now() > this.bubbleUntil) this.bubble.on = false;
    this.overlay.update();
  }

  private updateCamera(dt: number) {
    const cam = this.eng.camera;
    const want = this.camFocus && performance.now() < this.camFocus.until ? this.tmp.copy(this.camFocus.p) : this.tmp.set(this.me.x + this.vel.x * 0.28, 0, this.me.z + this.vel.y * 0.28);
    if (this.camFocus && performance.now() >= this.camFocus.until) this.camFocus = null;
    const k = 1 - Math.exp(-dt * 6);
    this.viewShift += ((this.ctxOpen && this.eng.camera.aspect < 0.8 ? -2.6 : 0) - this.viewShift) * Math.min(1, dt * 5);
    want.z += this.viewShift;
    this.camTarget.lerp(want, k);
    this.camTarget.x = Math.max(3, Math.min(MAP_W - 3, this.camTarget.x));
    this.camTarget.z = Math.max(3, Math.min(MAP_H - 1, this.camTarget.z));
    const pitch = THREE.MathUtils.degToRad(this.eng.camera.aspect < 0.8 ? 56 : 52);
    cam.fov = cam.aspect < 0.8 ? 50 : 40; cam.updateProjectionMatrix();
    let sx = 0, sy = 0;
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt); sx = (Math.random() - 0.5) * this.shake * 0.5; sy = (Math.random() - 0.5) * this.shake * 0.5; }
    cam.position.set(this.camTarget.x + sx, Math.sin(pitch) * this.dist + sy, this.camTarget.z + Math.cos(pitch) * this.dist);
    cam.lookAt(this.camTarget.x + sx, 0.5, this.camTarget.z);
    this.eng.followShadow(this.camTarget.x, this.camTarget.z);
  }

  // ================================================================ trabalho automático
  /** Escolhe o alvo mais adequado: à frente > perto > da missão; só o que dá para usar agora. */
  private pickWork(moved: boolean, input: [number, number] | null) {
    const me = this.me;
    const fx = Math.sin(me.heading), fz = Math.cos(me.heading);
    let best: { v: NodeView; score: number; d: number; reach: number } | null = null;
    let blockedMsg = '';
    const tx = Math.floor(me.x), tz = Math.floor(me.z);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) for (const v of this.nodeCells.get((tz + dz) * MAP_W + tx + dx) ?? []) {
      if (v.off || this.pending.has(v.n.id) || !store.hasRegion(v.n.r)) continue;
      const ddx = v.x - me.x, ddz = v.z - me.z, d = Math.hypot(ddx, ddz);
      const reach = this.reachOf(v);
      if (d > reach + 0.4) continue;
      const facing = (ddx * fx + ddz * fz) / Math.max(1e-3, d);
      // passando por perto não dispara: precisa estar parado, indo na direção dele, ou ter tocado nele
      if (this.forced !== v.n.id) {
        if (d > reach) continue;
        if (input) { const ilen = Math.hypot(input[0], input[1]); if ((ddx * input[0] + ddz * input[1]) / (ilen * Math.max(1e-3, d)) < 0.75 || d > reach * 0.85) continue; }
        else if (moved) continue;
      }
      const def = v.def;
      if (def.tool && store.tool(def.tool) < def.tier) { blockedMsg = `🔒 ${TOOL_BY_ID[def.tool as ToolId].tiers[def.tier - 1].name}`; continue; }
      const score = d - facing * 0.6 - (this.forced === v.n.id ? 5 : 0);
      if (!best || score < best.score) best = { v, score, d, reach };
    }
    // canteiros
    let plot: { i: number; action: 'reap' | 'plant'; x: number; z: number } | null = null;
    if (!moved && me.x > FIELD.x - 0.6 && me.x < FIELD.x + FIELD.cols * 2 + 0.6 && me.z > FIELD.y - 0.6 && me.z < FIELD.y + FIELD.rows * 2 + 0.6) {
      const count = plotCount('field'), slots = store.ents.field?.state.p ?? [];
      let bd = 1.25;
      for (let i = 0; i < count; i++) {
        if (this.pendingPlots.has(i)) continue;
        const p = plotTile(i), cx = p.x + 1, cz = p.y + 1, d = Math.hypot(cx - me.x, cz - me.z);
        if (d > bd) continue;
        const s = slots[i];
        if (s && s[1] + growMs(s[0], 'field') <= store.now()) {
          const def = CROP_BY_ID[s[0]];
          if (def.tool && store.tool(def.tool) < 1) { blockedMsg = `🔒 ${TOOL_BY_ID[def.tool].tiers[0].name}`; continue; }
          plot = { i, action: 'reap', x: cx, z: cz }; bd = d;
        } else if (!s && this.seed && CROP_BY_ID[this.seed] && (store.farm?.coins ?? 0) >= CROP_BY_ID[this.seed].seed && (store.farm?.level ?? 1) >= CROP_BY_ID[this.seed].level) { plot = { i, action: 'plant', x: cx, z: cz }; bd = d; }
      }
    }
    const bagFull = store.bagUsed() >= store.bagCap();
    if ((best || plot?.action === 'reap') && bagFull) { this.say('🎒 Mochila cheia! Leve ao Celeiro', 2500); bus.emit('bagfull'); this.forced = null; return; }
    if (!best && !plot && blockedMsg && !moved) { this.say(blockedMsg, 1800); return; }
    if (best) {
      const def = best.v.def, tier = def.tool ? store.tool(def.tool) : 0;
      const need = def.tool ? Math.max(1, def.hits - (tier - def.tier)) : 1;
      const clip = def.tool ? WORK_CLIP[def.tool] : best.v.n.t.includes('tree') ? 'harvest' : 'pickup';
      this.work = { kind: 'node', nv: best.v, clip, hits: 0, need, last: 0, x: best.v.x, z: best.v.z, reach: best.reach };
      this.forced = null;
      this.path = [];
    } else if (plot) {
      this.work = { kind: 'plot', plot: plot.i, action: plot.action, clip: plot.action === 'reap' ? 'harvest' : 'plant', hits: 0, need: 1, last: 0, x: plot.x, z: plot.z, reach: 1.6 };
    }
  }

  private stepWork(dt: number, moved: boolean, _ix: number, _iz: number) {
    const w = this.work!, me = this.me;
    const d = Math.hypot(w.x - me.x, w.z - me.z);
    if (d > w.reach + 0.75 || (w.nv && (w.nv.off || this.pending.has(w.nv.n.id)))) { this.cancelWork(); return; }
    if (moved) return; // segue se o jogador só ajustou a posição dentro do alcance
    me.heading = turn(me.heading, Math.atan2(w.x - me.x, w.z - me.z), dt * 12);
    if (me.anim !== w.clip) return;
    const ph = me.c.phase(), imp = IMPACT[w.clip] ?? 0.5;
    const crossed = (w.last < imp && ph >= imp) || (w.last > ph && ph >= imp);
    w.last = ph;
    if (!crossed) return;
    w.hits++;
    this.impact(w);
    if (w.hits >= w.need) { this.finishWork(w); this.work = null; this.cool = 0.25; }
  }

  private impact(w: Work) {
    if (w.nv) {
      const def = w.nv.def;
      w.nv.kind = 'shake'; w.nv.anim = 0.3;
      play(def.tool === 'axe' ? 'chop' : def.tool === 'pickaxe' ? 'pick' : def.tool === 'shovel' ? 'dig' : 'pop');
      this.fx.burst(new THREE.Vector3(w.nv.x, 0.5, w.nv.z), CHIP[def.tool ?? 'sickle'] ?? CHIP.sickle, 6, { speed: 2, up: 3, size: 0.7 });
      if (def.tool === 'axe') this.fx.burst(new THREE.Vector3(w.nv.x, 1.5, w.nv.z), ['#6fb043', '#5da443', '#8fcf4a'], 5, { speed: 1.2, up: 0.5, size: 0.6, life: 1.2, gravity: 2 });
    } else { play('dig'); this.fx.burst(new THREE.Vector3(w.x, 0.3, w.z), ['#8a6a3c', '#6fb043'], 5, { speed: 1.4, up: 2, size: 0.5 }); }
  }

  private finishWork(w: Work) {
    if (w.kind === 'node' && w.nv) {
      const v = w.nv, def = v.def, id = v.n.id;
      const tier = def.tool ? store.tool(def.tool) : 0;
      const q = def.qty + (def.tool ? tier - def.tier : 0);
      this.pending.add(id);
      v.off = true; v.kind = ''; this.writeNode(v);
      this.fx.burst(new THREE.Vector3(v.x, 0.2, v.z), ['#e6dccb', '#d6c8ad'], 6, { speed: 1.6, up: 1.2, size: 0.9, life: 0.6, gravity: 1 });
      this.collectFx(def.item, q, new THREE.Vector3(v.x, 0.9, v.z));
      void store.gather({ t: 'harvest', n: id }, def.item, q).then((r) => {
        this.pending.delete(id);
        if (!r.ok) { this.denied(errorText(r.e)); this.refreshNodes(); }
      });
    } else if (w.kind === 'plot' && w.plot !== undefined) {
      const i = w.plot, p = plotTile(i);
      if (w.action === 'reap') {
        const slot = store.ents.field?.state.p?.[i]; if (!slot) return;
        const def = CROP_BY_ID[slot[0]];
        const q = def.yield + (def.tool ? store.tool(def.tool) - 1 : 0);
        this.pendingPlots.add(i);
        this.plots[i].crop.visible = false; this.plots[i].key = '';
        this.fx.burst(new THREE.Vector3(p.x + 1, 0.5, p.y + 1), ['#6fb043', '#8fcf4a', ITEM_BY_ID[slot[0]].icon.c], 10, { speed: 1.8, up: 2.5, size: 0.6 });
        this.collectFx(slot[0], q, new THREE.Vector3(p.x + 1, 0.6, p.y + 1));
        void store.gather({ t: 'reap', e: 'field', i }, slot[0], q).then((r) => { this.pendingPlots.delete(i); if (!r.ok) this.denied(errorText(r.e)); this.refreshPlots(); });
      } else {
        const c = this.seed;
        this.pendingPlots.add(i);
        void store.act({ t: 'plant', e: 'field', i, c }).then((r) => { this.pendingPlots.delete(i); if (!r.ok) { this.denied(errorText(r.e)); this.seed = r.e?.startsWith('no_coins') ? '' : this.seed; } this.refreshPlots(); });
      }
    }
  }

  private collectFx(item: string, q: number, from: THREE.Vector3) {
    const me = this.me;
    this.drops.spawn(item, Math.min(q, 4), from, () => me.pos.clone().add(new THREE.Vector3(-Math.sin(me.heading) * 0.2, 0.95, -Math.cos(me.heading) * 0.2)), () => {
      play('pop');
      this.overlay.float(`+${q} ${escapeHtml(ITEM_BY_ID[item]?.name ?? item)}`, me.pos.clone().setY(1.9));
      bus.emit('gain', { item, q });
    });
  }

  private reachOf(v: NodeView) { return (v.r || 0.25) * v.sc + R_PLAYER + 0.42; }
  private cancelWork() { this.work = null; }
  private setPose(name: string, ms: number) { this.pose = { name, until: performance.now() + ms }; }
  private say(text: string, ms: number) {
    if (this.bubble.on && this.bubble.el.textContent === text) { this.bubbleUntil = performance.now() + ms; return; }
    this.bubble.el.textContent = text; this.bubble.on = true; this.bubbleUntil = performance.now() + ms;
  }
  private denied(text: string) { play('error'); bus.emit('toast', { kind: 'warn', text }); }

  // ================================================================ zonas de prédios (painéis por proximidade)
  private updateZones() {
    const me = this.me;
    let best: { z: Zone; key: string; d: number } | null = null;
    const consider = (z: Zone, key: string, x: number, zz: number) => {
      const d = Math.hypot(x - me.x, zz - me.z);
      const r = key === this.zoneKey ? EXIT_R : ENTER_R;
      if (d <= r && (!best || d < best.d - (key === this.zoneKey ? -0.3 : 0))) best = { z, key, d };
    };
    for (const b of BUILDINGS) {
      if (!store.hasRegion(b.region)) continue;
      const d = doorTile(b.spot);
      consider({ k: 'b', id: b.id }, `b:${b.id}`, d.x + 0.5, d.y + 0.35);
    }
    for (const [id, p] of Object.entries(this.signs)) if (!store.hasRegion(id)) consider({ k: 'region', id }, `r:${id}`, p.x, p.z + 0.6);
    const inField = me.x > FIELD.x - 0.4 && me.x < FIELD.x + FIELD.cols * 2 + 0.4 && me.z > FIELD.y - 0.4 && me.z < FIELD.y + FIELD.rows * 2 + 0.4;
    if (inField && !best) best = { z: { k: 'field' }, key: 'field', d: 0 };
    const b = best as { z: Zone; key: string; d: number } | null;
    const now = performance.now();
    if (b) {
      this.zoneLeft = 0;
      if (b.key !== this.zoneKey) { this.zoneKey = b.key; this.zone = b.z; this.enterZone(b.z); bus.emit('zone', b.z); }
    } else if (this.zoneKey) {
      if (!this.zoneLeft) this.zoneLeft = now + CLOSE_MS;
      else if (now >= this.zoneLeft) { this.zoneKey = ''; this.zone = null; this.zoneLeft = 0; bus.emit('zone', null); }
    }
  }

  private enterZone(z: Zone) {
    if (!z || z.k !== 'b') return;
    const id = z.id;
    if ((id === 'barn' || id === 'warehouse') && store.lvl(id) >= 1) this.deposit(id);
    else if (store.lvl(id) >= 1) this.setPose('interact', 900);
  }

  /** Descarrega a mochila no celeiro: itens voam do personagem para a porta. */
  private deposit(id: string) {
    const bag = store.bag(), used = store.bagUsed();
    if (!used) return;
    const room = capacity() - store.invTotal();
    if (room <= 0) { this.denied(errorText('storage_full')); return; }
    this.setPose('deposit', 1200);
    const d = doorTile(BUILDING_BY_ID[id].spot), to = new THREE.Vector3(d.x + 0.5, 0.6, d.y - 0.2);
    const items = Object.keys(bag);
    items.slice(0, 5).forEach((it, i) => setTimeout(() => this.drops.spawn(it, 1, this.me.pos.clone().setY(1.0), () => to), i * 120));
    play('coin');
    void store.act({ t: 'deposit' }).then((r) => {
      if (!r.ok) { this.denied(errorText(r.e)); return; }
      const q = r.q as number;
      this.overlay.float(`📦 +${q} no ${BUILDING_BY_ID[id].name}`, to.clone().setY(2), 'w-float big');
      if ((r.left as number) > 0) bus.emit('toast', { kind: 'warn', text: `O ${BUILDING_BY_ID[id].name} encheu. Ficaram ${r.left} itens na mochila.` });
      bus.emit('deposit', { q });
    });
  }

  // ================================================================ ajudantes
  private stepHelpers(dt: number) {
    const st = store.ents.workers?.state.w ?? {};
    for (const [id, rec] of Object.entries(st)) {
      if (this.helpers.has(id) || !rec) continue;
      const w = WORKER_BY_ID[id]; if (!w || !store.hasRegion(w.region)) continue;
      const home = doorTile(BUILDING_BY_ID.barn.spot);
      const nodes = WORLD_NODES.filter((n) => n.t === w.node && n.r === w.region);
      const node = nodes.sort((a, b) => Math.hypot(a.x - home.x, a.y - home.y) - Math.hypot(b.x - home.x, b.y - home.y))[Math.floor(Math.random() * Math.min(3, nodes.length))] ?? nodes[0];
      if (!node) continue;
      const av = new Avatar3D(this.eng.scene, this.overlay, home.x + 0.5, home.y + 0.5, `${w.name} · ${w.role}`, w.look, false);
      av.tag.el.classList.add('helper');
      this.helpers.set(id, { id, av, path: [], state: 'go', t: 0, node: [node.x, node.y], home: [home.x, home.y] });
    }
    for (const h of this.helpers.values()) {
      const av = h.av;
      if (h.path.length) {
        const [tx, tz] = h.path[0], gx = tx + 0.5, gz = tz + 0.5, dx = gx - av.x, dz = gz - av.z, d = Math.hypot(dx, dz), step = 2.6 * dt;
        if (d <= step) { av.x = gx; av.z = gz; h.path.shift(); } else { av.x += (dx / d) * step; av.z += (dz / d) * step; }
        av.heading = turn(av.heading, Math.atan2(dx, dz), dt * 10);
        const want = h.state === 'back' ? 'carry' : 'walk';
        if (av.anim !== want) av.play(want);
      } else {
        h.t -= dt;
        if (h.state === 'go') { const p = this.neighborFree(h.node); if (p) h.path = findPath(this.grid, MAP_W, MAP_H, Math.floor(av.x), Math.floor(av.z), p[0], p[1]) ?? []; h.state = 'work'; h.t = 3.2; }
        else if (h.state === 'work') {
          av.heading = turn(av.heading, Math.atan2(h.node[0] + 0.5 - av.x, h.node[1] + 0.5 - av.z), dt * 8);
          const def = NODE_BY_ID[WORKER_BY_ID[h.id].node];
          const clip = def.tool ? WORK_CLIP[def.tool] : 'harvest';
          if (av.anim !== clip) av.play(clip);
          if (h.t <= 0) { h.state = 'back'; h.path = findPath(this.grid, MAP_W, MAP_H, Math.floor(av.x), Math.floor(av.z), h.home[0], h.home[1]) ?? []; av.c.setPile(0.7, [ITEM_BY_ID[WORKER_BY_ID[h.id].item]?.icon.c ?? '#b9824e']); }
        } else if (h.state === 'back') { h.state = 'drop'; h.t = 1; av.play('deposit'); }
        else if (h.state === 'drop' && h.t <= 0) { av.c.setPile(0, []); h.state = 'go'; }
      }
      av.place(); av.update(dt);
    }
  }

  private neighborFree([x, y]: [number, number]): [number, number] | null {
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]]) if (this.walkable(x + dx, y + dy)) return [x + dx, y + dy];
    return null;
  }

  /** O primeiro jogador online recolhe a produção dos ajudantes para o celeiro. */
  private claimHelpers() {
    const st = store.ents.workers?.state.w; if (!st) return;
    const leader = [...store.online].sort()[0] ?? store.myId;
    if (leader !== store.myId) return;
    const now = store.now();
    const ready = Object.entries(st).some(([id, r]) => r && now - r.at >= workerPeriodMs(WORKER_BY_ID[id], r.lv));
    if (ready && store.invTotal() < capacity()) void store.act({ t: 'wclaim' });
  }

  // ================================================================ multiplayer
  private sendPos(force = false) {
    realtime.sendPos({ x: Math.round(this.me.lx), y: Math.round(this.me.ly), d: Math.round(this.me.heading * 1000), a: this.me.anim }, force);
  }

  private onPresence(metas: PresenceMeta[], quiet = false) {
    const ids = new Set(metas.map((m) => m.u));
    for (const m of metas) {
      if (m.u === this.meInfo.id) continue;
      const a = this.remotes.get(m.u);
      if (!a) {
        const last = realtime.lastPos.get(m.u);
        const av = new Avatar3D(this.eng.scene, this.overlay, (last?.x ?? SPAWN.x * TILE + 16) / TILE, (last?.y ?? SPAWN.y * TILE + 16) / TILE, m.name, m.look, false);
        this.fx.burst(av.pos.clone().setY(1), ['#f6c445', '#ffffff'], 10, { speed: 1.5, up: 2, size: 0.4 });
        this.remotes.set(m.u, av);
        if (!quiet) bus.emit('toast', { kind: 'ok', text: `${m.name} entrou na fazenda.` });
      } else a.setLook(m.look);
    }
    for (const [u, a] of this.remotes) if (!ids.has(u)) { a.dispose(this.overlay); this.remotes.delete(u); bus.emit('toast', { kind: 'info', text: `${a.name} saiu. A fazenda continua salva.` }); }
  }

  private onRemotePos(p: PosMsg) {
    const a = this.remotes.get(p.u);
    if (!a || p.t < a.lastSeen) return;
    a.lastSeen = p.t;
    a.tx = p.x / TILE; a.tz = p.y / TILE; a.th = p.d / 1000;
    const anim = clips()[p.a] ? p.a : 'idle';
    if (a.anim !== anim) a.play(anim);
    const m = store.members.find((x) => x.user_id === p.u);
    if (m) { const used = Object.values(m.bag ?? {}).reduce((s, v) => s + v, 0); a.c.setPile(used / 50, Object.keys(m.bag ?? {}).map((i) => ITEM_BY_ID[i]?.icon.c ?? '#b9824e')); }
  }

  /** Para o minimapa: posições em tiles e a área visível (px lógicos). */
  snapshot() {
    const span = this.dist * Math.tan(THREE.MathUtils.degToRad(this.eng.camera.fov / 2)) * 1.25;
    const w = span * 2 * this.eng.camera.aspect, h = span * 2;
    return {
      me: { x: this.me.x, y: this.me.z },
      others: [...this.remotes.values()].map((a) => ({ x: a.x, y: a.z, name: a.name })),
      view: { x: (this.camTarget.x - w / 2) * TILE, y: (this.camTarget.z - h * 0.6) * TILE, w: w * TILE, h: h * TILE },
    };
  }

  // ================================================================ estado → cena
  private refreshAll() {
    this.rebuildGrid();
    this.refreshLocks();
    this.refreshBuildings();
    this.refreshPlots();
    this.refreshNodes();
    const used = store.bagUsed();
    this.me?.c.setPile(used / store.bagCap(), Object.keys(store.bag()).map((i) => ITEM_BY_ID[i]?.icon.c ?? '#b9824e'));
    this.firstRefresh = false;
  }

  private rebuildGrid() {
    const regions = new Set(store.farm?.progression.regions ?? ['sitio']);
    const built = new Set(BUILDINGS.filter((b) => store.lvl(b.id) >= 1 || store.ents[b.id]?.state.proj).map((b) => b.id));
    this.grid = buildWalkGrid(regions, built);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) { const r = regionAt(x, y); this.move[y * MAP_W + x] = r && regions.has(r) && !isWater(x, y) ? 1 : 0; }
    this.boxes = BUILDINGS.filter((b) => built.has(b.id)).map((b) => {
      const s = (store.lvl(b.id) >= 1 ? this.bviews[b.id]?.model.solid : null) ?? [0.15, 0.3, b.spot.w - 0.15, b.spot.h - 0.3];
      return [b.spot.x + s[0], b.spot.y + s[1], b.spot.x + s[2], b.spot.y + s[3]] as [number, number, number, number];
    });
    if (!this.me) return;
    const tx = Math.floor(this.me.x), tz = Math.floor(this.me.z);
    if (!this.walkable(tx, tz)) {
      for (let r = 1; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (this.walkable(tx + dx, tz + dy)) { this.me.x = tx + dx + 0.5; this.me.z = tz + dy + 0.5; return; }
      this.me.x = SPAWN.x + 0.5; this.me.z = SPAWN.y + 0.5;
    }
  }

  private refreshLocks() {
    const lv = store.farm?.level ?? 1;
    for (const r of REGIONS) {
      const g = this.locks[r.id]; if (!g) continue;
      const open = store.hasRegion(r.id);
      if (open) { if (g.visible) { g.visible = false; if (!this.firstRefresh) this.fx.burst(new THREE.Vector3(r.rect.x + r.rect.w / 2, 1, r.rect.y + r.rect.h / 2), ['#f6c445', '#ffffff', '#7fc14f'], 30, { speed: 4, up: 4 }); } continue; }
      const proj = store.ents[`region:${r.id}`]?.state.proj;
      const text = proj ? 'obra em andamento' : lv >= r.level ? 'pronto para abrir!' : `nível ${r.level}`;
      if (g.userData.text !== text) {
        g.userData.text = text;
        const board = g.userData.board as THREE.Mesh;
        const mat = board.material as THREE.MeshBasicMaterial;
        mat.map?.dispose(); mat.map = labelTexture([r.name, text]); mat.needsUpdate = true;
      }
    }
  }

  private refreshBuildings() {
    const now = store.now();
    for (const b of BUILDINGS) {
      const v = this.bviews[b.id];
      const lvl = store.lvl(b.id), proj = store.ents[b.id]?.state.proj, built = lvl >= 1;
      v.main.visible = built;
      v.site.visible = !built && !!proj;
      v.lot.visible = !built && !proj && store.hasRegion(b.region);
      v.badge.on = built && lvl >= 2; v.badge.el.textContent = `nv ${lvl}`;
      if (v.built === false && built && !this.firstRefresh) this.buildingDone(v);
      v.built = built;
      v.bar.on = !!proj;
      if (proj) {
        let need = proj.need.coins ?? 0, got = Math.min(need, proj.got.coins ?? 0);
        for (const [k, q] of Object.entries(proj.need.items ?? {})) { const p = ITEM_BY_ID[k].price; need += q * p; got += Math.min(q, proj.got[k] ?? 0) * p; }
        (v.bar.el.firstChild as HTMLElement).style.width = `${Math.round((100 * got) / Math.max(1, need))}%`;
      }
      const q = store.ents[b.id]?.state.q ?? [];
      const ready = q.find((e) => e[1] <= now);
      v.ready.on = built && !!ready;
      if (ready && v.ready.el.dataset.i !== ready[0]) { v.ready.el.dataset.i = ready[0]; v.ready.el.innerHTML = `<img src="${iconUrl(ready[0], 64)}" alt="">`; }
    }
  }

  /** Obra concluída: o prédio cresce com elástico, poeira, confete e um tremor leve. */
  private buildingDone(v: BView) {
    play('build');
    v.pop = 0.9;
    const { x, y, w, h } = v.def.spot;
    for (let i = 0; i <= w; i++) this.fx.burst(new THREE.Vector3(x + i, 0.2, y + h), ['#e6dccb', '#d6c8ad'], 4, { speed: 2, up: 1, size: 1.1, gravity: 1 });
    this.fx.burst(new THREE.Vector3(x + w / 2, 2.5, y + h / 2), ['#f6c445', '#e2574c', '#4a9fd8', '#7fc14f', '#ffffff'], 40, { speed: 4, up: 5, size: 0.5, life: 1.6, gravity: 5 });
    if (!gfx.reduceMotion) this.shake = 0.35;
  }

  private refreshPlots() {
    const count = plotCount('field');
    const slots = store.ents.field?.state.p ?? [];
    const now = store.now();
    this.plots.forEach((pl, i) => {
      const locked = i >= count;
      pl.g.getObjectByName('soil')!.visible = !locked;
      pl.g.getObjectByName('locked')!.visible = locked;
      const s = slots[i];
      if (!s || locked || this.pendingPlots.has(i)) { pl.crop.visible = false; pl.key = ''; return; }
      const stage = stageOf((now - s[1]) / growMs(s[0], 'field'));
      const key = `${s[0]}_${stage}`;
      if (pl.key !== key) {
        pl.crop.geometry = cropGeometry(s[0], stage);
        pl.crop.visible = true;
        if (!this.firstRefresh) { pl.pop = 0.4; if (!pl.key) { play('dig'); this.fx.burst(new THREE.Vector3(plotTile(i).x + 1, 0.3, plotTile(i).y + 1), ['#8a6a3c', '#b98a50'], 6, { speed: 1.2, up: 1.5, size: 0.5 }); } }
        pl.key = key;
      }
    });
  }

  private refreshNodes() {
    for (const v of this.nodes.values()) {
      const off = this.pending.has(v.n.id) || !store.nodeReady(v.n.id);
      if (off !== v.off) {
        v.off = off;
        if (!off && !this.firstRefresh) { v.kind = 'pop'; v.anim = 0.45; }
        this.writeNode(v);
      }
    }
  }

  private animateNodes(dt: number) {
    for (const I of this.inst.values()) for (const v of I.list) {
      if (!v.kind) continue;
      v.anim -= dt;
      if (v.anim <= 0) { v.kind = ''; v.anim = 0; }
      this.writeNode(v);
    }
  }

  private animatePlots(dt: number) {
    for (const pl of this.plots) {
      if (pl.pop <= 0) continue;
      pl.pop = Math.max(0, pl.pop - dt);
      const k = 1 - pl.pop / 0.4;
      pl.crop.scale.set(1, Math.max(0.3, easeBack(k)), 1);
    }
  }

  private animateBuildings(dt: number, t: number) {
    const now = performance.now();
    for (const v of Object.values(this.bviews)) {
      if (!v.main.visible) continue;
      const working = (store.ents[v.def.id]?.state.q?.length ?? 0) > 0;
      if (v.blades) v.blades.rotation.z -= dt * (working ? 2.4 : 0.5);
      if (v.pop > 0) { v.pop = Math.max(0, v.pop - dt); const k = 1 - v.pop / 0.9; v.main.scale.set(1 + (1 - k) * 0.08, Math.max(0.15, easeBack(k)), 1 + (1 - k) * 0.08); }
      const s = v.model.anchors.smoke;
      if (s && gfx.quality !== 'low' && (working || v.def.id === 'farmhouse') && now > v.smokeAt) {
        v.smokeAt = now + (working ? 450 : 1300);
        this.smoke.emit(new THREE.Vector3(v.def.spot.x + s[0], s[1], v.def.spot.y + s[2]), working ? '#f2f2ee' : '#ffffff', 0.6);
      }
    }
    void t;
  }

  private tick500() {
    this.refreshNodes();
    this.refreshPlots();
    this.refreshBuildings();
    bus.emit('minimap', this.snapshot());
  }

  private celebrate(big = true) {
    this.setPose('celebrate', 1700);
    const p = this.me.pos.clone().setY(1.6);
    if (big) this.fx.burst(p, ['#f6c445', '#e2574c', '#4a9fd8', '#7fc14f', '#ffffff', '#9152b8'], 40, { speed: 3.5, up: 5, size: 0.45, life: 1.5, gravity: 5 });
    else this.fx.burst(p, ['#f6c445', '#ffffff'], 14, { speed: 2, up: 3, size: 0.35 });
  }

  // ================================================================ posição local (só no aparelho)
  private posKey() { return `sm-pos3d-${store.farm?.id}-${this.meInfo.id}`; }
  private loadPos() {
    try {
      const p = JSON.parse(localStorage.getItem(this.posKey()) ?? 'null');
      if (p && typeof p.x === 'number') { const r = regionAt(Math.floor(p.x), Math.floor(p.z)); if (r && store.hasRegion(r)) return p as { x: number; z: number }; }
    } catch { /* sem storage */ }
    return { x: SPAWN.x + 0.5, z: SPAWN.y + 0.5 };
  }
  savePos() { try { localStorage.setItem(this.posKey(), JSON.stringify({ x: this.me.x, z: this.me.z })); } catch { /* sem storage */ } }

  destroy() {
    this.savePos();
    this.offs.forEach((f) => f());
    this.timers.forEach((t) => clearInterval(t));
    this.overlay.dispose();
    this.eng.dispose();
    if (import.meta.env.DEV) delete (window as unknown as Record<string, unknown>).__mutirao;
  }
}

function pushBox(x: number, z: number, x0: number, z0: number, x1: number, z1: number): [number, number] {
  const cx = Math.max(x0, Math.min(x, x1)), cz = Math.max(z0, Math.min(z, z1));
  const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
  if (d >= R_PLAYER) return [x, z];
  if (d > 1e-5) return [cx + (dx / d) * R_PLAYER, cz + (dz / d) * R_PLAYER];
  // dentro da caixa: sai pelo lado mais próximo
  const opts: [number, number, number][] = [[x - x0, x0 - R_PLAYER, z], [x1 - x, x1 + R_PLAYER, z], [z - z0, x, z0 - R_PLAYER], [z1 - z, x, z1 + R_PLAYER]];
  const o = opts.sort((a, b) => a[0] - b[0])[0];
  return [o[1], o[2]];
}
function turn(a: number, b: number, k: number) { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * Math.min(1, k); }
function easeBack(t: number) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

export function createWorld(host: HTMLElement, me: WorldInit['me']) {
  const g = new Game3D(host, me);
  return { destroy: () => g.destroy(), game: g };
}
