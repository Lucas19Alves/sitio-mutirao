// Adereços 3D da progressão: obstáculos físicos que fecham as regiões, pets que seguem o
// jogador e placas dos campos. Tudo modelado proceduralmente com o mesmo Kit dos prédios.
import * as THREE from 'three';
import { Kit, rng, tint } from './geo.ts';
import type { ObstacleKind } from '../../../data/catalog.ts';

const WOOD = '#a8713f', WOOD_D = '#7a4b2a', WOOD_L = '#c9935a', RUST = '#a4532d', STONE = '#9aa0a6';

/** Modelo de um obstáculo, centrado na origem, ocupando ~3 tiles de largura. */
export function obstacleModel(kind: ObstacleKind, seed = 1): THREE.BufferGeometry {
  const k = new Kit();
  const r = rng(seed * 31 + kind.length);
  switch (kind) {
    case 'fallen_tree': {
      k.cyl(0.36, 0.42, 3.4, '#8a5a34', { p: [0, 0.36, 0], r: [0, 0, Math.PI / 2 - 0.05], jitter: 0.12, flat: true }, 12);
      for (const x of [-1.72, 1.72]) k.cyl(0.33, 0.33, 0.04, '#e3c08a', { p: [x, 0.36, 0], r: [0, 0, Math.PI / 2] }, 12);
      for (const x of [-1.72]) k.torus(0.2, 0.02, '#b98a50', { p: [x - 0.02, 0.36, 0], r: [0, Math.PI / 2, 0] });
      for (let i = 0; i < 4; i++) k.cyl(0.05, 0.08, 0.7, '#7a4b2a', { p: [-1 + i * 0.7, 0.7, (i % 2 ? 0.25 : -0.25)], r: [i % 2 ? 0.7 : -0.7, 0, 0.3] }, 6);
      for (let i = 0; i < 7; i++) k.sphere(0.32 + r() * 0.18, ['#5da443', '#6fb043', '#4f8f3a'][i % 3], { p: [1.4 + r() * 0.9, 0.45 + r() * 0.6, (r() - 0.5) * 1.2], wind: 0.6, flat: true }, 7, 5);
      k.cyl(0.45, 0.55, 0.45, '#8a5a34', { p: [-2.2, 0.22, 0.5] }, 10); k.cyl(0.42, 0.42, 0.03, '#e3c08a', { p: [-2.2, 0.46, 0.5] }, 10);
      break;
    }
    case 'brush': {
      for (let i = 0; i < 14; i++) {
        const x = (r() - 0.5) * 3.2, z = (r() - 0.5) * 1.6, s = 0.32 + r() * 0.3;
        k.sphere(s, ['#3f7a34', '#4f8f3a', '#2f6a2c'][i % 3], { p: [x, s * 0.8, z], s: [1, 0.85, 1], wind: 0.8, flat: true }, 7, 5);
        for (let j = 0; j < 3; j++) k.cone(0.03, 0.18, '#d9cfa0', { p: [x + (r() - 0.5) * s, s * 0.8 + (r() - 0.2) * s, z + (r() - 0.5) * s], r: [r() * 3, r() * 3, r() * 3] }, 4);
        if (i % 3 === 0) k.sphere(0.05, '#7d3fa6', { p: [x + 0.1, s * 1.4, z + 0.1] }, 5, 4);
      }
      break;
    }
    case 'landslide': {
      for (let i = 0; i < 11; i++) { const x = (r() - 0.5) * 3, z = (r() - 0.5) * 1.4, s = 0.4 + r() * 0.35; k.sphere(s, ['#9a6a3c', '#8a5f36', '#a8784a'][i % 3], { p: [x, s * 0.35, z], s: [1.3, 0.6, 1], jitter: 0.1, flat: true }, 8, 5); }
      for (let i = 0; i < 7; i++) { const s = 0.15 + r() * 0.25; k.sphere(s, tint(STONE, (r() - 0.5) * 0.3), { p: [(r() - 0.5) * 3, 0.45 + r() * 0.3, (r() - 0.5) * 1.2], flat: true }, 6, 4); }
      for (let i = 0; i < 3; i++) k.cyl(0.03, 0.05, 0.9, '#6b4426', { p: [-1 + i, 0.6, 0.3], r: [0.9, i, 0.4] }, 5);
      k.cyl(0.05, 0.05, 1.1, WOOD_D, { p: [1.6, 0.55, 0.6], r: [0, 0, 0.2] }, 6); k.box(0.5, 0.35, 0.04, '#f6c445', { p: [1.6, 1.0, 0.65] }, 0.02);
      break;
    }
    case 'gate': {
      for (const s of [-1, 1]) {
        for (let i = 0; i < 5; i++) k.box(0.55, 0.36, 0.55, tint(STONE, (r() - 0.5) * 0.25), { p: [s * 1.45, 0.18 + i * 0.36, 0], jitter: 0.1 }, 0.05);
        k.box(0.65, 0.12, 0.65, '#868c92', { p: [s * 1.45, 1.86, 0] }, 0.03);
      }
      k.box(2.4, 0.07, 0.07, RUST, { p: [-0.05, 1.3, 0.05], r: [0, 0.18, 0] }, 0.02);
      k.box(2.4, 0.07, 0.07, RUST, { p: [-0.05, 0.3, 0.05], r: [0, 0.18, 0] }, 0.02);
      for (let i = 0; i < 9; i++) k.cyl(0.025, 0.025, 1.2, tint(RUST, (r() - 0.5) * 0.3), { p: [-1.1 + i * 0.27, 0.8, 0.05 + (i - 4) * -0.048] }, 5);
      for (let i = 0; i < 6; i++) k.torus(0.06, 0.018, '#7d7f80', { p: [-0.05 + i * 0.09, 0.8, 0.12], r: [0, i % 2 ? Math.PI / 2 : 0, 0] });
      k.box(0.16, 0.2, 0.08, '#c7a03a', { p: [0.5, 0.75, 0.14] }, 0.02);
      for (let i = 0; i < 6; i++) k.sphere(0.12, '#5da443', { p: [(r() - 0.5) * 3, 0.1, (r() - 0.5) * 0.8], wind: 1 }, 6, 4);
      break;
    }
    case 'car': {
      const body = '#6e8c96';
      k.box(2.4, 0.5, 1.1, tint(body, -0.05), { p: [0.1, 0.6, 0], r: [0, 0, 0.06], jitter: 0.06 }, 0.08);
      k.box(0.9, 0.6, 1.0, body, { p: [-0.75, 1.1, 0], r: [0, 0, 0.06] }, 0.1);
      k.box(0.05, 0.36, 0.84, '#bfe7f6', { p: [-0.3, 1.15, 0], r: [0, 0, 0.06] }, 0.01);
      k.box(1.3, 0.36, 1.05, '#8a6440', { p: [0.65, 1.0, 0], r: [0, 0, 0.06] }, 0.03);
      for (let i = 0; i < 4; i++) k.box(0.08, 0.38, 1.08, WOOD_D, { p: [0.05 + i * 0.4, 1.0, 0], r: [0, 0, 0.06] }, 0.01);
      for (const [x, z, flat] of [[-0.8, 0.55, 0], [-0.8, -0.55, 0], [0.9, 0.55, 1], [0.9, -0.55, 0]] as const) {
        k.cyl(0.27, 0.27, 0.2, '#2f2a26', { p: [x, flat ? 0.18 : 0.27, z], r: [Math.PI / 2, 0, 0], s: flat ? [1, 1, 0.6] : 1 }, 12);
        k.cyl(0.12, 0.12, 0.22, '#a7adb2', { p: [x, flat ? 0.18 : 0.27, z], r: [Math.PI / 2, 0, 0] }, 8);
      }
      for (let i = 0; i < 6; i++) k.sphere(0.1 + r() * 0.08, RUST, { p: [-1 + r() * 2.2, 0.62 + r() * 0.3, 0.56], s: [1, 1, 0.2] }, 6, 4);
      k.box(0.3, 0.12, 0.05, '#f6c445', { p: [-1.22, 0.62, 0.3] }, 0.02); k.box(0.3, 0.12, 0.05, '#f6c445', { p: [-1.22, 0.62, -0.3] }, 0.02);
      break;
    }
    case 'boat': {
      k.cyl(1.7, 1.7, 0.04, '#5fb4d8', { p: [0, 0.03, 0], s: [1, 1, 0.55] }, 20);
      k.box(2.2, 0.35, 0.95, WOOD, { p: [0, 0.3, 0], r: [0.12, 0.2, 0.05], jitter: 0.1 }, 0.12);
      k.box(2.0, 0.08, 0.8, WOOD_D, { p: [0, 0.5, 0], r: [0.12, 0.2, 0.05] }, 0.02);
      k.cone(0.48, 0.6, WOOD, { p: [1.35, 0.32, 0.27], r: [0, 0.2, -Math.PI / 2], s: [1, 1, 0.7] }, 8);
      for (let i = 0; i < 3; i++) k.box(0.1, 0.06, 0.82, WOOD_L, { p: [-0.6 + i * 0.6, 0.55, 0.12 * i], r: [0.12, 0.2, 0] }, 0.01);
      k.cyl(0.03, 0.03, 1.6, WOOD_D, { p: [-0.3, 0.7, -0.6], r: [0.3, 0, 1.2] }, 6); k.box(0.1, 0.03, 0.35, WOOD_D, { p: [-1.0, 0.45, -0.75], r: [0.3, 0, 1.2] }, 0.01);
      for (let i = 0; i < 10; i++) k.cyl(0.015, 0.015, 0.6 + r() * 0.5, '#7fae4a', { p: [(r() - 0.5) * 3, 0.3, (r() > 0.5 ? 1 : -1) * (0.7 + r() * 0.3)], wind: 1 }, 4);
      break;
    }
    case 'bridge': {
      for (let i = 0; i < 6; i++) k.box(0.9, 0.06, 0.22, tint('#8d5a33', (r() - 0.5) * 0.3), { p: [(r() - 0.5) * 1.8, 0.05, (r() - 0.5) * 2], r: [r() - 0.5, r() * 3, r() - 0.5] }, 0.02);
      k.box(0.6, 0.5, 0.05, '#f6c445', { p: [0, 0.75, 0.9] }, 0.02); k.cyl(0.04, 0.04, 0.9, WOOD_D, { p: [0, 0.45, 0.88] }, 6);
      break;
    }
  }
  return k.build();
}

/** Andaime e materiais empilhados: aparece quando a obra do obstáculo começou. */
export function obstacleSite(): THREE.BufferGeometry {
  const k = new Kit();
  for (let i = 0; i < 3; i++) k.box(0.7, 0.08, 0.2, WOOD_L, { p: [1.9, 0.05 + i * 0.09, 0.9 + (i % 2) * 0.05] }, 0.01);
  k.box(0.35, 0.3, 0.35, WOOD, { p: [-1.9, 0.15, 0.9] }, 0.03);
  k.cyl(0.03, 0.03, 0.9, WOOD_D, { p: [2.3, 0.45, 0.5], r: [0, 0, 0.3] }, 5); k.box(0.24, 0.1, 0.06, '#a7adb2', { p: [2.42, 0.88, 0.5] }, 0.02);
  for (const s of [-1, 1]) { k.cone(0.12, 0.35, '#f28a24', { p: [s * 2.2, 0.18, 1.1] }, 8); k.cyl(0.13, 0.13, 0.04, '#f6f1e4', { p: [s * 2.2, 0.22, 1.1] }, 8); }
  return k.build();
}

/** Pets: corpo arredondado simples por espécie, com cores do catálogo. */
export function petModel(id: string, c1: string, c2: string): THREE.BufferGeometry {
  const k = new Kit();
  // espécies novas reaproveitam corpos parecidos e ganham detalhes próprios
  const species = id === 'goat' || id === 'capybara' ? 'dog' : id === 'parrot' ? 'duck' : id;
  const eye = (x: number, y: number, z: number) => { for (const s of [-1, 1]) { k.sphere(0.03, '#2b1d14', { p: [x + s * 0.06, y, z] }, 6, 5); k.sphere(0.01, '#ffffff', { p: [x + s * 0.06 + 0.01, y + 0.01, z + 0.025] }, 4, 3); } };
  switch (species) {
    case 'dog': case 'cat': case 'fox': {
      const cat = species === 'cat', fox = species === 'fox';
      k.capsule(0.13, 0.22, c1, { p: [0, 0.22, 0], r: [Math.PI / 2, 0, 0] });
      k.sphere(0.14, c1, { p: [0, 0.38, 0.2] }, 10, 8);
      k.sphere(0.08, c2, { p: [0, 0.34, 0.31], s: [1, 0.8, 1] }, 8, 6);
      k.sphere(0.03, '#2b1d14', { p: [0, 0.36, 0.38] }, 6, 5);
      eye(0, 0.42, 0.31);
      for (const s of [-1, 1]) {
        if (cat || fox) k.cone(0.055, 0.12, fox ? '#e07a35' : c1, { p: [s * 0.08, 0.52, 0.19], r: [0, 0, s * -0.25] }, 4);
        else k.sphere(0.06, tint(c1, -0.25), { p: [s * 0.13, 0.4, 0.18], s: [0.5, 1.2, 0.8] }, 6, 5);
        for (const dz of [-0.12, 0.12]) k.cyl(0.04, 0.035, 0.14, c1, { p: [s * 0.07, 0.07, dz] }, 6);
      }
      k.capsule(fox ? 0.07 : 0.035, fox ? 0.18 : 0.16, fox ? c1 : tint(c1, -0.1), { p: [0, 0.3, -0.25], r: [-0.8, 0, 0] });
      if (fox) k.sphere(0.06, c2, { p: [0, 0.38, -0.37] }, 6, 5);
      if (!cat && !fox) k.torus(0.1, 0.02, '#e2574c', { p: [0, 0.3, 0.16], r: [Math.PI / 2 - 0.3, 0, 0] });
      break;
    }
    case 'rabbit': {
      k.sphere(0.16, c1, { p: [0, 0.18, 0], s: [1, 0.95, 1.15] }, 10, 8);
      k.sphere(0.12, c1, { p: [0, 0.33, 0.13] }, 10, 8);
      for (const s of [-1, 1]) { k.capsule(0.035, 0.16, c1, { p: [s * 0.05, 0.53, 0.1], r: [-0.2, 0, s * -0.15] }); k.capsule(0.018, 0.12, c2, { p: [s * 0.05, 0.53, 0.125], r: [-0.2, 0, s * -0.15] }); }
      k.sphere(0.06, '#ffffff', { p: [0, 0.2, -0.18] }, 6, 5);
      k.sphere(0.02, c2, { p: [0, 0.33, 0.25] }, 5, 4);
      eye(0, 0.37, 0.22);
      break;
    }
    case 'duck': case 'hen': {
      const hen = species === 'hen';
      k.sphere(0.16, c1, { p: [0, 0.2, 0], s: [1, 0.9, 1.2] }, 10, 8);
      k.sphere(0.1, c1, { p: [0, 0.38, 0.12] }, 10, 8);
      k.cone(0.045, 0.1, '#f2a62c', { p: [0, 0.37, 0.24], r: [Math.PI / 2, 0, 0] }, 6);
      if (hen) { for (let i = 0; i < 3; i++) k.sphere(0.03, '#e2394f', { p: [0, 0.48 + (i === 1 ? 0.02 : 0), 0.08 + i * 0.04] }, 5, 4); k.sphere(0.025, '#e2394f', { p: [0, 0.31, 0.21] }, 5, 4); for (let i = 0; i < 6; i++) k.sphere(0.03, c2, { p: [(i % 2 ? 0.1 : -0.1), 0.18 + (i % 3) * 0.06, -0.05 + i * 0.03] }, 4, 3); }
      for (const s of [-1, 1]) { k.sphere(0.08, tint(c1, -0.08), { p: [s * 0.14, 0.22, -0.02], s: [0.4, 0.8, 1.2] }, 6, 5); k.cyl(0.015, 0.015, 0.1, '#f2a62c', { p: [s * 0.06, 0.05, 0] }, 4); k.box(0.07, 0.015, 0.08, '#f2a62c', { p: [s * 0.06, 0.008, 0.03] }, 0.005); }
      k.cone(0.07, 0.12, tint(c1, -0.1), { p: [0, 0.27, -0.2], r: [-1.2, 0, 0] }, 5);
      eye(0, 0.42, 0.2);
      break;
    }
    case 'owl': {
      k.sphere(0.17, c1, { p: [0, 0.22, 0], s: [1, 1.15, 0.95] }, 10, 8);
      k.sphere(0.12, c2, { p: [0, 0.2, 0.08], s: [1, 1.1, 0.6] }, 8, 6);
      for (const s of [-1, 1]) { k.sphere(0.06, '#fff7d6', { p: [s * 0.07, 0.34, 0.12] }, 8, 6); k.sphere(0.035, '#2b1d14', { p: [s * 0.07, 0.34, 0.16] }, 6, 5); k.cone(0.035, 0.09, c1, { p: [s * 0.1, 0.46, 0.02], r: [0, 0, s * -0.3] }, 4); k.sphere(0.09, tint(c1, -0.15), { p: [s * 0.15, 0.2, -0.02], s: [0.4, 1, 1] }, 6, 5); }
      k.cone(0.025, 0.06, '#f2a62c', { p: [0, 0.29, 0.17], r: [Math.PI, 0, 0] }, 4);
      break;
    }
  }
  if (id === 'goat') { for (const sd of [-1, 1]) k.cone(0.025, 0.14, '#d7ccc8', { p: [sd * 0.06, 0.55, 0.16], r: [-0.5, 0, sd * 0.3] }, 5); k.cone(0.03, 0.08, c2, { p: [0, 0.27, 0.33], r: [Math.PI, 0, 0] }, 5); }
  if (id === 'capybara') k.box(0.16, 0.1, 0.1, tint(c1, -0.15), { p: [0, 0.36, 0.32] }, 0.04);
  if (id === 'parrot') { k.cone(0.07, 0.25, '#e53935', { p: [0, 0.25, -0.27], r: [-1.2, 0, 0] }, 5); k.sphere(0.06, c2, { p: [0, 0.45, 0.12] }, 6, 5); }
  return k.build();
}

/** Placa de madeira de um campo (o texto é uma textura à parte). */
export function signPosts(): THREE.BufferGeometry {
  const k = new Kit();
  for (const s of [-0.55, 0.55]) k.box(0.09, 1.0, 0.09, WOOD_D, { p: [s, 0.5, 0] }, 0.02);
  k.box(1.36, 0.62, 0.05, WOOD_L, { p: [0, 0.92, -0.03] }, 0.02);
  return k.build();
}
