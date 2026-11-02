// Barramento de eventos entre Phaser e React (sem dependências).
type Handler = (payload?: any) => void;

class Bus {
  private map = new Map<string, Set<Handler>>();
  on(ev: string, fn: Handler) {
    if (!this.map.has(ev)) this.map.set(ev, new Set());
    this.map.get(ev)!.add(fn);
    return () => this.off(ev, fn);
  }
  off(ev: string, fn: Handler) { this.map.get(ev)?.delete(fn); }
  emit(ev: string, payload?: unknown) { this.map.get(ev)?.forEach((fn) => fn(payload)); }
}

export const bus = new Bus();

export type PanelId =
  | 'inventory' | 'sell' | 'projects' | 'orders' | 'tools' | 'progress' | 'settings' | 'character'
  | { b: string } | { plant: string; i: number };
