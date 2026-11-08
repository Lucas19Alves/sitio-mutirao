// Aparência dos personagens (salva em profiles.character_config). O modelo 3D que usa estes
// dados está em src/game/three/kit/character.ts.

export interface Look { body: number; skin: number; hair: number; hairColor: number; shirt: number; shirtColor: number; pants: number; hat: number; hatColor: number; acc: number; shoes: number; eyes: number; face: number; legs: number }

export const BODIES = ['Masculino', 'Feminino'];
export const SHOE_COLORS = ['#6a442a', '#2f2a26', '#f6f1e4', '#c8433a', '#3a78c2', '#e0a81c'];

export const SKINS = ['#f8d8bd', '#eebd95', '#d49c6c', '#b5794b', '#8c5732', '#603b22', '#fbe3cf', '#4a2c19'];
export const HAIR_STYLES = ['Curto', 'Cacheado', 'Rabo de cavalo', 'Tranças', 'Raspado', 'Black power', 'Coque', 'Moicano', 'Longo solto', 'Franja', 'Maria-chiquinha'];
export const HAIR_COLORS = ['#2b1d14', '#5a3820', '#9a5b2e', '#d9a441', '#ecdcae', '#b8432f', '#7d8a96', '#f2f0ea', '#e57fa8', '#4a7bd0', '#3f9b6a', '#8e5cc0'];
export const SHIRT_STYLES = ['Camiseta', 'Xadrez', 'Macacão', 'Regata', 'Vestido', 'Moletom', 'Colete'];
export const CLOTH_COLORS = ['#dd4b50', '#3474c0', '#43a058', '#f4b83a', '#9152b8', '#ec8530', '#24447e', '#f7f6ef', '#ef97b7', '#575757', '#2bb3a6', '#a3d977', '#c0392b', '#6d4c41'];
export const PANTS_COLORS = ['#35548a', '#5f4938', '#456a40', '#2a2f38', '#a76d3e', '#7f3541'];
export const HATS = ['Nenhum', 'Chapéu de palha', 'Boné', 'Lenço', 'Chapéu com flor', 'Gorro', 'Chapéu de vaqueiro', 'Boina', 'Coroa de flores'];
export const ACCESSORIES = ['Nenhum', 'Óculos', 'Lenço no pescoço', 'Mochila', 'Avental', 'Brincos', 'Cachecol', 'Flor no cabelo'];
export const EYES = ['Redondos', 'Felizes', 'Sonolentos', 'Grandes', 'Com cílios'];
export const FACES = ['Nada', 'Sardas', 'Bochechas', 'Bigode', 'Barba', 'Cavanhaque'];
export const LEGS = ['Calça', 'Bermuda', 'Saia'];

export const DEFAULT_LOOK: Look = { body: 0, skin: 1, hair: 0, hairColor: 1, shirt: 0, shirtColor: 0, pants: 0, hat: 1, hatColor: 3, acc: 0, shoes: 0, eyes: 0, face: 0, legs: 0 };

export const LOOK_LIMITS: Record<keyof Look, number> = {
  body: 2, shoes: 6, eyes: EYES.length, face: FACES.length, legs: LEGS.length,
  skin: SKINS.length, hair: HAIR_STYLES.length, hairColor: HAIR_COLORS.length, shirt: SHIRT_STYLES.length,
  shirtColor: CLOTH_COLORS.length, pants: PANTS_COLORS.length, hat: HATS.length, hatColor: CLOTH_COLORS.length, acc: ACCESSORIES.length,
};

/** Normaliza o que vem do banco (pode ser {} ou ter valores fora do intervalo). */
export function normalizeLook(raw: unknown): Look {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_LOOK };
  for (const k of Object.keys(LOOK_LIMITS) as (keyof Look)[]) {
    const v = Number(o[k]);
    if (Number.isInteger(v) && v >= 0 && v < LOOK_LIMITS[k]) out[k] = v;
  }
  return out;
}

export const lookKey = (l: Look) => Object.values(l).join('-');
