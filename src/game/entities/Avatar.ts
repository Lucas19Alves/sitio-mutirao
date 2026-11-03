import Phaser from 'phaser';
import { ensureCharacter } from '../scenes/BootScene.ts';
import { normalizeLook, FOOT, type Look } from '../art/characters.ts';

export type Anim = 'idle' | 'walk' | 'work' | 'crouch' | 'cheer' | 'carry';
export const DIRS = ['down', 'left', 'right', 'up'] as const;

/** Personagem no mundo. Posição em px de mundo (grade de 32), câmera top-down: lógico = tela. */
export class Avatar {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  dir = 0;
  anim: Anim = 'idle';
  lx = 0; ly = 0;
  /** alvo de interpolação (remotos) */
  tx: number; ty: number;
  lastSeen = 0;
  private texKey: string;

  constructor(private scene: Phaser.Scene, lx: number, ly: number, name: string, look: unknown, me: boolean) {
    this.texKey = ensureCharacter(scene, normalizeLook(look));
    this.sprite = scene.add.sprite(0, 0, this.texKey, 0).setOrigin(0.5, FOOT).setScale(0.5);
    this.label = scene.add.text(0, 0, name, {
      fontFamily: 'Atkinson Hyperlegible, sans-serif', fontSize: '11px', fontStyle: 'bold',
      color: me ? '#3b2c22' : '#fffdf6', backgroundColor: me ? '#fffdf6' : '#3f8a4a',
      padding: { x: 5, y: 1 },
    }).setOrigin(0.5, 1).setResolution(3).setDepth(80000).setAlpha(me ? 0.92 : 1);
    this.tx = lx; this.ty = ly;
    this.setPos(lx, ly);
    this.play('idle', 0);
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  setLook(look: unknown) {
    const key = ensureCharacter(this.scene, normalizeLook(look as Look));
    if (key === this.texKey) return;
    this.texKey = key;
    this.sprite.setTexture(key, 0);
    this.play(this.anim, this.dir, true);
  }

  play(anim: Anim, dir: number, force = false) {
    if (!force && anim === this.anim && dir === this.dir && this.sprite.anims.isPlaying) return;
    this.anim = anim; this.dir = dir;
    this.sprite.play(`${this.texKey}_${anim}_${DIRS[dir]}`, true);
  }

  setPos(lx: number, ly: number) {
    this.lx = lx; this.ly = ly;
    this.sprite.setPosition(lx, ly).setDepth(ly);
    this.label.setPosition(lx, ly - 54);
  }

  destroy() { this.sprite.destroy(); this.label.destroy(); }
}

/** Direção do sprite a partir de um deslocamento (0 baixo, 1 esquerda, 2 direita, 3 cima). */
export function dirFrom(dx: number, dy: number, cur: number) {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return cur;
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : (dy < 0 ? 3 : 0);
}
