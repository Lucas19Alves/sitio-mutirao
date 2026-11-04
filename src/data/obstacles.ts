// Expansão por obstáculos físicos: cada região fechada tem um bloqueio visível na estrada de
// entrada (árvore caída, mato fechado, deslizamento, portão, carro, passagem alagada). Remover
// exige nível, a ferramenta certa e materiais entregues por qualquer membro (obra coletiva).
// As pontes do rio são um obstáculo à parte: dão acesso à margem sul.
import type { ToolId, Cost } from './production.ts';

export type ObstacleKind = 'fallen_tree' | 'brush' | 'landslide' | 'gate' | 'car' | 'boat' | 'bridge';

export interface ObstacleDef {
  id: string;
  kind: ObstacleKind;
  name: string;
  /** o que fazer, no tom do lugar */
  desc: string;
  /** região que se abre (null = só acesso, como as pontes) */
  region: string | null;
  /** tile onde o bloqueio fica (dentro da área fechada) e de onde se interage (lado aberto) */
  at: { x: number; y: number };
  from: { x: number; y: number };
  tool?: { t: ToolId; tier: number };
  /** custo próprio (obstáculos sem região); regiões usam o custo da região */
  cost?: Cost;
  level?: number;
  needs?: string;
}

export const OBSTACLES: ObstacleDef[] = [
  { id: 'pomar', kind: 'fallen_tree', name: 'Árvore caída', desc: 'Um jequitibá tombou na estrada do pomar. Corte o tronco e abra o caminho.', region: 'pomar', at: { x: 44, y: 24 }, from: { x: 42, y: 24 }, tool: { t: 'axe', tier: 1 } },
  { id: 'bosque', kind: 'brush', name: 'Mato fechado', desc: 'Espinheiros tomaram a trilha do bosque. Ceife e abra a passagem.', region: 'bosque', at: { x: 21, y: 24 }, from: { x: 23, y: 24 }, tool: { t: 'sickle', tier: 1 } },
  { id: 'rio', kind: 'landslide', name: 'Deslizamento', desc: 'A chuva derrubou o barranco sobre a estrada do rio. Cave e escore a encosta.', region: 'rio', at: { x: 32, y: 36 }, from: { x: 32, y: 34 }, tool: { t: 'shovel', tier: 1 } },
  { id: 'colinas', kind: 'gate', name: 'Portão enferrujado', desc: 'O velho portão das colinas emperrou. Troque as dobradiças e reforce as pedras.', region: 'colinas', at: { x: 33, y: 17 }, from: { x: 33, y: 19 }, tool: { t: 'pickaxe', tier: 2 } },
  { id: 'vale', kind: 'car', name: 'Caminhão quebrado', desc: 'Um caminhão sem motor trava a subida para o vale. Conserte e tire-o da estrada.', region: 'vale', at: { x: 48, y: 17 }, from: { x: 48, y: 19 }, tool: { t: 'shovel', tier: 2 } },
  { id: 'planalto', kind: 'boat', name: 'Passagem alagada', desc: 'A trilha do planalto alagou. Recupere o barco abandonado para atravessar.', region: 'planalto', at: { x: 21, y: 43 }, from: { x: 23, y: 43 }, tool: { t: 'axe', tier: 3 } },
  { id: 'pontes', kind: 'bridge', name: 'Pontes quebradas', desc: 'As pontes do rio perderam as tábuas. Reconstrua para chegar à margem sul.', region: null, at: { x: 30, y: 44 }, from: { x: 30, y: 42 }, level: 10, needs: 'sawmill', cost: { coins: 400, items: { plank: 24, beam: 6, rope: 8, stone: 16 } } },
];

export const OBSTACLE_BY_ID = Object.fromEntries(OBSTACLES.map((o) => [o.id, o])) as Record<string, ObstacleDef>;
export const OBSTACLE_OF_REGION = Object.fromEntries(OBSTACLES.filter((o) => o.region).map((o) => [o.region!, o])) as Record<string, ObstacleDef>;
