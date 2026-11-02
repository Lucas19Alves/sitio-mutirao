// Efeitos sonoros sintetizados (WebAudio): nada para baixar, quase nada de CPU.
let ctx: AudioContext | null = null;
let muted = (() => { try { return localStorage.getItem('sm-muted') === '1'; } catch { return false; } })();
let volume = (() => { try { return Number(localStorage.getItem('sm-volume') ?? '0.6'); } catch { return 0.6; } })();

export const sound = {
  get muted() { return muted; },
  get volume() { return volume; },
  setMuted(v: boolean) { muted = v; try { localStorage.setItem('sm-muted', v ? '1' : '0'); } catch { /* sem storage */ } },
  setVolume(v: number) { volume = v; try { localStorage.setItem('sm-volume', String(v)); } catch { /* sem storage */ } },
  /** Precisa ser chamado num gesto do usuário (iOS). */
  unlock() { if (!ctx) { try { ctx = new AudioContext(); } catch { /* sem áudio */ } } void ctx?.resume(); },
};

type Kind = 'chop' | 'pick' | 'pop' | 'coin' | 'level' | 'error' | 'click' | 'build' | 'dig';

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slide = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain * volume, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur: number, gain: number, freq: number, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = gain * volume;
  s.connect(f).connect(g).connect(ctx.destination); s.start(t);
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
  }
}
