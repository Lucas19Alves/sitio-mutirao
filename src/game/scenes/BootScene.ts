import Phaser from 'phaser';
import { BUILDINGS, CROPS } from '../../data/catalog.ts';
import { nodeArts } from '../art/world.ts';
import { drawIsoGround, isoBuildingArt, isoConstructionArt, isoLotArt, isoSoilArt, isoCropArt, type IsoArt } from '../art/isoWorld.ts';
import { buildSheet, lookKey, FW, FH, type Look } from '../art/characters.ts';
import { iconCanvas } from '../art/icons.ts';
import { canvas, ellipse } from '../art/draw.ts';
import { bus } from '../bus.ts';
import { shared } from '../shared.ts';

export const NODE_ORIGIN: Record<string, [number, number]> = {};
/** Origem (0..1) e âncoras (px de tela 1x relativos à origem) de cada textura isométrica. */
export const ISO_META: Record<string, { ox: number; oy: number; anchors: Record<string, [number, number]> }> = {};
/** Canvas do terreno, guardado para o minimapa. */
export let groundCanvas: HTMLCanvasElement | null = null;

const addImg = (scene: Phaser.Scene, key: string, c: HTMLCanvasElement) => {
  if (!scene.textures.exists(key)) scene.textures.addImage(key, c as unknown as HTMLImageElement);
};
const addIso = (scene: Phaser.Scene, key: string, a: IsoArt) => {
  addImg(scene, key, a.c);
  ISO_META[key] = { ox: a.ox / a.c.width, oy: a.oy / a.c.height, anchors: a.anchors };
};

/** Gera todas as texturas procedurais uma única vez (sem downloads de imagem). */
export class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }

  create() {
    const steps: (() => void)[] = [
      () => { groundCanvas = drawIsoGround(); shared.ground = groundCanvas; addImg(this, 'ground', groundCanvas); },
      () => { for (const [k, a] of Object.entries(nodeArts())) { addImg(this, `n_${k}`, a.c); NODE_ORIGIN[k] = [a.ox, a.oy]; } },
      () => {
        const sizes = new Set<string>();
        for (const b of BUILDINGS) { addIso(this, `b_${b.id}`, isoBuildingArt(b)); sizes.add(`${b.spot.w}x${b.spot.h}`); }
        for (const s of sizes) {
          const [w, h] = s.split('x').map(Number);
          addIso(this, `con_${s}`, isoConstructionArt(w, h));
          addIso(this, `lot_${s}`, isoLotArt(w, h));
        }
        // pás do moinho
        const { c: bl, ctx: bx } = canvas(200, 200);
        bx.translate(100, 100); bx.lineJoin = 'round';
        for (let i = 0; i < 4; i++) {
          bx.save(); bx.rotate((i * Math.PI) / 2);
          bx.fillStyle = '#8d5a33'; bx.strokeStyle = '#3a2a1f'; bx.lineWidth = 2.5;
          bx.beginPath(); bx.roundRect(-5, -96, 10, 92, 3); bx.fill(); bx.stroke();
          bx.fillStyle = '#f7f8f4'; bx.beginPath(); bx.roundRect(4, -92, 26, 72, 3); bx.fill(); bx.stroke();
          bx.strokeStyle = '#c9b28a'; bx.lineWidth = 1.5; for (let k = 1; k < 4; k++) { bx.beginPath(); bx.moveTo(4, -92 + k * 18); bx.lineTo(30, -92 + k * 18); bx.stroke(); }
          bx.restore();
        }
        ellipse(bx, 0, 0, 12, 12); bx.fillStyle = '#6b3f22'; bx.fill(); bx.strokeStyle = '#3a2a1f'; bx.lineWidth = 2.5; bx.stroke();
        addImg(this, 'blades', bl);
      },
      () => {
        addIso(this, 'soil', isoSoilArt(false));
        addIso(this, 'soil_locked', isoSoilArt(true));
        for (const c of CROPS) for (let s = 0; s < 3; s++) addIso(this, `crop_${c.id}_${s}`, isoCropArt(c.id, s));
      },
      () => {
        const { c: dot, ctx } = canvas(16, 16); ellipse(ctx, 8, 8, 7, 7); ctx.fillStyle = '#fff'; ctx.fill(); addImg(this, 'dot', dot);
        const { c: ring, ctx: r } = canvas(64, 32); ellipse(r, 32, 16, 28, 12); r.lineWidth = 4; r.strokeStyle = '#f2b632'; r.stroke(); addImg(this, 'marker', ring);
        const { c: puff, ctx: p } = canvas(32, 32); ellipse(p, 16, 16, 14, 12); p.fillStyle = 'rgba(240,240,240,.9)'; p.fill(); addImg(this, 'puff', puff);
        const { c: leaf, ctx: l } = canvas(16, 10); ellipse(l, 8, 5, 7, 3.5, 0.3); l.fillStyle = '#7cb342'; l.fill(); addImg(this, 'leaf', leaf);
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
  if (!scene.textures.exists(key)) addImg(scene, key, iconCanvas(id, 48));
  return key;
}

/** Spritesheet + animações para uma aparência (cacheadas por combinação). */
export function ensureCharacter(scene: Phaser.Scene, look: Look) {
  const key = `ch_${lookKey(look)}`;
  if (scene.textures.exists(key)) return key;
  scene.textures.addSpriteSheet(key, buildSheet(look) as unknown as HTMLImageElement, { frameWidth: FW, frameHeight: FH });
  const dirs = ['down', 'left', 'right', 'up'];
  dirs.forEach((d, row) => {
    const f = (a: number, b: number) => scene.anims.generateFrameNumbers(key, { start: row * 12 + a, end: row * 12 + b });
    scene.anims.create({ key: `${key}_idle_${d}`, frames: f(0, 1), frameRate: 2, repeat: -1 });
    scene.anims.create({ key: `${key}_walk_${d}`, frames: f(2, 5), frameRate: 9, repeat: -1 });
    scene.anims.create({ key: `${key}_work_${d}`, frames: f(6, 7), frameRate: 6, repeat: -1 });
    scene.anims.create({ key: `${key}_carry_${d}`, frames: f(8, 11), frameRate: 8, repeat: -1 });
  });
  return key;
}
