import Phaser from 'phaser';
import { BUILDINGS, CROPS } from '../../data/catalog.ts';
import { drawGround, nodeArts, buildingArt, constructionArt, lotArt, soilArt, cropArt } from '../art/world.ts';
import { buildSheet, lookKey, FW, FH, type Look } from '../art/characters.ts';
import { iconCanvas } from '../art/icons.ts';
import { canvas, ellipse } from '../art/draw.ts';
import { bus } from '../bus.ts';

export const NODE_ORIGIN: Record<string, [number, number]> = {};

const addImg = (scene: Phaser.Scene, key: string, c: HTMLCanvasElement) => {
  if (!scene.textures.exists(key)) scene.textures.addImage(key, c as unknown as HTMLImageElement);
};

/** Gera todas as texturas procedurais uma única vez (sem downloads de imagem). */
export class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }

  create() {
    const steps: (() => void)[] = [
      () => addImg(this, 'ground', drawGround()),
      () => { for (const [k, a] of Object.entries(nodeArts())) { addImg(this, `n_${k}`, a.c); NODE_ORIGIN[k] = [a.ox, a.oy]; } },
      () => {
        const sizes = new Set<string>();
        for (const b of BUILDINGS) {
          const art = buildingArt(b);
          addImg(this, `b_${b.id}`, art.main);
          if (art.blades) addImg(this, `b_${b.id}_blades`, art.blades);
          sizes.add(`${b.spot.w}x${b.spot.h}`);
        }
        for (const s of sizes) {
          const [w, h] = s.split('x').map(Number);
          addImg(this, `con_${s}`, constructionArt(w, h));
          addImg(this, `lot_${s}`, lotArt(w, h));
        }
      },
      () => {
        addImg(this, 'soil', soilArt(false));
        addImg(this, 'soil_locked', soilArt(true));
        for (const c of CROPS) for (let s = 0; s < 3; s++) addImg(this, `crop_${c.id}_${s}`, cropArt(c.id, s));
      },
      () => {
        const { c: dot, ctx } = canvas(16, 16); ellipse(ctx, 8, 8, 7, 7); ctx.fillStyle = '#fff'; ctx.fill(); addImg(this, 'dot', dot);
        const { c: ring, ctx: r } = canvas(64, 32); ellipse(r, 32, 16, 28, 12); r.lineWidth = 4; r.strokeStyle = '#f2b632'; r.stroke(); addImg(this, 'marker', ring);
        const { c: puff, ctx: p } = canvas(32, 32); ellipse(p, 16, 16, 14, 12); p.fillStyle = 'rgba(240,240,240,.9)'; p.fill(); addImg(this, 'puff', puff);
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
