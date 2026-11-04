// Pets, melhorias do personagem, cosméticos e aceleração. Preços em moedas da fazenda (`coins`)
// ou cristais (`cr`, moeda rara ganha jogando: missões, marcos, diárias, clientes especiais).

export type PetAbility = 'gather' | 'harvest' | 'coins' | 'xp' | 'find';
export interface PetDef {
  id: string; name: string; species: string; rarity: 'comum' | 'incomum' | 'raro' | 'épico';
  level: number; price: { coins?: number; cr?: number };
  ability: PetAbility; values: number[]; // efeito por nível do pet (1..5)
  persona: string; color: string; color2: string;
}

export const PET_LEVELS = [0, 25, 75, 160, 300]; // xp acumulado para cada nível
export const petLevel = (xp: number) => PET_LEVELS.reduce((lv, need, i) => (xp >= need ? i + 1 : lv), 1);
export const ABILITY_TEXT: Record<PetAbility, (v: number) => string> = {
  gather: (v) => `${Math.round(v * 100)}% de chance de +1 ao coletar recursos`,
  harvest: (v) => `${Math.round(v * 100)}% de chance de +1 ao colher`,
  coins: (v) => `+${Math.round(v * 100)}% de moedas dos clientes`,
  xp: (v) => `+${Math.round(v * 100)}% de XP dos clientes`,
  find: (v) => `${Math.round(v * 100)}% de chance de achar 1 cristal ao atender`,
};

export const PETS: PetDef[] = [
  { id: 'dog', name: 'Totó', species: 'Cachorro', rarity: 'comum', level: 5, price: { coins: 450 }, ability: 'gather', values: [0.08, 0.11, 0.14, 0.17, 0.2], persona: 'Fareja madeira e pedra boa.', color: '#c98b4a', color2: '#f3e3c3' },
  { id: 'cat', name: 'Mimi', species: 'Gata', rarity: 'comum', level: 7, price: { coins: 650 }, ability: 'coins', values: [0.04, 0.06, 0.08, 0.1, 0.12], persona: 'Encanta a freguesia do balcão.', color: '#9aa0a6', color2: '#f7f6ef' },
  { id: 'rabbit', name: 'Pipoca', species: 'Coelho', rarity: 'comum', level: 9, price: { coins: 900 }, ability: 'harvest', values: [0.08, 0.11, 0.14, 0.17, 0.2], persona: 'Sabe onde estão as melhores cenouras.', color: '#f4efe6', color2: '#f2a7b5' },
  { id: 'duck', name: 'Quaquá', species: 'Pato', rarity: 'incomum', level: 12, price: { coins: 1500 }, ability: 'xp', values: [0.06, 0.09, 0.12, 0.15, 0.18], persona: 'Puxa conversa com todo cliente.', color: '#fbfaf4', color2: '#f2a62c' },
  { id: 'hen', name: 'Dona Pintada', species: 'Galinha especial', rarity: 'raro', level: 10, price: { cr: 12 }, ability: 'harvest', values: [0.12, 0.16, 0.2, 0.24, 0.28], persona: 'Cisca a horta e acha o que sobrou.', color: '#7a4a2a', color2: '#f6f1e4' },
  { id: 'fox', name: 'Ruivo', species: 'Raposa', rarity: 'raro', level: 15, price: { cr: 20 }, ability: 'find', values: [0.04, 0.05, 0.06, 0.08, 0.1], persona: 'Some e volta com algo brilhante.', color: '#e07a35', color2: '#fbfaf4' },
  { id: 'owl', name: 'Sábia', species: 'Coruja', rarity: 'épico', level: 20, price: { cr: 35 }, ability: 'gather', values: [0.16, 0.2, 0.24, 0.28, 0.32], persona: 'Do alto, aponta os melhores veios.', color: '#8a6a4a', color2: '#e9dcc4' },
];
export const PET_BY_ID = Object.fromEntries(PETS.map((p) => [p.id, p])) as Record<string, PetDef>;

/** Melhorias do personagem (de cada jogador; pagas com o caixa da fazenda). */
export interface PerkDef { id: 'spd' | 'gat'; name: string; desc: string; per: number; levels: { level: number; coins: number }[] }
export const PERKS: PerkDef[] = [
  { id: 'spd', name: 'Botas de caminhada', desc: 'Anda mais rápido', per: 0.07, levels: [{ level: 3, coins: 250 }, { level: 8, coins: 900 }, { level: 15, coins: 2600 }] },
  { id: 'gat', name: 'Luvas de trabalho', desc: 'Trabalha mais rápido (cortar, minerar, colher)', per: 0.15, levels: [{ level: 4, coins: 350 }, { level: 10, coins: 1200 }, { level: 18, coins: 3200 }] },
];
export const PERK_BY_ID = Object.fromEntries(PERKS.map((p) => [p.id, p])) as Record<string, PerkDef>;

/** Cosméticos que precisam ser comprados (o resto do editor é livre). */
export interface CosmeticDef { id: string; f: 'hat' | 'acc' | 'shoes' | 'hair'; v: number; name: string; price: { coins?: number; cr?: number }; level: number }
export const COSMETICS: CosmeticDef[] = [
  { id: 'hat4', f: 'hat', v: 4, name: 'Chapéu com flor', price: { cr: 3 }, level: 3 },
  { id: 'hat5', f: 'hat', v: 5, name: 'Gorro', price: { coins: 300 }, level: 4 },
  { id: 'acc1', f: 'acc', v: 1, name: 'Óculos', price: { coins: 200 }, level: 3 },
  { id: 'acc2', f: 'acc', v: 2, name: 'Lenço no pescoço', price: { coins: 150 }, level: 2 },
  { id: 'acc3', f: 'acc', v: 3, name: 'Mochila colorida', price: { cr: 4 }, level: 6 },
  { id: 'shoes3', f: 'shoes', v: 3, name: 'Botas vermelhas', price: { coins: 250 }, level: 5 },
  { id: 'shoes4', f: 'shoes', v: 4, name: 'Tênis azul', price: { coins: 400 }, level: 8 },
  { id: 'shoes5', f: 'shoes', v: 5, name: 'Botas douradas', price: { cr: 6 }, level: 12 },
];
export const COSMETIC_OF = (f: string, v: number) => COSMETICS.find((c) => c.f === f && c.v === v);

/** Aceleração: 1 cristal a cada 3 min restantes; esperas curtas (até 60 s) podem ser pagas em moedas. */
export const RUSH = { msPerCrystal: 180_000, coinsMaxMs: 60_000, coinsPerSec: 2 };
export const rushCost = (ms: number) => (ms <= RUSH.coinsMaxMs ? { coins: Math.max(1, Math.ceil(ms / 1000) * RUSH.coinsPerSec) } : { cr: Math.max(1, Math.ceil(ms / RUSH.msPerCrystal)) });
