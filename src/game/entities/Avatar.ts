import Phaser from 'phaser';
import { ensureCharacter } from '../scenes/BootScene.ts';
import { normalizeLook, type Look } from '../art/characters.ts';

export type Anim = 'idle' | 'walk' | 'work' | 'carry';
export const DIRS = ['down', 'left', 'right', 'up'] as const;

/** Personagem visível no mundo (local ou remoto). */
export class Avatar {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  dir = 0;
  anim: Anim = 'idle';
  /** alvo de interpolação (remotos) */
  tx: number; ty: number;
  lastSeen = 0;
  private texKey: string;

  constructor(private scene: Phaser.Scene, x: number, y: number, name: string, look: unknown, me: boolean) {
    this.texKey = ensureCharacter(scene, normalizeLook(look));
    this.sprite = scene.add.sprite(x, y, this.texKey, 0).setOrigin(0.5, 0.94).setScale(0.5);
    this.label = scene.add.text(x, y - 52, name, {
      fontFamily: 'Atkinson Hyperlegible, sans-serif', fontSize: '12px', fontStyle: 'bold',
      color: me ? '#1d3b72' : '#ffffff', backgroundColor: me ? '#f2b632' : '#1d3b72',
      padding: { x: 6, y: 2 },
    }).setOrigin(0.5, 1).setResolution(2).setDepth(80000);
    this.tx = x; this.ty = y;
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

  setPos(x: number, y: number) {
    this.sprite.setPosition(x, y);
    this.sprite.setDepth(y);
    this.label.setPosition(x, y - 50);
  }

  destroy() { this.sprite.destroy(); this.label.destroy(); }
}

export const dirFrom = (dx: number, dy: number, cur: number) =>
  Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01 ? cur : Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : (dy < 0 ? 3 : 0);
