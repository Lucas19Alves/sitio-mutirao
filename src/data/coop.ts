// Recursos cooperativos: Sino do Mutirão (bônus de colheita para todos por alguns minutos) e
// Feira da Vila (meta semanal da fazenda inteira, com três faixas de prêmio).

export const COOP = {
  bell: { level: 3, ms: 10 * 60_000, cooldown: 3 * 3600_000, chance: 0.35 },
  fair: {
    base: 300, perLevel: 120,
    tiers: [
      { pct: 0.35, coins: 150, perLevel: 10, cr: 2, rep: 2, xp: 40, name: 'Barraca enfeitada' },
      { pct: 0.7, coins: 300, perLevel: 20, cr: 3, rep: 3, xp: 80, name: 'Fita de prata' },
      { pct: 1, coins: 600, perLevel: 40, cr: 5, rep: 5, xp: 160, name: 'Faixa de ouro' },
    ],
  },
};

/** Sinais rápidos no mapa (só em tempo real, nada vai para o banco). */
export const PINGS: { k: string; icon: string; text: string }[] = [
  { k: 'here', icon: '📍', text: 'Vem cá!' },
  { k: 'help', icon: '🙋', text: 'Preciso de ajuda aqui' },
  { k: 'harvest', icon: '🌾', text: 'Bora colher!' },
  { k: 'build', icon: '🔨', text: 'Vamos terminar a obra!' },
  { k: 'thanks', icon: '💛', text: 'Valeu, equipe!' },
];
