// Campos especializados: cada um aceita só a(s) sua(s) cultura(s), tem lugar fixo no mapa,
// nível (mais canteiros, crescimento mais rápido, colheita maior) e requisitos para abrir.
// Um canteiro ocupa 2×2 tiles; o campo tem cols × rows canteiros.
import type { Cost } from './production.ts';

export interface FieldDef {
  id: string;            // entidade no servidor: `f:${id}`
  name: string;
  crops: string[];
  region: string;
  x: number; y: number; cols: number; rows: number;
  level: number;         // nível da fazenda para abrir
  needs?: string;        // prédio necessário
  obs?: string;          // obstáculo que precisa estar reparado (acesso)
  open: Cost;            // custo para abrir (nível 1)
  ups: Cost[];           // custo dos níveis 2 e 3
  color: string;         // cor da placa e da cerca
  soil: string;          // tom da terra (identidade visual)
}

export const FIELD_LEVELS = 3;
/** Canteiros liberados por nível (fração do total). */
export const fieldPlots = (f: FieldDef, lv: number) => Math.max(1, Math.ceil(f.cols * f.rows * [0.5, 0.75, 1][Math.max(0, Math.min(2, lv - 1))]));
/** Multiplicador de tempo de crescimento por nível. */
export const FIELD_SPEED = [1, 0.88, 0.76];
/** Bônus de rendimento por colheita, por nível. */
export const FIELD_YIELD = [0, 0, 1];

const f = (id: string, name: string, crops: string[], region: string, x: number, y: number, cols: number, rows: number, level: number, open: Cost, ups: Cost[], color: string, soil: string, extra: Partial<FieldDef> = {}): FieldDef =>
  ({ id, name, crops, region, x, y, cols, rows, level, open, ups, color, soil, ...extra });

export const FIELDS: FieldDef[] = [
  f('wheat', 'Campo de Trigo', ['wheat'], 'sitio', 24, 26, 2, 3, 1, {}, [{ coins: 120, items: { plank: 6 } }, { coins: 450, items: { beam: 4, rope: 6 } }], '#e9c34e', '#9a6a3c'),
  f('carrot', 'Horta de Raízes', ['carrot'], 'sitio', 28, 26, 2, 3, 2, { coins: 60, items: { wood: 10, fiber: 6 } }, [{ coins: 160, items: { plank: 6 } }, { coins: 520, items: { beam: 4, basket: 3 } }], '#f28a24', '#8d5f36'),
  f('corn', 'Milharal', ['corn'], 'sitio', 24, 32, 3, 2, 4, { coins: 140, items: { plank: 8, rope: 4 } }, [{ coins: 300, items: { plank: 10 } }, { coins: 800, items: { beam: 6, crate: 2 } }], '#f6cf3e', '#94683c'),
  f('tomato', 'Horta de Tomates', ['tomato'], 'pomar', 44, 26, 3, 2, 5, { coins: 180, items: { plank: 8, stone: 10 } }, [{ coins: 380, items: { plank: 12, rope: 6 } }, { coins: 950, items: { beam: 6, clay_pot: 4 } }], '#e3473e', '#7f5532', { needs: 'well' }),
  f('potato', 'Campo de Batatas', ['potato'], 'bosque', 4, 30, 4, 2, 6, { coins: 220, items: { plank: 10, stone: 8 } }, [{ coins: 450, items: { beam: 4 } }, { coins: 1100, items: { beam: 8, sack: 4 } }], '#d3a96c', '#7a5230'),
  f('cotton', 'Algodoal', ['cotton'], 'rio', 33, 41, 6, 1, 8, { coins: 320, items: { plank: 12, rope: 8 } }, [{ coins: 650, items: { beam: 6, thread: 4 } }, { coins: 1500, items: { cloth: 4, brick: 10 } }], '#fbfaf4', '#8a6440'),
  f('strawberry', 'Morangal', ['strawberry'], 'pomar', 50, 26, 3, 2, 11, { coins: 520, items: { plank: 14, basket: 4 } }, [{ coins: 1000, items: { beam: 8, glass: 4 } }, { coins: 2200, items: { brick: 16, jar: 6 } }], '#e5394f', '#7b4f30'),
  f('sunflower', 'Campo de Girassóis', ['sunflower'], 'colinas', 4, 4, 3, 2, 14, { coins: 800, items: { beam: 8, brick: 10 } }, [{ coins: 1500, items: { nails: 10, beam: 8 } }, { coins: 3000, items: { metal_parts: 2, glass: 8 } }], '#f9c932', '#8d6a3c'),
  f('grape', 'Vinhedo', ['grape'], 'pomar', 56, 26, 3, 2, 16, { coins: 1000, items: { beam: 10, nails: 12 } }, [{ coins: 2000, items: { metal_parts: 2, beam: 8 } }, { coins: 4000, items: { metal_parts: 4, jar: 10 } }], '#7d3fa6', '#7a5232'),
  f('flowers', 'Jardim de Flores', ['rose', 'tulip', 'lavender'], 'vale', 50, 11, 4, 2, 17, { coins: 1300, items: { brick: 16, clay_pot: 8 } }, [{ coins: 2600, items: { vase: 2, glass: 10 } }, { coins: 5000, items: { vase: 4, metal_parts: 3 } }], '#e2386a', '#8a5f3c'),
  f('oat', 'Campo de Aveia', ['oat'], 'pasto', 6, 66, 3, 2, 10, { coins: 400, items: { plank: 12, rope: 8 } }, [{ coins: 800, items: { beam: 6 } }, { coins: 1800, items: { beam: 10, sack: 4 } }], '#d9c38a', '#8d6a3c'),
  f('cassava', 'Roça de Mandioca', ['cassava'], 'pasto', 14, 66, 3, 2, 11, { coins: 450, items: { plank: 12, stone: 12 } }, [{ coins: 900, items: { beam: 6, rope: 8 } }, { coins: 2000, items: { brick: 12, sack: 4 } }], '#7cb342', '#7a5230'),
  f('cane', 'Canavial', ['sugarcane'], 'pasto', 22, 66, 4, 2, 12, { coins: 600, items: { plank: 16, beam: 4 } }, [{ coins: 1200, items: { beam: 8, nails: 6 } }, { coins: 2600, items: { brick: 16, metal_parts: 2 } }], '#9ccc65', '#8a6440'),
  f('coffee', 'Cafezal', ['coffee'], 'cafezal', 84, 4, 4, 2, 18, { coins: 1400, items: { beam: 12, brick: 12 } }, [{ coins: 2800, items: { metal_parts: 3, beam: 10 } }, { coins: 5500, items: { metal_parts: 6, glass: 10 } }], '#c0392b', '#6d4c41'),
  f('mate', 'Ervatal', ['erva_mate'], 'serra', 116, 14, 3, 2, 31, { coins: 5000, items: { beam: 20, brick: 20 } }, [{ coins: 9000, items: { metal_parts: 8, beam: 16 } }, { coins: 16000, items: { metal_parts: 12, glass: 16 } }], '#6b8e23', '#6d4c41'),
  f('pumpkin', 'Aboboral', ['pumpkin'], 'rio', 33, 47, 6, 1, 19, { coins: 1500, items: { beam: 12, brick: 14 } }, [{ coins: 3000, items: { metal_parts: 3, crate: 6 } }, { coins: 6000, items: { metal_parts: 6, cabinet: 1 } }], '#f28a26', '#7e5634', { obs: 'pontes' }),
];

export const FIELD_BY_ID = Object.fromEntries(FIELDS.map((x) => [x.id, x])) as Record<string, FieldDef>;
/** Campo de cada cultura. */
export const FIELD_OF_CROP = Object.fromEntries(FIELDS.flatMap((x) => x.crops.map((c) => [c, x.id]))) as Record<string, string>;
/** Tile do canto do canteiro i de um campo. */
export const fieldPlot = (fd: FieldDef, i: number) => ({ x: fd.x + (i % fd.cols) * 2, y: fd.y + Math.floor(i / fd.cols) * 2 });
