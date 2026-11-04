// Estado persistente da fazenda no cliente (espelho do servidor).
// Toda mudança econômica vem do servidor (resposta da RPC ou broadcast "sync").
// As ações são enfileiradas e enviadas em lotes para economizar requisições.
import { supabase } from '../../services/supabase.ts';
import { bus } from '../bus.ts';
import { CONFIG } from '../../data/progression.ts';

export interface Progression {
  regions: string[];
  tools: Record<string, number>;
  quest: number;
  contract: number;
  stats: Record<string, number>;
}
export interface FarmRow {
  id: string; name: string; owner_id: string; invite_code: string;
  level: number; xp: number; coins: number; reputation: number; rev: number;
  progression: Progression; nodes: Record<string, number>;
}
export interface Ent { k: string; kind: string; level: number; state: { p?: ([string, number] | null)[]; q?: [string, number][]; proj?: Project; w?: Record<string, { lv: number; at: number }> } }
export interface Project { k: string; need: { coins?: number; items?: Record<string, number> }; got: Record<string, number>; by: Record<string, number>; at: number }
export interface Order { slot: number; order_key: string; npc: string; items: Record<string, number>; reward: { coins: number; xp: number; rep: number; level?: number }; progress: { got?: Record<string, number>; by?: Record<string, number> }; status: string }
export interface Member { user_id: string; username: string; role: string; stats: Record<string, number>; look: Record<string, number>; joined_at: string; bag?: Record<string, number>; bag_tier?: number }

export type Action =
  | { t: 'harvest'; n: string }
  | { t: 'plant'; e: string; i: number; c: string }
  | { t: 'reap'; e: string; i: number }
  | { t: 'craft'; b: string; r: string }
  | { t: 'collect'; b: string }
  | { t: 'sell'; i: string; q: number; src?: 'bag' }
  | { t: 'deposit'; i?: string }
  | { t: 'bag' }
  | { t: 'hire'; w: string }
  | { t: 'wclaim' }
  | { t: 'tool'; tool: string }
  | { t: 'give'; k: string; i: string; q: number }
  | { t: 'order'; o: number }
  | { t: 'skip'; o: number }
  | { t: 'cgive'; i: string; q: number }
  | { t: 'quest' };

export interface ActResult { ok: boolean; e?: string; [k: string]: unknown }

interface Pending { a: Action; resolve: (r: ActResult) => void }

interface Delta {
  rev: number; by: string; now: number;
  farm: Omit<FarmRow, 'id' | 'name' | 'owner_id' | 'invite_code' | 'rev'>;
  inv: Record<string, number>; ents: Ent[]; gone: string[]; orders: Order[];
  member?: { user_id: string; stats: Record<string, number>; bag?: Record<string, number>; bag_tier?: number };
  res?: ActResult[]; dup?: boolean; noop?: boolean;
}

const uuid = () => crypto.randomUUID();

class FarmStore {
  farm: FarmRow | null = null;
  inv: Record<string, number> = {};
  ents: Record<string, Ent> = {};
  orders: Record<number, Order> = {};
  members: Member[] = [];
  online: Set<string> = new Set();
  /** serverNow - Date.now() */
  offset = 0;
  connected = false;
  syncing = false;
  version = 0;
  /** usuário local (para a mochila) */
  myId = '';
  /** coletas a caminho do servidor, já mostradas na mochila */
  private pend: Record<string, number> = {};

  private queue: Pending[] = [];
  private inflight: { batch: string; items: Pending[] } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  private resyncing: Promise<void> | null = null;

  now = () => Date.now() + this.offset;

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  getVersion = () => this.version;
  private emit() { this.version++; for (const l of this.listeners) l(); }

  reset() {
    this.farm = null; this.inv = {}; this.ents = {}; this.orders = {}; this.members = []; this.online = new Set();
    this.queue = []; this.inflight = null; this.emit();
  }

  async load(farmId: string) {
    const { data, error } = await supabase.rpc('get_farm_state', { p_farm: farmId });
    if (error) throw new Error(error.message);
    this.applySnapshot(data);
  }

  applySnapshot(s: { now: number; farm: FarmRow; inv: Record<string, number>; ents: Ent[]; orders: Order[]; members: Member[] }) {
    this.offset = s.now - Date.now();
    this.farm = s.farm;
    this.inv = s.inv;
    this.ents = Object.fromEntries(s.ents.map((e) => [e.k, e]));
    this.orders = Object.fromEntries(s.orders.map((o) => [o.slot, o]));
    this.members = s.members;
    this.emit();
    bus.emit('state:reset');
  }

  /** Recarrega tudo (após reconexão ou lacuna de revisão). */
  resync() {
    if (!this.farm) return Promise.resolve();
    if (!this.resyncing) {
      const id = this.farm.id;
      this.syncing = true;
      this.resyncing = this.load(id).catch((e) => console.warn('resync falhou', e)).finally(() => { this.resyncing = null; this.syncing = false; this.emit(); });
    }
    return this.resyncing;
  }

  applyDelta(d: Delta) {
    if (!this.farm || d.rev === undefined || !d.farm) return;
    if (d.rev <= this.farm.rev) return; // já aplicado (resposta e broadcast chegam os dois)
    if (d.rev > this.farm.rev + 1) { void this.resync(); return; }
    const prevLevel = this.farm.level;
    const prevRegions = this.farm.progression.regions.length;
    this.offset = d.now - Date.now();
    Object.assign(this.farm, d.farm, { rev: d.rev });
    for (const [k, v] of Object.entries(d.inv)) { if (v > 0) this.inv[k] = v; else delete this.inv[k]; }
    for (const e of d.ents) this.ents[e.k] = e;
    for (const k of d.gone) delete this.ents[k];
    for (const o of d.orders) this.orders[o.slot] = o;
    if (d.member) {
      const m = this.members.find((x) => x.user_id === d.member!.user_id);
      if (m) { m.stats = d.member.stats; if (d.member.bag) m.bag = d.member.bag; if (d.member.bag_tier !== undefined) m.bag_tier = d.member.bag_tier; }
    }
    this.emit();
    bus.emit('state:delta', { by: d.by, ents: d.ents.map((e) => e.k).concat(d.gone), nodes: true });
    if (this.farm.level > prevLevel) bus.emit('levelup', this.farm.level);
    if (this.farm.progression.regions.length > prevRegions) bus.emit('regions');
  }

  setMembers(m: Member[]) { this.members = m; this.emit(); }
  setOnline(ids: string[]) { this.online = new Set(ids); this.emit(); }
  setConnected(v: boolean) { this.connected = v; this.emit(); }

  /**
   * Enfileira uma ação. Coletas de recursos esperam até 1.2 s para sair
   * no mesmo lote; ações de interface saem imediatamente.
   */
  act(a: Action, immediate = a.t !== 'harvest' && a.t !== 'reap'): Promise<ActResult> {
    return new Promise((resolve) => {
      this.queue.push({ a, resolve });
      if (immediate || this.queue.length >= 8) this.schedule(0);
      else this.schedule(1200);
    });
  }

  private schedule(ms: number) {
    if (this.timer) { if (ms > 0) return; clearTimeout(this.timer); }
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, ms);
  }

  private async flush() {
    if (this.inflight || !this.farm || this.queue.length === 0) return;
    const items = this.queue.splice(0, 40);
    this.inflight = { batch: uuid(), items };
    await this.send();
  }

  private async send(attempt = 0): Promise<void> {
    const job = this.inflight!;
    const farmId = this.farm!.id;
    const { data, error } = await supabase.rpc('farm_act', { p_farm: farmId, p_batch: job.batch, p_actions: job.items.map((p) => p.a) });
    if (error) {
      // erro de rede: reenvia o MESMO lote (o servidor ignora duplicatas)
      const transient = !error.code || error.message.includes('fetch') || error.code === 'PGRST301';
      if (transient && attempt < 6) {
        bus.emit('toast', { kind: 'warn', text: 'Sem conexão. Tentando de novo…' });
        await new Promise((r) => setTimeout(r, Math.min(8000, 600 * 2 ** attempt)));
        return this.send(attempt + 1);
      }
      job.items.forEach((p) => p.resolve({ ok: false, e: error.message.match(/^[a-z_]+(:[a-z0-9_]+)*$/) ? error.message : 'network' }));
      this.inflight = null;
      void this.resync();
      if (this.queue.length) this.schedule(0);
      return;
    }
    const d = data as Delta;
    if (d.dup) {
      job.items.forEach((p) => p.resolve({ ok: true }));
      await this.resync();
    } else {
      if (!d.noop) this.applyDelta(d);
      job.items.forEach((p, i) => p.resolve(d.res?.[i] ?? { ok: false, e: 'error' }));
    }
    this.inflight = null;
    if (this.queue.length) this.schedule(0);
  }

  /** Coleta que vai para a mochila: aparece na hora e se ajusta quando o servidor responde. */
  gather(a: Action, item: string, q: number): Promise<ActResult> {
    this.pend[item] = (this.pend[item] ?? 0) + q;
    this.emit();
    return this.act(a).then((r) => {
      this.pend[item] -= q;
      if (this.pend[item] <= 0) delete this.pend[item];
      this.emit();
      return r;
    });
  }

  // ---------------------------------------------------------------- seletores
  me = () => this.members.find((m) => m.user_id === this.myId);
  /** Mochila do jogador local, incluindo coletas ainda não confirmadas. */
  bag = (): Record<string, number> => {
    const out = { ...(this.me()?.bag ?? {}) };
    for (const [k, v] of Object.entries(this.pend)) out[k] = (out[k] ?? 0) + v;
    return out;
  };
  bagUsed = () => Object.values(this.bag()).reduce((a, b) => a + b, 0);
  bagTier = () => this.me()?.bag_tier ?? 0;
  bagCap = () => CONFIG.bagCap[Math.min(this.bagTier(), CONFIG.bagCap.length - 1)];
  get progression() { return this.farm?.progression; }
  hasRegion = (r: string) => !!this.farm?.progression.regions.includes(r);
  lvl = (k: string) => this.ents[k]?.level ?? 0;
  tool = (t: string) => this.farm?.progression.tools[t] ?? 0;
  qty = (i: string) => this.inv[i] ?? 0;
  invTotal = () => Object.values(this.inv).reduce((a, b) => a + b, 0);
  nodeReady = (id: string) => (this.farm?.nodes[id] ?? 0) <= this.now();
  memberName = (uid: string) => this.members.find((m) => m.user_id === uid)?.username ?? 'alguém';
  projects = () => Object.values(this.ents).filter((e) => e.state.proj);
}

export const store = new FarmStore();
