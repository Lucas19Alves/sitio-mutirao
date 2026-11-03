import Phaser from 'phaser';
import { BUILDINGS, CROPS, BRIDGES, RIVER, MAP_W, MAP_H, PATH_TILES, regionAt, isWater } from '../../data/catalog.ts';
import { buildTileset, PAD, TS } from '../art/cartoon/terrain.ts';
import { nodeArts, decorArts, type Art } from '../art/cartoon/nature.ts';
import { buildingArt, constructionArt, lotArt } from '../art/cartoon/buildings.ts';
import { cropArt, soilArt, STAGES } from '../art/cartoon/crops.ts';
import { bridgeArt, fenceArts, fxArts, critterArts } from '../art/cartoon/props.ts';
import { buildSheet, lookKey, FW, FH, POSES, type Look } from '../art/characters.ts';
import { iconCanvas } from '../art/icons.ts';
import { cv } from '../art/cartoon/paint.ts';
import { bus } from '../bus.ts';
import { shared } from '../shared.ts';

/** Origem (0..1) de cada quadro de atlas, por chave "atlas:frame". */
export const ORIGIN: Record<string, [number, number]> = {};
/** Âncoras dos prédios (px de mundo relativos ao canto do lote). */
export const ANCHORS: Record<string, Record<string, [number, number]>> = {};
export { PAD, TS };

/** Empacota artes num atlas (prateleiras) e registra cada quadro com sua origem. */
function packAtlas(scene: Phaser.Scene, key: string, arts: Record<string, Art | { c: HTMLCanvasElement; ox: number; oy: number }>, width = 2048) {
  if (scene.textures.exists(key)) return;
  const items = Object.entries(arts).sort((a, b) => b[1].c.height - a[1].c.height);
  const G = 2; // espaço entre quadros (filtragem linear)
  let x = 0, y = 0, row = 0;
  const pos: Record<string, [number, number]> = {};
  for (const [k, a] of items) {
    if (x + a.c.width + G > width) { x = 0; y += row + G; row = 0; }
    pos[k] = [x, y]; x += a.c.width + G; row = Math.max(row, a.c.height);
  }
  const { c, x: ctx } = cv(width, y + row);
  for (const [k, a] of items) ctx.drawImage(a.c, pos[k][0], pos[k][1]);
  const tex = scene.textures.addImage(key, c as unknown as HTMLImageElement)!;
  for (const [k, a] of items) { tex.add(k, 0, pos[k][0], pos[k][1], a.c.width, a.c.height); ORIGIN[`${key}:${k}`] = [a.ox, a.oy]; }
}

/** Miniatura do mapa (4 px por tile) para o minimapa da interface. */
function minimapCanvas() {
  const S = 4;
  const { c, x } = cv(MAP_W * S, MAP_H * S);
  const col: Record<string, string> = { sitio: '#7cbf4f', pomar: '#86c457', bosque: '#5a9440', rio: '#8cc85b', colinas: '#a1ae5c', vale: '#8ccd62', planalto: '#b6a764' };
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    const r = regionAt(tx, ty);
    x.fillStyle = isWater(tx, ty) ? '#5fb6dc' : ty >= RIVER.y0 && ty <= RIVER.y1 ? '#b9824e' : PATH_TILES.has(`${tx},${ty}`) && r ? '#e2c08c' : r ? col[r] : '#3f7a35';
    x.fillRect(tx * S, ty * S, S, S);
  }
  for (const b of BUILDINGS) { x.fillStyle = '#c4473f'; x.fillRect(b.spot.x * S + 1, b.spot.y * S + 1, b.spot.w * S - 2, b.spot.h * S - 2); }
  return c;
}

/** Gera todas as texturas procedurais uma única vez (sem downloads de imagem). */
export class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }

  create() {
    const steps: (() => void)[] = [
      () => { this.textures.addImage('terrain', buildTileset() as unknown as HTMLImageElement); shared.ground = minimapCanvas(); },
      () => {
        const fx = fxArts();
        const { ripple, cloud, ...small } = fx;
        packAtlas(this, 'fx', { ...small, ...critterArts(), ...fenceArts() }, 1024);
        this.textures.addImage('ripple', ripple.c as unknown as HTMLImageElement);
        this.textures.addImage('cloud', cloud.c as unknown as HTMLImageElement);
      },
      () => packAtlas(this, 'nature', { ...nodeArts(), ...decorArts() }),
      () => {
        const arts: Record<string, Art> = {};
        const sizes = new Set<string>();
        for (const b of BUILDINGS) { const a = buildingArt(b); arts[b.id] = a; ANCHORS[b.id] = a.anchors; sizes.add(`${b.spot.w}x${b.spot.h}`); }
        for (const s of sizes) {
          const [w, h] = s.split('x').map(Number);
          const con = constructionArt(w, h), lot = lotArt(w, h);
          arts[`con_${s}`] = con; arts[`lot_${s}`] = lot; ANCHORS[`con_${s}`] = con.anchors;
        }
        for (const br of BRIDGES) arts[`bridge_${br.x0}`] = bridgeArt(br.x1 - br.x0 + 1, RIVER.y1 - RIVER.y0 + 1);
        packAtlas(this, 'bld', arts);
        // pás do moinho
        const { c: bl, x: bx } = cv(200, 200);
        bx.translate(100, 100);
        for (let i = 0; i < 4; i++) {
          bx.save(); bx.rotate((i * Math.PI) / 2);
          bx.fillStyle = '#8d5a33'; bx.strokeStyle = '#4a3423'; bx.lineWidth = 2.5;
          bx.beginPath(); bx.roundRect(-5, -96, 10, 92, 3); bx.fill(); bx.stroke();
          bx.fillStyle = '#fbf8ef'; bx.beginPath(); bx.roundRect(4, -92, 26, 72, 3); bx.fill(); bx.stroke();
          bx.strokeStyle = '#d2bf98'; bx.lineWidth = 1.5; for (let k = 1; k < 4; k++) { bx.beginPath(); bx.moveTo(4, -92 + k * 18); bx.lineTo(30, -92 + k * 18); bx.stroke(); }
          bx.restore();
        }
        bx.beginPath(); bx.arc(0, 0, 12, 0, Math.PI * 2); bx.fillStyle = '#6b3f22'; bx.fill(); bx.strokeStyle = '#4a3423'; bx.lineWidth = 2.5; bx.stroke();
        this.textures.addImage('blades', bl as unknown as HTMLImageElement);
      },
      () => {
        const arts: Record<string, Art> = { soil: soilArt(false), soil_locked: soilArt(true) };
        for (const c of CROPS) for (let s = 1; s < STAGES; s++) arts[`${c.id}_${s}`] = cropArt(c.id, s);
        packAtlas(this, 'crops', arts);
      },
    ];
    // gera um pouco por frame para a tela de carregamento continuar fluida
    let i = 0;
    const tick = () => {
      if (i < steps.length) { steps[i++](); bus.emit('boot:progress', i / steps.length); this.time.delayedCall(0, tick); }
      else this.scene.start('world');
    };
    tick();
  }
}

/** Ícone de item como textura (sob demanda). */
export function ensureIcon(scene: Phaser.Scene, id: string) {
  const key = `i_${id}`;
  if (!scene.textures.exists(key)) scene.textures.addImage(key, iconCanvas(id, 48) as unknown as HTMLImageElement);
  return key;
}

const RATE: Record<string, number> = { idle: 2.2, walk: 9, work: 9, crouch: 4, cheer: 5, carry: 8 };
/** Spritesheet + animações para uma aparência (cacheadas por combinação). */
export function ensureCharacter(scene: Phaser.Scene, look: Look) {
  const key = `ch_${lookKey(look)}`;
  if (scene.textures.exists(key)) return key;
  scene.textures.addSpriteSheet(key, buildSheet(look) as unknown as HTMLImageElement, { frameWidth: FW, frameHeight: FH });
  const cols = Object.values(POSES).reduce((n, [s, k]) => Math.max(n, s + k), 0);
  ['down', 'left', 'right', 'up'].forEach((d, row) => {
    for (const [pose, [start, n]] of Object.entries(POSES)) {
      const frames = scene.anims.generateFrameNumbers(key, { start: row * cols + start, end: row * cols + start + n - 1 });
      scene.anims.create({ key: `${key}_${pose}_${d}`, frames, frameRate: RATE[pose], repeat: -1 });
    }
  });
  return key;
}
