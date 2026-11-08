// Áudio sintetizado (WebAudio): efeitos e trilha generativa, nada para baixar.
// Efeitos passam por um compressor e um reverb curto de "ar livre" para soarem macios e cheios.
let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let wet: GainNode | null = null;
let dry: GainNode | null = null;

const load = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem storage */ } };

let muted = load('sm-muted', '0') === '1';
let volume = Number(load('sm-volume', '0.6'));
let musicOn = load('sm-music-on', '1') === '1';
let musicVolume = Number(load('sm-music', '0.45'));
const listeners = new Set<() => void>();

export function audioCtx() { return ctx; }
export function musicOut() { return musicBus; }

function applyGains() {
  if (!ctx) return;
  sfxBus?.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.05);
  musicBus?.gain.setTargetAtTime(musicOn ? musicVolume * 0.6 : 0, ctx.currentTime, 0.4);
}

/** Resposta ao impulso sintética: um reverb leve, como um quintal aberto. */
function impulse(c: AudioContext, secs: number, decay: number) {
  const n = Math.floor(c.sampleRate * secs), b = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
  return b;
}

export const sound = {
  get muted() { return muted; },
  get volume() { return volume; },
  get musicOn() { return musicOn; },
  get musicVolume() { return musicVolume; },
  setMuted(v: boolean) { muted = v; save('sm-muted', v ? '1' : '0'); applyGains(); listeners.forEach((f) => f()); },
  setVolume(v: number) { volume = v; save('sm-volume', String(v)); applyGains(); },
  setMusicOn(v: boolean) { musicOn = v; save('sm-music-on', v ? '1' : '0'); applyGains(); listeners.forEach((f) => f()); },
  setMusicVolume(v: number) { musicVolume = v; save('sm-music', String(v)); applyGains(); },
  subscribe(f: () => void) { listeners.add(f); return () => listeners.delete(f); },
  /** Precisa ser chamado num gesto do usuário (iOS/Chrome). */
  unlock() {
    if (!ctx) {
      try {
        ctx = new AudioContext();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.18;
        comp.connect(ctx.destination);
        sfxBus = ctx.createGain(); sfxBus.connect(comp);
        dry = ctx.createGain(); dry.gain.value = 1; dry.connect(sfxBus);
        const rev = ctx.createConvolver(); rev.buffer = impulse(ctx, 1.1, 3.2);
        wet = ctx.createGain(); wet.gain.value = 0.22; wet.connect(rev).connect(sfxBus);
        musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(ctx.destination);
        applyGains();
        listeners.forEach((f) => f());
        // economiza bateria: pausa o áudio quando a aba vai para segundo plano
        document.addEventListener('visibilitychange', () => { if (document.hidden) void ctx?.suspend(); else void ctx?.resume(); });
      } catch { /* sem áudio */ }
    }
    void ctx?.resume();
  },
};

export type Kind =
  | 'chop' | 'pick' | 'pop' | 'coin' | 'level' | 'error' | 'click' | 'build' | 'dig' | 'open' | 'close'
  | 'harvest' | 'plant' | 'pickup' | 'deposit' | 'sell' | 'mission' | 'ready' | 'combo' | 'bell' | 'gift'
  | 'splash' | 'fish' | 'ping' | 'unlock' | 'whoosh' | 'thanks' | 'pet' | 'sparkle' | 'hammer';

interface ToneOpt { type?: OscillatorType; gain?: number; delay?: number; slide?: number; attack?: number; wet?: number; detune?: number; pan?: number }

/** Uma nota com envelope (ataque curto, decaimento exponencial). */
function tone(freq: number, dur: number, o: ToneOpt = {}) {
  if (!ctx || !dry || !wet) return;
  const t = ctx.currentTime + (o.delay ?? 0);
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = o.type ?? 'sine'; osc.frequency.setValueAtTime(freq, t);
  if (o.detune) osc.detune.value = o.detune;
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + o.slide), t + dur);
  const peak = o.gain ?? 0.15;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + (o.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let out: AudioNode = g;
  if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; g.connect(p); out = p; }
  osc.connect(g);
  out.connect(dry);
  if ((o.wet ?? 0.6) > 0) { const s = ctx.createGain(); s.gain.value = o.wet ?? 0.6; out.connect(s).connect(wet); }
  osc.start(t); osc.stop(t + dur + 0.05);
}

/** Ruído filtrado (passos, golpes, folhas). */
function noise(dur: number, gain: number, freq: number, o: { delay?: number; type?: BiquadFilterType; q?: number; sweep?: number; wet?: number } = {}) {
  if (!ctx || !dry || !wet) return;
  const t = ctx.currentTime + (o.delay ?? 0);
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = buf; fl.type = o.type ?? 'bandpass'; fl.frequency.setValueAtTime(freq, t); fl.Q.value = o.q ?? 1;
  if (o.sweep) fl.frequency.exponentialRampToValueAtTime(Math.max(60, freq + o.sweep), t + dur);
  g.gain.value = gain;
  s.connect(fl).connect(g).connect(dry);
  if ((o.wet ?? 0.3) > 0) { const w = ctx.createGain(); w.gain.value = o.wet ?? 0.3; g.connect(w).connect(wet); }
  s.start(t);
}

/** Sino: parciais inarmônicos, como bronze de verdade. */
function bell(f: number, delay = 0, gain = 0.12) {
  [1, 2.4, 3.02, 4.5, 5.9].forEach((m, i) => tone(f * m, 2.2 / (1 + i * 0.6), { gain: gain / (1 + i * 0.9), delay, wet: 1 }));
}

// escala pentatônica maior (soa sempre "certa"): os combos sobem por ela
const PENTA = [0, 2, 4, 7, 9];
export const pentaFreq = (step: number, base = 523.25) => base * Math.pow(2, (PENTA[((step % 5) + 5) % 5] + 12 * Math.floor(step / 5)) / 12);
const rnd = (a: number) => 1 + (Math.random() - 0.5) * a;

export function play(k: Kind, opt: { step?: number; vol?: number } = {}) {
  if (muted || !ctx) return;
  const v = opt.vol ?? 1;
  switch (k) {
    case 'chop': noise(0.07, 0.55 * v, 1100 * rnd(0.2), { q: 2 }); tone(120 * rnd(0.1), 0.12, { type: 'triangle', gain: 0.3 * v, slide: -50, wet: 0.2 }); noise(0.03, 0.3 * v, 3200, { delay: 0.01 }); break;
    case 'pick': tone(1480 * rnd(0.06), 0.25, { type: 'sine', gain: 0.07 * v, wet: 0.8 }); tone(2210 * rnd(0.06), 0.18, { gain: 0.04 * v }); noise(0.04, 0.45 * v, 3600, { q: 3 }); break;
    case 'dig': noise(0.16, 0.5 * v, 420 * rnd(0.2), { sweep: 500, type: 'lowpass' }); noise(0.05, 0.2 * v, 1800, { delay: 0.06 }); break;
    case 'harvest': noise(0.14, 0.32 * v, 2400, { sweep: 2200, type: 'highpass' }); tone(660 * rnd(0.05), 0.08, { gain: 0.05 * v, delay: 0.05 }); break;
    case 'plant': tone(180, 0.1, { type: 'triangle', gain: 0.18 * v, slide: -60, wet: 0.1 }); noise(0.08, 0.2 * v, 600, { type: 'lowpass' }); tone(880, 0.12, { gain: 0.04, delay: 0.08 }); break;
    case 'pop': tone(520, 0.08, { gain: 0.22 * v, slide: 380 }); break;
    case 'pickup': { // nota da escala pentatônica: coletas seguidas sobem a melodia
      const f = pentaFreq(opt.step ?? 0);
      tone(f, 0.16, { type: 'triangle', gain: 0.14 * v }); tone(f * 2, 0.1, { gain: 0.05 * v, delay: 0.02 });
      break;
    }
    case 'combo': { const s = opt.step ?? 0; [0, 2, 4, 7].forEach((n, i) => tone(pentaFreq(s + n), 0.22, { type: 'triangle', gain: 0.12, delay: i * 0.05 })); noise(0.4, 0.12, 6000, { type: 'highpass', delay: 0.1, wet: 1 }); break; }
    case 'sparkle': for (let i = 0; i < 6; i++) tone(1800 + Math.random() * 1600, 0.12, { gain: 0.035, delay: i * 0.04, wet: 1, pan: Math.random() - 0.5 }); break;
    case 'coin': tone(988, 0.09, { type: 'square', gain: 0.06 }); tone(1319, 0.22, { type: 'square', gain: 0.06, delay: 0.07 }); break;
    case 'sell': [1319, 1568, 1976].forEach((f, i) => tone(f, 0.14, { type: 'square', gain: 0.05, delay: i * 0.06 })); noise(0.2, 0.15, 5000, { type: 'highpass', delay: 0.05 }); break;
    case 'deposit': for (let i = 0; i < 6; i++) { tone(900 + i * 110, 0.07, { type: 'square', gain: 0.035, delay: i * 0.05 }); noise(0.03, 0.15, 4200, { delay: i * 0.05 }); } tone(196, 0.2, { type: 'triangle', gain: 0.2, delay: 0.3, wet: 0.2 }); break;
    case 'level': // fanfarra com harmonia
      [523, 659, 784, 1047].forEach((f, i) => { tone(f, 0.3, { type: 'triangle', gain: 0.14, delay: i * 0.1 }); tone(f / 2, 0.3, { type: 'sine', gain: 0.08, delay: i * 0.1 }); });
      [1047, 1319, 1568].forEach((f) => tone(f, 0.9, { type: 'triangle', gain: 0.08, delay: 0.42 }));
      noise(0.8, 0.12, 7000, { type: 'highpass', delay: 0.42, wet: 1 });
      break;
    case 'mission': [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.2, { type: 'triangle', gain: 0.12, delay: i * 0.07 })); bell(1568, 0.3, 0.06); break;
    case 'ready': tone(1175, 0.15, { type: 'triangle', gain: 0.1 }); tone(1568, 0.3, { type: 'triangle', gain: 0.1, delay: 0.1 }); break;
    case 'unlock': [392, 494, 587, 784].forEach((f, i) => tone(f, 0.25, { type: 'sawtooth', gain: 0.04, delay: i * 0.08, wet: 0.8 })); bell(784, 0.35, 0.08); noise(0.9, 0.14, 5000, { type: 'highpass', delay: 0.3, wet: 1 }); break;
    case 'hammer': noise(0.05, 0.5, 2600, { q: 4 }); tone(320 * rnd(0.1), 0.1, { type: 'square', gain: 0.05 }); break;
    case 'build': [0, 0.16, 0.32].forEach((d) => { noise(0.05, 0.45, 2600, { q: 4, delay: d }); tone(300, 0.08, { type: 'square', gain: 0.04, delay: d }); }); [392, 523, 659, 784].forEach((f, i) => tone(f, 0.3, { type: 'triangle', gain: 0.13, delay: 0.5 + i * 0.07 })); break;
    case 'bell': bell(523); bell(659, 0.5); bell(784, 1.0); break;
    case 'gift': [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.18, { gain: 0.07, delay: i * 0.06, wet: 1 })); break;
    case 'thanks': tone(392, 0.12, { type: 'triangle', gain: 0.1 }); tone(523, 0.18, { type: 'triangle', gain: 0.1, delay: 0.1 }); break;
    case 'pet': tone(880, 0.06, { gain: 0.08, slide: 300 }); tone(1100, 0.08, { gain: 0.06, delay: 0.08, slide: 200 }); break;
    case 'splash': noise(0.35, 0.4, 900, { sweep: -600, type: 'lowpass', wet: 0.6 }); noise(0.2, 0.2, 3000, { delay: 0.05 }); break;
    case 'fish': noise(0.25, 0.35, 1200, { sweep: -800 }); [784, 988, 1319].forEach((f, i) => tone(f, 0.12, { type: 'triangle', gain: 0.09, delay: 0.15 + i * 0.06 })); break;
    case 'ping': tone(1568, 0.18, { gain: 0.1 }); tone(2093, 0.35, { gain: 0.08, delay: 0.12, wet: 1 }); break;
    case 'whoosh': noise(0.22, 0.2, 800, { sweep: 2500, q: 0.7 }); break;
    case 'open': noise(0.12, 0.12, 1500, { sweep: 1500, q: 0.8, wet: 0.1 }); tone(660, 0.07, { gain: 0.06, delay: 0.04 }); break;
    case 'close': noise(0.1, 0.1, 2500, { sweep: -1500, q: 0.8, wet: 0.1 }); break;
    case 'error': tone(220, 0.16, { type: 'sawtooth', gain: 0.06, slide: -60, wet: 0.1 }); tone(207, 0.2, { type: 'sawtooth', gain: 0.05, delay: 0.1, wet: 0.1 }); break;
    case 'click': tone(700, 0.04, { gain: 0.09, wet: 0 }); break;
  }
}

/** Passo conforme o piso: grama (macio), terra (crocante), madeira (oco), água (respingo). */
export type Surface = 'grass' | 'dirt' | 'wood' | 'water' | 'soil';
let stepAlt = false;
export function footstep(s: Surface, run = false) {
  if (muted || !ctx) return;
  stepAlt = !stepAlt;
  const v = (run ? 0.75 : 0.5) * (stepAlt ? 1 : 0.85);
  switch (s) {
    case 'grass': noise(0.07, 0.16 * v, 2200 * rnd(0.3), { type: 'highpass', wet: 0 }); noise(0.05, 0.08 * v, 500, { type: 'lowpass', wet: 0 }); break;
    case 'dirt': noise(0.06, 0.22 * v, 1100 * rnd(0.3), { q: 1.4, wet: 0 }); noise(0.03, 0.1 * v, 3400, { delay: 0.01, wet: 0 }); break;
    case 'soil': noise(0.08, 0.2 * v, 700 * rnd(0.3), { type: 'lowpass', wet: 0 }); break;
    case 'wood': tone(160 * rnd(0.1), 0.09, { type: 'triangle', gain: 0.14 * v, wet: 0.3 }); noise(0.04, 0.12 * v, 1600, { wet: 0 }); break;
    case 'water': noise(0.14, 0.2 * v, 1300, { sweep: -700, wet: 0.2 }); break;
  }
}
