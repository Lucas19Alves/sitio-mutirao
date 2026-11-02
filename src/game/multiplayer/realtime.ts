// Um canal privado por fazenda: farm:<id>.
//  - Presence: quem está online (+ aparência).
//  - Broadcast "pos": posição/animação dos personagens (transitório, nunca vai ao banco).
//  - Broadcast "sync": novo estado persistente, enviado pelo PRÓPRIO banco (realtime.send) após cada lote.
//  - Broadcast "members": lista de membros mudou.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../services/supabase.ts';
import { store, type Member } from '../state/store.ts';
import { bus } from '../bus.ts';

export interface PosMsg { u: string; x: number; y: number; d: number; a: string; t: number }
export interface PresenceMeta { u: string; name: string; look: Record<string, number> }

class FarmRealtime {
  /** Último estado conhecido: a cena do Phaser pode nascer depois dos eventos. */
  metas: PresenceMeta[] = [];
  lastPos = new Map<string, PosMsg>();
  private ch: RealtimeChannel | null = null;
  private farmId = '';
  private me: PresenceMeta | null = null;
  private wasSubscribed = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private lastSent = 0;
  private visHandler = () => { if (document.visibilityState === 'visible' && !store.connected) this.reconnect(0); };
  // a rede caiu: não espera o heartbeat do socket para avisar o jogador
  private offHandler = () => { store.setConnected(false); this.wasSubscribed = true; };

  async connect(farmId: string, me: PresenceMeta) {
    this.disconnect();
    this.farmId = farmId;
    this.me = me;
    document.addEventListener('visibilitychange', this.visHandler);
    window.addEventListener('online', this.visHandler);
    window.addEventListener('offline', this.offHandler);
    await this.open();
  }

  private async open() {
    await supabase.realtime.setAuth();
    const ch = supabase.channel(`farm:${this.farmId}`, {
      config: { private: true, broadcast: { self: false, ack: false }, presence: { key: this.me!.u } },
    });
    ch.on('broadcast', { event: 'sync' }, ({ payload }) => store.applyDelta(payload))
      .on('broadcast', { event: 'members' }, ({ payload }) => store.setMembers(payload.members as Member[]))
      .on('broadcast', { event: 'pos' }, ({ payload }) => { this.lastPos.set(payload.u, payload as PosMsg); bus.emit('net:pos', payload as PosMsg); })
      .on('broadcast', { event: 'emote' }, ({ payload }) => bus.emit('net:emote', payload))
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState<PresenceMeta>();
        const metas = Object.values(state).map((arr) => arr[0]).filter(Boolean);
        this.metas = metas;
        store.setOnline(metas.map((m) => m.u));
        bus.emit('net:presence', metas);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        // alguém entrou: reenviamos nossa posição para ele nos ver imediatamente
        if (newPresences.some((p) => (p as unknown as PresenceMeta).u !== this.me!.u)) bus.emit('net:need-pos');
      });
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        this.attempts = 0;
        store.setConnected(true);
        await ch.track(this.me!);
        if (this.wasSubscribed) {
          // voltamos de uma queda: o estado pode ter mudado enquanto estávamos fora
          await store.resync();
          bus.emit('toast', { kind: 'ok', text: 'Conexão restabelecida.' });
        }
        this.wasSubscribed = true;
        bus.emit('net:need-pos');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        store.setConnected(false);
        if (this.ch === ch) this.reconnect();
      }
    });
    this.ch = ch;
  }

  private reconnect(delay = Math.min(15000, 1000 * 2 ** this.attempts)) {
    if (this.retry || !this.farmId) return;
    this.attempts++;
    this.retry = setTimeout(async () => {
      this.retry = null;
      const old = this.ch;
      this.ch = null;
      if (old) await supabase.removeChannel(old);
      if (this.farmId) await this.open().catch(() => this.reconnect());
    }, delay);
  }

  /** Posição: no máximo ~5 msgs/s, só enquanto o personagem se move. */
  sendPos(p: Omit<PosMsg, 'u' | 't'>, force = false) {
    const now = performance.now();
    if (!this.ch || !store.connected || (!force && now - this.lastSent < 200)) return;
    this.lastSent = now;
    void this.ch.send({ type: 'broadcast', event: 'pos', payload: { ...p, u: this.me!.u, t: Date.now() } });
  }

  emote(kind: string) {
    if (!this.ch || !store.connected) return;
    void this.ch.send({ type: 'broadcast', event: 'emote', payload: { u: this.me!.u, k: kind } });
  }

  async updateLook(look: Record<string, number>) {
    if (!this.me) return;
    this.me.look = look;
    if (this.ch && store.connected) await this.ch.track(this.me);
  }

  disconnect() {
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    document.removeEventListener('visibilitychange', this.visHandler);
    window.removeEventListener('online', this.visHandler);
    window.removeEventListener('offline', this.offHandler);
    const ch = this.ch;
    this.ch = null;
    this.farmId = '';
    this.wasSubscribed = false;
    this.metas = [];
    this.lastPos.clear();
    if (ch) void supabase.removeChannel(ch);
    store.setConnected(false);
  }
}

export const realtime = new FarmRealtime();
