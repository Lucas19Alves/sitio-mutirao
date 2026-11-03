// Trilha sonora generativa e calma "do campo": violão dedilhado (Karplus-Strong),
// pad suave, flauta ocasional, baixo, pássaros e vento. Tudo sintetizado em tempo
// real com agendamento antecipado; nunca repete exatamente igual.
import { audioCtx, musicOut, sound } from './audio.ts';

const BPM = 70;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const EIGHTH = BEAT / 2;

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

// Sol maior. Acordes como notas MIDI (fundamental, terça, quinta) na região do violão.
const CHORDS: Record<string, number[]> = {
  G: [43, 55, 59, 62], Em: [40, 52, 55, 59], C: [36, 48, 52, 55], D: [38, 50, 54, 57], Am: [45, 57, 60, 64], Bm: [47, 54, 59, 62],
};
const PROGRESSIONS = [['G', 'D', 'Em', 'C'], ['G', 'Em', 'C', 'D'], ['C', 'G', 'Am', 'D'], ['Em', 'C', 'G', 'D'], ['G', 'C', 'G', 'D'], ['Am', 'C', 'G', 'D'], ['G', 'Bm', 'C', 'D']];
const ARPS = [[1, 2, 3, 4, 3, 2, 1, 2], [1, 3, 4, 3, 2, 3, 1, 3], [1, 2, 3, 2, 4, 3, 2, 3], [1, 2, 3, 4, 5, 4, 3, 2]];
const PENTA = [62, 64, 67, 69, 71, 74, 76, 79]; // D4 E4 G4 A4 B4 D5 E5 G5
const RHYTHMS = [[4, 2, 2], [2, 2, 4], [3, 1, 4], [8], [2, 2, 2, 2], [6, 2], [4, 4]];

class Music {
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private next = 0;
  private bar = 0;
  private prog: string[] = PROGRESSIONS[0];
  private arp: number[] = ARPS[0];
  private melodyOn = false;
  private mel = 3;
  private plucks = new Map<number, AudioBuffer>();
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private nextBird = 0;
  private wind: AudioBufferSourceNode | null = null;

  constructor() {
    sound.subscribe(() => { if (sound.musicOn) this.start(); else this.stop(); });
  }

  start() {
    const ctx = audioCtx(), out = musicOut();
    if (!ctx || !out || this.running || !sound.musicOn) return;
    if (!this.dry) this.buildGraph(ctx, out);
    this.running = true;
    this.next = ctx.currentTime + 0.3;
    this.nextBird = ctx.currentTime + 3;
    this.startWind(ctx);
    this.timer = setInterval(() => this.schedule(), 120);
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try { this.wind?.stop(); } catch { /* já parado */ }
    this.wind = null;
  }

  private buildGraph(ctx: AudioContext, out: AudioNode) {
    // reverb de sala de madeira (resposta ao impulso gerada)
    const len = Math.floor(ctx.sampleRate * 2.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    this.wet = ctx.createGain(); this.wet.gain.value = 0.42;
    this.dry = ctx.createGain(); this.dry.gain.value = 0.85;
    const warm = ctx.createBiquadFilter(); warm.type = 'lowshelf'; warm.frequency.value = 250; warm.gain.value = 2;
    this.wet.connect(conv).connect(out);
    this.dry.connect(warm).connect(out);
  }

  /** Corda dedilhada (Karplus-Strong) pré-calculada por nota. */
  private pluck(ctx: AudioContext, midi: number) {
    const hit = this.plucks.get(midi);
    if (hit) return hit;
    const sr = ctx.sampleRate, f = mtof(midi), n = Math.max(2, Math.round(sr / f));
    const len = Math.floor(sr * 2.4);
    const buf = ctx.createBuffer(1, len, sr), y = buf.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < n; i++) { const r = Math.random() * 2 - 1; prev = prev * 0.5 + r * 0.5; y[i] = prev; }
    const decay = 0.996 - (midi - 40) * 0.00012;
    for (let i = n; i < len; i++) y[i] = decay * 0.5 * (y[i - n] + y[i - n + 1 < i ? i - n + 1 : i - n]);
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(y[i]));
    for (let i = 0; i < len; i++) y[i] /= peak || 1;
    this.plucks.set(midi, buf);
    return buf;
  }

  private schedule() {
    const ctx = audioCtx();
    if (!ctx || !this.running) return;
    while (this.next < ctx.currentTime + 0.8) {
      this.playBar(ctx, this.next);
      this.next += BAR;
      this.bar++;
    }
    if (ctx.currentTime > this.nextBird) { this.birds(ctx, ctx.currentTime + 0.1); this.nextBird = ctx.currentTime + rnd(4, 12); }
  }

  private playBar(ctx: AudioContext, t: number) {
    const k = this.bar % 4;
    if (k === 0) {
      this.prog = pick(PROGRESSIONS);
      this.arp = Math.random() < 0.7 ? ARPS[Math.floor(Math.random() * 2)] : pick(ARPS);
      this.melodyOn = Math.random() < 0.55;
    }
    const ch = CHORDS[this.prog[k]];
    const tones = [ch[0], ch[1], ch[2], ch[3], ch[1] + 12];
    // baixo na cabeça do compasso
    this.bass(ctx, t, ch[0]);
    // dedilhado
    this.arp.forEach((idx, i) => {
      if (i > 0 && Math.random() < 0.08) return; // respira às vezes
      const note = tones[idx % tones.length];
      this.note(ctx, t + i * EIGHTH + rnd(-0.012, 0.012), note, i % 4 === 0 ? 0.5 : rnd(0.28, 0.4), rnd(-0.35, 0.35));
    });
    // pad
    this.pad(ctx, t, [ch[1] + 12, ch[2] + 12, ch[3] + 12]);
    // flauta
    if (this.melodyOn) this.melody(ctx, t, ch);
  }

  private note(ctx: AudioContext, t: number, midi: number, vel: number, pan: number) {
    const s = ctx.createBufferSource(); s.buffer = this.pluck(ctx, midi);
    const g = ctx.createGain(); g.gain.value = vel * 0.32;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    s.connect(lp).connect(g).connect(p);
    p.connect(this.dry!); p.connect(this.wet!);
    s.start(t); s.stop(t + 2.4);
  }

  private bass(ctx: AudioContext, t: number, midi: number) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = mtof(midi);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.11, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + BAR * 0.9);
    o.connect(g).connect(this.dry!);
    o.start(t); o.stop(t + BAR);
  }

  private pad(ctx: AudioContext, t: number, notes: number[]) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 850; lp.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035, t + 1.4); g.gain.linearRampToValueAtTime(0.03, t + BAR); g.gain.linearRampToValueAtTime(0.0001, t + BAR + 1.6);
    lp.connect(g); g.connect(this.wet!); g.connect(this.dry!);
    for (const n of notes) for (const det of [-6, 6]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(n); o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + BAR + 1.7);
    }
  }

  private melody(ctx: AudioContext, t: number, ch: number[]) {
    const rhythm = pick(RHYTHMS);
    let at = t;
    rhythm.forEach((len, i) => {
      const dur = len * EIGHTH;
      if (i > 0 && Math.random() < 0.18) { at += dur; return; } // pausa
      if (i === 0) {
        // no tempo forte, prefere uma nota do acorde
        const chordPc = ch.map((n) => n % 12);
        const opts = PENTA.map((n, idx) => ({ n, idx })).filter((o) => chordPc.includes(o.n % 12));
        this.mel = opts.length ? pick(opts).idx : this.mel;
      } else this.mel = Math.max(0, Math.min(PENTA.length - 1, this.mel + pick([-2, -1, -1, 1, 1, 2])));
      this.flute(ctx, at, PENTA[this.mel], dur * 0.95);
      at += dur;
    });
  }

  private flute(ctx: AudioContext, t: number, midi: number, dur: number) {
    const f = mtof(midi);
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f; o2.type = 'triangle'; o2.frequency.value = f * 2;
    const g2 = ctx.createGain(); g2.gain.value = 0.12;
    lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.004, t + Math.min(0.5, dur * 0.6));
    lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + 0.08); g.gain.setValueAtTime(0.055, t + dur - 0.15); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.25);
    o.connect(g); o2.connect(g2).connect(g);
    const p = ctx.createStereoPanner(); p.pan.value = 0.15;
    g.connect(p); p.connect(this.dry!); p.connect(this.wet!);
    for (const n of [o, o2, lfo]) { n.start(t); n.stop(t + dur + 0.3); }
  }

  private birds(ctx: AudioContext, t: number) {
    const n = 1 + Math.floor(Math.random() * 4);
    const base = rnd(2400, 3800), pan = rnd(-0.8, 0.8);
    for (let i = 0; i < n; i++) {
      const at = t + i * rnd(0.12, 0.22), d = rnd(0.05, 0.11);
      const o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
      o.type = 'sine';
      o.frequency.setValueAtTime(base * rnd(0.95, 1.1), at);
      o.frequency.exponentialRampToValueAtTime(base * rnd(1.2, 1.5), at + d * 0.4);
      o.frequency.exponentialRampToValueAtTime(base * rnd(0.8, 0.95), at + d);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.02, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + d);
      p.pan.value = pan;
      o.connect(g).connect(p); p.connect(this.dry!); p.connect(this.wet!);
      o.start(at); o.stop(at + d + 0.02);
    }
  }

  private startWind(ctx: AudioContext) {
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { b = 0.985 * b + 0.015 * (Math.random() * 2 - 1); d[i] = b * 6; }
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.6;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.06; lg.gain.value = 180;
    lfo.connect(lg).connect(f.frequency);
    const g = ctx.createGain(); g.gain.value = 0.02;
    s.connect(f).connect(g).connect(this.dry!);
    s.start(); lfo.start();
    this.wind = s;
  }
}

export const music = new Music();
