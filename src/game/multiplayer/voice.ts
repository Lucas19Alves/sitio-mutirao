// Voz entre os jogadores da fazenda (VoIP) com WebRTC em malha: cada par conversa direto,
// e a sinalização (oferta, resposta, candidatos) passa pelo canal Realtime da fazenda.
// Áudio sai por elementos <audio>; o volume cai com a distância no mapa (modo "por perto").
import { bus } from '../bus.ts';
import { realtime, type PresenceMeta } from './realtime.ts';
import { TILE } from '../../data/catalog.ts';

type Msg = { t: 'hello' | 'offer' | 'answer' | 'ice' | 'bye'; from: string; to?: string; sdp?: RTCSessionDescriptionInit; cand?: RTCIceCandidateInit };
interface Peer { pc: RTCPeerConnection; audio: HTMLAudioElement; level: number; analyser?: AnalyserNode; pending: RTCIceCandidateInit[] }

const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const load = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* */ } };

class Voice {
  /** voz ligada (participando da conversa) */
  on = false;
  /** microfone aberto */
  micOn = load('sm-mic', '1') === '1';
  /** 'near' = volume pela distância; 'all' = todos iguais */
  mode: 'near' | 'all' = load('sm-voice-mode', 'near') === 'all' ? 'all' : 'near';
  /** quem está falando agora (níveis 0..1) */
  levels = new Map<string, number>();
  micDenied = false;
  private me = '';
  private stream: MediaStream | null = null;
  private peers = new Map<string, Peer>();
  private ac: AudioContext | null = null;
  private myAnalyser: AnalyserNode | null = null;
  private timer = 0;
  private offs: (() => void)[] = [];
  private subs = new Set<() => void>();
  version = 0;

  subscribe = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  getVersion = () => this.version;
  private emit() { this.version++; this.subs.forEach((f) => f()); }

  /** Pede o microfone (pode ser chamado pela tela de permissões). */
  async ensureMic(): Promise<MediaStream | null> {
    if (this.stream) return this.stream;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      this.micDenied = false;
      for (const t of this.stream.getAudioTracks()) t.enabled = this.micOn;
      return this.stream;
    } catch { this.micDenied = true; this.emit(); return null; }
  }

  /** Entra na conversa da fazenda. Sem microfone, entra só ouvindo. */
  async join(me: string) {
    if (this.on) return;
    this.me = me; this.on = true;
    await this.ensureMic();
    try { this.ac = new AudioContext(); } catch { this.ac = null; }
    if (this.ac && this.stream) { const src = this.ac.createMediaStreamSource(this.stream); this.myAnalyser = this.ac.createAnalyser(); this.myAnalyser.fftSize = 256; src.connect(this.myAnalyser); }
    this.offs.push(
      bus.on('net:rtc', (m: Msg) => void this.onMsg(m)),
      bus.on('net:presence', (metas: PresenceMeta[]) => { const ids = new Set(metas.map((x) => x.u)); for (const u of [...this.peers.keys()]) if (!ids.has(u)) this.drop(u); }),
    );
    realtime.rtc({ t: 'hello' });
    this.timer = window.setInterval(() => this.tick(), 150);
    this.emit();
  }

  leave() {
    if (!this.on) return;
    realtime.rtc({ t: 'bye' });
    for (const u of [...this.peers.keys()]) this.drop(u);
    this.offs.forEach((f) => f()); this.offs = [];
    clearInterval(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null;
    void this.ac?.close(); this.ac = null; this.myAnalyser = null;
    this.on = false; this.levels.clear();
    this.emit();
  }

  setMic(v: boolean) {
    this.micOn = v; save('sm-mic', v ? '1' : '0');
    for (const t of this.stream?.getAudioTracks() ?? []) t.enabled = v;
    this.emit();
  }
  setMode(m: 'near' | 'all') { this.mode = m; save('sm-voice-mode', m); this.emit(); }
  peerCount() { return this.peers.size; }

  private peer(u: string): Peer {
    let p = this.peers.get(u);
    if (p) return p;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const audio = new Audio(); audio.autoplay = true;
    p = { pc, audio, level: 0, pending: [] };
    this.peers.set(u, p);
    if (this.stream) for (const t of this.stream.getAudioTracks()) pc.addTrack(t, this.stream);
    else pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.onicecandidate = (e) => { if (e.candidate) realtime.rtc({ t: 'ice', to: u, cand: e.candidate.toJSON() }); };
    pc.ontrack = (e) => {
      const st = e.streams[0] ?? new MediaStream([e.track]);
      audio.srcObject = st; void audio.play().catch(() => {});
      if (this.ac) { try { const src = this.ac.createMediaStreamSource(st); const an = this.ac.createAnalyser(); an.fftSize = 256; src.connect(an); p!.analyser = an; } catch { /* sem medidor */ } }
      this.emit();
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.drop(u); else this.emit(); };
    return p;
  }

  private drop(u: string) {
    const p = this.peers.get(u); if (!p) return;
    p.pc.close(); p.audio.srcObject = null; this.peers.delete(u); this.levels.delete(u);
    this.emit();
  }

  private async onMsg(m: Msg) {
    if (!this.on || m.from === this.me || (m.to && m.to !== this.me)) return;
    if (m.t === 'bye') { this.drop(m.from); return; }
    if (m.t === 'hello') {
      // quem tem o id menor faz a oferta (evita as duas pontas oferecerem ao mesmo tempo)
      if (this.me < m.from) await this.offer(m.from); else realtime.rtc({ t: 'hello', to: m.from });
      return;
    }
    const p = this.peer(m.from);
    try {
      if (m.t === 'offer' && m.sdp) {
        await p.pc.setRemoteDescription(m.sdp);
        for (const c of p.pending.splice(0)) await p.pc.addIceCandidate(c);
        await p.pc.setLocalDescription(await p.pc.createAnswer());
        realtime.rtc({ t: 'answer', to: m.from, sdp: p.pc.localDescription!.toJSON() });
      } else if (m.t === 'answer' && m.sdp) {
        await p.pc.setRemoteDescription(m.sdp);
        for (const c of p.pending.splice(0)) await p.pc.addIceCandidate(c);
      } else if (m.t === 'ice' && m.cand) {
        if (p.pc.remoteDescription) await p.pc.addIceCandidate(m.cand); else p.pending.push(m.cand);
      }
    } catch (e) { console.warn('voz', e); }
  }

  private async offer(u: string) {
    const p = this.peer(u);
    if (p.pc.signalingState !== 'stable' || p.pc.localDescription) return;
    await p.pc.setLocalDescription(await p.pc.createOffer());
    realtime.rtc({ t: 'offer', to: u, sdp: p.pc.localDescription!.toJSON() });
  }

  /** Volume pela distância e medidor de quem está falando. */
  private tick() {
    const mine = realtime.lastPos.get(this.me);
    const buf = new Uint8Array(128);
    const lvl = (an?: AnalyserNode | null) => { if (!an) return 0; an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); return m / 128; };
    let changed = false;
    const set = (u: string, v: number) => { const was = (this.levels.get(u) ?? 0) > 0.06, now = v > 0.06; this.levels.set(u, v); if (was !== now) changed = true; };
    set(this.me, this.micOn ? lvl(this.myAnalyser) : 0);
    for (const [u, p] of this.peers) {
      set(u, lvl(p.analyser));
      let vol = 1;
      const pos = realtime.lastPos.get(u);
      if (this.mode === 'near' && pos && mine) { const d = Math.hypot(pos.x - mine.x, pos.y - mine.y) / TILE; vol = d <= 6 ? 1 : Math.max(0.12, 1 - (d - 6) / 18); }
      p.audio.volume = vol;
    }
    if (changed) { bus.emit('voice:levels', this.levels); this.emit(); }
  }

  /** O jogo usa a própria posição para o volume (a minha não chega pelo canal). */
  setMyPos(x: number, y: number) { realtime.lastPos.set(this.me, { u: this.me, x, y, d: 0, a: 'idle', t: Date.now() }); }
}

export const voice = new Voice();
