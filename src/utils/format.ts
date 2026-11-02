export const fmt = (n: number) => n.toLocaleString('pt-BR');
export function fmtTime(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  return r ? `${m}min ${r}s` : `${m}min`;
}
