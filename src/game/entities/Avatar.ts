import Phaser from 'phaser';
import { ensureCharacter } from '../scenes/BootScene.ts';
import { normalizeLook, type Look } from '../art/characters.ts';
import { isoL, isoDelta } from '../iso.ts';

export type Anim = 'idle' | 'walk' | 'work' | 'carry';
export const DIRS = ['down', 'left', 'right', 'up'] as const;

/** Personagem no mundo. Posição em px lógicos (grade de 32); exibição projetada. */
export class Avatar {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  dir = 0;
  anim: Anim = 'idle';
  lx = 0; ly = 0;
  /** alvo de interpolação (remotos), px lógicos */
  tx: number; ty: number;
  lastSeen = 0;
  private texKey: string;

  constructor(private scene: Phaser.Scene, lx: number, ly: number, name: string, look: unknown, me: boolean) {
    this.texKey = ensureCharacter(scene, normalizeLook(look));
    this.sprite = scene.add.sprite(0, 0, this.texKey, 0).setOrigin(0.5, 0.93).setScale(0.6);
    this.label = scene.add.text(0, 0, name, {
      fontFamily: 'Atkinson Hyperlegible, sans-serif', fontSize: '12px', fontStyle: 'bold',
      color: me ? '#1d3b72' : '#ffffff', backgroundColor: me ? '#f2b632' : '#1d3b72',
      padding: { x: 6, y: 2 },
    }).setOrigin(0.5, 1).setResolution(2).setDepth(80000);
    this.tx = lx; this.ty = ly;
    this.setPos(lx, ly);
    this.play('idle', 0);
  }

  /** Posição na tela (para câmera, efeitos e seleção). */
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
    const p = isoL(lx, ly);
    this.sprite.setPosition(p.x, p.y).setDepth(p.y + 2);
    this.label.setPosition(p.x, p.y - 60);
  }

  destroy() { this.sprite.destroy(); this.label.destroy(); }
}

/** Direção do sprite a partir de um deslocamento lógico (convertido para a tela). */
export function dirFrom(dx: number, dy: number, cur: number) {
  const s = isoDelta(dx, dy);
  if (Math.abs(s.x) < 0.01 && Math.abs(s.y) < 0.01) return cur;
  return Math.abs(s.x) > Math.abs(s.y) * 1.6 ? (s.x < 0 ? 1 : 2) : (s.y < 0 ? 3 : 0);
}
