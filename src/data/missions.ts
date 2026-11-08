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
  // v1.3 — Pastagem
  m('m41', ['m25'], 'A porteira da pastagem', 'Atravesse as pontes e solte a porteira emperrada da Pastagem.', { k: 'region', r: 'pasto' }, 350, 90, 4, 'Pastagem, galinheiro e estábulo'),
  m('m42', ['m41'], 'Campo de Aveia', 'Abra o Campo de Aveia: é a comida dos bichos.', { k: 'field', f: 'oat', lv: 1 }, 250, 70, 0, 'Ração no Moinho'),
  m('m43', ['m42'], 'Cocoricó!', 'Construa o Galinheiro.', { k: 'built', b: 'chicken_coop', lv: 1 }, 300, 80, 2, 'Ovos caipiras'),
  m('m44', ['m43'], 'Ovos fresquinhos', 'Junte 12 ovos no galinheiro.', { k: 'stat', key: 'c:egg', n: 12 }, 260, 70, 0, 'Estábulo'),
  m('m45', ['m43'], 'Muuu!', 'Construa o Estábulo para as vacas.', { k: 'built', b: 'dairy', lv: 1 }, 380, 90, 2, 'Leite'),
  m('m46', ['m45'], 'Roça de Mandioca', 'Abra a Roça de Mandioca.', { k: 'field', f: 'cassava', lv: 1 }, 300, 80, 0, 'Casa de Farinha'),
  m('m47', ['m46'], 'Casa de Farinha', 'Construa a Casa de Farinha.', { k: 'built', b: 'flour_house', lv: 1 }, 400, 100, 2, 'Farinha e tapioca'),
  m('m48', ['m45'], 'Do leite ao queijo', 'Construa o Laticínio.', { k: 'built', b: 'creamery', lv: 1 }, 500, 120, 3, 'Queijo, manteiga e iogurte'),
  m('m49', ['m47', 'm48'], 'Pão de queijo da vó', 'Asse 6 pães de queijo na Padaria.', { k: 'stat', key: 'c:pao_de_queijo', n: 6 }, 600, 150, 3, 'Clientes famintos'),
  m('m50', ['m46'], 'Canavial', 'Abra o Canavial e construa o Engenho.', { k: 'built', b: 'sugar_mill', lv: 1 }, 450, 110, 2, 'Açúcar e rapadura'),
  // Lago das Garças
  m('m51', ['m30'], 'Vara de pescar', 'Fabrique a Vara de Bambu Simples no Galpão.', { k: 'tool', tool: 'rod', tier: 1 }, 300, 80, 0, 'Pesca'),
  m('m52', ['m51'], 'A trilha do lago', 'Ceife a galhada e abra o Lago das Garças.', { k: 'region', r: 'lago' }, 500, 130, 4, 'Lago, peixes e peixaria'),
  m('m53', ['m52'], 'Primeira fisgada', 'Pesque 15 lambaris no lago.', { k: 'stat', key: 'h:fish', n: 15 }, 350, 90, 2, 'Peixaria'),
  m('m54', ['m53'], 'Peixaria', 'Construa a Peixaria na beira do lago.', { k: 'built', b: 'fishery', lv: 1 }, 600, 150, 3, 'Peixe frito e moqueca'),
  // Cafezal da Serra
  m('m55', ['m34'], 'O barranco da serra', 'Cave o barranco e abra o Cafezal da Serra.', { k: 'region', r: 'cafezal' }, 900, 220, 5, 'Café, banana e cacau'),
  m('m56', ['m55'], 'Cafezal', 'Abra o campo de café.', { k: 'field', f: 'coffee', lv: 1 }, 700, 170, 0, 'Torrefação'),
  m('m57', ['m56', 'm48'], 'Cheirinho de café', 'Construa a Torrefação.', { k: 'built', b: 'roastery', lv: 1 }, 900, 220, 3, 'Café com leite'),
  m('m58', ['m57', 'm50'], 'Doces da serra', 'Construa a Confeitaria.', { k: 'built', b: 'confectionery', lv: 1 }, 1000, 240, 4, 'Brigadeiro e bolo de banana'),
  m('m59', ['m58'], 'Festa de aniversário', 'Faça 10 brigadeiros.', { k: 'stat', key: 'c:brigadeiro', n: 10 }, 1200, 280, 4, 'Mata da Cachoeira'),
  // Mata da Cachoeira
  m('m60', ['m59', 'm38'], 'Rumo à cachoeira', 'Abra a trilha da Mata da Cachoeira.', { k: 'region', r: 'mata' }, 1600, 380, 6, 'Bambu e açaí'),
  m('m61', ['m60'], 'Ateliê de Bambu', 'Construa o Ateliê de Bambu.', { k: 'built', b: 'bamboo_shop', lv: 1 }, 1500, 350, 4, 'Flautas e luminárias'),
  m('m62', ['m61'], 'Açaí na tigela', 'Construa o Quiosque de Açaí.', { k: 'built', b: 'acai_bar', lv: 1 }, 1700, 380, 5, 'Tigelas de açaí'),
  // v1.5 — Serra da Neblina e Várzea dos Ipês
  m('m64', ['m55', 'm38'], 'A subida da serra', 'Abra uma passagem no muro de pedra da Serra da Neblina.', { k: 'region', r: 'serra' }, 2000, 450, 6, 'Araucárias e pinhão'),
  m('m65', ['m64'], 'Colheita de pinhão', 'Junte 30 pinhões das araucárias.', { k: 'stat', key: 'h:pinhao', n: 30 }, 1500, 360, 3, 'Casa do Pinhão'),
  m('m66', ['m65'], 'Casa do Pinhão', 'Construa a Casa do Pinhão.', { k: 'built', b: 'casa_pinhao', lv: 1 }, 2500, 520, 5, 'Pinhão cozido e paçoca'),
  m('m67', ['m66'], 'Ervatal', 'Abra o Ervatal e prepare 8 chimarrões.', { k: 'stat', key: 'c:chimarrao', n: 8 }, 2600, 540, 5, 'Várzea dos Ipês'),
  m('m68', ['m67', 'm62'], 'O ipê tombado', 'Corte o ipê caído e abra a Várzea dos Ipês.', { k: 'region', r: 'varzea' }, 3500, 700, 8, 'Ipês e a lagoa'),
  m('m69', ['m68'], 'Luthieria', 'Construa a Luthieria na várzea.', { k: 'built', b: 'luthier', lv: 1 }, 3800, 760, 6, 'Violas e rabecas'),
  m('m70', ['m69'], 'Moda de viola', 'Faça 5 violas caipiras.', { k: 'stat', key: 'c:viola', n: 5 }, 4500, 900, 10, 'Festa no terreiro'),
  m('m63', ['m62', 'm40'], 'Lenda do Mutirão', 'Leve a fazenda ao nível 40.', { k: 'level', n: 40 }, 5000, 0, 20, 'Título de Lenda do Mutirão'),
];

export const MAIN_BY_ID = Object.fromEntries(MAIN.map((x) => [x.id, x])) as Record<string, MainMission>;

/** Tipos de missões geradas (secundárias, diárias, cooperativas) e seus textos. */
export const GEN_LABEL: Record<string, string> = { h: 'Colete', c: 'Produza', orders: 'Atenda clientes', plant: 'Plante canteiros', deposit: 'Guarde itens no celeiro', sold: 'Venda itens no mercado' };
