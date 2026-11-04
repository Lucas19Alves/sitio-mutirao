// Missões. A campanha principal é um grafo (DAG): cada missão aparece quando as anteriores foram
// concluídas e se completa pelo estado REAL da fazenda (prédio construído, campo aberto, região
// liberada…). Se a fazenda já cumpriu o objetivo, a missão já nasce pronta para receber.
// Secundárias, diárias e cooperativas são geradas no servidor a partir do que está desbloqueado.

export type Goal =
  | { k: 'stat'; key: string; n: number }          // contador da fazenda (h:item, c:item, orders, plant, deposit…)
  | { k: 'built'; b: string; lv: number }
  | { k: 'tool'; tool: string; tier: number }
  | { k: 'region'; r: string }
  | { k: 'level'; n: number }
  | { k: 'field'; f: string; lv: number }
  | { k: 'obs'; o: string }
  | { k: 'bag'; tier: number }                      // algum membro com mochila deste tamanho
  | { k: 'pets'; n: number };                       // pets na fazenda (somando membros)

export interface Reward { coins: number; xp: number; cr?: number }
export interface MainMission { id: string; title: string; desc: string; goal: Goal; after: string[]; r: Reward; unlocks: string }

const m = (id: string, after: string[], title: string, desc: string, goal: Goal, coins: number, xp: number, cr = 0, unlocks = ''): MainMission =>
  ({ id, after, title, desc, goal, r: { coins, xp, ...(cr ? { cr } : {}) }, unlocks });

export const MAIN: MainMission[] = [
  m('m01', [], 'Lenha para o fogão', 'Chegue perto das árvores do sítio e junte 6 madeiras.', { k: 'stat', key: 'h:wood', n: 6 }, 30, 10, 0, 'Guardar no Celeiro'),
  m('m02', ['m01'], 'Mochila no celeiro', 'Leve a mochila ao Celeiro e guarde 10 itens.', { k: 'stat', key: 'deposit', n: 10 }, 30, 10, 0, 'Bancada de Trabalho'),
  m('m03', ['m01'], 'Primeira colheita', 'Ande pelo Campo de Trigo: o plantio e a colheita são automáticos. Colha 6 trigos.', { k: 'stat', key: 'h:wheat', n: 6 }, 40, 12, 0, 'Clientes no balcão'),
  m('m04', ['m02'], 'Mãos à obra', 'Construa a Bancada de Trabalho entregando madeira na obra.', { k: 'built', b: 'workbench', lv: 1 }, 60, 20, 2, 'Cordas e cestos'),
  m('m05', ['m03'], 'Freguesia', 'Atenda 3 clientes no Balcão de Atendimento.', { k: 'stat', key: 'orders', n: 3 }, 60, 20, 1, 'Horta de Raízes'),
  m('m06', ['m04'], 'Nó de marinheiro', 'Produza 4 cordas na Bancada.', { k: 'stat', key: 'c:rope', n: 4 }, 50, 15, 0, 'Mochila maior'),
  m('m07', ['m06'], 'Carregar mais', 'Melhore sua mochila na Casa da Fazenda.', { k: 'bag', tier: 1 }, 60, 20, 1, 'Estrada do pomar'),
  m('m08', ['m05'], 'Horta de Raízes', 'Abra a Horta de Raízes ao lado do trigo.', { k: 'field', f: 'carrot', lv: 1 }, 80, 25, 0, 'Cenouras para os clientes'),
  m('m09', ['m07', 'm08'], 'A árvore caída', 'Corte o tronco que bloqueia a estrada do pomar.', { k: 'region', r: 'pomar' }, 120, 40, 3, 'Pomar, Horta de Tomates'),
  m('m10', ['m04'], 'Serra afiada', 'Construa a Serraria.', { k: 'built', b: 'sawmill', lv: 1 }, 100, 30, 0, 'Tábuas'),
  m('m11', ['m10'], 'Tábuas de sobra', 'Produza 15 tábuas na Serraria.', { k: 'stat', key: 'c:plank', n: 15 }, 90, 25, 0, 'Celeiro maior'),
  m('m12', ['m09'], 'Milharal', 'Abra o Milharal no sítio.', { k: 'field', f: 'corn', lv: 1 }, 100, 30, 0, 'Moinho'),
  m('m13', ['m12'], 'O moinho', 'Construa o Moinho para moer trigo e milho.', { k: 'built', b: 'mill', lv: 1 }, 120, 35, 0, 'Padaria'),
  m('m14', ['m13'], 'Cheiro de pão', 'Construa a Padaria.', { k: 'built', b: 'bakery', lv: 1 }, 150, 40, 2, 'Pão para os clientes'),
  m('m15', ['m14'], 'Fornada', 'Asse 5 pães na Padaria.', { k: 'stat', key: 'c:bread', n: 5 }, 140, 40, 0, 'Bosque'),
  m('m16', ['m09'], 'Horta de Tomates', 'Construa o Poço e abra a Horta de Tomates no pomar.', { k: 'field', f: 'tomato', lv: 1 }, 120, 35, 0, 'Molho de tomate'),
  m('m17', ['m11'], 'Celeiro maior', 'Melhore o Celeiro para o nível 2.', { k: 'built', b: 'barn', lv: 2 }, 150, 40, 0, 'Ajudantes'),
  m('m18', ['m17'], 'Uma mão amiga', 'Contrate um ajudante na Casa da Fazenda.', { k: 'stat', key: 'hire', n: 1 }, 150, 40, 2, 'Produção automática'),
  m('m19', ['m14'], 'Um amigo de quatro patas', 'Adote um pet na Loja.', { k: 'pets', n: 1 }, 100, 30, 0, 'Bônus do pet'),
  m('m20', ['m15'], 'Mato fechado', 'Ceife os espinheiros e abra a trilha do bosque.', { k: 'region', r: 'bosque' }, 200, 60, 3, 'Bosque, Campo de Batatas'),
  m('m21', ['m20'], 'Campo de Batatas', 'Abra o Campo de Batatas no bosque.', { k: 'field', f: 'potato', lv: 1 }, 150, 45, 0, 'Sopa de legumes'),
  m('m22', ['m20'], 'Galpão de ferramentas', 'Construa o Galpão de Ferramentas.', { k: 'built', b: 'toolshed', lv: 1 }, 160, 45, 0, 'Ferramentas melhores'),
  m('m23', ['m22'], 'Machado reforçado', 'Fabrique o Machado Reforçado.', { k: 'tool', tool: 'axe', tier: 2 }, 160, 45, 0, 'Madeira de lei'),
  m('m24', ['m23', 'm11'], 'O barranco caiu', 'Cave o deslizamento e libere a estrada do rio.', { k: 'region', r: 'rio' }, 300, 80, 4, 'Margem do Rio, Algodoal'),
  m('m25', ['m24'], 'Pontes do rio', 'Reconstrua as pontes para chegar à margem sul.', { k: 'obs', o: 'pontes' }, 250, 70, 3, 'Aboboral (margem sul)'),
  m('m26', ['m24'], 'Algodoal', 'Abra o Algodoal na margem do rio.', { k: 'field', f: 'cotton', lv: 1 }, 180, 50, 0, 'Tecelagem'),
  m('m27', ['m26'], 'Fios e tecidos', 'Construa a Tecelagem.', { k: 'built', b: 'weaving', lv: 1 }, 220, 60, 0, 'Colinas'),
  m('m28', ['m24'], 'Balcão movimentado', 'Atenda 25 clientes no total.', { k: 'stat', key: 'orders', n: 25 }, 250, 70, 2, 'Vinhedo'),
  m('m29', ['m28'], 'Morangal', 'Abra o Morangal no pomar.', { k: 'field', f: 'strawberry', lv: 1 }, 300, 80, 0, 'Geleia'),
  m('m30', ['m27'], 'O portão das colinas', 'Conserte o portão enferrujado das colinas.', { k: 'region', r: 'colinas' }, 400, 110, 4, 'Colinas, minérios'),
  m('m31', ['m30'], 'Ferraria', 'Construa a Ferraria.', { k: 'built', b: 'smithy', lv: 1 }, 350, 90, 0, 'Peças de metal'),
  m('m32', ['m30'], 'Girassóis', 'Abra o Campo de Girassóis nas colinas.', { k: 'field', f: 'sunflower', lv: 1 }, 350, 90, 0, 'Óleo de girassol'),
  m('m33', ['m29'], 'Vinhedo', 'Abra o Vinhedo no pomar.', { k: 'field', f: 'grape', lv: 1 }, 400, 100, 0, 'Suco de uva'),
  m('m34', ['m31', 'm33'], 'O caminhão do vale', 'Tire o caminhão quebrado da subida do vale.', { k: 'region', r: 'vale' }, 600, 150, 5, 'Vale das Flores'),
  m('m35', ['m34'], 'Jardim de Flores', 'Abra o Jardim de Flores no vale.', { k: 'field', f: 'flowers', lv: 1 }, 400, 100, 0, 'Buquês e perfume'),
  m('m36', ['m34', 'm25'], 'Aboboral', 'Abra o Aboboral na margem sul do rio.', { k: 'field', f: 'pumpkin', lv: 1 }, 450, 110, 0, 'Torta de abóbora'),
  m('m37', ['m35'], 'A Grande Oficina', 'Construa a Grande Oficina nas colinas.', { k: 'built', b: 'great_workshop', lv: 1 }, 700, 180, 4, 'Planalto'),
  m('m38', ['m37'], 'O barco abandonado', 'Recupere o barco e atravesse a passagem alagada do planalto.', { k: 'region', r: 'planalto' }, 900, 220, 6, 'Planalto, ouro e cristais'),
  m('m39', ['m38'], 'Joalheria', 'Construa a Joalheria no planalto.', { k: 'built', b: 'jewelry', lv: 1 }, 1000, 250, 5, 'Joias'),
  m('m40', ['m39'], 'Fazenda completa', 'Leve a fazenda ao nível 30.', { k: 'level', n: 30 }, 2000, 0, 10, 'Título de Fazenda Mestre'),
];

export const MAIN_BY_ID = Object.fromEntries(MAIN.map((x) => [x.id, x])) as Record<string, MainMission>;

/** Tipos de missões geradas (secundárias, diárias, cooperativas) e seus textos. */
export const GEN_LABEL: Record<string, string> = { h: 'Colete', c: 'Produza', orders: 'Atenda clientes', plant: 'Plante canteiros', deposit: 'Guarde itens no celeiro', sold: 'Venda itens no mercado' };
