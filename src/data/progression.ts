// Níveis, missões, contratos coletivos e parâmetros de economia.

export const MAX_LEVEL = 40;

/** XP para ir do nível L ao L+1 (índice L-1). */
export const LEVEL_XP: number[] = Array.from({ length: MAX_LEVEL - 1 }, (_, k) => Math.round(40 + 14 * Math.pow(k, 1.55)));

export const levelReward = (level: number) => 25 * level;

export type QuestGoal =
  | { k: 'stat'; key: string; n: number }
  | { k: 'built'; b: string; lv: number }
  | { k: 'tool'; tool: string; tier: number }
  | { k: 'region'; r: string }
  | { k: 'level'; n: number };

export interface QuestDef { title: string; desc: string; goal: QuestGoal; coins: number; xp: number }

const q = (title: string, desc: string, goal: QuestGoal, coins: number, xp: number): QuestDef => ({ title, desc, goal, coins, xp });

export const QUESTS: QuestDef[] = [
  q('Primeiros passos', 'Corte árvores com o machado e junte 6 madeiras.', { k: 'stat', key: 'h:wood', n: 6 }, 15, 10),
  q('Mãos à obra', 'Construa a Bancada de Trabalho no Quadro de Projetos.', { k: 'built', b: 'workbench', lv: 1 }, 20, 15),
  q('Capim alto', 'Colete 6 fibras das touceiras de capim.', { k: 'stat', key: 'h:fiber', n: 6 }, 10, 10),
  q('Uma boa foice', 'Fabrique a Foice de Madeira (menu Ferramentas).', { k: 'tool', tool: 'sickle', tier: 1 }, 10, 15),
  q('Semeadura', 'Plante 3 vezes nos canteiros.', { k: 'stat', key: 'plant', n: 3 }, 10, 10),
  q('Primeira colheita', 'Colha 9 trigos.', { k: 'stat', key: 'h:wheat', n: 9 }, 20, 15),
  q('Nó de marinheiro', 'Produza 3 cordas na bancada.', { k: 'stat', key: 'c:rope', n: 3 }, 15, 15),
  q('Dia de feira', 'Venda 10 itens na Carroça de Vendas.', { k: 'stat', key: 'sold', n: 10 }, 20, 15),
  q('Vizinhança', 'Entregue 1 pedido do Quadro de Pedidos.', { k: 'stat', key: 'orders', n: 1 }, 30, 20),
  q('Rocha dura', 'Fabrique a Picareta Simples.', { k: 'tool', tool: 'pickaxe', tier: 1 }, 20, 20),
  q('Serra afiada', 'Construa a Serraria.', { k: 'built', b: 'sawmill', lv: 1 }, 30, 25),
  q('Tábua por tábua', 'Produza 8 tábuas.', { k: 'stat', key: 'c:plank', n: 8 }, 30, 25),
  q('Mais espaço', 'Melhore o Celeiro para o nível 2.', { k: 'built', b: 'barn', lv: 2 }, 40, 30),
  q('Cheiro de fruta', 'Desbloqueie o Pomar.', { k: 'region', r: 'pomar' }, 50, 40),
  q('Colheita doce', 'Colha 6 maçãs.', { k: 'stat', key: 'h:apple', n: 6 }, 30, 25),
  q('Vento a favor', 'Construa o Moinho.', { k: 'built', b: 'mill', lv: 1 }, 40, 30),
  q('Farinha fina', 'Produza 5 farinhas.', { k: 'stat', key: 'c:flour', n: 5 }, 40, 30),
  q('Freguesia fiel', 'Entregue 5 pedidos.', { k: 'stat', key: 'orders', n: 5 }, 60, 40),
  q('Forno aceso', 'Construa a Padaria.', { k: 'built', b: 'bakery', lv: 1 }, 60, 40),
  q('Pão quentinho', 'Asse 4 pães.', { k: 'stat', key: 'c:bread', n: 4 }, 60, 40),
  q('Ferramentaria', 'Construa o Galpão de Ferramentas.', { k: 'built', b: 'toolshed', lv: 1 }, 60, 40),
  q('Lâmina reforçada', 'Fabrique o Machado Reforçado.', { k: 'tool', tool: 'axe', tier: 2 }, 80, 50),
  q('Trabalho em equipe', 'Entregue 10 itens em contratos coletivos.', { k: 'stat', key: 'cgive', n: 10 }, 80, 50),
  q('Mata adentro', 'Desbloqueie o Bosque.', { k: 'region', r: 'bosque' }, 120, 60),
  q('Estrutura firme', 'Produza 6 vigas.', { k: 'stat', key: 'c:beam', n: 6 }, 80, 50),
  q('Sabor caseiro', 'Construa a Cozinha Rústica.', { k: 'built', b: 'kitchen', lv: 1 }, 100, 60),
  q('Fio da meada', 'Construa a Tecelagem.', { k: 'built', b: 'weaving', lv: 1 }, 120, 70),
  q('Águas claras', 'Desbloqueie a Margem do Rio.', { k: 'region', r: 'rio' }, 200, 100),
  q('Cavar fundo', 'Fabrique a Pá de Madeira.', { k: 'tool', tool: 'shovel', tier: 1 }, 120, 60),
  q('Barro e fogo', 'Construa a Olaria.', { k: 'built', b: 'pottery', lv: 1 }, 150, 80),
  q('Tijolo a tijolo', 'Produza 20 tijolos.', { k: 'stat', key: 'c:brick', n: 20 }, 150, 80),
  q('Contrato fechado', 'Conclua 1 contrato coletivo.', { k: 'stat', key: 'contracts', n: 1 }, 200, 100),
  q('Subindo a serra', 'Desbloqueie as Colinas.', { k: 'region', r: 'colinas' }, 300, 150),
  q('Metal fundido', 'Construa a Fundição.', { k: 'built', b: 'foundry', lv: 1 }, 250, 120),
  q('Ferro em barra', 'Produza 10 lingotes de ferro.', { k: 'stat', key: 'c:iron_ingot', n: 10 }, 250, 120),
  q('Martelo e bigorna', 'Construa a Ferraria.', { k: 'built', b: 'smithy', lv: 1 }, 300, 150),
  q('Engrenagens', 'Produza 5 peças metálicas.', { k: 'stat', key: 'c:metal_parts', n: 5 }, 300, 150),
  q('Fazenda conhecida', 'Alcance o nível 17.', { k: 'level', n: 17 }, 300, 150),
  q('Primavera eterna', 'Desbloqueie o Vale das Flores.', { k: 'region', r: 'vale' }, 500, 200),
  q('Obra-prima coletiva', 'Construam juntos a Grande Oficina.', { k: 'built', b: 'great_workshop', lv: 1 }, 800, 300),
  q('Terras altas', 'Desbloqueie o Planalto Industrial.', { k: 'region', r: 'planalto' }, 1000, 400),
  q('Brilho real', 'Construa a Joalheria.', { k: 'built', b: 'jewelry', lv: 1 }, 1200, 500),
];

export interface ContractDef { id: string; npc: string; title: string; level: number; items: Record<string, number>; coins: number; xp: number; rep: number }

const c = (id: string, npc: string, title: string, level: number, items: Record<string, number>, coins: number, xp: number, rep: number): ContractDef =>
  ({ id, npc, title, level, items, coins, xp, rep });

export const CONTRACTS: ContractDef[] = [
  c('mercearia', 'Seu Bento', 'Estoque da Mercearia', 4, { flour: 8, carrot: 15, plank: 12 }, 320, 120, 3),
  c('padaria_praca', 'Dona Lurdes', 'Padaria da Praça', 6, { bread: 8, chair: 4, basket: 4 }, 600, 220, 4),
  c('feira_domingo', 'Toninho', 'Feira de Domingo', 8, { veggie_soup: 6, orange_juice: 8, crate: 6 }, 900, 320, 5),
  c('festa_junina', 'Comissão da Vila', 'Festa Junina', 10, { corn_cake: 10, bread: 10, cloth: 4, crate: 6 }, 1500, 520, 6),
  c('construtora', 'Construtora do Vale', 'Casas Novas', 12, { brick: 40, beam: 20, plank: 20 }, 1800, 600, 6),
  c('pousada', 'Pousada do Rio', 'Mobiliar a Pousada', 14, { table: 6, chair: 8, cloth: 8, clay_pot: 10 }, 2600, 850, 7),
  c('armazem_central', 'Armazém Central', 'Despensa Cheia', 16, { tomato_sauce: 15, jam: 12, sunflower_oil: 10 }, 3300, 1000, 8),
  c('ferrovia', 'Companhia Ferroviária', 'Estação Nova', 18, { nails: 30, metal_parts: 8, beam: 20 }, 4200, 1300, 9),
  c('casamento', 'Família Moreira', 'Casamento na Colina', 20, { bouquet: 8, carrot_cake: 6, grape_juice: 8, honey: 8 }, 5200, 1600, 10),
  c('exposicao', 'Prefeitura', 'Exposição Agrícola', 22, { pumpkin_pie: 8, vase: 6, cabinet: 5 }, 6500, 2000, 11),
  c('joalheria_real', 'Casa Aurora', 'Encomenda Real', 24, { ring: 5, gold_ingot: 8, glass: 10 }, 8000, 2500, 12),
  c('feira_regional', 'Federação Rural', 'Grande Feira Regional', 26, { cart: 2, lamp: 8, perfume: 8, bread: 20 }, 11000, 3200, 14),
  c('festival', 'Toda a Região', 'Festival da Colheita', 28, { pumpkin_pie: 15, apple_pie: 15, lavender_honey: 10, music_box: 6 }, 15000, 4200, 16),
  c('festa_junina', 'Comissão da Festa Junina', 'Quermesse da vila', 14, { tapioca: 10, rapadura: 12, pao_de_queijo: 6 }, 3200, 520, 6),
  c('peixada', 'Seu Quim Pescador', 'Peixada no lago', 18, { fried_fish: 12, moqueca: 4 }, 2600, 420, 5),
  c('cafe_da_manha', 'Pousada da Serra', 'Café da manhã da pousada', 21, { cafe_com_leite: 10, banana_cake: 6, pao_de_queijo: 10 }, 6800, 980, 8),
  c('aniversario', 'Dona Benta Doceira', 'Aniversário na praça', 23, { brigadeiro: 15, chocolate: 10, yogurt: 8 }, 7600, 1100, 9),
  c('feira_artesanato', 'Cacá Artesã', 'Feira de artesanato', 28, { bamboo_flute: 12, bamboo_lamp: 8, acai_bowl: 10 }, 9800, 1400, 10),
];

export const ORDER_NPCS = [
  'Dona Cida', 'Seu Zé', 'Marina', 'Juca', 'Tia Nena', 'Pedro Pescador', 'Lia da Venda', 'Professor Abel',
  'Rosa Florista', 'Caio Carteiro', 'Vó Dita', 'Bia Ciclista', 'Mestre Otávio', 'Dona Filó',
  'Seu Quim Pescador', 'Dona Benta Doceira', 'Tião Tropeiro', 'Iara do Lago', 'Padre Zezinho', 'Nina Barista', 'Zé do Engenho', 'Cacá Artesã',
];

export const CONFIG = {
  startCoins: 60,
  startItems: { wood: 4 } as Record<string, number>,
  barnCap: [150, 250, 400, 600, 900],
  warehouseCap: [300, 500, 800],
  plots: [6, 9, 12],
  greenhousePlots: [4, 6, 8],
  greenhouseSpeed: 0.7,
  wellBonus: [0.15, 0.25, 0.35],
  marketBonus: [0.1, 0.15, 0.2],
  boardSlots: [3, 4, 5],
  queueBase: 2,
  maxBatch: 40,
  /** Bônus quando 2+ membros contribuem (cada um com >= 15% do valor). */
  coopMinShare: 0.15,
  coopProjectXp: 0.25,
  coopContractBonus: 0.3,
  maxMembers: 4,
  /** cristais: moeda rara, ganha jogando */
  startCrystals: 5,
  levelCrystals: 2,
  regionCrystals: 3,
  dailyCrystals: 1,
  coopCrystals: 3,
  /** chance de um cliente especial (pedido maior, paga cristais) */
  vipChance: 0.12,
  vipNpcs: ['Chef do Restaurante', 'Mercador Viajante', 'Artesã da Vila', 'Dona da Pousada'],
  /** Mochila de cada jogador: capacidade por tamanho (0 = inicial). */
  bagCap: [50, 80, 120, 170, 240, 320],
  /** Custo para passar ao tamanho n (índice n-1). */
  bagUp: [
    { level: 2, coins: 80, items: { rope: 3 } },
    { level: 5, coins: 250, items: { basket: 2, rope: 4 } },
    { level: 9, coins: 700, items: { sack: 3, cloth: 2 } },
    { level: 14, coins: 1800, items: { cloth: 6, nails: 10 } },
    { level: 20, coins: 4500, items: { cloth: 12, metal_parts: 4 } },
  ] as { level: number; coins: number; items: Record<string, number> }[],
};
