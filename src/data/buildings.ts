// Construções e regiões. Toda construção, melhoria e expansão é um
// "projeto coletivo": qualquer membro entrega materiais/moedas até completar.
import type { Cost } from './production.ts';

export type BuildingKind = 'starter' | 'producer' | 'utility';

export interface Spot { x: number; y: number; w: number; h: number }

export interface UpgradeDef extends Cost { level: number }

export interface BuildingDef {
  id: string;
  name: string;
  desc: string;
  effect: string;
  kind: BuildingKind;
  region: string;
  level: number;
  spot: Spot;
  cost: Cost; // custo de construção (starter = já construído)
  upgrades: UpgradeDef[]; // custo para nível 2, 3...
  roof: string; // cor do telhado
  wall: string;
}

const scale = (c: Cost, coinMul: number, itemMul: number): Cost => ({
  coins: Math.round((c.coins ?? 0) * coinMul),
  items: Object.fromEntries(Object.entries(c.items ?? {}).map(([k, v]) => [k, Math.ceil(v * itemMul)])),
});

/** Produtores: nível 2 e 3 custam o dobro/quádruplo e liberam +1 fila e -10% de tempo cada. */
const prodUpgrades = (base: Cost, level: number): UpgradeDef[] => [
  { level: level + 4, ...scale(base, 2, 1.5) },
  { level: level + 9, ...scale(base, 4, 2.5) },
];

const b = (
  id: string, name: string, kind: BuildingKind, region: string, level: number, spot: Spot,
  cost: Cost, desc: string, effect: string, roof: string, wall: string, upgrades?: UpgradeDef[],
): BuildingDef => ({
  id, name, kind, region, level, spot, cost, desc, effect, roof, wall,
  upgrades: upgrades ?? (kind === 'producer' ? prodUpgrades(cost, level) : []),
});

export const BUILDINGS: BuildingDef[] = [
  // Já começam construídos
  b('farmhouse', 'Casa da Fazenda', 'starter', 'sitio', 1, { x: 24, y: 19, w: 5, h: 4 }, {},
    'O coração da propriedade.', 'Libera canteiros: 6 / 9 / 12.', '#c0504d', '#f3e3c3', [
      { level: 4, coins: 200, items: { plank: 15, stone: 10 } },
      { level: 9, coins: 800, items: { plank: 30, stone: 30, beam: 10 } },
    ]),
  b('barn', 'Celeiro', 'starter', 'sitio', 1, { x: 37, y: 19, w: 5, h: 4 }, {},
    'Estoque compartilhado da fazenda.', 'Capacidade: 150 / 250 / 400 / 600 / 900.', '#b23a3a', '#d9534f', [
      { level: 3, coins: 100, items: { wood: 20, plank: 8 } },
      { level: 7, coins: 400, items: { plank: 20, stone: 20 } },
      { level: 12, coins: 1200, items: { beam: 20, brick: 20 } },
      { level: 18, coins: 3000, items: { brick: 40, nails: 30 } },
    ]),
  b('sales_cart', 'Carroça de Vendas', 'starter', 'sitio', 1, { x: 30, y: 20, w: 3, h: 2 }, {},
    'Venda qualquer item do estoque.', 'Preço base de mercado.', '#3f7fbf', '#d9a766'),
  b('order_board', 'Quadro de Pedidos', 'starter', 'sitio', 1, { x: 34, y: 20, w: 2, h: 2 }, {},
    'Pedidos dos moradores e contratos coletivos.', 'Vagas de pedido: 3 / 4 / 5.', '#6b8e23', '#a0673a', [
      { level: 6, coins: 300, items: { plank: 12 } },
      { level: 14, coins: 1500, items: { beam: 10, nails: 10 } },
    ]),

  // Sítio
  b('workbench', 'Bancada de Trabalho', 'producer', 'sitio', 1, { x: 36, y: 26, w: 3, h: 2 },
    { coins: 10, items: { wood: 5 } }, 'Cordas, cestos e as primeiras ferramentas.', 'Fabrica ferramentas tier 1.', '#8d6e63', '#c99a5b'),
  b('sawmill', 'Serraria', 'producer', 'sitio', 2, { x: 33, y: 31, w: 4, h: 3 },
    { coins: 60, items: { wood: 15, stone: 5 } }, 'Transforma madeira em tábuas e vigas.', '', '#795548', '#d9a766'),
  b('mill', 'Moinho', 'producer', 'sitio', 3, { x: 40, y: 26, w: 3, h: 3 },
    { coins: 90, items: { wood: 20, plank: 6, stone: 6 } }, 'Mói trigo e milho.', '', '#a1887f', '#f3e3c3'),
  b('well', 'Poço', 'utility', 'sitio', 4, { x: 33, y: 27, w: 2, h: 2 },
    { coins: 120, items: { stone: 15, plank: 6 } }, 'Água fresca para os canteiros.', 'Cultivos crescem 15% / 25% / 35% mais rápido.', '#5d7a8c', '#9aa0a6', [
      { level: 9, coins: 500, items: { stone: 30, rope: 10 } },
      { level: 15, coins: 1600, items: { brick: 30, metal_parts: 2 } },
    ]),
  b('bakery', 'Padaria', 'producer', 'sitio', 5, { x: 38, y: 31, w: 4, h: 3 },
    { coins: 160, items: { plank: 12, stone: 12 } }, 'Pães, bolos e tortas.', '', '#e07b39', '#f6dcb4'),
  b('toolshed', 'Galpão de Ferramentas', 'utility', 'pomar', 5, { x: 57, y: 31, w: 2, h: 2 },
    { coins: 150, items: { plank: 10, wood: 10, rope: 4 } }, 'Oficina para ferramentas melhores.', 'Fabrica ferramentas tier 2 e 3.', '#556b2f', '#a0673a'),
  b('carpentry', 'Carpintaria', 'producer', 'pomar', 6, { x: 46, y: 31, w: 4, h: 2 },
    { coins: 220, items: { plank: 16, stone: 10, rope: 4 } }, 'Móveis e caixotes.', '', '#8b5a2b', '#deb887'),
  b('market', 'Mercado', 'utility', 'pomar', 6, { x: 52, y: 31, w: 3, h: 2 },
    { coins: 250, items: { plank: 20, basket: 4, rope: 6 } }, 'Comerciantes pagam melhor.', 'Vendas +10% / +15% / +20%.', '#c62828', '#fff3e0', [
      { level: 11, coins: 900, items: { crate: 6, cloth: 4 } },
      { level: 17, coins: 2400, items: { table: 4, glass: 10 } },
    ]),

  // Pomar
  b('kitchen', 'Cozinha Rústica', 'producer', 'pomar', 7, { x: 46, y: 19, w: 4, h: 3 },
    { coins: 300, items: { plank: 18, stone: 14, basket: 2 } }, 'Sucos, molhos, sopas e geleias.', '', '#d4a017', '#f3e3c3'),
  b('weaving', 'Tecelagem', 'producer', 'pomar', 8, { x: 52, y: 19, w: 4, h: 3 },
    { coins: 380, items: { plank: 20, beam: 4, rope: 8 } }, 'Fios, tecidos e sacos.', '', '#7e57c2', '#ede7f6'),
  b('greenhouse', 'Estufa', 'utility', 'pomar', 11, { x: 57, y: 19, w: 4, h: 3 },
    { coins: 700, items: { plank: 20, beam: 8, brick: 10 } }, 'Canteiros protegidos.', 'Canteiros extras (4 / 6 / 8) que crescem 30% mais rápido.', '#81d4fa', '#e0f7fa', [
      { level: 15, coins: 1500, items: { glass: 12, beam: 10 } },
      { level: 20, coins: 3200, items: { glass: 24, metal_parts: 4 } },
    ]),

  // Margem do rio
  b('pottery', 'Olaria', 'producer', 'rio', 10, { x: 25, y: 37, w: 4, h: 3 },
    { coins: 600, items: { plank: 20, beam: 8, stone: 20 } }, 'Cerâmica: tijolos, vasos e jarros.', '', '#bf6b3a', '#f0d0b0'),
  b('glassworks', 'Vidraria', 'producer', 'rio', 14, { x: 32, y: 37, w: 4, h: 3 },
    { coins: 1100, items: { brick: 30, beam: 10, iron_ingot: 4 } }, 'Vidro, potes e lampiões.', '', '#4fc3f7', '#e1f5fe'),
  b('oil_press', 'Prensa', 'producer', 'rio', 14, { x: 39, y: 37, w: 4, h: 3 },
    { coins: 1000, items: { beam: 12, brick: 20, copper_ingot: 4 } }, 'Óleos e sucos prensados.', '', '#9e9d24', '#f9fbe7'),
  b('warehouse', 'Armazém', 'utility', 'rio', 15, { x: 47, y: 37, w: 5, h: 3 },
    { coins: 1300, items: { brick: 40, beam: 16, nails: 20 } }, 'Depósito à beira do rio.', 'Capacidade extra: +300 / +500 / +800.', '#607d8b', '#cfd8dc', [
      { level: 19, coins: 2600, items: { brick: 60, nails: 30 } },
      { level: 25, coins: 6000, items: { metal_parts: 10, beam: 30 } },
    ]),

  // Colinas
  b('foundry', 'Fundição', 'producer', 'colinas', 12, { x: 20, y: 11, w: 4, h: 3 },
    { coins: 900, items: { brick: 25, stone: 30, beam: 8 } }, 'Derrete minérios em lingotes.', '', '#5d4037', '#a1887f'),
  b('smithy', 'Ferraria', 'producer', 'colinas', 13, { x: 26, y: 11, w: 4, h: 3 },
    { coins: 1000, items: { brick: 25, copper_ingot: 6, beam: 8 } }, 'Pregos e peças metálicas.', '', '#455a64', '#b0bec5'),
  b('great_workshop', 'Grande Oficina', 'producer', 'colinas', 20, { x: 12, y: 10, w: 6, h: 4 },
    { coins: 3000, items: { wood: 100, stone: 50, plank: 30, metal_parts: 20 } },
    'Projeto cooperativo de grande porte.', 'Carroças e caixinhas de música. Exigida pelo Planalto.', '#8e24aa', '#f3e5f5'),

  // Vale das Flores
  b('apiary', 'Apiário', 'producer', 'vale', 18, { x: 38, y: 6, w: 3, h: 3 },
    { coins: 1800, items: { plank: 20, jar: 10, beam: 10 } }, 'Abelhas transformam flores em mel.', '', '#ffb300', '#fff8e1'),
  b('florist', 'Floricultura', 'producer', 'vale', 18, { x: 46, y: 6, w: 4, h: 3 },
    { coins: 2000, items: { brick: 30, glass: 12, cloth: 6 } }, 'Buquês e perfumes.', '', '#ec407a', '#fce4ec'),

  // Planalto
  b('jewelry', 'Joalheria', 'producer', 'planalto', 24, { x: 8, y: 38, w: 4, h: 3 },
    { coins: 5000, items: { brick: 40, gold_ingot: 6, glass: 20, metal_parts: 6 } }, 'Joias de ouro e cristal.', '', '#ffd54f', '#37474f'),
];

export interface RegionDef {
  id: string;
  name: string;
  desc: string;
  rect: { x: number; y: number; w: number; h: number };
  level: number;
  cost: Cost;
  needs?: string; // prédio exigido
  ground: string; // cor base do terreno
}

export const REGIONS: RegionDef[] = [
  { id: 'sitio', name: 'Sítio Inicial', desc: 'Onde tudo começa: madeira, fibra e o primeiro campo.', rect: { x: 22, y: 18, w: 22, h: 18 }, level: 1, cost: {}, ground: '#8cc152' },
  { id: 'pomar', name: 'Pomar', desc: 'Macieiras, laranjeiras e pessegueiros. Cozinha e tecelagem.', rect: { x: 44, y: 18, w: 18, h: 18 }, level: 3, cost: { coins: 150, items: { wood: 20, rope: 4 } }, ground: '#9ccc65' },
  { id: 'bosque', name: 'Bosque', desc: 'Árvores antigas (madeira de lei), ervas e cogumelos.', rect: { x: 2, y: 18, w: 20, h: 18 }, level: 6, cost: { coins: 400, items: { plank: 30, rope: 10, basket: 2 } }, ground: '#6fa84a' },
  { id: 'rio', name: 'Margem do Rio', desc: 'Argila, areia e junco. Olaria, vidraria e armazém.', rect: { x: 22, y: 36, w: 40, h: 14 }, level: 9, cost: { coins: 900, items: { plank: 40, beam: 15, stone: 20 } }, ground: '#a5c96a' },
  { id: 'colinas', name: 'Colinas', desc: 'Rochedos, carvão, cobre e ferro. Fundição e ferraria.', rect: { x: 2, y: 2, w: 32, h: 16 }, level: 12, cost: { coins: 1800, items: { brick: 40, beam: 20, rope: 20 } }, ground: '#a7b26b' },
  { id: 'vale', name: 'Vale das Flores', desc: 'Pétalas, rosas, tulipas e lavanda. Apiário e floricultura.', rect: { x: 34, y: 2, w: 28, h: 16 }, level: 17, cost: { coins: 3500, items: { brick: 30, glass: 20, cloth: 10 } }, ground: '#b5d77a' },
  { id: 'planalto', name: 'Planalto Industrial', desc: 'Ouro e cristais. Joalheria.', rect: { x: 2, y: 36, w: 20, h: 14 }, level: 23, cost: { coins: 7000, items: { metal_parts: 30, brick: 40, beam: 20 } }, needs: 'great_workshop', ground: '#b9a77a' },
];

export const BUILDING_BY_ID = Object.fromEntries(BUILDINGS.map((x) => [x.id, x])) as Record<string, BuildingDef>;
export const REGION_BY_ID = Object.fromEntries(REGIONS.map((x) => [x.id, x])) as Record<string, RegionDef>;
