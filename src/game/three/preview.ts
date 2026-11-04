// Vitrine de desenvolvimento dos modelos 3D (preview.html). Não entra no build de produção.
import * as THREE from 'three';
import { Engine } from './Engine.ts';
import { Character3D } from './kit/character.ts';
import { nodeGeometries, decorGeometries } from './kit/nature.ts';
import { matVC, matGlass } from './kit/materials.ts';
import { buildingModel, constructionModel, lotModel } from './kit/buildings.ts';
import { BUILDINGS, CROPS } from '../../data/catalog.ts';
import { soilGeometry, cropGeometry } from './kit/crops.ts';

const host = document.getElementById('app')!;
const eng = new Engine(host);
const params = new URLSearchParams(location.search);
const what = params.get('k') ?? 'chars';
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: '#7cbf4f', roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
eng.scene.add(ground);

const looks = [
  { skin: 1, hair: 0, hairColor: 1, shirt: 0, shirtColor: 0, pants: 0, hat: 1, hatColor: 3, acc: 0 },
  { skin: 4, hair: 5, hairColor: 0, shirt: 1, shirtColor: 2, pants: 3, hat: 0, hatColor: 3, acc: 4 },
  { skin: 0, hair: 2, hairColor: 3, shirt: 2, shirtColor: 7, pants: 0, hat: 2, hatColor: 1, acc: 1 },
  { skin: 2, hair: 3, hairColor: 5, shirt: 3, shirtColor: 8, pants: 4, hat: 4, hatColor: 0, acc: 2 },
  { skin: 5, hair: 1, hairColor: 6, shirt: 0, shirtColor: 6, pants: 2, hat: 5, hatColor: 0, acc: 3 },
  { skin: 3, hair: 4, hairColor: 0, shirt: 1, shirtColor: 5, pants: 5, hat: 3, hatColor: 4, acc: 0 },
];
const anims = (params.get('a') ?? 'idle,walk,chop,mine,harvest,celebrate').split(',');
const tools: Record<string, 'axe' | 'pickaxe' | 'shovel' | 'sickle' | 'hammer' | 'seeds' | null> = { chop: 'axe', mine: 'pickaxe', dig: 'shovel', harvest: 'sickle', build: 'hammer', plant: 'seeds' };
const chars: Character3D[] = [];
if (what === 'chars') {
  looks.slice(0, Number(params.get('n') ?? 6)).forEach((l, i) => anims.forEach((a, j) => {
    const c = new Character3D(l);
    c.root.position.set((j - (anims.length - 1) / 2) * 1.4, 0, (i - 2.5) * 1.5);
    c.root.rotation.y = Number(params.get('ry') ?? 0.35);
    c.play(a, 0); c.setTool(tools[a] ?? null);
    if (a === 'carry') c.setPile(0.8, ['#b9824e', '#a7adb2', '#8fcf4a']);
    eng.scene.add(c.root); chars.push(c);
  }));
}
if (what === 'nature') {
  const all: [string, THREE.BufferGeometry][] = [...Object.entries(nodeGeometries()).flatMap(([k, [a, b]]) => [[k, a], [k + '_off', b]] as [string, THREE.BufferGeometry][]), ...Object.entries(decorGeometries())];
  const cols = 9;
  all.forEach(([, g], i) => { const m = new THREE.Mesh(g, matVC); m.castShadow = true; m.receiveShadow = true; m.position.set((i % cols - (cols - 1) / 2) * 1.6, 0, (Math.floor(i / cols) - 3) * 1.8); eng.scene.add(m); });
}
if (what === 'bld') {
  const only = params.get('only');
  let x = -14, z = -6, rowH = 0;
  for (const b of BUILDINGS.filter((b) => !only || only.split(',').includes(b.id))) {
    const m = buildingModel(b);
    if (x + b.spot.w > 16) { x = -14; z += rowH + 1.5; rowH = 0; }
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const o = new THREE.Mesh(m.opaque, matVC); o.castShadow = o.receiveShadow = true; g.add(o);
    if (m.glass) g.add(new THREE.Mesh(m.glass, matGlass));
    if (m.blades) { const bl = new THREE.Mesh(m.blades.geo, matVC); bl.position.set(...m.blades.pivot); g.add(bl); }
    eng.scene.add(g); x += b.spot.w + 1.2; rowH = Math.max(rowH, b.spot.h);
  }
  if (!only) { for (const [i, gg] of [constructionModel(4, 3), lotModel(4, 3)].entries()) { const o = new THREE.Mesh(gg, matVC); o.castShadow = true; o.position.set(x + i * 5.2, 0, z); eng.scene.add(o); } }
}
if (what === 'crops') {
  CROPS.forEach((c, i) => { for (let s = 0; s <= 5; s++) { const g = new THREE.Group(); g.position.set((s - 3) * 2.3, 0, (i - 6.5) * 2.3);
    const soil = new THREE.Mesh(soilGeometry(false), matVC); soil.receiveShadow = true; g.add(soil);
    if (s > 0) { const m = new THREE.Mesh(cropGeometry(c.id, s), matVC); m.castShadow = true; g.add(m); }
    eng.scene.add(g); } });
}
const d = Number(params.get('d') ?? 12);
eng.camera.position.set(0, d * 0.85, d);
eng.camera.lookAt(0, 0.6, Number(params.get('cz') ?? 0)); eng.camera.position.z += Number(params.get('cz') ?? 0);
eng.add({ update: (dt) => chars.forEach((c) => c.update(dt)) });
eng.start();
(window as unknown as Record<string, unknown>).__preview = { eng, chars, THREE };
