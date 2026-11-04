// Miniaturas para a interface renderizadas a partir dos MESMOS modelos 3D do jogo (prédios,
// rostos dos jogadores e moradores, cena da tela de entrada) e a prévia animada do editor.
import * as THREE from 'three';
import { BUILDING_BY_ID } from '../../data/catalog.ts';
import { buildingModel } from './kit/buildings.ts';
import { Character3D } from './kit/character.ts';
import { matVC, matGlass } from './kit/materials.ts';
import { oak, pine, bush, wildflowers } from './kit/nature.ts';
import { soilGeometry, cropGeometry } from './kit/crops.ts';
import { Kit } from './kit/geo.ts';

let R: THREE.WebGLRenderer | null = null;
function renderer() {
  if (!R) {
    R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    R.outputColorSpace = THREE.SRGBColorSpace;
    R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.15;
    R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  return R;
}
function stage(bg?: string) {
  const s = new THREE.Scene();
  if (bg) s.background = new THREE.Color(bg);
  s.add(new THREE.HemisphereLight('#e8f6ff', '#7a9a50', 1.5));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.3); sun.position.set(-6, 10, 8); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); const c = sun.shadow.camera; c.left = c.bottom = -8; c.right = c.top = 8;
  s.add(sun);
  return s;
}
function shoot(scene: THREE.Scene, cam: THREE.Camera, w: number, h: number) {
  const r = renderer();
  r.setPixelRatio(1); r.setSize(w, h, false);
  r.render(scene, cam);
  return r.domElement.toDataURL('image/png');
}
function frame(obj: THREE.Object3D, cam: THREE.PerspectiveCamera, dir: THREE.Vector3, fill = 1) {
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const r = size.length() / 2;
  const d = (r / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2))) / fill;
  cam.position.copy(c).addScaledVector(dir.normalize(), d);
  cam.lookAt(c);
  cam.near = 0.1; cam.far = d * 4; cam.updateProjectionMatrix();
}

export function buildingThumb(id: string, size: number) {
  const def = BUILDING_BY_ID[id]; if (!def) return '';
  const m = buildingModel(def);
  const s = stage();
  const g = new THREE.Group();
  const o = new THREE.Mesh(m.opaque, matVC); o.castShadow = o.receiveShadow = true; g.add(o);
  if (m.glass) g.add(new THREE.Mesh(m.glass, matGlass));
  if (m.blades) { const b = new THREE.Mesh(m.blades.geo, matVC); b.position.set(...m.blades.pivot); b.rotation.z = 0.4; g.add(b); }
  s.add(g);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  frame(g, cam, new THREE.Vector3(0.45, 0.75, 1), 1.12);
  return shoot(s, cam, size, size);
}

export function faceThumb(look: unknown, size: number, bg?: string) {
  const ch = new Character3D(look);
  ch.play('idle', 0); ch.update(0.6);
  ch.root.updateMatrixWorld(true);
  const s = stage(bg); s.add(ch.root);
  const head = new THREE.Vector3(); ch.bones[5].getWorldPosition(head); head.y += 0.18;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(head.x + 0.1, head.y + 0.12, head.z + 1.55); cam.lookAt(head.x, head.y - 0.04, head.z);
  return shoot(s, cam, size, size);
}

/** Cena da tela de entrada: casa, moinho, poço, canteiros, árvores e dois moradores. */
export function diorama(w: number, h: number) {
  const s = stage();
  s.background = null;
  const ground = new Kit();
  ground.box(13, 0.4, 8.4, '#7fc14f', { p: [6.5, -0.2, 4.2], jitter: 0.08 }, 0.15);
  ground.box(13, 0.42, 1, '#d7b07a', { p: [6.5, -0.19, 5.4], jitter: 0.1 }, 0.05);
  ground.box(1, 0.42, 3, '#d7b07a', { p: [6.5, -0.19, 7.2], jitter: 0.1 }, 0.05);
  ground.box(13.1, 0.8, 8.5, '#8a5a35', { p: [6.5, -0.65, 4.2], jitter: 0.1 }, 0.15);
  const gm = new THREE.Mesh(ground.build(), matVC); gm.receiveShadow = true; s.add(gm);
  const put = (geo: THREE.BufferGeometry, x: number, z: number, sc = 1, mat: THREE.Material = matVC) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, 0, z); m.scale.setScalar(sc); m.castShadow = m.receiveShadow = true; s.add(m); return m; };
  for (const [id, x, z] of [['farmhouse', 0.5, 0.6], ['mill', 9, 1.4], ['well', 6.8, 2.6]] as const) {
    const m = buildingModel(BUILDING_BY_ID[id]);
    put(m.opaque, x, z); if (m.glass) put(m.glass, x, z, 1, matGlass);
    if (m.blades) { const b = put(m.blades.geo, 0, 0); b.position.set(x + m.blades.pivot[0], m.blades.pivot[1], z + m.blades.pivot[2]); b.rotation.z = 0.5; }
  }
  for (const [x, crop, st] of [[0.6, 'wheat', 5], [2.8, 'carrot', 4], [8.6, 'sunflower', 5]] as const) { put(soilGeometry(false), x, 6.1); put(cropGeometry(crop, st), x, 6.1); }
  put(oak(5, '#6fb04c', '#e53935'), 12.2, 4.3); put(oak(12, '#58a040'), 0.2, 4.6, 0.9); put(pine(4), 12.3, 7.6, 0.8); put(bush(), 5.3, 4.4, 0.8); put(wildflowers(true), 4.6, 4.4); put(wildflowers(true), 10.7, 7.5);
  const looks = [
    { skin: 1, hair: 2, hairColor: 3, shirt: 2, shirtColor: 0, pants: 0, hat: 1, hatColor: 0, acc: 0 },
    { skin: 4, hair: 5, hairColor: 0, shirt: 1, shirtColor: 2, pants: 3, hat: 0, hatColor: 3, acc: 4 },
  ];
  looks.forEach((l, i) => { const c = new Character3D(l); c.play(i ? 'interact' : 'idle', 0); c.update(i ? 0.3 : 0.8); c.root.position.set(5.6 + i * 1.2, 0, 5.6); c.root.rotation.y = i ? -0.7 : 0.7; s.add(c.root); });
  const cam = new THREE.PerspectiveCamera(32, w / h, 0.1, 100);
  cam.position.set(6.5, 10.5, 14.5); cam.lookAt(6.5, 0.6, 4.2);
  return shoot(s, cam, w, h);
}

/** Prévia animada do personagem (editor de aparência). */
export function mountPreview(canvas: HTMLCanvasElement) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15;
  r.shadowMap.enabled = true;
  r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const s = stage();
  const disc = new Kit(); disc.cyl(1.0, 1.05, 0.16, '#8cc152', { p: [0, -0.08, 0], jitter: 0.08 }, 28); disc.cyl(1.06, 1.1, 0.12, '#8d5a33', { p: [0, -0.2, 0] }, 28);
  const dm = new THREE.Mesh(disc.build(), matVC); dm.receiveShadow = true; s.add(dm);
  let ch: Character3D | null = null;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(0, 1.5, 4.2); cam.lookAt(0, 0.75, 0);
  let pose: string | null = null, raf = 0, last = performance.now(), t0 = last;
  const seq: [string, number][] = [['idle', 2.4], ['walk', 2.4], ['chop', 1.6], ['harvest', 1.8], ['celebrate', 1.8]];
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!ch) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * r.getPixelRatio())) { r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
    let name = pose;
    if (!name) { let k = ((now - t0) / 1000) % seq.reduce((a, b) => a + b[1], 0), i = 0; while (k > seq[i][1]) { k -= seq[i][1]; i++; } name = seq[i][0]; }
    ch.play(name, 0.25); ch.setTool(name === 'chop' ? 'axe' : name === 'harvest' ? 'sickle' : null);
    ch.root.rotation.y = pose ? ch.root.rotation.y : Math.sin(now / 1800) * 0.6;
    ch.update(dt);
    r.render(s, cam);
  };
  raf = requestAnimationFrame(loop);
  return {
    setLook(look: unknown) { if (!ch) { ch = new Character3D(look); s.add(ch.root); } else ch.setLook(look); },
    setPose(p: string | null, ry = 0) { pose = p; if (ch) ch.root.rotation.y = ry; },
    dispose() { cancelAnimationFrame(raf); r.dispose(); },
  };
}
