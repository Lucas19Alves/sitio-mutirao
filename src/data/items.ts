// Catálogo de itens. Fonte única: o cliente importa daqui e o script
// scripts/gen-catalog-sql.mjs gera a cópia que o servidor usa para validar.

export type ItemCat = 'raw' | 'fruit' | 'crop' | 'flower' | 'product' | 'goods';

/** Forma do ícone procedural + cores. Ver src/game/art/icons.ts */
export interface IconSpec {
  s: string;
  c: string;
  c2?: string;
}

export interface ItemDef {
  id: string;
  name: string;
  cat: ItemCat;
  price: number;
  /** Nível da fazenda em que o item passa a aparecer em pedidos. */
  level: number;
  icon: IconSpec;
  desc?: string;
}

const i = (id: string, name: string, cat: ItemCat, price: number, level: number, s: string, c: string, c2?: string, desc?: string): ItemDef =>
  ({ id, name, cat, price, level, icon: { s, c, c2 }, desc });

export const ITEMS: ItemDef[] = [
  // Recursos naturais
  i('wood', 'Madeira', 'raw', 2, 1, 'log', '#a0673a', '#d9a766', 'Cortada de árvores com machado.'),
  i('fiber', 'Fibra', 'raw', 2, 1, 'fiber', '#8fbf4a', '#5d8a2a', 'Colhida de touceiras de capim.'),
  i('stone', 'Pedra', 'raw', 3, 2, 'stone', '#9aa0a6', '#6d7378', 'Precisa de picareta.'),
  i('hardwood', 'Madeira de Lei', 'raw', 6, 6, 'log', '#6b3f22', '#b07a4a', 'Árvores grandes do Bosque. Machado reforçado.'),
  i('herbs', 'Ervas', 'raw', 4, 6, 'leaf', '#4caf6a', '#2e7d4a'),
  i('mushroom', 'Cogumelo', 'raw', 5, 6, 'mushroom', '#d9534f', '#f5e6c8'),
  i('clay', 'Argila', 'raw', 4, 9, 'blob', '#c97b4a', '#9c5a32', 'Escavada na margem do rio com pá.'),
  i('sand', 'Areia', 'raw', 3, 9, 'pile', '#e8d39a', '#c9b26e'),
  i('coal', 'Carvão', 'raw', 5, 12, 'ore', '#3b3b40', '#5c5c66'),
  i('copper_ore', 'Minério de Cobre', 'raw', 6, 12, 'ore', '#b8733a', '#7a8a8f'),
  i('iron_ore', 'Minério de Ferro', 'raw', 8, 12, 'ore', '#8a6f63', '#a6a9ad'),
  i('petals', 'Pétalas', 'raw', 5, 17, 'petals', '#f28cb1', '#ffd1e3'),
  i('gold_ore', 'Minério de Ouro', 'raw', 18, 23, 'ore', '#e6b422', '#8d8f94'),
  i('crystal', 'Cristal', 'raw', 30, 23, 'crystal', '#7fd6ff', '#c8f0ff'),

  // Frutas do pomar
  i('apple', 'Maçã', 'fruit', 5, 3, 'fruit', '#e53935', '#4caf50'),
  i('orange', 'Laranja', 'fruit', 6, 3, 'fruit', '#fb8c00', '#4caf50'),
  i('peach', 'Pêssego', 'fruit', 8, 5, 'fruit', '#ffab91', '#66bb6a'),

  // Cultivos
  i('wheat', 'Trigo', 'crop', 2, 1, 'grain', '#e6c34a', '#b8902a'),
  i('carrot', 'Cenoura', 'crop', 4, 2, 'root', '#f57c00', '#43a047'),
  i('corn', 'Milho', 'crop', 5, 4, 'corn', '#fdd835', '#7cb342'),
  i('tomato', 'Tomate', 'crop', 6, 5, 'fruit', '#e53935', '#2e7d32'),
  i('potato', 'Batata', 'crop', 5, 6, 'potato', '#c8a165', '#9c7a45'),
  i('cotton', 'Algodão', 'crop', 9, 8, 'cotton', '#fafafa', '#8d6e63'),
  i('strawberry', 'Morango', 'crop', 12, 11, 'berry', '#e53950', '#43a047'),
  i('sunflower', 'Girassol', 'flower', 12, 14, 'flower', '#fbc02d', '#6d4c41'),
  i('grape', 'Uva', 'crop', 12, 16, 'grape', '#7b3fa0', '#558b2f'),
  i('rose', 'Rosa', 'flower', 14, 17, 'flower', '#e91e63', '#ad1457'),
  i('tulip', 'Tulipa', 'flower', 16, 19, 'tulip', '#ff7043', '#43a047'),
  i('lavender', 'Lavanda', 'flower', 15, 21, 'lavender', '#9575cd', '#5e35b1'),
  i('pumpkin', 'Abóbora', 'crop', 35, 19, 'pumpkin', '#ef6c00', '#6d8a2a'),

  // Produtos processados
  i('rope', 'Corda', 'product', 9, 1, 'rope', '#c8a46e', '#8d6e44'),
  i('basket', 'Cesto', 'product', 18, 2, 'basket', '#c99a5b', '#8a6236'),
  i('plank', 'Tábua', 'product', 7, 2, 'plank', '#d9a766', '#a0673a'),
  i('beam', 'Viga', 'product', 17, 7, 'beam', '#9c6a3c', '#6b3f22'),
  i('flour', 'Farinha', 'product', 10, 3, 'sack', '#f3ead7', '#c9b28a'),
  i('cornmeal', 'Fubá', 'product', 14, 4, 'sack', '#f9d65c', '#c9a43a'),
  i('bread', 'Pão', 'goods', 30, 5, 'bread', '#d08a3c', '#f1c27d'),
  i('carrot_cake', 'Bolo de Cenoura', 'goods', 50, 6, 'cake', '#f57c00', '#6d4c41'),
  i('corn_cake', 'Bolo de Fubá', 'goods', 48, 7, 'cake', '#fdd835', '#c9a43a'),
  i('apple_pie', 'Torta de Maçã', 'goods', 58, 9, 'pie', '#d08a3c', '#e53935'),
  i('pumpkin_pie', 'Torta de Abóbora', 'goods', 100, 20, 'pie', '#d08a3c', '#ef6c00'),
  i('orange_juice', 'Suco de Laranja', 'goods', 24, 7, 'bottle', '#fb8c00', '#fff3e0'),
  i('tomato_sauce', 'Molho de Tomate', 'goods', 26, 7, 'jar', '#c62828', '#ffcdd2'),
  i('veggie_soup', 'Sopa de Legumes', 'goods', 40, 8, 'bowl', '#e67e22', '#8d6e63'),
  i('mushroom_soup', 'Sopa de Cogumelos', 'goods', 42, 9, 'bowl', '#c8a165', '#8d6e63'),
  i('herbal_tea', 'Chá de Ervas', 'goods', 18, 7, 'cup', '#66bb6a', '#efebe9'),
  i('peach_jam', 'Compota de Pêssego', 'goods', 36, 8, 'jar', '#ffab91', '#fff3e0'),
  i('jam', 'Geleia de Morango', 'goods', 50, 11, 'jar', '#d81b60', '#fce4ec'),
  i('chair', 'Cadeira', 'goods', 32, 6, 'chair', '#b07a4a', '#7a4f2a'),
  i('crate', 'Caixote', 'goods', 30, 6, 'crate', '#c99a5b', '#8a6236'),
  i('table', 'Mesa', 'goods', 58, 7, 'table', '#a0673a', '#6b3f22'),
  i('cabinet', 'Armário', 'goods', 130, 15, 'cabinet', '#8d5a33', '#5d3a1f'),
  i('thread', 'Fio', 'product', 24, 8, 'spool', '#fafafa', '#a1887f'),
  i('cloth', 'Tecido', 'product', 60, 9, 'cloth', '#64b5f6', '#1e88e5'),
  i('sack', 'Saco de Juta', 'goods', 40, 9, 'sack', '#c8a46e', '#8d6e44'),
  i('brick', 'Tijolo', 'product', 12, 10, 'brick', '#c0563a', '#8a3a25'),
  i('clay_pot', 'Vaso de Barro', 'goods', 18, 10, 'pot', '#c97b4a', '#9c5a32'),
  i('vase', 'Jarro Decorado', 'goods', 70, 18, 'vase', '#4f8fc0', '#e91e63'),
  i('copper_ingot', 'Lingote de Cobre', 'product', 30, 12, 'ingot', '#d9823b', '#a85a20'),
  i('iron_ingot', 'Lingote de Ferro', 'product', 40, 12, 'ingot', '#9ea7ad', '#6d767c'),
  i('gold_ingot', 'Lingote de Ouro', 'product', 80, 23, 'ingot', '#f2c230', '#b88a10'),
  i('nails', 'Pregos', 'product', 12, 13, 'nails', '#9ea7ad', '#5d666c'),
  i('metal_parts', 'Peças Metálicas', 'product', 90, 13, 'gear', '#9ea7ad', '#d9823b'),
  i('glass', 'Vidro', 'product', 22, 14, 'glass', '#b3e5fc', '#4fc3f7'),
  i('jar', 'Pote de Vidro', 'product', 30, 14, 'jar', '#b3e5fc', '#e1f5fe'),
  i('lamp', 'Lampião', 'goods', 165, 23, 'lamp', '#f9a825', '#5d666c'),
  i('sunflower_oil', 'Óleo de Girassol', 'goods', 48, 14, 'bottle', '#fbc02d', '#fff8e1'),
  i('grape_juice', 'Suco de Uva', 'goods', 64, 16, 'bottle', '#6a1b9a', '#f3e5f5'),
  i('honey', 'Mel', 'goods', 55, 18, 'jar', '#ffb300', '#fff8e1'),
  i('lavender_honey', 'Mel de Lavanda', 'goods', 80, 21, 'jar', '#b39ddb', '#fff8e1'),
  i('bouquet', 'Buquê', 'goods', 85, 19, 'bouquet', '#e91e63', '#ff7043'),
  i('perfume', 'Perfume', 'goods', 95, 21, 'perfume', '#ce93d8', '#b3e5fc'),
  i('cart', 'Carroça', 'goods', 420, 20, 'cart', '#a0673a', '#5d666c'),
  i('music_box', 'Caixinha de Música', 'goods', 320, 23, 'musicbox', '#8d5a33', '#f2c230'),
  i('ring', 'Anel de Cristal', 'goods', 260, 24, 'ring', '#f2c230', '#7fd6ff'),
  i('necklace', 'Colar Real', 'goods', 400, 26, 'necklace', '#f2c230', '#7fd6ff'),

  // v1.3 — pesca, pastagem, cafezal e mata
  i('fish', 'Lambari', 'raw', 6, 13, 'blob', '#9cc6e0', '#5d8aa8', 'Pescado no Lago das Garças com vara de pescar.'),
  i('big_fish', 'Tilápia', 'raw', 14, 17, 'blob', '#7fa6c2', '#e57373', 'Peixe graúdo das águas fundas. Precisa de vara melhor.'),
  i('banana', 'Banana', 'fruit', 5, 18, 'root', '#f6d84a', '#8d6e3f', 'Cachos das bananeiras do cafezal.'),
  i('cocoa', 'Cacau', 'fruit', 6, 18, 'fruit', '#a0522d', '#5d4037', 'Fruto do cacaueiro. Vira chocolate.'),
  i('acai', 'Açaí', 'fruit', 7, 25, 'berry', '#4a2c5e', '#7b4b94', 'Colhido das palmeiras da Mata da Cachoeira.'),
  i('bamboo', 'Bambu', 'raw', 7, 25, 'log', '#a5c36a', '#6f8f3a', 'Varas de bambu da mata. Leves e resistentes.'),
  i('oat', 'Aveia', 'crop', 4, 10, 'grain', '#d9c38a', '#a68b4f', 'Plantada no Campo de Aveia. Vira ração.'),
  i('cassava', 'Mandioca', 'crop', 5, 11, 'root', '#d7b98e', '#8d5a33', 'Raiz da roça de mandioca.'),
  i('sugarcane', 'Cana-de-açúcar', 'crop', 5, 12, 'grain', '#9ccc65', '#558b2f', 'Cortada com foice no Canavial.'),
  i('coffee', 'Café em grão', 'crop', 8, 18, 'berry', '#c0392b', '#5d4037', 'Grãos vermelhos do cafezal.'),
  i('feed', 'Ração', 'product', 7, 10, 'pile', '#d9c38a', '#a68b4f', 'Aveia moída para as galinhas e as vacas.'),
  i('egg', 'Ovo caipira', 'product', 14, 10, 'blob', '#fff3e0', '#f6c445', 'Do galinheiro, quentinho.'),
  i('milk', 'Leite', 'product', 26, 11, 'bottle', '#ffffff', '#90caf9', 'Tirado no estábulo.'),
  i('cheese', 'Queijo minas', 'goods', 118, 13, 'cake', '#f6e7a1', '#e0c060', 'Curado no laticínio.'),
  i('butter', 'Manteiga', 'product', 79, 13, 'brick', '#ffe082', '#f6c445', 'Batida no laticínio.'),
  i('yogurt', 'Iogurte de morango', 'goods', 96, 14, 'cup', '#f8bbd0', '#e5394f'),
  i('sugar', 'Açúcar', 'product', 25, 12, 'pile', '#ffffff', '#e0e0e0', 'Do engenho de cana.'),
  i('rapadura', 'Rapadura', 'goods', 37, 13, 'brick', '#a0673a', '#6d4c41'),
  i('cassava_flour', 'Farinha de mandioca', 'product', 25, 11, 'sack', '#f0e2c0', '#c9a96e'),
  i('tapioca', 'Tapioca', 'goods', 75, 12, 'bowl', '#fffaf0', '#e8d7b0'),
  i('pao_de_queijo', 'Pão de queijo', 'goods', 258, 15, 'bread', '#f2c46d', '#d99a3c'),
  i('fried_fish', 'Peixe frito', 'goods', 66, 14, 'bowl', '#e0a85a', '#9cc6e0'),
  i('smoked_fish', 'Peixe defumado', 'goods', 61, 17, 'blob', '#8d5a33', '#5d4037'),
  i('moqueca', 'Moqueca', 'goods', 144, 19, 'bowl', '#e2574c', '#f6c445'),
  i('roasted_coffee', 'Café torrado', 'product', 40, 19, 'sack', '#5d4037', '#3e2723'),
  i('cafe_com_leite', 'Café com leite', 'goods', 130, 20, 'cup', '#c8a27a', '#ffffff'),
  i('chocolate', 'Chocolate', 'product', 71, 20, 'brick', '#5d4037', '#3e2723'),
  i('brigadeiro', 'Brigadeiro', 'goods', 248, 21, 'berry', '#4e342e', '#f06292'),
  i('banana_cake', 'Bolo de banana', 'goods', 100, 20, 'cake', '#f6d84a', '#a0673a'),
  i('bamboo_flute', 'Flauta de bambu', 'goods', 41, 26, 'rope', '#a5c36a', '#6f8f3a'),
  i('bamboo_lamp', 'Luminária de bambu', 'goods', 84, 27, 'lamp', '#a5c36a', '#fff3c4'),
  i('acai_bowl', 'Tigela de açaí', 'goods', 88, 27, 'bowl', '#6a1b9a', '#f6d84a'),
  // v1.5 — Serra da Neblina e Várzea dos Ipês
  i('pinhao', 'Pinhão', 'fruit', 7, 30, 'root', '#8d4f2b', '#d7b98e', 'Semente da araucária, colhida na serra.'),
  i('erva_mate', 'Erva-mate', 'crop', 6, 31, 'leaf', '#6b8e23', '#33691e', 'Folhas do ervatal da serra.'),
  i('ipe_wood', 'Madeira de ipê', 'raw', 12, 34, 'log', '#7b4a2b', '#e6b23a', 'Madeira nobre dos ipês da várzea.'),
  i('pinhao_cozido', 'Pinhão cozido', 'goods', 45, 30, 'bowl', '#8d4f2b', '#d7b98e'),
  i('pacoca_pinhao', 'Paçoca de pinhão', 'goods', 108, 31, 'cake', '#c9a96e', '#8d4f2b'),
  i('chimarrao', 'Chimarrão', 'goods', 59, 32, 'cup', '#6b8e23', '#8d6e63'),
  i('viola', 'Viola caipira', 'goods', 276, 35, 'musicbox', '#7b4a2b', '#f2c230'),
  i('rabeca', 'Rabeca', 'goods', 247, 36, 'musicbox', '#a0522d', '#fff8e1'),
];

export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((x) => [x.id, x]));
