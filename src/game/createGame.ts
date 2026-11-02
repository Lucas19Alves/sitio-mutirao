import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.ts';
import { WorldScene, type WorldInit } from './scenes/WorldScene.ts';

export function createGame(parent: HTMLElement, me: WorldInit['me']) {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#3f6e35',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    render: { antialias: true, roundPixels: false, powerPreference: 'low-power' },
    fps: { target: 60, smoothStep: true },
    input: { activePointers: 2 },
    disableContextMenu: true,
    audio: { noAudio: true },
    scene: [BootScene, WorldScene],
    callbacks: { preBoot: (g) => g.registry.set('me', me) },
  });
  return game;
}
