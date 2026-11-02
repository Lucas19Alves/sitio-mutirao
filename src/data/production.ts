// Cultivos, recursos naturais, ferramentas e receitas.

export type ToolId = 'axe' | 'pickaxe' | 'sickle' | 'shovel';
export type Cost = { coins?: number; items?: Record<string, number> };

export interface CropDef {
  id: string; // = item colhido
  level: number;
  seed: number; // moedas por plantio
  time: number; // segundos
  yield: number;
  xp: number;
  tool?: ToolId;
  region?: string; // exige região desbloqueada
  color: string; // cor da planta madura
}

export const CROPS: CropDef[] = [
  { id: 'wheat', level: 1, seed: 1, time: 20, yield: 3, xp: 2, tool: 'sickle', color: '#e6c34a' },
  { id: 'carrot', level: 2, seed: 2, time: 40, yield: 3, xp: 3, color: '#f57c00' },
  { id: 'corn', level: 4, seed: 3, time: 60, yield: 3, xp: 4, color: '#fdd835' },
  { id: 'tomato', level: 5, seed: 4, time: 75, yield: 3, xp: 5, color: '#e53935' },
  { id: 'potato', level: 6, seed: 4, time: 90, yield: 4, xp: 5, color: '#c8a165' },
  { id: 'cotton', level: 8, seed: 6, time: 120, yield: 3, xp: 7, tool: 'sickle', color: '#fafafa' },
  { id: 'strawberry', level: 11, seed: 8, time: 150, yield: 3, xp: 9, color: '#e53950' },
  { id: 'sunflower', level: 14, seed: 8, time: 150, yield: 3, xp: 9, color: '#fbc02d' },
  { id: 'grape', level: 16, seed: 10, time: 180, yield: 4, xp: 11, color: '#7b3fa0' },
  { id: 'rose', level: 17, seed: 10, time: 150, yield: 3, xp: 10, region: 'vale', color: '#e91e63' },
  { id: 'pumpkin', level: 19, seed: 14, time: 240, yield: 2, xp: 14, color: '#ef6c00' },
  { id: 'tulip', level: 19, seed: 12, time: 170, yield: 3, xp: 11, region: 'vale', color: '#ff7043' },
  { id: 'lavender', level: 21, seed: 11, time: 160, yield: 3, xp: 11, tool: 'sickle', region: 'vale', color: '#9575cd' },
];

export interface NodeDef {
  id: string;
  name: string;
  item: string;
  qty: number;
  tool?: ToolId;
  tier: number; // tier mínimo da ferramenta (0 = mãos)
  hits: number; // golpes com o tier mínimo (cada tier acima tira 1)
  respawn: number; // segundos
  xp: number;
  /** Bloqueia o tile (árvores, rochas). */
  solid: boolean;
}

export const NODES: NodeDef[] = [
  { id: 'tree_oak', name: 'Carvalho', item: 'wood', qty: 2, tool: 'axe', tier: 1, hits: 3, respawn: 60, xp: 2, solid: true },
  { id: 'tree_big', name: 'Árvore Antiga', item: 'hardwood', qty: 2, tool: 'axe', tier: 2, hits: 4, respawn: 120, xp: 4, solid: true },
  { id: 'grass', name: 'Capim Alto', item: 'fiber', qty: 2, tier: 0, hits: 1, respawn: 30, xp: 1, solid: false },
  { id: 'reeds', name: 'Junco', item: 'fiber', qty: 3, tool: 'sickle', tier: 1, hits: 1, respawn: 40, xp: 1, solid: false },
  { id: 'rock_small', name: 'Pedra', item: 'stone', qty: 2, tool: 'pickaxe', tier: 1, hits: 3, respawn: 60, xp: 2, solid: true },
  { id: 'rock_big', name: 'Rochedo', item: 'stone', qty: 4, tool: 'pickaxe', tier: 1, hits: 5, respawn: 120, xp: 4, solid: true },
  { id: 'apple_tree', name: 'Macieira', item: 'apple', qty: 3, tier: 0, hits: 1, respawn: 90, xp: 2, solid: true },
  { id: 'orange_tree', name: 'Laranjeira', item: 'orange', qty: 3, tier: 0, hits: 1, respawn: 100, xp: 2, solid: true },
  { id: 'peach_tree', name: 'Pessegueiro', item: 'peach', qty: 3, tier: 0, hits: 1, respawn: 120, xp: 3, solid: true },
  { id: 'herb_bush', name: 'Moita de Ervas', item: 'herbs', qty: 2, tool: 'sickle', tier: 1, hits: 1, respawn: 60, xp: 2, solid: false },
  { id: 'mushroom', name: 'Cogumelos', item: 'mushroom', qty: 2, tier: 0, hits: 1, respawn: 90, xp: 2, solid: false },
  { id: 'clay', name: 'Barranco de Argila', item: 'clay', qty: 2, tool: 'shovel', tier: 1, hits: 2, respawn: 70, xp: 3, solid: false },
  { id: 'sand', name: 'Banco de Areia', item: 'sand', qty: 2, tool: 'shovel', tier: 1, hits: 2, respawn: 70, xp: 3, solid: false },
  { id: 'coal', name: 'Veio de Carvão', item: 'coal', qty: 2, tool: 'pickaxe', tier: 1, hits: 3, respawn: 100, xp: 3, solid: true },
  { id: 'copper', name: 'Veio de Cobre', item: 'copper_ore', qty: 2, tool: 'pickaxe', tier: 2, hits: 4, respawn: 120, xp: 4, solid: true },
  { id: 'iron', name: 'Veio de Ferro', item: 'iron_ore', qty: 2, tool: 'pickaxe', tier: 2, hits: 4, respawn: 140, xp: 5, solid: true },
  { id: 'wildflower', name: 'Flores do Campo', item: 'petals', qty: 3, tier: 0, hits: 1, respawn: 80, xp: 3, solid: false },
  { id: 'gold', name: 'Veio de Ouro', item: 'gold_ore', qty: 2, tool: 'pickaxe', tier: 3, hits: 5, respawn: 180, xp: 8, solid: true },
  { id: 'crystal', name: 'Geodo de Cristal', item: 'crystal', qty: 1, tool: 'pickaxe', tier: 3, hits: 6, respawn: 240, xp: 10, solid: true },
];

export interface ToolTier {
  tier: number;
  name: string;
  level: number;
  cost: Cost;
  /** Prédio necessário para fabricar este tier. */
  needs: string;
}

export interface ToolDef {
  id: ToolId;
  name: string;
  desc: string;
  tiers: ToolTier[];
}

export const TOOLS: ToolDef[] = [
  {
    id: 'axe', name: 'Machado', desc: 'Corta árvores. Tiers maiores cortam com menos golpes e rendem +1 por tier extra.',
    tiers: [
      { tier: 1, name: 'Machado de Pedra', level: 1, cost: {}, needs: '' },
      { tier: 2, name: 'Machado Reforçado', level: 6, cost: { coins: 120, items: { plank: 8, stone: 12, rope: 4 } }, needs: 'toolshed' },
      { tier: 3, name: 'Machado de Aço', level: 14, cost: { coins: 600, items: { iron_ingot: 4, beam: 4, rope: 6 } }, needs: 'toolshed' },
    ],
  },
  {
    id: 'pickaxe', name: 'Picareta', desc: 'Quebra pedras e minérios. Tier 2 para cobre e ferro, tier 3 para ouro e cristal.',
    tiers: [
      { tier: 1, name: 'Picareta Simples', level: 2, cost: { coins: 20, items: { wood: 10, fiber: 6, rope: 2 } }, needs: 'workbench' },
      { tier: 2, name: 'Picareta Reforçada', level: 11, cost: { coins: 300, items: { plank: 10, stone: 20, rope: 6, brick: 6 } }, needs: 'toolshed' },
      { tier: 3, name: 'Picareta de Aço', level: 21, cost: { coins: 1500, items: { iron_ingot: 8, metal_parts: 2, beam: 6 } }, needs: 'toolshed' },
    ],
  },
  {
    id: 'sickle', name: 'Foice', desc: 'Colhe trigo, algodão, lavanda, junco e ervas. Tier 2 rende +1 por colheita.',
    tiers: [
      { tier: 1, name: 'Foice de Madeira', level: 1, cost: { items: { wood: 4, fiber: 4 } }, needs: 'workbench' },
      { tier: 2, name: 'Foice de Ferro', level: 13, cost: { coins: 400, items: { iron_ingot: 3, plank: 6 } }, needs: 'toolshed' },
    ],
  },
  {
    id: 'shovel', name: 'Pá', desc: 'Escava argila e areia na margem do rio.',
    tiers: [
      { tier: 1, name: 'Pá de Madeira', level: 9, cost: { coins: 150, items: { plank: 6, stone: 8, rope: 3 } }, needs: 'toolshed' },
      { tier: 2, name: 'Pá de Aço', level: 15, cost: { coins: 700, items: { iron_ingot: 4, beam: 3 } }, needs: 'toolshed' },
    ],
  },
];

export interface RecipeDef {
  id: string; // = item produzido
  b: string; // prédio
  level: number;
  in: Record<string, number>;
  out: number;
  time: number; // segundos
  xp: number;
}

const r = (id: string, b: string, level: number, inp: Record<string, number>, time: number, xp: number, out = 1): RecipeDef =>
  ({ id, b, level, in: inp, out, time, xp });

export const RECIPES: RecipeDef[] = [
  r('rope', 'workbench', 1, { fiber: 3 }, 15, 3),
  r('basket', 'workbench', 2, { fiber: 4, wood: 2 }, 30, 5),
  r('plank', 'sawmill', 2, { wood: 2 }, 12, 2),
  r('beam', 'sawmill', 7, { hardwood: 2 }, 30, 5),
  r('flour', 'mill', 3, { wheat: 3 }, 20, 3),
  r('cornmeal', 'mill', 4, { corn: 2 }, 25, 4),
  r('bread', 'bakery', 5, { flour: 2 }, 40, 8),
  r('carrot_cake', 'bakery', 6, { flour: 2, carrot: 3 }, 60, 12),
  r('corn_cake', 'bakery', 7, { cornmeal: 2, flour: 1 }, 60, 12),
  r('apple_pie', 'bakery', 9, { flour: 2, apple: 3 }, 90, 14),
  r('pumpkin_pie', 'bakery', 20, { flour: 2, pumpkin: 1 }, 120, 24),
  r('orange_juice', 'kitchen', 7, { orange: 3 }, 40, 6),
  r('tomato_sauce', 'kitchen', 7, { tomato: 3 }, 40, 7),
  r('herbal_tea', 'kitchen', 7, { herbs: 3 }, 30, 5),
  r('veggie_soup', 'kitchen', 8, { potato: 2, carrot: 2, tomato: 1 }, 60, 10),
  r('peach_jam', 'kitchen', 8, { peach: 3 }, 60, 9),
  r('mushroom_soup', 'kitchen', 9, { mushroom: 3, potato: 2 }, 70, 11),
  r('jam', 'kitchen', 11, { strawberry: 3 }, 60, 12),
  r('chair', 'carpentry', 6, { plank: 3 }, 45, 8),
  r('crate', 'carpentry', 6, { plank: 2, rope: 1 }, 30, 7),
  r('table', 'carpentry', 7, { plank: 5, rope: 1 }, 60, 13),
  r('cabinet', 'carpentry', 15, { beam: 2, plank: 3, nails: 4 }, 120, 28),
  r('thread', 'weaving', 8, { cotton: 2 }, 30, 6),
  r('cloth', 'weaving', 9, { thread: 2 }, 60, 13),
  r('sack', 'weaving', 9, { fiber: 4, thread: 1 }, 45, 9),
  r('brick', 'pottery', 10, { clay: 2 }, 30, 4),
  r('clay_pot', 'pottery', 10, { clay: 3 }, 45, 5),
  r('vase', 'pottery', 18, { clay_pot: 1, rose: 2, glass: 1 }, 90, 16),
  r('copper_ingot', 'foundry', 12, { copper_ore: 3, coal: 1 }, 60, 8),
  r('iron_ingot', 'foundry', 12, { iron_ore: 3, coal: 1 }, 75, 10),
  r('gold_ingot', 'foundry', 23, { gold_ore: 3, coal: 2 }, 120, 20),
  r('nails', 'smithy', 13, { iron_ingot: 1 }, 40, 8, 4),
  r('metal_parts', 'smithy', 13, { iron_ingot: 1, copper_ingot: 1 }, 90, 18),
  r('glass', 'glassworks', 14, { sand: 3, coal: 1 }, 60, 7),
  r('jar', 'glassworks', 14, { glass: 1 }, 30, 4),
  r('lamp', 'glassworks', 23, { glass: 1, metal_parts: 1, sunflower_oil: 1 }, 180, 34),
  r('sunflower_oil', 'oil_press', 14, { sunflower: 3 }, 60, 10),
  r('grape_juice', 'oil_press', 16, { grape: 4 }, 75, 13),
  r('honey', 'apiary', 18, { petals: 3, jar: 1 }, 90, 12),
  r('lavender_honey', 'apiary', 21, { lavender: 3, jar: 1 }, 110, 17),
  r('bouquet', 'florist', 19, { rose: 2, tulip: 2 }, 70, 17),
  r('perfume', 'florist', 21, { lavender: 3, glass: 1, petals: 2 }, 120, 20),
  r('cart', 'great_workshop', 20, { beam: 4, metal_parts: 2, nails: 6 }, 240, 80),
  r('music_box', 'great_workshop', 23, { gold_ingot: 1, plank: 3, metal_parts: 2 }, 200, 64),
  r('ring', 'jewelry', 24, { gold_ingot: 2, crystal: 1 }, 150, 52),
  r('necklace', 'jewelry', 26, { gold_ingot: 3, crystal: 2 }, 220, 80),
];

export const CROP_BY_ID = Object.fromEntries(CROPS.map((x) => [x.id, x])) as Record<string, CropDef>;
export const NODE_BY_ID = Object.fromEntries(NODES.map((x) => [x.id, x])) as Record<string, NodeDef>;
export const TOOL_BY_ID = Object.fromEntries(TOOLS.map((x) => [x.id, x])) as Record<ToolId, ToolDef>;
export const RECIPE_BY_ID = Object.fromEntries(RECIPES.map((x) => [x.id, x])) as Record<string, RecipeDef>;
