// Áudio sintetizado (WebAudio): efeitos e trilha generativa, nada para baixar.
let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;

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
        sfxBus = ctx.createGain(); sfxBus.connect(ctx.destination);
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

type Kind = 'chop' | 'pick' | 'pop' | 'coin' | 'level' | 'error' | 'click' | 'build' | 'dig' | 'open';

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slide = 0) {
  if (!ctx || !sfxBus) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfxBus);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur: number, gain: number, freq: number, delay = 0) {
  if (!ctx || !sfxBus) return;
  const t = ctx.currentTime + delay;
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = gain;
  s.connect(f).connect(g).connect(sfxBus); s.start(t);
}

export function play(k: Kind) {
  if (muted || !ctx) return;
  switch (k) {
    case 'chop': noise(0.09, 0.5, 900); tone(140, 0.08, 'triangle', 0.25); break;
    case 'pick': noise(0.05, 0.4, 3200); tone(900, 0.06, 'square', 0.06); break;
    case 'dig': noise(0.12, 0.45, 500); break;
    case 'pop': tone(520, 0.08, 'sine', 0.25, 0, 380); break;
    case 'coin': tone(988, 0.08, 'square', 0.08); tone(1319, 0.16, 'square', 0.08, 0.07); break;
    case 'level': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.18, i * 0.09)); break;
    case 'build': [392, 523, 659].forEach((f, i) => tone(f, 0.14, 'triangle', 0.18, i * 0.07)); noise(0.1, 0.3, 700); break;
    case 'error': tone(220, 0.14, 'sawtooth', 0.08, 0, -60); break;
    case 'click': tone(700, 0.04, 'sine', 0.12); break;
    case 'open': tone(440, 0.07, 'sine', 0.12); tone(660, 0.09, 'sine', 0.1, 0.05); break;
  }
}
