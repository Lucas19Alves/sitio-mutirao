// Preferências visuais do aparelho (qualidade, movimento, joystick). Ficam só no navegador,
// como as de som: não fazem parte do progresso (que vive no Supabase).
export type Quality = 'high' | 'medium' | 'low';

const load = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem storage */ } };
const prefersReduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

let quality = load('sm-quality', 'high') as Quality;
let effects = load('sm-effects', '1') === '1';
let reduceMotion = load('sm-reduce', prefersReduced() ? '1' : '0') === '1';
let joystick = load('sm-joy', coarse() ? '1' : '0') === '1';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export const gfx = {
  get quality() { return quality; },
  get effects() { return effects; },
  get reduceMotion() { return reduceMotion; },
  get joystick() { return joystick; },
  /** Multiplicador de densidade do ambiente (decoração, bichos, partículas). */
  get density() { return quality === 'high' ? 1 : quality === 'medium' ? 0.6 : 0.3; },
  setQuality(q: Quality) { quality = q; save('sm-quality', q); emit(); },
  setEffects(v: boolean) { effects = v; save('sm-effects', v ? '1' : '0'); emit(); },
  setReduceMotion(v: boolean) { reduceMotion = v; save('sm-reduce', v ? '1' : '0'); emit(); },
  setJoystick(v: boolean) { joystick = v; save('sm-joy', v ? '1' : '0'); emit(); },
  subscribe(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; },
};
