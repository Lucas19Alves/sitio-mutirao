// Ajudantes: moradores contratados que produzem um recurso ao longo do tempo e o levam ao
// celeiro. O servidor calcula a produção pelo tempo decorrido (ação 'wclaim'); no mundo 3D
// cada ajudante anda entre o recurso e o celeiro.
import type { Cost } from './production.ts';

export interface WorkerDef {
  id: string;
  name: string;
  role: string;
  item: string;
  /** região onde trabalha (precisa estar aberta) */
  region: string;
  /** nó do mundo que ele visita (só visual) */
  node: string;
  level: number;
  /** segundos por unidade no nível 1; cada nível acima divide por (1 + 0,6 × nível extra) */
  per: number;
  /** quanto acumula antes de parar, esperando alguém passar no celeiro */
  cap: number;
  /** custo de contratar (índice 0) e de cada melhoria */
  costs: Cost[];
  look: { skin: number; hair: number; hairColor: number; shirt: number; shirtColor: number; pants: number; hat: number; hatColor: number; acc: number };
}

export const WORKERS: WorkerDef[] = [
  { id: 'lenhador', name: 'Seu Tonho', role: 'Lenhador', item: 'wood', region: 'sitio', node: 'tree_oak', level: 4, per: 24, cap: 40,
    costs: [{ coins: 220, items: { plank: 8 } }, { coins: 600, items: { beam: 4 } }, { coins: 1500, items: { nails: 10, beam: 8 } }],
    look: { skin: 3, hair: 4, hairColor: 0, shirt: 1, shirtColor: 0, pants: 1, hat: 0, hatColor: 0, acc: 0 } },
  { id: 'capineira', name: 'Dona Lia', role: 'Capineira', item: 'fiber', region: 'sitio', node: 'grass', level: 5, per: 20, cap: 40,
    costs: [{ coins: 260, items: { rope: 6 } }, { coins: 650, items: { basket: 3 } }, { coins: 1500, items: { sack: 4 } }],
    look: { skin: 1, hair: 3, hairColor: 5, shirt: 2, shirtColor: 2, pants: 0, hat: 1, hatColor: 8, acc: 4 } },
  { id: 'pedreiro', name: 'Seu Bento', role: 'Pedreiro', item: 'stone', region: 'sitio', node: 'rock_small', level: 7, per: 30, cap: 40,
    costs: [{ coins: 400, items: { plank: 12 } }, { coins: 900, items: { brick: 10 } }, { coins: 2200, items: { iron_ingot: 4 } }],
    look: { skin: 4, hair: 0, hairColor: 6, shirt: 0, shirtColor: 9, pants: 3, hat: 2, hatColor: 3, acc: 0 } },
  { id: 'colhedora', name: 'Mariana', role: 'Colhedora', item: 'apple', region: 'pomar', node: 'apple_tree', level: 8, per: 36, cap: 30,
    costs: [{ coins: 500, items: { basket: 4 } }, { coins: 1200, items: { crate: 3 } }, { coins: 2600, items: { cloth: 4 } }],
    look: { skin: 0, hair: 2, hairColor: 3, shirt: 3, shirtColor: 8, pants: 4, hat: 4, hatColor: 0, acc: 0 } },
  { id: 'oleiro', name: 'Zeca', role: 'Barreiro', item: 'clay', region: 'rio', node: 'clay', level: 11, per: 40, cap: 30,
    costs: [{ coins: 900, items: { beam: 6 } }, { coins: 2000, items: { brick: 16 } }, { coins: 4000, items: { metal_parts: 2 } }],
    look: { skin: 2, hair: 1, hairColor: 1, shirt: 2, shirtColor: 5, pants: 1, hat: 3, hatColor: 6, acc: 0 } },
  { id: 'mineiro', name: 'Dona Cida', role: 'Mineira', item: 'coal', region: 'colinas', node: 'coal', level: 14, per: 45, cap: 30,
    costs: [{ coins: 1600, items: { iron_ingot: 4 } }, { coins: 3200, items: { metal_parts: 3 } }, { coins: 6000, items: { metal_parts: 6 } }],
    look: { skin: 5, hair: 5, hairColor: 0, shirt: 2, shirtColor: 6, pants: 3, hat: 5, hatColor: 0, acc: 1 } },
  { id: 'florista', name: 'Iara', role: 'Florista', item: 'petals', region: 'vale', node: 'wildflower', level: 18, per: 40, cap: 30,
    costs: [{ coins: 2400, items: { vase: 2 } }, { coins: 4800, items: { bouquet: 3 } }, { coins: 8000, items: { perfume: 3 } }],
    look: { skin: 1, hair: 3, hairColor: 4, shirt: 3, shirtColor: 4, pants: 0, hat: 4, hatColor: 8, acc: 2 } },
  { id: 'pescador', name: 'Seu Quim', role: 'Pescador', item: 'fish', region: 'lago', node: 'fish_spot', level: 15, per: 40, cap: 30,
    costs: [{ coins: 1500, items: { rope: 10, plank: 10 } }, { coins: 3200, items: { thread: 8 } }, { coins: 6000, items: { metal_parts: 4 } }],
    look: { skin: 4, hair: 0, hairColor: 6, shirt: 1, shirtColor: 1, pants: 3, hat: 1, hatColor: 6, acc: 0 } },
  { id: 'vaqueira', name: 'Dona Zefa', role: 'Vaqueira', item: 'milk', region: 'pasto', node: 'grass', level: 13, per: 60, cap: 20,
    costs: [{ coins: 1800, items: { feed: 10, plank: 10 } }, { coins: 3600, items: { beam: 8 } }, { coins: 7000, items: { metal_parts: 4 } }],
    look: { skin: 2, hair: 2, hairColor: 1, shirt: 2, shirtColor: 7, pants: 2, hat: 3, hatColor: 0, acc: 4 } },
];

export const WORKER_BY_ID = Object.fromEntries(WORKERS.map((w) => [w.id, w])) as Record<string, WorkerDef>;
export const workerPeriodMs = (w: WorkerDef, lv: number) => Math.round((w.per * 1000) / (1 + 0.6 * (lv - 1)));
