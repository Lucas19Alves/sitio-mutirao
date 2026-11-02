import { useEffect, useState, useSyncExternalStore } from 'react';
import { store } from '../game/state/store.ts';
import { bus } from '../game/bus.ts';

/** Re-renderiza quando o estado da fazenda muda. */
export function useFarm() {
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store;
}

/** Re-renderiza a cada `ms` (cronômetros de produção). */
export function useTicker(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(t); }, [ms]);
}

export function useBus<T>(ev: string, fn: (p: T) => void) {
  useEffect(() => bus.on(ev, fn as (p?: unknown) => void), [ev, fn]);
}
