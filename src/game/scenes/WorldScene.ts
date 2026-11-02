import Phaser from 'phaser';
import {
  BUILDINGS, BUILDING_BY_ID, REGIONS, WORLD_NODES, NODE_BY_ID, CROP_BY_ID, ITEM_BY_ID, TOOL_BY_ID,
  MAP_W, MAP_H, TILE, FIELD, PLOT_COUNT, SPAWN, plotTile, doorTile, buildWalkGrid, regionAt,
  type ToolId, type WorldNode,
} from '../../data/catalog.ts';
import { store } from '../state/store.ts';
import { bus } from '../bus.ts';
import { realtime, type PosMsg, type PresenceMeta } from '../multiplayer/realtime.ts';
import { findPath } from '../systems/pathfinding.ts';
import { Avatar, dirFrom, type Anim } from '../entities/Avatar.ts';
import { NODE_ORIGIN, ensureIcon } from './BootScene.ts';
import { capacity, growMs, plotCount } from '../rules.ts';
import { errorText } from '../../utils/errors.ts';
import { play } from '../audio.ts';

const SPEED = 132; // px/s
const CHIMNEY: Record<string, number> = { bakery: 0.78, foundry: 0.78, smithy: 0.78, kitchen: 0.78, pottery: 0.78, glassworks: 0.78, farmhouse: 0.78, jewelry: 0.78 };
const VERB: Record<string, string> = { axe: 'Cortar', pickaxe: 'Minerar', shovel: 'Cavar', sickle: 'Ceifar' };

type Target =
  | { kind: 'node'; id: string }
  | { kind: 'building'; id: string }
  | { kind: 'plot'; e: 'field'; i: number }
  | { kind: 'sign'; region: string };

interface BView { main: Phaser.GameObjects.Image; blades?: Phaser.GameObjects.Image; site: Phaser.GameObjects.Image; lot: Phaser.GameObjects.Image; bar: Phaser.GameObjects.Graphics; badge: Phaser.GameObjects.Text; ready: Phaser.GameObjects.Image; smokeAt: number }

export interface WorldInit { me: { id: string; name: string; look: Record<string, number> } }

export class WorldScene extends Phaser.Scene {
  private meInfo!: WorldInit['me'];
  me!: Avatar;
  private remotes = new Map<string, Avatar>();
  private grid = new Uint8Array(MAP_W * MAP_H);
  private nodes = new Map<string, Phaser.GameObjects.Image>();
  private pending = new Set<string>();
  private pendingPlots = new Set<number>();
  private bviews: Record<string, BView> = {};
  private plots: { soil: Phaser.GameObjects.Image; crop: Phaser.GameObjects.Image; key: string }[] = [];
  private fog: Record<string, { g: Phaser.GameObjects.Graphics; sign: Phaser.GameObjects.Text }> = {};
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private path: [number, number][] = [];
  private onArrive: (() => void) | null = null;
  private busy = false;
  private carryUntil = 0;
  private marker!: Phaser.GameObjects.Image;
  private lastSentAnim = '';
  private moving = false;
  private ctxTarget: Target | null = null;
  private ctxLabel = '';
  private dragging = false;
  private pinch: { d: number; z: number } | null = null;
  private downAt: { x: number; y: number; t: number } | null = null;
  private offs: (() => void)[] = [];
  private floats: Phaser.GameObjects.Text[] = [];
  private workTimers: Phaser.Time.TimerEvent[] = [];

  constructor() { super('world'); }

  init(data: WorldInit) { this.meInfo = data.me ?? (this.registry.get('me') as WorldInit['me']); }

  create() {
    this.meInfo = this.meInfo ?? this.registry.get('me');
    this.add.image(0, 0, 'ground').setOrigin(0, 0).setDepth(-10);

    // nós de recurso
    for (const n of WORLD_NODES) {
      const [ox, oy] = NODE_ORIGIN[n.t] ?? [0.5, 0.9];
      const img = this.add.image(n.x * TILE + TILE / 2, n.y * TILE + TILE * 0.85, `n_${n.t}`).setOrigin(ox, oy).setScale(0.5);
      img.setDepth(img.y);
      this.nodes.set(n.id, img);
    }

    // campo
    for (let i = 0; i < PLOT_COUNT; i++) {
      const p = plotTile(i);
      const x = p.x * TILE + TILE, y = p.y * TILE + TILE;
      const soil = this.add.image(x, y, 'soil').setScale(0.5).setDepth(-5);
      const crop = this.add.image(x, y - 6, 'soil').setScale(0.5).setVisible(false);
      crop.setDepth(y + TILE * 0.6);
      this.plots.push({ soil, crop, key: '' });
    }

    // prédios
    for (const b of BUILDINGS) {
      const cx = (b.spot.x + b.spot.w / 2) * TILE, by = (b.spot.y + b.spot.h) * TILE + 6;
      const depth = by;
      const size = `${b.spot.w}x${b.spot.h}`;
      const main = this.add.image(cx, by, `b_${b.id}`).setOrigin(0.5, 1).setScale(0.5).setDepth(depth);
      let blades: Phaser.GameObjects.Image | undefined;
      if (this.textures.exists(`b_${b.id}_blades`)) blades = this.add.image(cx, by - main.displayHeight * 0.66, `b_${b.id}_blades`).setScale(0.5).setDepth(depth + 1);
      const site = this.add.image(cx, by, `con_${size}`).setOrigin(0.5, 1).setScale(0.5).setDepth(depth);
      const lot = this.add.image(cx, by, `lot_${size}`).setOrigin(0.5, 1).setScale(0.5).setDepth(-4);
      const bar = this.add.graphics().setDepth(70000);
      const badge = this.add.text(cx + main.displayWidth / 2 - 6, by - 10, '', { fontFamily: 'Sniglet, sans-serif', fontSize: '13px', color: '#1d3b72', backgroundColor: '#f2b632', padding: { x: 5, y: 1 } }).setOrigin(1, 1).setResolution(2).setDepth(depth + 2);
      const ready = this.add.image(cx, by - main.displayHeight - 4, 'dot').setScale(0.8).setDepth(75000).setVisible(false);
      this.tweens.add({ targets: ready, y: ready.y - 6, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.bviews[b.id] = { main, blades, site, lot, bar, badge, ready, smokeAt: 0 };
    }

    // névoa das regiões bloqueadas
    for (const r of REGIONS) {
      if (r.id === 'sitio') continue;
      const g = this.add.graphics().setDepth(60000);
      g.fillStyle(0x1f2e1a, 0.6).fillRect(r.rect.x * TILE, r.rect.y * TILE, r.rect.w * TILE, r.rect.h * TILE);
      g.lineStyle(2, 0xffffff, 0.06);
      for (let k = -r.rect.h; k < r.rect.w; k += 2) g.lineBetween((r.rect.x + k) * TILE, (r.rect.y + r.rect.h) * TILE, (r.rect.x + k + r.rect.h) * TILE, r.rect.y * TILE);
      g.lineStyle(4, 0xf2b632, 0.5).strokeRect(r.rect.x * TILE + 2, r.rect.y * TILE + 2, r.rect.w * TILE - 4, r.rect.h * TILE - 4);
      const sign = this.add.text((r.rect.x + r.rect.w / 2) * TILE, (r.rect.y + r.rect.h / 2) * TILE, '', {
        fontFamily: 'Sniglet, sans-serif', fontSize: '18px', color: '#1d3b72', backgroundColor: '#f7f8f4', align: 'center', padding: { x: 14, y: 8 },
      }).setOrigin(0.5).setResolution(2).setDepth(60001);
      this.fog[r.id] = { g, sign };
    }

    // personagem local
    const saved = this.loadPos();
    this.me = new Avatar(this, saved.x, saved.y, this.meInfo.name, this.meInfo.look, true);
    this.me.setPos(saved.x, saved.y);
    this.marker = this.add.image(0, 0, 'marker').setScale(0.5).setDepth(-3).setVisible(false);

    // câmera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    cam.setBackgroundColor('#3f6e35');
    cam.startFollow(this.me.sprite, true, 0.14, 0.14);
    cam.setZoom(this.defaultZoom());
    cam.centerOn(saved.x, saved.y);

    this.setupInput();
    this.refreshAll();

    this.offs.push(
      bus.on('state:delta', () => this.refreshAll()),
      bus.on('state:reset', () => this.refreshAll()),
      bus.on('regions', () => { play('build'); this.cameras.main.flash(400, 255, 240, 200); }),
      bus.on('levelup', (lv: number) => { play('level'); this.floatText(this.me.x, this.me.y - 70, `Nível ${lv}!`, '#f2b632', 26); this.confetti(this.me.x, this.me.y - 40); }),
      bus.on('net:pos', (p: PosMsg) => this.onRemotePos(p)),
      bus.on('net:presence', (metas: PresenceMeta[]) => this.onPresence(metas)),
      bus.on('net:need-pos', () => realtime.sendPos({ x: Math.round(this.me.x), y: Math.round(this.me.y), d: this.me.dir, a: this.me.anim }, true)),
      bus.on('net:emote', (e: { u: string; k: string }) => { const a = this.remotes.get(e.u); if (a) this.floatText(a.x, a.y - 64, e.k, '#ffffff', 22); }),
      bus.on('context:do', () => { if (this.ctxTarget) this.interact(this.ctxTarget); }),
      bus.on('zoom', (f: number) => this.setZoom(this.cameras.main.zoom * f)),
      bus.on('look', (look: Record<string, number>) => this.me.setLook(look)),
      bus.on('focus', (t: { x: number; y: number }) => { this.cameras.main.stopFollow(); this.cameras.main.pan(t.x * TILE, t.y * TILE, 600, 'Sine.inOut'); this.dragging = true; }),
      bus.on('recenter', () => this.recenter()),
      bus.on('emote', (k: string) => { realtime.emote(k); this.floatText(this.me.x, this.me.y - 64, k, '#ffffff', 22); }),
    );
    // presença/posições que chegaram antes da cena existir
    this.onPresence(realtime.metas, true);
    for (const p of realtime.lastPos.values()) this.onRemotePos(p);
    realtime.sendPos({ x: Math.round(this.me.x), y: Math.round(this.me.y), d: this.me.dir, a: 'idle' }, true);
    this.time.addEvent({ delay: 500, loop: true, callback: () => this.tick500() });
    this.time.addEvent({ delay: 220, loop: true, callback: () => this.updateContext() });
    this.scale.on('resize', () => this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom, 0.6, 2.6)));
    this.events.once('shutdown', () => { this.offs.forEach((f) => f()); this.savePos(); });
    this.game.events.on('blur', () => this.savePos());
    // gancho de teste (só em desenvolvimento): os testes E2E dirigem o jogo pelas mesmas funções da interface
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__mutirao = { store, scene: this, remotes: () => [...this.remotes.entries()].map(([u, a]) => ({ u, x: a.x, y: a.y })) };
    bus.emit('world:ready');
  }

  // ------------------------------------------------------------ entrada
  private setupInput() {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-E', () => this.ctxTarget && this.interact(this.ctxTarget));
    kb.on('keydown-SPACE', () => this.ctxTarget && this.interact(this.ctxTarget));
    // evita que o teclado do jogo capture digitação nos painéis
    kb.disableGlobalCapture();
    this.input.addPointer(1);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.downAt = { x: p.x, y: p.y, t: p.downTime };
      const ps = [this.input.pointer1, this.input.pointer2].filter((q) => q?.isDown);
      if (ps.length === 2) this.pinch = { d: Phaser.Math.Distance.Between(ps[0].x, ps[0].y, ps[1].x, ps[1].y), z: this.cameras.main.zoom };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const ps = [this.input.pointer1, this.input.pointer2].filter((q) => q?.isDown);
      if (ps.length === 2 && this.pinch) {
        const d = Phaser.Math.Distance.Between(ps[0].x, ps[0].y, ps[1].x, ps[1].y);
        this.setZoom(this.pinch.z * (d / this.pinch.d));
        this.downAt = null;
        return;
      }
      if (!p.isDown || !this.downAt) return;
      const dist = Phaser.Math.Distance.Between(p.x, p.y, this.downAt.x, this.downAt.y);
      if (dist > 12) {
        // arrastar: move a câmera para explorar o mapa
        const cam = this.cameras.main;
        if (!this.dragging) { cam.stopFollow(); this.dragging = true; }
        cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
        cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
      }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.pinch) { if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) this.pinch = null; return; }
      const d = this.downAt;
      this.downAt = null;
      if (!d || Phaser.Math.Distance.Between(p.x, p.y, d.x, d.y) > 12) return;
      this.onTap(p.worldX, p.worldY);
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.setZoom(this.cameras.main.zoom * (dy > 0 ? 0.9 : 1.1)));
  }

  private setZoom(z: number) { this.cameras.main.setZoom(Phaser.Math.Clamp(z, 0.6, 2.6)); bus.emit('zoomed', this.cameras.main.zoom); }

  private defaultZoom() {
    // ~28 tiles na largura ou ~18 na altura, o que couber
    return Phaser.Math.Clamp(Math.min(this.scale.width / (28 * TILE), this.scale.height / (18 * TILE)), 0.85, 1.5);
  }

  private recenter() {
    this.dragging = false;
    this.cameras.main.startFollow(this.me.sprite, true, 0.14, 0.14);
  }

  private onTap(wx: number, wy: number) {
    if (this.dragging) this.recenter();
    const t = this.pick(wx, wy);
    if (t) { play('click'); this.interact(t); return; }
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    this.walkTo(tx, ty);
  }

  /** O que está sob o ponto tocado (objeto mais à frente). */
  private pick(wx: number, wy: number): Target | null {
    // placa de região bloqueada
    for (const [id, f] of Object.entries(this.fog)) if (f.sign.visible && f.sign.getBounds().contains(wx, wy)) return { kind: 'sign', region: id };
    let best: { t: Target; depth: number } | null = null;
    const consider = (t: Target, img: Phaser.GameObjects.Image, shrink = 0.2) => {
      if (!img.visible) return;
      const b = img.getBounds();
      Phaser.Geom.Rectangle.Inflate(b, -b.width * shrink * 0.5, -b.height * shrink * 0.5);
      if (b.contains(wx, wy) && (!best || img.depth > best.depth)) best = { t, depth: img.depth };
    };
    for (const n of WORLD_NODES) { if (!store.hasRegion(n.r)) continue; consider({ kind: 'node', id: n.id }, this.nodes.get(n.id)!); }
    for (const b of BUILDINGS) {
      if (!store.hasRegion(b.region)) continue;
      const v = this.bviews[b.id];
      for (const img of [v.main, v.site, v.lot]) consider({ kind: 'building', id: b.id }, img, 0.1);
    }
    if (best) return (best as { t: Target }).t;
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    if (tx >= FIELD.x && tx < FIELD.x + FIELD.cols * FIELD.size && ty >= FIELD.y && ty < FIELD.y + FIELD.rows * FIELD.size) {
      const i = Math.floor((ty - FIELD.y) / FIELD.size) * FIELD.cols + Math.floor((tx - FIELD.x) / FIELD.size);
      return { kind: 'plot', e: 'field', i };
    }
    return null;
  }

  // ------------------------------------------------------------ movimento
  private tileOf(x: number, y: number) { return { x: Math.floor(x / TILE), y: Math.floor(y / TILE) }; }
  private walkable(tx: number, ty: number) { return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && !!this.grid[ty * MAP_W + tx]; }

  walkTo(tx: number, ty: number, then?: () => void) {
    const s = this.tileOf(this.me.x, this.me.y);
    if (!this.walkable(tx, ty)) {
      const r = regionAt(tx, ty);
      if (r && !store.hasRegion(r)) bus.emit('toast', { kind: 'info', text: `${REGIONS.find((x) => x.id === r)!.name} ainda está bloqueado.` });
      return false;
    }
    const p = findPath(this.grid, MAP_W, MAP_H, s.x, s.y, tx, ty);
    if (!p) { bus.emit('toast', { kind: 'info', text: 'Não há caminho até lá.' }); return false; }
    this.cancelWork();
    this.path = p;
    this.onArrive = then ?? null;
    this.marker.setPosition(tx * TILE + TILE / 2, ty * TILE + TILE * 0.8).setVisible(!then);
    if (p.length === 0) this.arrive();
    return true;
  }

  /** Vai até um tile vizinho de (tx,ty) e executa a ação. */
  private approach(cells: { x: number; y: number }[], then: () => void) {
    const here = this.tileOf(this.me.x, this.me.y);
    if (cells.some((c) => c.x === here.x && c.y === here.y)) { this.path = []; then(); return; }
    const ok = cells.filter((c) => this.walkable(c.x, c.y)).sort((a, b) => Phaser.Math.Distance.Between(a.x, a.y, here.x, here.y) - Phaser.Math.Distance.Between(b.x, b.y, here.x, here.y));
    for (const c of ok.slice(0, 4)) if (this.walkTo(c.x, c.y, then)) return;
    if (!ok.length) bus.emit('toast', { kind: 'info', text: 'Não dá para chegar perto daqui.' });
  }

  private neighbors(x: number, y: number) {
    const out: { x: number; y: number }[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) out.push({ x: x + dx, y: y + dy });
    return out;
  }

  private arrive() {
    this.marker.setVisible(false);
    const cb = this.onArrive;
    this.onArrive = null;
    cb?.();
  }

  private cancelWork() {
    this.busy = false;
    this.workTimers.forEach((t) => t.remove(false));
    this.workTimers = [];
  }

  update(_t: number, dtMs: number) {
    const dt = Math.min(0.05, dtMs / 1000);
    let vx = 0, vy = 0;
    const k = this.keys;
    if (k && !document.querySelector('input:focus, textarea:focus')) {
      if (k.A.isDown || k.LEFT.isDown) vx -= 1;
      if (k.D.isDown || k.RIGHT.isDown) vx += 1;
      if (k.W.isDown || k.UP.isDown) vy -= 1;
      if (k.S.isDown || k.DOWN.isDown) vy += 1;
    }
    let moved = false;
    if (vx || vy) {
      this.path = []; this.onArrive = null; this.marker.setVisible(false); this.cancelWork();
      if (this.dragging) this.recenter();
      const len = Math.hypot(vx, vy);
      const nx = this.me.x + (vx / len) * SPEED * dt, ny = this.me.y + (vy / len) * SPEED * dt;
      const ok = (x: number, y: number) => [[-7, -2], [7, -2], [-7, 4], [7, 4]].every(([ox, oy]) => { const t = this.tileOf(x + ox, y + oy); return this.walkable(t.x, t.y); });
      let x = this.me.x, y = this.me.y;
      if (ok(nx, y)) x = nx;
      if (ok(x, ny)) y = ny;
      if (x !== this.me.x || y !== this.me.y) { this.me.setPos(x, y); moved = true; }
      this.me.dir = dirFrom(vx, vy, this.me.dir);
    } else if (this.path.length) {
      const [tx, ty] = this.path[0];
      const gx = tx * TILE + TILE / 2, gy = ty * TILE + TILE * 0.7;
      const dx = gx - this.me.x, dy = gy - this.me.y;
      const dist = Math.hypot(dx, dy);
      const step = SPEED * dt;
      if (dist <= step) { this.me.setPos(gx, gy); this.path.shift(); if (!this.path.length) this.arrive(); }
      else this.me.setPos(this.me.x + (dx / dist) * step, this.me.y + (dy / dist) * step);
      this.me.dir = dirFrom(dx, dy, this.me.dir);
      moved = true;
    }
    const carrying = this.time.now < this.carryUntil;
    const anim: Anim = this.busy ? 'work' : moved ? (carrying ? 'carry' : 'walk') : (carrying ? 'carry' : 'idle');
    this.me.play(anim, this.me.dir);
    this.me.label.setPosition(this.me.x, this.me.y - 50);
    const sig = `${anim}${this.me.dir}`;
    if (moved || sig !== this.lastSentAnim) {
      realtime.sendPos({ x: Math.round(this.me.x), y: Math.round(this.me.y), d: this.me.dir, a: anim }, sig !== this.lastSentAnim);
      this.lastSentAnim = sig;
    }
    if (this.moving && !moved) realtime.sendPos({ x: Math.round(this.me.x), y: Math.round(this.me.y), d: this.me.dir, a: anim }, true);
    this.moving = moved;

    // interpolação dos outros jogadores
    for (const a of this.remotes.values()) {
      const dx = a.tx - a.x, dy = a.ty - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 400) a.setPos(a.tx, a.ty);
      else if (dist > 0.5) {
        const step = Math.max(SPEED * 1.1 * dt, dist * 0.2);
        a.setPos(a.x + (dx / dist) * Math.min(step, dist), a.y + (dy / dist) * Math.min(step, dist));
      }
    }
  }

  // ------------------------------------------------------------ interações
  interact(t: Target) {
    if (t.kind === 'sign') { bus.emit('panel', 'projects'); bus.emit('projects:focus', `r:${t.region}`); return; }
    if (t.kind === 'building') {
      const b = BUILDING_BY_ID[t.id];
      const d = doorTile(b.spot);
      this.approach([d, { x: d.x - 1, y: d.y }, { x: d.x + 1, y: d.y }, { x: d.x, y: d.y + 1 }], () => {
        this.faceTo(d.x, d.y - 1);
        const lvl = store.lvl(b.id);
        if (lvl >= 1) bus.emit('panel', { b: b.id });
        else { bus.emit('panel', 'projects'); bus.emit('projects:focus', `b:${b.id}`); }
      });
      return;
    }
    if (t.kind === 'plot') { this.interactPlot(t.i); return; }
    this.interactNode(t.id);
  }

  private faceTo(tx: number, ty: number) {
    const dx = tx * TILE + TILE / 2 - this.me.x, dy = ty * TILE + TILE / 2 - this.me.y;
    this.me.dir = dirFrom(dx, dy, this.me.dir);
  }

  private interactPlot(i: number) {
    const count = plotCount('field');
    if (i >= count) { bus.emit('toast', { kind: 'info', text: 'Canteiro bloqueado. Melhore a Casa da Fazenda para liberar mais.' }); return; }
    const p = plotTile(i);
    const cells = [{ x: p.x, y: p.y + 2 }, { x: p.x + 1, y: p.y + 2 }, { x: p.x, y: p.y }, { x: p.x + 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x + 1, y: p.y + 1 }];
    const slot = this.pendingPlots.has(i) ? null : store.ents.field?.state.p?.[i];
    if (!slot && this.pendingPlots.has(i)) return;
    if (!slot) { this.approach(cells, () => { this.faceTo(p.x, p.y); bus.emit('panel', { plant: 'field', i }); }); return; }
    const [crop, at] = slot;
    const left = at + growMs(crop, 'field') - store.now();
    if (left > 0) { this.floatText(p.x * TILE + TILE, p.y * TILE + 8, `${ITEM_BY_ID[crop].name}: ${Math.ceil(left / 1000)}s`, '#ffffff', 15); return; }
    const def = CROP_BY_ID[crop];
    if (def.tool && store.tool(def.tool) < 1) { this.denied(`Precisa de ${TOOL_BY_ID[def.tool].tiers[0].name} para colher ${ITEM_BY_ID[crop].name}.`); return; }
    this.approach(cells, () => {
      this.faceTo(p.x, p.y);
      this.work(1, () => {
        const q = def.yield + (def.tool ? store.tool(def.tool) - 1 : 0);
        if (store.invTotal() + q > capacity()) { this.denied(errorText('storage_full')); return; }
        this.pendingPlots.add(i);
        this.plots[i].crop.setVisible(false);
        this.flyItem(crop, q, p.x * TILE + TILE, p.y * TILE + TILE);
        play('pop');
        void store.act({ t: 'reap', e: 'field', i }).then((r) => { this.pendingPlots.delete(i); if (!r.ok) this.denied(errorText(r.e)); this.refreshPlots(); });
      });
    });
  }

  private interactNode(id: string) {
    const n = WORLD_NODES.find((x) => x.id === id) as WorldNode;
    const def = NODE_BY_ID[n.t];
    if (this.pending.has(id) || !store.nodeReady(id)) {
      const left = Math.max(1, Math.ceil(((store.farm?.nodes[id] ?? 0) - store.now()) / 1000));
      this.floatText(n.x * TILE + TILE / 2, n.y * TILE - 30, this.pending.has(id) ? 'Coletando…' : `Volta em ${left}s`, '#ffffff', 15);
      return;
    }
    let tier = 0;
    if (def.tool) {
      tier = store.tool(def.tool);
      if (tier < def.tier) { this.denied(`Precisa de ${TOOL_BY_ID[def.tool as ToolId].tiers[def.tier - 1].name}. Fabrique no menu Ferramentas.`); return; }
    }
    const q = def.qty + (def.tool ? tier - def.tier : 0);
    if (store.invTotal() + q > capacity()) { this.denied(errorText('storage_full')); return; }
    const cells = def.solid ? this.neighbors(n.x, n.y) : [{ x: n.x, y: n.y }, ...this.neighbors(n.x, n.y)];
    this.approach(cells, () => {
      this.faceTo(n.x, n.y);
      const hits = def.tool ? Math.max(1, def.hits - (tier - def.tier)) : 1;
      const img = this.nodes.get(id)!;
      this.work(hits, () => {
        if (!store.nodeReady(id) || this.pending.has(id)) { this.denied(errorText('node_depleted')); return; }
        this.pending.add(id);
        img.setTexture(`n_${n.t}_off`);
        this.flyItem(def.item, q, img.x, img.y - 20);
        void store.act({ t: 'harvest', n: id }).then((r) => {
          this.pending.delete(id);
          if (!r.ok) { this.denied(errorText(r.e)); }
          this.refreshNodes();
        });
      }, (k) => {
        play(def.tool === 'axe' ? 'chop' : def.tool === 'pickaxe' ? 'pick' : def.tool === 'shovel' ? 'dig' : 'pop');
        this.tweens.add({ targets: img, x: img.x + (k % 2 ? 2 : -2), duration: 50, yoyo: true, repeat: 1 });
        this.chips(img.x, img.y - 16, def.tool === 'axe' ? 0xd9a766 : def.tool === 'pickaxe' ? 0x9aa0a6 : 0x9ccc44);
      });
    });
  }

  /** Animação de trabalho por N golpes. */
  private work(hits: number, done: () => void, onHit?: (k: number) => void) {
    this.busy = true;
    let k = 0;
    const step = () => {
      if (!this.busy) return;
      onHit?.(k);
      k++;
      if (k >= hits) this.workTimers.push(this.time.delayedCall(260, () => { if (!this.busy) return; this.busy = false; this.workTimers = []; this.carryUntil = this.time.now + 1400; done(); }));
      else this.workTimers.push(this.time.delayedCall(340, step));
    };
    this.workTimers.push(this.time.delayedCall(120, step));
  }

  private denied(text: string) { play('error'); bus.emit('toast', { kind: 'warn', text }); }

  // ------------------------------------------------------------ contexto (botão de ação)
  private updateContext() {
    const here = this.tileOf(this.me.x, this.me.y);
    let best: { t: Target; label: string; d: number } | null = null;
    const offer = (t: Target, label: string, x: number, y: number) => {
      const d = Math.max(Math.abs(x - here.x), Math.abs(y - here.y));
      if (d <= 1 && (!best || d < best.d)) best = { t, label, d };
    };
    for (const n of WORLD_NODES) {
      if (Math.abs(n.x - here.x) > 1 || Math.abs(n.y - here.y) > 1 || !store.hasRegion(n.r) || !store.nodeReady(n.id) || this.pending.has(n.id)) continue;
      const def = NODE_BY_ID[n.t];
      offer({ kind: 'node', id: n.id }, `${def.tool ? VERB[def.tool] : 'Colher'}: ${def.name}`, n.x, n.y);
    }
    for (const b of BUILDINGS) {
      if (!store.hasRegion(b.region)) continue;
      const d = doorTile(b.spot);
      offer({ kind: 'building', id: b.id }, store.lvl(b.id) >= 1 ? `Abrir ${b.name}` : `Projeto: ${b.name}`, d.x, d.y);
    }
    if (here.x >= FIELD.x - 1 && here.x <= FIELD.x + FIELD.cols * 2 && here.y >= FIELD.y - 1 && here.y <= FIELD.y + FIELD.rows * 2) {
      for (let i = 0; i < plotCount('field'); i++) {
        const p = plotTile(i);
        const slot = store.ents.field?.state.p?.[i];
        const ready = slot && slot[1] + growMs(slot[0], 'field') <= store.now();
        if (!slot) offer({ kind: 'plot', e: 'field', i }, 'Plantar', p.x + (here.x > p.x ? 1 : 0), p.y + (here.y > p.y ? 1 : 0));
        else if (ready) offer({ kind: 'plot', e: 'field', i }, `Colher ${ITEM_BY_ID[slot[0]].name}`, p.x + (here.x > p.x ? 1 : 0), p.y + (here.y > p.y ? 1 : 0));
      }
    }
    const b = best as { t: Target; label: string } | null;
    const label = b?.label ?? '';
    this.ctxTarget = b?.t ?? null;
    if (label !== this.ctxLabel) { this.ctxLabel = label; bus.emit('context', label); }
  }

  // ------------------------------------------------------------ multiplayer
  private onPresence(metas: PresenceMeta[], quiet = false) {
    const ids = new Set(metas.map((m) => m.u));
    for (const m of metas) {
      if (m.u === this.meInfo.id) continue;
      const a = this.remotes.get(m.u);
      if (!a) {
        const s = SPAWN;
        const av = new Avatar(this, s.x * TILE + 16, s.y * TILE + 22, m.name, m.look, false);
        av.setPos(av.tx, av.ty);
        av.sprite.setAlpha(0);
        this.tweens.add({ targets: av.sprite, alpha: 1, duration: 400 });
        const last = realtime.lastPos.get(m.u);
        if (last) { av.tx = last.x; av.ty = last.y; av.setPos(last.x, last.y); }
        this.remotes.set(m.u, av);
        if (!quiet) bus.emit('toast', { kind: 'ok', text: `${m.name} entrou na fazenda.` });
      } else a.setLook(m.look);
    }
    for (const [u, a] of this.remotes) if (!ids.has(u)) { a.destroy(); this.remotes.delete(u); bus.emit('toast', { kind: 'info', text: `${a.label.text} saiu. A fazenda continua salva.` }); }
  }

  private onRemotePos(p: PosMsg) {
    const a = this.remotes.get(p.u);
    if (!a) return;
    if (p.t < a.lastSeen) return;
    a.lastSeen = p.t;
    a.tx = p.x; a.ty = p.y;
    const moving = Math.hypot(p.x - a.x, p.y - a.y) > 2;
    a.play((p.a as Anim) === 'idle' && moving ? 'walk' : (p.a as Anim), p.d);
  }

  // ------------------------------------------------------------ visuais
  private refreshAll() {
    this.rebuildGrid();
    this.refreshFog();
    this.refreshBuildings();
    this.refreshPlots();
    this.refreshNodes();
  }

  private rebuildGrid() {
    const regions = new Set(store.farm?.progression.regions ?? ['sitio']);
    const built = new Set(BUILDINGS.filter((b) => store.lvl(b.id) >= 1 || store.ents[b.id]?.state.proj).map((b) => b.id));
    this.grid = buildWalkGrid(regions, built);
    // se algo foi construído sob o jogador, empurra para o tile livre mais próximo
    const t = this.tileOf(this.me?.x ?? 0, this.me?.y ?? 0);
    if (this.me && !this.walkable(t.x, t.y)) {
      for (let r = 1; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (this.walkable(t.x + dx, t.y + dy)) { this.me.setPos((t.x + dx) * TILE + 16, (t.y + dy) * TILE + 22); return; }
      }
      this.me.setPos(SPAWN.x * TILE + 16, SPAWN.y * TILE + 22);
    }
  }

  private refreshFog() {
    const lv = store.farm?.level ?? 1;
    for (const r of REGIONS) {
      const f = this.fog[r.id];
      if (!f) continue;
      const open = store.hasRegion(r.id);
      if (open && f.g.visible) {
        this.tweens.add({ targets: [f.g, f.sign], alpha: 0, duration: 1200, onComplete: () => { f.g.setVisible(false); f.sign.setVisible(false); } });
      } else if (!open) {
        const proj = store.ents[`region:${r.id}`]?.state.proj;
        f.sign.setText(proj ? `${r.name}\nprojeto em andamento` : lv >= r.level ? `${r.name}\npronto para expandir` : `${r.name}\nnível ${r.level}`);
      }
    }
  }

  private refreshBuildings() {
    const now = store.now();
    for (const b of BUILDINGS) {
      const v = this.bviews[b.id];
      const lvl = store.lvl(b.id);
      const proj = store.ents[b.id]?.state.proj;
      const regionOpen = store.hasRegion(b.region);
      const built = lvl >= 1;
      v.main.setVisible(built);
      v.blades?.setVisible(built);
      v.site.setVisible(!built && !!proj);
      v.lot.setVisible(!built && !proj && regionOpen);
      v.badge.setVisible(built && lvl >= 2).setText(`nv ${lvl}`);
      v.bar.clear();
      if (proj) {
        let need = proj.need.coins ?? 0, got = Math.min(need, proj.got.coins ?? 0);
        for (const [k, q] of Object.entries(proj.need.items ?? {})) { const p = ITEM_BY_ID[k].price; need += q * p; got += Math.min(q, proj.got[k] ?? 0) * p; }
        const w = Math.max(60, v.main.displayWidth * 0.6), x = v.main.x - w / 2, y = v.main.y - v.main.displayHeight * 0.7;
        v.bar.fillStyle(0x1d3b72, 1).fillRoundedRect(x - 3, y - 3, w + 6, 14, 6);
        v.bar.fillStyle(0xf7f8f4, 1).fillRoundedRect(x, y, w, 8, 4);
        v.bar.fillStyle(0xf2b632, 1).fillRoundedRect(x, y, Math.max(6, (w * got) / Math.max(1, need)), 8, 4);
      }
      const q = store.ents[b.id]?.state.q ?? [];
      const ready = q.find((e) => e[1] <= now);
      if (built && ready) { v.ready.setTexture(ensureIcon(this, ready[0])).setScale(0.75).setVisible(true); }
      else v.ready.setVisible(false);
    }
  }

  private refreshPlots() {
    const count = plotCount('field');
    const slots = store.ents.field?.state.p ?? [];
    const now = store.now();
    this.plots.forEach((pl, i) => {
      pl.soil.setTexture(i < count ? 'soil' : 'soil_locked');
      const s = slots[i];
      if (!s || i >= count || this.pendingPlots.has(i)) { pl.crop.setVisible(false); pl.key = ''; return; }
      const f = (now - s[1]) / growMs(s[0], 'field');
      const stage = f >= 1 ? 2 : f >= 0.5 ? 1 : 0;
      const key = `crop_${s[0]}_${stage}`;
      if (pl.key !== key) {
        pl.crop.setTexture(key).setVisible(true);
        if (stage === 2 && pl.key) this.tweens.add({ targets: pl.crop, scale: { from: 0.42, to: 0.5 }, duration: 300, ease: 'Back.out' });
        pl.key = key;
      } else pl.crop.setVisible(true);
    });
  }

  private refreshNodes() {
    for (const n of WORLD_NODES) {
      const img = this.nodes.get(n.id)!;
      const off = this.pending.has(n.id) || !store.nodeReady(n.id);
      const key = off ? `n_${n.t}_off` : `n_${n.t}`;
      if (img.texture.key !== key) {
        img.setTexture(key);
        if (!off) { img.setScale(0.35); this.tweens.add({ targets: img, scale: 0.5, duration: 350, ease: 'Back.out' }); }
      }
    }
  }

  private tick500() {
    this.refreshNodes();
    this.refreshPlots();
    this.refreshBuildings();
    // fumaça e moinho trabalhando
    const now = this.time.now;
    for (const b of BUILDINGS) {
      const v = this.bviews[b.id];
      const working = (store.ents[b.id]?.state.q?.length ?? 0) > 0 && store.lvl(b.id) >= 1;
      if (v.blades) this.tweens.add({ targets: v.blades, angle: v.blades.angle + (working ? 45 : 8), duration: 500 });
      if (working && CHIMNEY[b.id] && now > v.smokeAt) {
        v.smokeAt = now + 900;
        const p = this.add.image(v.main.x + v.main.displayWidth * 0.22, v.main.y - v.main.displayHeight * CHIMNEY[b.id], 'puff').setScale(0.4).setAlpha(0.8).setDepth(v.main.depth + 1);
        this.tweens.add({ targets: p, y: p.y - 40, x: p.x + 10, scale: 0.9, alpha: 0, duration: 1800, onComplete: () => p.destroy() });
      }
    }
  }

  // ------------------------------------------------------------ efeitos
  floatText(x: number, y: number, text: string, color: string, size = 16) {
    const t = this.floats.pop() ?? this.add.text(0, 0, '', { fontFamily: 'Sniglet, sans-serif', stroke: '#1d3b72', strokeThickness: 5 }).setOrigin(0.5).setResolution(2).setDepth(90000);
    t.setText(text).setPosition(x, y).setColor(color).setFontSize(size).setAlpha(1).setVisible(true);
    this.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 1300, ease: 'Cubic.out', onComplete: () => { t.setVisible(false); this.floats.push(t); } });
  }

  private flyItem(item: string, q: number, x: number, y: number) {
    const icon = this.add.image(x, y, ensureIcon(this, item)).setScale(0.6).setDepth(90000);
    this.tweens.add({ targets: icon, x: this.me.x, y: this.me.y - 60, scale: 0.45, duration: 420, ease: 'Quad.in', onComplete: () => {
      icon.destroy();
      this.floatText(this.me.x, this.me.y - 62, `+${q} ${ITEM_BY_ID[item].name}`, '#f7f8f4', 15);
    } });
  }

  private chips(x: number, y: number, tint: number) {
    for (let i = 0; i < 5; i++) {
      const d = this.add.image(x, y, 'dot').setScale(0.35).setTint(tint).setDepth(90000);
      this.tweens.add({ targets: d, x: x + Phaser.Math.Between(-22, 22), y: y + Phaser.Math.Between(-26, 4), alpha: 0, duration: 420, ease: 'Quad.out', onComplete: () => d.destroy() });
    }
  }

  private confetti(x: number, y: number) {
    const cols = [0xf2b632, 0xd8434b, 0x2f6db5, 0x3f8f4f, 0xf7f8f4];
    for (let i = 0; i < 24; i++) {
      const d = this.add.image(x, y, 'dot').setScale(0.4).setTint(cols[i % cols.length]).setDepth(90000);
      this.tweens.add({ targets: d, x: x + Phaser.Math.Between(-90, 90), y: y + Phaser.Math.Between(-90, 30), alpha: 0, angle: 360, duration: 1100, ease: 'Cubic.out', onComplete: () => d.destroy() });
    }
  }

  // ------------------------------------------------------------ posição local (só no aparelho)
  private posKey() { return `sm-pos-${store.farm?.id}-${this.meInfo.id}`; }
  private loadPos() {
    try {
      const p = JSON.parse(localStorage.getItem(this.posKey()) ?? 'null');
      if (p && typeof p.x === 'number') { const t = this.tileOf(p.x, p.y); const r = regionAt(t.x, t.y); if (r && store.hasRegion(r)) return p; }
    } catch { /* sem storage */ }
    return { x: SPAWN.x * TILE + 16, y: SPAWN.y * TILE + 22 };
  }
  savePos() { try { localStorage.setItem(this.posKey(), JSON.stringify({ x: Math.round(this.me.x), y: Math.round(this.me.y) })); } catch { /* sem storage */ } }
}
