import Phaser from 'phaser';
import {
  BUILDINGS, BUILDING_BY_ID, REGIONS, WORLD_NODES, NODE_BY_ID, CROP_BY_ID, ITEM_BY_ID, TOOL_BY_ID,
  MAP_W, MAP_H, TILE, FIELD, PLOT_COUNT, SPAWN, RIVER, BRIDGES, PATH_TILES, plotTile, doorTile, buildWalkGrid, regionAt, isWater,
  type ToolId, type WorldNode,
} from '../../data/catalog.ts';
import { store } from '../state/store.ts';
import { bus } from '../bus.ts';
import { realtime, type PosMsg, type PresenceMeta } from '../multiplayer/realtime.ts';
import { findPath } from '../systems/pathfinding.ts';
import { Avatar, dirFrom, type Anim } from '../entities/Avatar.ts';
import { ORIGIN, ANCHORS, ensureIcon, PAD, TS } from './BootScene.ts';
import { terrainLayers } from '../art/cartoon/terrain.ts';
import { stageOf } from '../art/cartoon/crops.ts';
import { capacity, growMs, plotCount } from '../rules.ts';
import { errorText } from '../../utils/errors.ts';
import { play } from '../audio.ts';
import { gfx } from '../gfx.ts';
import { mulberry } from '../art/draw.ts';
import { WORLD_W, WORLD_H } from '../view.ts';

const SPEED = 132; // px de mundo/s
const S = 0.5;     // sprites pintados a 2×
const VERB: Record<string, string> = { axe: 'Cortar', pickaxe: 'Minerar', shovel: 'Cavar', sickle: 'Ceifar' };
const CHUNK = 8 * TILE;

type Target =
  | { kind: 'node'; id: string }
  | { kind: 'building'; id: string }
  | { kind: 'plot'; e: 'field'; i: number }
  | { kind: 'sign'; region: string };

interface BView { main: Phaser.GameObjects.Image; blades?: Phaser.GameObjects.Image; site: Phaser.GameObjects.Image; lot: Phaser.GameObjects.Image; bar: Phaser.GameObjects.Graphics; badge: Phaser.GameObjects.Text; ready: Phaser.GameObjects.Image; smokeAt: number; ox: number; oy: number; built: boolean | null }
interface Occluder { img: Phaser.GameObjects.Image; sway: number; phase: number; rect: Phaser.Geom.Rectangle }

export interface WorldInit { me: { id: string; name: string; look: Record<string, number> } }

/** Aplica um quadro de atlas com a origem registrada no Boot. */
function frame<T extends Phaser.GameObjects.Image>(img: T, atlas: string, f: string): T {
  const o = ORIGIN[`${atlas}:${f}`] ?? [0.5, 1];
  img.setTexture(atlas, f).setOrigin(o[0], o[1]);
  return img;
}

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
  private busyAnim: Anim = 'work';
  private poseUntil = 0;
  private pose: Anim = 'idle';
  private carryUntil = 0;
  private marker!: Phaser.GameObjects.Image;
  private hover!: Phaser.GameObjects.Image;
  private focusRing!: Phaser.GameObjects.Image;
  private focusTag!: Phaser.GameObjects.Text;
  private lastSentAnim = '';
  private moving = false;
  private ctxTarget: Target | null = null;
  private ctxLabel = '';
  private dragging = false;
  private pinch: { d: number; z: number } | null = null;
  private downAt: { x: number; y: number } | null = null;
  private offs: (() => void)[] = [];
  private floats: Phaser.GameObjects.Text[] = [];
  private workTimers: Phaser.Time.TimerEvent[] = [];
  private joy = { x: 0, y: 0 };
  private occ = new Map<string, Occluder[]>();
  private ripple!: Phaser.GameObjects.TileSprite;
  private clouds: Phaser.GameObjects.Image[] = [];
  private firstRefresh = true;
  private coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

  constructor() { super('world'); }

  init(data: WorldInit) { this.meInfo = data.me ?? (this.registry.get('me') as WorldInit['me']); }

  create() {
    this.meInfo = this.meInfo ?? this.registry.get('me');
    this.buildTerrain();
    this.buildDecor();
    this.makeAnims();

    // nós de recurso
    for (const n of WORLD_NODES) {
      const img = frame(this.add.image(n.x * TILE + 16, n.y * TILE + 27, 'nature'), 'nature', n.t).setScale(S);
      img.setDepth(img.y);
      this.nodes.set(n.id, img);
      if (/tree/.test(n.t)) this.addOccluder(img, 1);
    }

    // campo: canteiros e cerca
    for (let i = 0; i < PLOT_COUNT; i++) {
      const t = plotTile(i);
      const soil = frame(this.add.image(t.x * TILE, t.y * TILE, 'crops'), 'crops', 'soil').setScale(S).setDepth(-50);
      const crop = this.add.image(t.x * TILE, t.y * TILE, 'crops', 'soil').setScale(S).setVisible(false).setDepth((t.y + FIELD.size) * TILE - 3);
      this.plots.push({ soil, crop, key: '' });
    }
    this.buildFence();

    // prédios
    for (const b of BUILDINGS) {
      const { x, y, w, h } = b.spot;
      const ox = x * TILE, oy = y * TILE, depth = (y + h) * TILE - 2;
      const size = `${w}x${h}`;
      const main = frame(this.add.image(ox, oy, 'bld'), 'bld', b.id).setScale(S).setDepth(depth);
      const site = frame(this.add.image(ox, oy, 'bld'), 'bld', `con_${size}`).setScale(S).setDepth(depth);
      const lot = frame(this.add.image(ox, oy, 'bld'), 'bld', `lot_${size}`).setScale(S).setDepth(-48);
      const a = ANCHORS[b.id];
      const blades = a.hub ? this.add.image(ox + a.hub[0], oy + a.hub[1], 'blades').setScale(0.34).setDepth(depth + 1) : undefined;
      const badge = this.add.text(ox + w * TILE - 6, oy + h * TILE - 4, '', { fontFamily: 'Sniglet, sans-serif', fontSize: '11px', color: '#3b2c22', backgroundColor: '#f6c445', padding: { x: 4, y: 1 } }).setOrigin(1, 1).setResolution(3).setDepth(depth + 2);
      const ready = this.add.image(ox + a.top[0], oy + a.top[1] - 14, 'fx', 'dot').setDepth(75000).setVisible(false);
      this.tweens.add({ targets: ready, y: ready.y - 6, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      const bar = this.add.graphics().setDepth(70000);
      this.bviews[b.id] = { main, blades, site, lot, bar, badge, ready, smokeAt: 0, ox, oy, built: null };
      this.addOccluder(main, 0);
    }

    // névoa das regiões bloqueadas (retângulos alinhados à grade)
    for (const r of REGIONS) {
      if (r.id === 'sitio') continue;
      const { x, y, w, h } = r.rect;
      const g = this.add.graphics().setDepth(60000);
      g.fillStyle(0x23361f, 0.5).fillRect(x * TILE, y * TILE, w * TILE, h * TILE);
      g.lineStyle(3, 0xfffdf6, 0.5).strokeRoundedRect(x * TILE + 3, y * TILE + 3, w * TILE - 6, h * TILE - 6, 10);
      const sign = this.add.text((x + w / 2) * TILE, (y + h / 2) * TILE, '', {
        fontFamily: 'Sniglet, sans-serif', fontSize: '15px', color: '#3b2c22', backgroundColor: '#fffdf6', align: 'center', padding: { x: 12, y: 7 },
      }).setOrigin(0.5).setResolution(3).setDepth(60001);
      this.fog[r.id] = { g, sign };
    }

    // personagem local e marcadores
    const saved = this.loadPos();
    this.me = new Avatar(this, saved.x, saved.y, this.meInfo.name, this.meInfo.look, true);
    this.marker = this.add.image(0, 0, 'fx', 'target').setScale(0.5).setDepth(-30).setVisible(false);
    this.hover = this.add.image(0, 0, 'fx', 'ring').setScale(0.5).setDepth(-29).setAlpha(0.75).setVisible(false);
    this.focusRing = this.add.image(0, 0, 'fx', 'ring').setScale(0.5).setDepth(-28).setVisible(false);
    this.tweens.add({ targets: this.focusRing, alpha: { from: 1, to: 0.45 }, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.focusTag = this.add.text(0, 0, '', { fontFamily: 'Atkinson Hyperlegible, sans-serif', fontStyle: 'bold', fontSize: '11px', color: '#3b2c22', backgroundColor: '#fffdf6', padding: { x: 6, y: 3 } }).setOrigin(0.5, 1).setResolution(3).setDepth(88000).setVisible(false);

    // câmera top-down: segue com zona morta, presa às bordas
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.setBackgroundColor('#4f8a3c');
    cam.setRoundPixels(false);
    cam.startFollow(this.me.sprite, false, 0.12, 0.12);
    cam.setZoom(this.defaultZoom());
    this.fitDeadzone();
    cam.centerOn(this.me.x, this.me.y);

    this.setupInput();
    this.startAmbient();
    this.refreshAll();

    this.offs.push(
      bus.on('state:delta', () => this.refreshAll()),
      bus.on('state:reset', () => this.refreshAll()),
      bus.on('regions', () => { play('build'); this.cameras.main.flash(400, 255, 240, 200); this.celebrate(); }),
      bus.on('levelup', () => { play('level'); this.celebrate(); }),
      bus.on('cheer', () => this.celebrate(false)),
      bus.on('net:pos', (p: PosMsg) => this.onRemotePos(p)),
      bus.on('net:presence', (metas: PresenceMeta[]) => this.onPresence(metas)),
      bus.on('net:need-pos', () => this.sendPos(true)),
      bus.on('net:emote', (e: { u: string; k: string }) => { const a = this.remotes.get(e.u); if (a) this.floatText(a.x, a.y - 66, e.k, '#ffffff', 22); }),
      bus.on('context:do', () => { if (this.ctxTarget) this.interact(this.ctxTarget); }),
      bus.on('zoom', (f: number) => this.setZoom(this.cameras.main.zoom * f)),
      bus.on('joy', (v: { x: number; y: number }) => { this.joy = v; }),
      bus.on('look', (look: Record<string, number>) => this.me.setLook(look)),
      bus.on('focus', (t: { x: number; y: number }) => { const cam = this.cameras.main; cam.stopFollow(); cam.pan(t.x * TILE, t.y * TILE, 600, 'Sine.inOut'); this.dragging = true; }),
      bus.on('recenter', () => this.recenter()),
      bus.on('emote', (k: string) => { realtime.emote(k); this.floatText(this.me.x, this.me.y - 66, k, '#ffffff', 22); }),
      gfx.subscribe(() => this.applyQuality()),
    );
    // presença/posições que chegaram antes da cena existir
    this.onPresence(realtime.metas, true);
    for (const p of realtime.lastPos.values()) this.onRemotePos(p);
    this.sendPos(true);
    this.time.addEvent({ delay: 500, loop: true, callback: () => this.tick500() });
    this.time.addEvent({ delay: 200, loop: true, callback: () => { this.updateContext(); this.updateOcclusion(); } });
    this.scale.on('resize', () => { this.setZoom(this.cameras.main.zoom); this.fitDeadzone(); });
    this.events.once('shutdown', () => { this.offs.forEach((f) => f()); this.savePos(); });
    this.game.events.on('blur', () => this.savePos());
    // gancho de teste (só em desenvolvimento): os testes E2E dirigem o jogo pelas mesmas funções da interface
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__mutirao = { store, scene: this, remotes: () => [...this.remotes.entries()].map(([u, a]) => ({ u, x: a.lx, y: a.ly })) };
    bus.emit('world:ready');
  }

  // ------------------------------------------------------------ construção do mundo
  private buildTerrain() {
    const L = terrainLayers();
    [L.ground, L.blend, L.over].forEach((data, i) => {
      const map = this.make.tilemap({ data, tileWidth: TS, tileHeight: TS });
      const ts = map.addTilesetImage('terrain', 'terrain', TS, TS, PAD, PAD * 2)!;
      map.createLayer(0, ts, 0, 0)!.setScale(S).setDepth(-100 + i);
    });
    // ondulação do rio (desliza devagar) e pontes por cima
    this.ripple = this.add.tileSprite(0, RIVER.y0 * TILE + 4, WORLD_W, (RIVER.y1 - RIVER.y0 + 1) * TILE - 8, 'ripple').setOrigin(0, 0).setDepth(-60).setAlpha(0.45).setTileScale(0.5, 0.5);
    for (const b of BRIDGES) frame(this.add.image(b.x0 * TILE, RIVER.y0 * TILE, 'bld'), 'bld', `bridge_${b.x0}`).setScale(S).setDepth(-40);
  }

  /** Decoração determinística (sem interação): árvores da borda, flores, pedrinhas, arbustos. */
  private buildDecor() {
    const blocked = new Set<string>();
    const mark = (x: number, y: number) => blocked.add(`${x},${y}`);
    for (const k of PATH_TILES) blocked.add(k);
    for (const b of BUILDINGS) for (let y = b.spot.y - 1; y <= b.spot.y + b.spot.h + 1; y++) for (let x = b.spot.x - 1; x <= b.spot.x + b.spot.w; x++) mark(x, y);
    for (let y = FIELD.y - 1; y <= FIELD.y + FIELD.rows * FIELD.size; y++) for (let x = FIELD.x - 1; x <= FIELD.x + FIELD.cols * FIELD.size; x++) mark(x, y);
    for (const n of WORLD_NODES) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mark(n.x + dx, n.y + dy);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(SPAWN.x + dx, SPAWN.y + dy);

    const TABLE: Record<string, [string, number][]> = {
      border: [['pine', 0.2], ['pine2', 0.16], ['oak_d', 0.14], ['oak_d2', 0.1], ['bush', 0.08], ['fern', 0.05]],
      sitio: [['flowers_a', 0.035], ['flowers_b', 0.03], ['pebbles', 0.015], ['bush', 0.012], ['fern', 0.01]],
      pomar: [['flowers_b', 0.04], ['bush', 0.025], ['berrybush', 0.015], ['pebbles', 0.01]],
      bosque: [['pine', 0.06], ['pine2', 0.04], ['fern', 0.07], ['mush_s', 0.03], ['log', 0.012], ['bush', 0.04]],
      rio: [['stone_s', 0.03], ['flowers_a', 0.02], ['fern', 0.03], ['pebbles', 0.02]],
      colinas: [['stone_s', 0.06], ['pebbles', 0.07], ['bush', 0.02]],
      vale: [['flowers_a', 0.1], ['flowers_b', 0.08], ['bush', 0.02], ['berrybush', 0.015]],
      planalto: [['stone_s', 0.05], ['pebbles', 0.06], ['pine2', 0.02]],
    };
    const rnd = mulberry(77);
    const dens = gfx.density;
    for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
      const roll = rnd(), jx = rnd(), jy = rnd(), sc = rnd();
      if (blocked.has(`${tx},${ty}`)) continue;
      if (ty >= RIVER.y0 && ty <= RIVER.y1) {
        if (isWater(tx, ty) && roll < 0.05 * dens) this.add.image(tx * TILE + 16, ty * TILE + 18, 'nature', 'lily').setScale(S * 0.9).setDepth(-55).setAngle(jx * 360);
        continue;
      }
      const r = regionAt(tx, ty) ?? 'border';
      const big = r === 'border';
      let acc = 0;
      for (const [k, p] of TABLE[r] ?? []) {
        acc += big || /pine|oak/.test(k) ? p : p * dens;
        if (roll >= acc) continue;
        const img = frame(this.add.image(tx * TILE + 8 + jx * 16, ty * TILE + 20 + jy * 10, 'nature'), 'nature', k);
        const tree = /pine|oak/.test(k);
        img.setScale(S * (tree ? 0.85 + sc * 0.3 : 0.8 + sc * 0.3)).setDepth(img.y).setFlipX(jx < 0.5);
        if (big) img.setTint(0xe6f0de);
        if (tree) this.addOccluder(img, 1);
        else if (/flowers|fern/.test(k)) this.addOccluder(img, 0.6, false);
        break;
      }
    }
  }

  private buildFence() {
    const x0 = FIELD.x * TILE - 8, x1 = (FIELD.x + FIELD.cols * FIELD.size) * TILE + 8;
    const y0 = FIELD.y * TILE - 4, y1 = (FIELD.y + FIELD.rows * FIELD.size) * TILE + 6;
    const gapA = (FIELD.x + FIELD.cols) * TILE - 40, gapB = (FIELD.x + FIELD.cols) * TILE + 40;
    for (let x = x0; x < x1 - 8; x += 32) {
      if (x + 32 > gapA && x < gapB) continue;
      frame(this.add.image(x, y1, 'fx'), 'fx', 'fence_h').setScale(S).setDepth(y1);
    }
    for (const x of [x0, x1]) {
      for (let y = y0 + 30; y <= y1; y += 36) frame(this.add.image(x, y, 'fx'), 'fx', 'fence_v').setScale(S).setDepth(y);
      frame(this.add.image(x, y1, 'fx'), 'fx', 'fence_post').setScale(S).setDepth(y1 + 1);
    }
  }

  private makeAnims() {
    const mk = (key: string, frames: string[], rate: number) => { if (!this.anims.exists(key)) this.anims.create({ key, frames: frames.map((f) => ({ key: 'fx', frame: f })), frameRate: rate, repeat: -1 }); };
    mk('bird', ['bird_0', 'bird_1'], 6);
    for (const b of ['bfy', 'bfp', 'bfb']) mk(b, [`${b}_0`, `${b}_1`], 10);
    mk('hen_walk', ['hen_0', 'hen_1'], 6);
    mk('hen_peck', ['hen_0', 'hen_2'], 4);
  }

  private addOccluder(img: Phaser.GameObjects.Image, sway: number, fade = true) {
    const b = img.getBounds();
    const rect = fade ? new Phaser.Geom.Rectangle(b.x + b.width * 0.15, b.y, b.width * 0.7, b.height * 0.85) : new Phaser.Geom.Rectangle(0, 0, 0, 0);
    const key = `${Math.floor(img.x / CHUNK)},${Math.floor(img.y / CHUNK)}`;
    if (!this.occ.has(key)) this.occ.set(key, []);
    this.occ.get(key)!.push({ img, sway, phase: Math.random() * Math.PI * 2, rect });
  }

  private eachVisible(fn: (o: Occluder) => void, pad = 1) {
    const v = this.cameras.main.worldView;
    const cx0 = Math.floor(v.x / CHUNK) - pad, cx1 = Math.floor((v.x + v.width) / CHUNK) + pad;
    const cy0 = Math.floor(v.y / CHUNK) - pad, cy1 = Math.floor((v.y + v.height) / CHUNK) + pad;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) this.occ.get(`${cx},${cy}`)?.forEach(fn);
  }

  /** Copas e telhados ficam translúcidos quando o personagem passa por trás. */
  private updateOcclusion() {
    const px = this.me.lx, py = this.me.ly - 18;
    const cx = Math.floor(this.me.lx / CHUNK), cy = Math.floor(this.me.ly / CHUNK);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.occ.get(`${cx + dx},${cy + dy}`)?.forEach((o) => {
      if (!o.rect.width) return;
      const behind = this.me.ly < o.img.depth - 4 && o.rect.contains(px, py);
      const a = behind ? 0.5 : 1;
      if (o.img.alpha !== a && o.img.visible) this.tweens.add({ targets: o.img, alpha: a, duration: 180 });
    });
  }

  // ------------------------------------------------------------ ambiente
  private startAmbient() {
    // nuvens: sombras grandes e suaves atravessando o mapa
    for (let i = 0; i < 3; i++) this.clouds.push(this.add.image(Math.random() * WORLD_W, Math.random() * WORLD_H, 'cloud').setScale(2 + Math.random()).setAlpha(0.09).setDepth(85000));
    // galinhas ciscando perto da casa
    const home = BUILDING_BY_ID.farmhouse?.spot ?? { x: SPAWN.x, y: SPAWN.y - 4, w: 1, h: 1 };
    for (let i = 0; i < 3; i++) this.spawnHen(home.x * TILE - 30 - i * 20, (home.y + home.h) * TILE + 20 + i * 14);
    // borboletas perto das flores do sítio e do campo
    for (let i = 0; i < 6; i++) this.spawnButterfly((FIELD.x - 4 + Math.random() * 16) * TILE, (FIELD.y - 3 + Math.random() * 12) * TILE);
    this.time.addEvent({ delay: 11000, loop: true, callback: () => this.spawnBirds() });
    this.time.addEvent({ delay: 1400, loop: true, callback: () => this.ambientTick() });
    this.applyQuality();
  }

  private ambient: Phaser.GameObjects.Sprite[] = [];
  private applyQuality() {
    const lowMotion = gfx.reduceMotion || gfx.quality === 'low';
    this.clouds.forEach((c) => c.setVisible(gfx.quality !== 'low'));
    this.ambient.forEach((a, i) => a.setVisible(!lowMotion && i < Math.ceil(this.ambient.length * gfx.density)));
    this.ripple?.setVisible(gfx.quality !== 'low');
  }

  private spawnHen(x: number, y: number) {
    const h = this.add.sprite(x, y, 'fx', 'hen_0').setOrigin(...(ORIGIN['fx:hen_0'] ?? [0.5, 0.9])).setScale(S).setDepth(y);
    this.ambient.push(h);
    const wander = () => {
      if (!h.active) return;
      if (Math.random() < 0.45) { h.play('hen_peck'); this.time.delayedCall(1200 + Math.random() * 1600, wander); return; }
      const nx = Phaser.Math.Clamp(h.x + Phaser.Math.Between(-50, 50), x - 70, x + 70), ny = Phaser.Math.Clamp(h.y + Phaser.Math.Between(-30, 30), y - 40, y + 40);
      h.play('hen_walk').setFlipX(nx > h.x);
      this.tweens.add({ targets: h, x: nx, y: ny, duration: 900 + Math.random() * 700, ease: 'Sine.inOut', onUpdate: () => h.setDepth(h.y), onComplete: wander });
    };
    wander();
  }

  private spawnButterfly(x: number, y: number) {
    const kind = ['bfy', 'bfp', 'bfb'][Math.floor(Math.random() * 3)];
    const b = this.add.sprite(x, y, 'fx', `${kind}_0`).setScale(S * 0.8).setDepth(84000).play(kind);
    this.ambient.push(b);
    const fly = () => {
      if (!b.active) return;
      const nx = Phaser.Math.Clamp(b.x + Phaser.Math.Between(-90, 90), x - 160, x + 160), ny = Phaser.Math.Clamp(b.y + Phaser.Math.Between(-60, 60), y - 120, y + 120);
      this.tweens.add({ targets: b, x: nx, y: ny, duration: 2200 + Math.random() * 1800, ease: 'Sine.inOut', onComplete: fly });
    };
    fly();
  }

  private spawnBirds() {
    if (gfx.reduceMotion || gfx.quality === 'low' || Math.random() < 0.3) return;
    const v = this.cameras.main.worldView;
    const ltr = Math.random() < 0.5;
    const y = v.y + v.height * (0.15 + Math.random() * 0.5);
    for (let i = 0; i < 3; i++) {
      const b = this.add.sprite(ltr ? v.x - 40 - i * 26 : v.right + 40 + i * 26, y + (i % 2) * 18 + i * 6, 'fx', 'bird_0').setScale(S).setDepth(86000).play('bird').setAngle(ltr ? 90 : -90);
      this.tweens.add({ targets: b, x: ltr ? v.right + 120 : v.x - 120, y: b.y - 60, duration: 6500, onComplete: () => b.destroy() });
    }
  }

  private ambientTick() {
    if (gfx.reduceMotion || gfx.quality === 'low') return;
    const v = this.cameras.main.worldView;
    // folha caindo de uma árvore visível
    const trees: Occluder[] = [];
    this.eachVisible((o) => { if (o.sway === 1) trees.push(o); }, 0);
    const t = trees[Math.floor(Math.random() * trees.length)];
    if (t && t.img.visible) {
      const lx = t.img.x + Phaser.Math.Between(-16, 16), ly = t.img.y - t.img.displayHeight * 0.55;
      const l = this.add.image(lx, ly, 'fx', 'leaf').setScale(S).setDepth(t.img.depth + 1).setAngle(Phaser.Math.Between(0, 360));
      this.tweens.add({ targets: l, x: lx + Phaser.Math.Between(-30, 30), y: t.img.y - 4, angle: l.angle + 220, duration: 2600, ease: 'Sine.inOut', onComplete: () => this.tweens.add({ targets: l, alpha: 0, duration: 600, onComplete: () => l.destroy() }) });
    }
    // brilho na água
    const ry = RIVER.y0 * TILE + 10 + Math.random() * ((RIVER.y1 - RIVER.y0 + 1) * TILE - 20);
    if (ry > v.y && ry < v.bottom) {
      const g = this.add.image(v.x + Math.random() * v.width, ry, 'fx', 'glint').setScale(0.1).setDepth(-50);
      this.tweens.add({ targets: g, scale: S * 0.7, alpha: { from: 1, to: 0 }, duration: 900, ease: 'Sine.out', onComplete: () => g.destroy() });
    }
  }

  private sendPos(force = false) {
    realtime.sendPos({ x: Math.round(this.me.lx), y: Math.round(this.me.ly), d: this.me.dir, a: this.me.anim }, force);
  }

  // ------------------------------------------------------------ entrada
  private setupInput() {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-E', () => this.ctxTarget && this.interact(this.ctxTarget));
    kb.on('keydown-SPACE', () => this.ctxTarget && this.interact(this.ctxTarget));
    kb.disableGlobalCapture();
    this.input.addPointer(1);

    let longPress: Phaser.Time.TimerEvent | null = null;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.downAt = { x: p.x, y: p.y };
      const ps = [this.input.pointer1, this.input.pointer2].filter((q) => q?.isDown);
      if (ps.length === 2) this.pinch = { d: Phaser.Math.Distance.Between(ps[0].x, ps[0].y, ps[1].x, ps[1].y), z: this.cameras.main.zoom };
      // toque longo: mostra o que é o objeto sem agir
      longPress?.remove(false);
      longPress = this.time.delayedCall(480, () => {
        if (!this.downAt || this.pinch) return;
        const t = this.pick(p.worldX, p.worldY);
        if (t) { const pos = this.targetPos(t); if (pos) this.floatText(pos.x, pos.top - 8, this.describe(t), '#fffdf6', 13); this.downAt = null; }
      });
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const ps = [this.input.pointer1, this.input.pointer2].filter((q) => q?.isDown);
      if (ps.length === 2 && this.pinch) {
        const d = Phaser.Math.Distance.Between(ps[0].x, ps[0].y, ps[1].x, ps[1].y);
        this.setZoom(this.pinch.z * (d / this.pinch.d));
        this.downAt = null;
        return;
      }
      if (!p.isDown) { this.updateHover(p.worldX, p.worldY); return; }
      if (!this.downAt) return;
      if (Phaser.Math.Distance.Between(p.x, p.y, this.downAt.x, this.downAt.y) > 12) {
        longPress?.remove(false);
        const cam = this.cameras.main;
        if (!this.dragging) { cam.stopFollow(); this.dragging = true; }
        cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
        cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
      }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      longPress?.remove(false);
      if (this.pinch) { if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) this.pinch = null; return; }
      const d = this.downAt;
      this.downAt = null;
      if (!d || Phaser.Math.Distance.Between(p.x, p.y, d.x, d.y) > 12) return;
      this.onTap(p.worldX, p.worldY);
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.setZoom(this.cameras.main.zoom * (dy > 0 ? 0.9 : 1.1)));
  }

  private setZoom(z: number) {
    const min = Math.max(0.5, this.scale.width / WORLD_W, this.scale.height / WORLD_H);
    this.cameras.main.setZoom(Phaser.Math.Clamp(z, min, 2.4));
  }

  /** ~15 tiles na menor dimensão da tela (retrato do celular ≈ 15 de largura). */
  private defaultZoom() { return Phaser.Math.Clamp(Math.min(this.scale.width, this.scale.height) / (15 * TILE), 0.75, 2); }

  private fitDeadzone() {
    const cam = this.cameras.main;
    cam.setDeadzone(Math.min(110, this.scale.width * 0.14) / cam.zoom, Math.min(80, this.scale.height * 0.1) / cam.zoom);
  }

  private recenter() {
    this.dragging = false;
    this.cameras.main.startFollow(this.me.sprite, false, 0.12, 0.12);
  }

  private onTap(wx: number, wy: number) {
    if (this.dragging) this.recenter();
    const t = this.pick(wx, wy);
    if (t) { play('click'); this.interact(t); return; }
    this.walkTo(Math.floor(wx / TILE), Math.floor(wy / TILE));
  }

  /** Anel de seleção sob o que está debaixo do mouse (desktop). */
  private updateHover(wx: number, wy: number) {
    const t = this.pick(wx, wy);
    const pos = t ? this.targetPos(t) : null;
    this.input.setDefaultCursor(t ? 'pointer' : 'default');
    if (!pos) { this.hover.setVisible(false); return; }
    this.hover.setPosition(pos.x, pos.y).setScale(pos.s * S).setVisible(true);
  }

  /** Posição de base (anel), topo (etiqueta) e escala do anel de um alvo. */
  private targetPos(t: Target): { x: number; y: number; top: number; s: number } | null {
    if (t.kind === 'node') { const img = this.nodes.get(t.id)!; return { x: img.x, y: img.y - 2, top: img.y - img.displayHeight * 0.85, s: /big|rock_big|gold/.test(WORLD_NODES.find((n) => n.id === t.id)!.t) ? 1.2 : 0.8 }; }
    if (t.kind === 'building') { const b = BUILDING_BY_ID[t.id].spot; const d = doorTile(b); return { x: d.x * TILE + 16, y: d.y * TILE + 4, top: b.y * TILE - 20, s: 0.9 }; }
    if (t.kind === 'plot') { const p = plotTile(t.i); return { x: (p.x + 1) * TILE, y: (p.y + 1) * TILE + 6, top: p.y * TILE - 6, s: 1.5 }; }
    const r = REGIONS.find((x) => x.id === t.region)!.rect;
    return { x: (r.x + r.w / 2) * TILE, y: (r.y + r.h / 2) * TILE, top: (r.y + r.h / 2) * TILE - 30, s: 1 };
  }

  private describe(t: Target): string {
    if (t.kind === 'node') { const def = NODE_BY_ID[WORLD_NODES.find((n) => n.id === t.id)!.t]; return `${def.name} → ${ITEM_BY_ID[def.item].name}${def.tool ? ` · ${TOOL_BY_ID[def.tool as ToolId].tiers[Math.max(0, def.tier - 1)].name}` : ''}`; }
    if (t.kind === 'building') return BUILDING_BY_ID[t.id].name;
    if (t.kind === 'plot') { const s = store.ents.field?.state.p?.[t.i]; return s ? ITEM_BY_ID[s[0]].name : 'Canteiro vazio'; }
    return REGIONS.find((r) => r.id === t.region)!.name;
  }

  /** O que está sob o ponto tocado (objeto mais à frente). */
  private pick(wx: number, wy: number): Target | null {
    for (const [id, f] of Object.entries(this.fog)) if (f.sign.visible && f.sign.getBounds().contains(wx, wy)) return { kind: 'sign', region: id };
    let best: { t: Target; depth: number } | null = null;
    const consider = (t: Target, img: Phaser.GameObjects.Image, shrink = 0.25) => {
      if (!img.visible) return;
      const b = img.getBounds();
      Phaser.Geom.Rectangle.Inflate(b, -b.width * shrink * 0.5, -b.height * shrink * 0.5);
      if (b.contains(wx, wy) && (!best || img.depth > best.depth)) best = { t, depth: img.depth };
    };
    for (const n of WORLD_NODES) { if (!store.hasRegion(n.r)) continue; consider({ kind: 'node', id: n.id }, this.nodes.get(n.id)!); }
    for (const b of BUILDINGS) {
      if (!store.hasRegion(b.region)) continue;
      const v = this.bviews[b.id];
      for (const img of [v.main, v.site, v.lot]) consider({ kind: 'building', id: b.id }, img, 0.15);
    }
    if (best) return (best as { t: Target }).t;
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    if (tx >= FIELD.x && tx < FIELD.x + FIELD.cols * FIELD.size && ty >= FIELD.y && ty < FIELD.y + FIELD.rows * FIELD.size) {
      return { kind: 'plot', e: 'field', i: Math.floor((ty - FIELD.y) / FIELD.size) * FIELD.cols + Math.floor((tx - FIELD.x) / FIELD.size) };
    }
    return null;
  }

  // ------------------------------------------------------------ movimento
  private tileOf(lx: number, ly: number) { return { x: Math.floor(lx / TILE), y: Math.floor(ly / TILE) }; }
  private walkable(tx: number, ty: number) { return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && !!this.grid[ty * MAP_W + tx]; }

  walkTo(tx: number, ty: number, then?: () => void) {
    const s = this.tileOf(this.me.lx, this.me.ly);
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
    this.marker.setPosition(tx * TILE + 16, ty * TILE + 18).setVisible(!then).setScale(0.2);
    if (!then) this.tweens.add({ targets: this.marker, scale: S, duration: 260, ease: 'Back.out' });
    if (p.length === 0) this.arrive();
    return true;
  }

  private approach(cells: { x: number; y: number }[], then: () => void) {
    const here = this.tileOf(this.me.lx, this.me.ly);
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

  update(time: number, dtMs: number) {
    const dt = Math.min(0.1, dtMs / 1000);
    let sx = 0, sy = 0;
    const k = this.keys;
    if (k && !document.querySelector('input:focus, textarea:focus')) {
      if (k.A.isDown || k.LEFT.isDown) sx -= 1;
      if (k.D.isDown || k.RIGHT.isDown) sx += 1;
      if (k.W.isDown || k.UP.isDown) sy -= 1;
      if (k.S.isDown || k.DOWN.isDown) sy += 1;
    }
    if (!sx && !sy && (this.joy.x || this.joy.y)) { sx = this.joy.x; sy = this.joy.y; }
    let moved = false;
    const me = this.me;
    if (sx || sy) {
      this.path = []; this.onArrive = null; this.marker.setVisible(false); this.cancelWork();
      if (this.dragging) this.recenter();
      const len = Math.hypot(sx, sy), mag = Math.min(1, len);
      const vx = sx / len, vy = sy / len;
      const nx = me.lx + vx * SPEED * mag * dt, ny = me.ly + vy * SPEED * mag * dt;
      const ok = (x: number, y: number) => [[-6, -6], [6, -6], [-6, 4], [6, 4]].every(([ox, oy]) => { const t = this.tileOf(x + ox, y + oy); return this.walkable(t.x, t.y); });
      let x = me.lx, y = me.ly;
      if (ok(nx, y)) x = nx;
      if (ok(x, ny)) y = ny;
      if (x !== me.lx || y !== me.ly) { me.setPos(x, y); moved = true; }
      me.dir = dirFrom(vx, vy, me.dir);
    } else if (this.path.length) {
      const [tx, ty] = this.path[0];
      const gx = tx * TILE + TILE / 2, gy = ty * TILE + TILE / 2;
      const dx = gx - me.lx, dy = gy - me.ly;
      const dist = Math.hypot(dx, dy);
      const step = SPEED * dt;
      if (dist <= step) { me.setPos(gx, gy); this.path.shift(); if (!this.path.length) this.arrive(); }
      else me.setPos(me.lx + (dx / dist) * step, me.ly + (dy / dist) * step);
      me.dir = dirFrom(dx, dy, me.dir);
      moved = true;
    }
    const carrying = this.time.now < this.carryUntil;
    const posing = this.time.now < this.poseUntil;
    const anim: Anim = this.busy ? this.busyAnim : moved ? (carrying ? 'carry' : 'walk') : posing ? this.pose : carrying ? 'carry' : 'idle';
    me.play(anim, me.dir);
    const sig = `${anim}${me.dir}`;
    if (moved || sig !== this.lastSentAnim) { this.sendPos(sig !== this.lastSentAnim); this.lastSentAnim = sig; }
    if (this.moving && !moved) this.sendPos(true);
    this.moving = moved;

    // interpolação dos outros jogadores
    for (const a of this.remotes.values()) {
      const dx = a.tx - a.lx, dy = a.ty - a.ly;
      const dist = Math.hypot(dx, dy);
      if (dist > 300) a.setPos(a.tx, a.ty);
      else if (dist > 0.5) {
        const step = Math.max(SPEED * 1.1 * dt, dist * 0.2);
        a.setPos(a.lx + (dx / dist) * Math.min(step, dist), a.ly + (dy / dist) * Math.min(step, dist));
      }
    }

    // árvores e flores balançam (só as visíveis)
    if (!gfx.reduceMotion && gfx.quality !== 'low') {
      const tt = time * 0.0011;
      this.eachVisible((o) => { if (o.sway) o.img.setAngle(Math.sin(tt + o.phase) * 1.3 * o.sway); }, 0);
    }
    if (this.ripple?.visible) { this.ripple.tilePositionX += dt * 14; this.ripple.tilePositionY = Math.sin(time * 0.0008) * 6; }
    for (const c of this.clouds) { c.x += dt * 9; if (c.x - c.displayWidth / 2 > WORLD_W) { c.x = -c.displayWidth / 2; c.y = Math.random() * WORLD_H; } }
  }

  // ------------------------------------------------------------ interações
  interact(t: Target) {
    if (t.kind === 'sign') { bus.emit('panel', 'projects'); bus.emit('projects:focus', `r:${t.region}`); return; }
    if (t.kind === 'building') {
      const b = BUILDING_BY_ID[t.id];
      const d = doorTile(b.spot);
      this.approach([d, { x: d.x - 1, y: d.y }, { x: d.x + 1, y: d.y }, { x: d.x, y: d.y + 1 }], () => {
        this.faceTo(d.x, d.y - 1);
        const v = this.bviews[b.id];
        this.squash(v.main.visible ? v.main : v.site.visible ? v.site : v.lot, 0.03);
        play('open');
        if (store.lvl(b.id) >= 1) bus.emit('panel', { b: b.id });
        else { bus.emit('panel', 'projects'); bus.emit('projects:focus', `b:${b.id}`); }
      });
      return;
    }
    if (t.kind === 'plot') { this.interactPlot(t.i); return; }
    this.interactNode(t.id);
  }

  private faceTo(tx: number, ty: number) {
    this.me.dir = dirFrom(tx * TILE + TILE / 2 - this.me.lx, ty * TILE + TILE / 2 - this.me.ly, this.me.dir);
  }

  private setPose(a: Anim, ms: number) { this.pose = a; this.poseUntil = this.time.now + ms; }

  private interactPlot(i: number) {
    if (i >= plotCount('field')) { bus.emit('toast', { kind: 'info', text: 'Canteiro bloqueado. Melhore a Casa da Fazenda para liberar mais.' }); return; }
    const p = plotTile(i);
    const cells = [{ x: p.x, y: p.y + 2 }, { x: p.x + 1, y: p.y + 2 }, { x: p.x + 2, y: p.y }, { x: p.x + 2, y: p.y + 1 }, { x: p.x, y: p.y }, { x: p.x + 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x + 1, y: p.y + 1 }];
    const slot = this.pendingPlots.has(i) ? null : store.ents.field?.state.p?.[i];
    if (!slot && this.pendingPlots.has(i)) return;
    const cx = (p.x + 1) * TILE, cy = (p.y + 1) * TILE;
    if (!slot) { this.approach(cells, () => { this.faceTo(p.x, p.y); this.setPose('crouch', 900); bus.emit('panel', { plant: 'field', i }); }); return; }
    const [crop, at] = slot;
    const left = at + growMs(crop, 'field') - store.now();
    if (left > 0) { this.floatText(cx, cy - 30, `${ITEM_BY_ID[crop].name}: ${Math.ceil(left / 1000)}s`, '#ffffff', 14); this.squash(this.plots[i].crop, 0.05); return; }
    const def = CROP_BY_ID[crop];
    if (def.tool && store.tool(def.tool) < 1) { this.denied(`Precisa de ${TOOL_BY_ID[def.tool].tiers[0].name} para colher ${ITEM_BY_ID[crop].name}.`); return; }
    this.approach(cells, () => {
      this.faceTo(p.x + 1, p.y + 1);
      this.work(1, () => {
        const q = def.yield + (def.tool ? store.tool(def.tool) - 1 : 0);
        if (store.invTotal() + q > capacity()) { this.denied(errorText('storage_full')); return; }
        this.pendingPlots.add(i);
        const img = this.plots[i].crop;
        this.tweens.add({ targets: img, scaleY: S * 1.15, scaleX: S * 0.92, duration: 90, yoyo: true, ease: 'Quad.out', onComplete: () => this.tweens.add({ targets: img, alpha: 0, y: img.y - 6, duration: 160, onComplete: () => { img.setVisible(false).setAlpha(1).setY(p.y * TILE); } }) });
        this.burst(cx, cy - 6, 'leaf', 6, 30);
        this.burst(cx, cy - 10, 'sparkle', 3, 26, 0.35);
        this.flyItem(crop, q, cx, cy - 16);
        play('pop');
        void store.act({ t: 'reap', e: 'field', i }).then((r) => { this.pendingPlots.delete(i); if (!r.ok) this.denied(errorText(r.e)); this.refreshPlots(); });
      }, undefined, def.tool ? 'work' : 'crouch');
    });
  }

  private interactNode(id: string) {
    const n = WORLD_NODES.find((x) => x.id === id) as WorldNode;
    const def = NODE_BY_ID[n.t];
    const img = this.nodes.get(id)!;
    if (this.pending.has(id) || !store.nodeReady(id)) {
      const left = Math.max(1, Math.ceil(((store.farm?.nodes[id] ?? 0) - store.now()) / 1000));
      this.floatText(img.x, img.y - 46, this.pending.has(id) ? 'Coletando…' : `Volta em ${left}s`, '#ffffff', 14);
      return;
    }
    let tier = 0;
    if (def.tool) {
      tier = store.tool(def.tool);
      if (tier < def.tier) { this.denied(`Precisa de ${TOOL_BY_ID[def.tool as ToolId].tiers[def.tier - 1].name}. Fabrique no menu Ferramentas.`); this.squash(img, 0.04); return; }
    }
    const q = def.qty + (def.tool ? tier - def.tier : 0);
    if (store.invTotal() + q > capacity()) { this.denied(errorText('storage_full')); return; }
    const cells = def.solid ? this.neighbors(n.x, n.y) : [{ x: n.x, y: n.y }, ...this.neighbors(n.x, n.y)];
    const chip = def.tool === 'axe' ? 'chip' : def.tool === 'pickaxe' ? 'stone' : def.tool === 'shovel' ? 'dust' : 'grassbit';
    this.approach(cells, () => {
      this.faceTo(n.x, n.y);
      const hits = def.tool ? Math.max(1, def.hits - (tier - def.tier)) : 1;
      this.work(hits, () => {
        if (!store.nodeReady(id) || this.pending.has(id)) { this.denied(errorText('node_depleted')); return; }
        this.pending.add(id);
        frame(img, 'nature', `${n.t}_off`);
        img.setScale(S * 1.08, S * 0.9);
        this.tweens.add({ targets: img, scaleX: S, scaleY: S, duration: 260, ease: 'Back.out' });
        if (def.tool === 'axe') this.burst(img.x, img.y - 40, 'leaf', 9, 40);
        this.burst(img.x, img.y - 4, 'dust', 4, 18, 0.5);
        this.flyItem(def.item, q, img.x, img.y - 26);
        void store.act({ t: 'harvest', n: id }).then((r) => {
          this.pending.delete(id);
          if (!r.ok) this.denied(errorText(r.e));
          this.refreshNodes();
        });
      }, () => {
        play(def.tool === 'axe' ? 'chop' : def.tool === 'pickaxe' ? 'pick' : def.tool === 'shovel' ? 'dig' : 'pop');
        this.squash(img, 0.07);
        if (/tree/.test(n.t)) this.tweens.add({ targets: img, angle: { from: -3, to: 0 }, duration: 260, ease: 'Elastic.out' });
        this.burst(img.x, img.y - 16, chip, 5, 24, chip === 'dust' ? 0.5 : S);
      }, def.tool ? 'work' : 'crouch');
    });
  }

  private work(hits: number, done: () => void, onHit?: (k: number) => void, anim: Anim = 'work') {
    this.busy = true;
    this.busyAnim = anim;
    let k = 0;
    const step = () => {
      if (!this.busy) return;
      onHit?.(k);
      k++;
      if (k >= hits) this.workTimers.push(this.time.delayedCall(260, () => { if (!this.busy) return; this.busy = false; this.workTimers = []; this.carryUntil = this.time.now + 1300; done(); }));
      else this.workTimers.push(this.time.delayedCall(330, step));
    };
    this.workTimers.push(this.time.delayedCall(140, step));
  }

  private denied(text: string) { play('error'); bus.emit('toast', { kind: 'warn', text }); }

  // ------------------------------------------------------------ contexto (botão de ação + destaque)
  private updateContext() {
    const here = this.tileOf(this.me.lx, this.me.ly);
    let best: { t: Target; label: string; icon: string; d: number; locked?: boolean } | null = null;
    const offer = (t: Target, label: string, icon: string, x: number, y: number, locked = false) => {
      const d = Math.max(Math.abs(x - here.x), Math.abs(y - here.y)) + (locked ? 0.5 : 0);
      if (d <= 1.5 && (!best || d < best.d)) best = { t, label, icon, d, locked };
    };
    for (const n of WORLD_NODES) {
      if (Math.abs(n.x - here.x) > 1 || Math.abs(n.y - here.y) > 1 || !store.hasRegion(n.r) || !store.nodeReady(n.id) || this.pending.has(n.id)) continue;
      const def = NODE_BY_ID[n.t];
      const tier = def.tool ? store.tool(def.tool) : 0;
      if (def.tool && tier < def.tier) offer({ kind: 'node', id: n.id }, `Precisa: ${TOOL_BY_ID[def.tool as ToolId].tiers[def.tier - 1].name}`, def.item, n.x, n.y, true);
      else offer({ kind: 'node', id: n.id }, `${def.tool ? VERB[def.tool] : 'Colher'}: ${def.name}`, def.item, n.x, n.y);
    }
    for (const b of BUILDINGS) {
      if (!store.hasRegion(b.region)) continue;
      const d = doorTile(b.spot);
      offer({ kind: 'building', id: b.id }, store.lvl(b.id) >= 1 ? `Abrir ${b.name}` : `Projeto: ${b.name}`, `b:${b.id}`, d.x, d.y);
    }
    if (here.x >= FIELD.x - 1 && here.x <= FIELD.x + FIELD.cols * 2 && here.y >= FIELD.y - 1 && here.y <= FIELD.y + FIELD.rows * 2) {
      for (let i = 0; i < plotCount('field'); i++) {
        const p = plotTile(i);
        const slot = store.ents.field?.state.p?.[i];
        const ready = slot && slot[1] + growMs(slot[0], 'field') <= store.now();
        const cx = p.x + (here.x > p.x ? 1 : 0), cy = p.y + (here.y > p.y ? 1 : 0);
        if (!slot) offer({ kind: 'plot', e: 'field', i }, 'Plantar', 'wheat', cx, cy);
        else if (ready) offer({ kind: 'plot', e: 'field', i }, `Colher ${ITEM_BY_ID[slot[0]].name}`, slot[0], cx, cy);
      }
    }
    const b = best as { t: Target; label: string; icon: string; locked?: boolean } | null;
    const label = b?.label ?? '';
    this.ctxTarget = b?.t ?? null;
    // destaque no mundo: anel pulsando + etiqueta com nome e atalho
    const pos = b ? this.targetPos(b.t) : null;
    if (pos && !this.busy) {
      this.focusRing.setPosition(pos.x, pos.y).setScale(pos.s * S).setVisible(true).setTint(b!.locked ? 0xffb4a8 : 0xffffff);
      this.focusTag.setText(this.coarse ? label : `${label}  [E]`).setPosition(pos.x, pos.top).setVisible(true).setColor(b!.locked ? '#b23a2a' : '#3b2c22');
    } else { this.focusRing.setVisible(false); this.focusTag.setVisible(false); }
    if (label !== this.ctxLabel) { this.ctxLabel = label; bus.emit('context', b ? { label, icon: b.icon, locked: !!b.locked } : null); }
  }

  // ------------------------------------------------------------ multiplayer
  private onPresence(metas: PresenceMeta[], quiet = false) {
    const ids = new Set(metas.map((m) => m.u));
    for (const m of metas) {
      if (m.u === this.meInfo.id) continue;
      const a = this.remotes.get(m.u);
      if (!a) {
        const last = realtime.lastPos.get(m.u);
        const av = new Avatar(this, last?.x ?? SPAWN.x * TILE + 16, last?.y ?? SPAWN.y * TILE + 16, m.name, m.look, false);
        av.sprite.setAlpha(0);
        this.tweens.add({ targets: av.sprite, alpha: 1, duration: 400 });
        this.burst(av.x, av.y - 10, 'sparkle', 5, 30, 0.35);
        this.remotes.set(m.u, av);
        if (!quiet) bus.emit('toast', { kind: 'ok', text: `${m.name} entrou na fazenda.` });
      } else a.setLook(m.look);
    }
    for (const [u, a] of this.remotes) if (!ids.has(u)) { a.destroy(); this.remotes.delete(u); bus.emit('toast', { kind: 'info', text: `${a.label.text} saiu. A fazenda continua salva.` }); }
  }

  private onRemotePos(p: PosMsg) {
    const a = this.remotes.get(p.u);
    if (!a || p.t < a.lastSeen) return;
    a.lastSeen = p.t;
    a.tx = p.x; a.ty = p.y;
    const moving = Math.hypot(p.x - a.lx, p.y - a.ly) > 2;
    a.play((p.a as Anim) === 'idle' && moving ? 'walk' : (p.a as Anim), p.d);
  }

  /** Para o minimapa: posições em tiles e a área visível (px de mundo). */
  snapshot() {
    const v = this.cameras.main.worldView;
    return {
      me: { x: this.me.lx / TILE, y: this.me.ly / TILE },
      others: [...this.remotes.values()].map((a) => ({ x: a.lx / TILE, y: a.ly / TILE, name: a.label.text })),
      view: { x: v.x, y: v.y, w: v.width, h: v.height },
    };
  }

  // ------------------------------------------------------------ visuais
  private refreshAll() {
    this.rebuildGrid();
    this.refreshFog();
    this.refreshBuildings();
    this.refreshPlots();
    this.refreshNodes();
    this.firstRefresh = false;
  }

  private rebuildGrid() {
    const regions = new Set(store.farm?.progression.regions ?? ['sitio']);
    const built = new Set(BUILDINGS.filter((b) => store.lvl(b.id) >= 1 || store.ents[b.id]?.state.proj).map((b) => b.id));
    this.grid = buildWalkGrid(regions, built);
    if (!this.me) return;
    const t = this.tileOf(this.me.lx, this.me.ly);
    if (!this.walkable(t.x, t.y)) {
      for (let r = 1; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (this.walkable(t.x + dx, t.y + dy)) { this.me.setPos((t.x + dx) * TILE + 16, (t.y + dy) * TILE + 16); return; }
      }
      this.me.setPos(SPAWN.x * TILE + 16, SPAWN.y * TILE + 16);
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
        f.sign.setText(proj ? `🚧 ${r.name}\nprojeto em andamento` : lv >= r.level ? `✨ ${r.name}\npronto para expandir` : `🔒 ${r.name}\nnível ${r.level}`);
      }
    }
  }

  private refreshBuildings() {
    const now = store.now();
    for (const b of BUILDINGS) {
      const v = this.bviews[b.id];
      const lvl = store.lvl(b.id);
      const proj = store.ents[b.id]?.state.proj;
      const built = lvl >= 1;
      v.main.setVisible(built);
      v.blades?.setVisible(built);
      v.site.setVisible(!built && !!proj);
      v.lot.setVisible(!built && !proj && store.hasRegion(b.region));
      v.badge.setVisible(built && lvl >= 2).setText(`nv ${lvl}`);
      if (v.built === false && built && !this.firstRefresh) this.buildingDone(b.id);
      v.built = built;
      v.bar.clear();
      if (proj) {
        let need = proj.need.coins ?? 0, got = Math.min(need, proj.got.coins ?? 0);
        for (const [k, q] of Object.entries(proj.need.items ?? {})) { const p = ITEM_BY_ID[k].price; need += q * p; got += Math.min(q, proj.got[k] ?? 0) * p; }
        const w = Math.min(90, b.spot.w * TILE * 0.7), x = v.ox + (b.spot.w * TILE - w) / 2, y = v.oy + b.spot.h * TILE * 0.35;
        v.bar.fillStyle(0x3b2c22, 0.9).fillRoundedRect(x - 3, y - 3, w + 6, 13, 6);
        v.bar.fillStyle(0xfffdf6, 1).fillRoundedRect(x, y, w, 7, 3.5);
        v.bar.fillStyle(0x3f8a4a, 1).fillRoundedRect(x, y, Math.max(6, (w * got) / Math.max(1, need)), 7, 3.5);
      }
      const q = store.ents[b.id]?.state.q ?? [];
      const ready = q.find((e) => e[1] <= now);
      if (built && ready) v.ready.setTexture(ensureIcon(this, ready[0])).setScale(0.6).setVisible(true);
      else v.ready.setVisible(false);
    }
  }

  /** Obra concluída: o prédio "brota" com elástico, poeira, confete e um tremor leve. */
  private buildingDone(id: string) {
    const v = this.bviews[id], b = BUILDING_BY_ID[id].spot;
    play('build');
    v.main.setScale(S * 1.1, S * 0.2);
    this.tweens.add({ targets: v.main, scaleX: S, scaleY: S, duration: 700, ease: 'Back.out', easeParams: [2.2] });
    for (let i = 0; i <= b.w; i++) this.burst(v.ox + i * TILE, v.oy + b.h * TILE, 'dust', 2, 26, 0.8);
    this.confetti(v.ox + (b.w * TILE) / 2, v.oy);
    if (!gfx.reduceMotion) this.cameras.main.shake(220, 0.003);
  }

  private refreshPlots() {
    const count = plotCount('field');
    const slots = store.ents.field?.state.p ?? [];
    const now = store.now();
    this.plots.forEach((pl, i) => {
      const soilKey = i < count ? 'soil' : 'soil_locked';
      if (pl.soil.frame.name !== soilKey) frame(pl.soil, 'crops', soilKey);
      const s = slots[i];
      if (!s || i >= count || this.pendingPlots.has(i)) { pl.crop.setVisible(false); pl.key = ''; return; }
      const stage = stageOf((now - s[1]) / growMs(s[0], 'field'));
      const key = `${s[0]}_${stage}`;
      if (pl.key !== key) {
        frame(pl.crop, 'crops', key).setVisible(true);
        if (!this.firstRefresh) {
          pl.crop.setScale(S, S * (pl.key ? 0.85 : 0.4));
          this.tweens.add({ targets: pl.crop, scaleY: S, duration: 360, ease: 'Back.out' });
          const t = plotTile(i);
          if (!pl.key) { this.burst((t.x + 1) * TILE, (t.y + 1) * TILE, 'dust', 4, 22, 0.6); play('dig'); }
          else if (stage === 5) this.burst((t.x + 1) * TILE, (t.y + 1) * TILE - 10, 'sparkle', 3, 24, 0.35);
        }
        pl.key = key;
      } else pl.crop.setVisible(true);
    });
  }

  private refreshNodes() {
    for (const n of WORLD_NODES) {
      const img = this.nodes.get(n.id)!;
      const off = this.pending.has(n.id) || !store.nodeReady(n.id);
      const key = off ? `${n.t}_off` : n.t;
      if (img.frame.name !== key) {
        frame(img, 'nature', key);
        if (!off && !this.firstRefresh) { img.setScale(S * 0.6); this.tweens.add({ targets: img, scale: S, duration: 380, ease: 'Back.out' }); }
      }
    }
  }

  private tick500() {
    this.refreshNodes();
    this.refreshPlots();
    this.refreshBuildings();
    bus.emit('minimap', this.snapshot());
    if (gfx.quality === 'low') return;
    const now = this.time.now;
    for (const b of BUILDINGS) {
      const v = this.bviews[b.id];
      if (!v.main.visible) continue;
      const working = (store.ents[b.id]?.state.q?.length ?? 0) > 0;
      if (v.blades) this.tweens.add({ targets: v.blades, angle: v.blades.angle + (working ? 45 : 8), duration: 500 });
      const smoke = ANCHORS[b.id].smoke;
      if (smoke && (working || b.id === 'farmhouse') && now > v.smokeAt) {
        v.smokeAt = now + (working ? 700 : 1800);
        const p = this.add.image(v.ox + smoke[0], v.oy + smoke[1], 'fx', 'puff').setScale(0.16).setAlpha(0.85).setDepth(v.main.depth + 1);
        this.tweens.add({ targets: p, y: p.y - 42, x: p.x + 14, scale: 0.42, alpha: 0, duration: 2200, ease: 'Sine.out', onComplete: () => p.destroy() });
      }
    }
  }

  // ------------------------------------------------------------ efeitos
  floatText(x: number, y: number, text: string, color: string, size = 15) {
    const t = this.floats.pop() ?? this.add.text(0, 0, '', { fontFamily: 'Sniglet, sans-serif', stroke: '#3b2c22', strokeThickness: 4 }).setOrigin(0.5).setResolution(3).setDepth(90000);
    t.setText(text).setPosition(x, y).setColor(color).setFontSize(size).setAlpha(1).setScale(0.6).setVisible(true);
    this.tweens.add({ targets: t, scale: 1, duration: 180, ease: 'Back.out' });
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, delay: 500, duration: 900, ease: 'Cubic.out', onComplete: () => { t.setVisible(false); this.floats.push(t); } });
  }

  /** Squash & stretch curtinho no alvo de um golpe. */
  private squash(img: Phaser.GameObjects.Image, k: number) {
    if (!img.visible) return;
    const sx = img.scaleX, sy = img.scaleY;
    this.tweens.add({ targets: img, scaleX: sx * (1 + k), scaleY: sy * (1 - k), duration: 70, yoyo: true, ease: 'Quad.out', onComplete: () => img.setScale(sx, sy) });
  }

  /** Partículas de um quadro do atlas fx espalhando em arco. */
  private burst(x: number, y: number, f: string, n: number, r: number, scale = S) {
    if (!gfx.effects) return;
    n = Math.max(1, Math.round(n * (gfx.quality === 'low' ? 0.5 : 1)));
    for (let i = 0; i < n; i++) {
      const d = this.add.image(x, y, 'fx', f).setScale(scale * (0.7 + Math.random() * 0.5)).setDepth(90000).setAngle(Math.random() * 360);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, dist = r * (0.5 + Math.random() * 0.7);
      this.tweens.add({ targets: d, x: x + Math.cos(a) * dist, y: y + Math.sin(a) * dist * 0.7 + r * 0.6, angle: d.angle + Phaser.Math.Between(-160, 160), alpha: 0, scale: d.scale * 0.6, duration: 520 + Math.random() * 300, ease: 'Cubic.out', onComplete: () => d.destroy() });
    }
  }

  /** Item salta em arco e voa até o personagem (a interface faz o resto até o estoque). */
  private flyItem(item: string, q: number, x: number, y: number) {
    const icon = this.add.image(x, y, ensureIcon(this, item)).setScale(0.3).setDepth(90000);
    this.tweens.add({ targets: icon, y: y - 26, scale: 0.6, duration: 260, ease: 'Back.out', onComplete: () => {
      this.tweens.add({ targets: icon, x: this.me.x, y: this.me.y - 40, scale: 0.35, duration: 300, ease: 'Quad.in', onComplete: () => {
        icon.destroy();
        this.floatText(this.me.x, this.me.y - 62, `+${q} ${ITEM_BY_ID[item].name}`, '#fffdf6', 14);
        bus.emit('gain', { item, q });
      } });
    } });
  }

  private celebrate(big = true) {
    this.setPose('cheer', 1500);
    if (big) this.confetti(this.me.x, this.me.y - 50);
    else this.burst(this.me.x, this.me.y - 40, 'heart', 4, 30, 0.4);
  }

  private confetti(x: number, y: number) {
    if (!gfx.effects) return;
    const cols = [0xf6c445, 0xe2574c, 0x4a9fd8, 0x3f8a4a, 0xfffdf6, 0x9152b8];
    for (let i = 0; i < 30; i++) {
      const d = this.add.image(x, y, 'fx', i % 4 ? 'dot' : 'sparkle').setScale(i % 4 ? 0.4 : 0.35).setTint(cols[i % cols.length]).setDepth(90000);
      this.tweens.add({ targets: d, x: x + Phaser.Math.Between(-110, 110), y: y + Phaser.Math.Between(-90, 40), alpha: 0, angle: 360, duration: 1200, ease: 'Cubic.out', onComplete: () => d.destroy() });
    }
  }

  // ------------------------------------------------------------ posição local (só no aparelho)
  private posKey() { return `sm-pos3-${store.farm?.id}-${this.meInfo.id}`; }
  private loadPos() {
    try {
      const p = JSON.parse(localStorage.getItem(this.posKey()) ?? 'null');
      if (p && typeof p.x === 'number') { const t = this.tileOf(p.x, p.y); const r = regionAt(t.x, t.y); if (r && store.hasRegion(r)) return p; }
    } catch { /* sem storage */ }
    return { x: SPAWN.x * TILE + 16, y: SPAWN.y * TILE + 16 };
  }
  savePos() { try { localStorage.setItem(this.posKey(), JSON.stringify({ x: Math.round(this.me.lx), y: Math.round(this.me.ly) })); } catch { /* sem storage */ } }
}
