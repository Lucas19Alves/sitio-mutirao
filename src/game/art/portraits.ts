// Retratos para a interface (prédios, rostos, cena de entrada) renderizados dos modelos 3D do jogo.
// O motor 3D é carregado sob demanda: enquanto a imagem não fica pronta, devolve um quadro vazio
// e avisa os componentes (useThumbs) para redesenhar quando ela chega.
import { useSyncExternalStore } from 'react';
import { REGION_BY_ID } from '../../data/catalog.ts';
import { LOOK_LIMITS, lookKey, normalizeLook, type Look } from './characters.ts';

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const cache = new Map<string, string>();
const loading = new Set<string>();
const queue: (() => Promise<void>)[] = [];
let busy = false;
let ver = 0;
const subs = new Set<() => void>();

/** Componentes que mostram retratos chamam isto para redesenhar quando eles ficam prontos. */
export function useThumbs() {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => ver);
}

type Mod = typeof import('../three/thumbs3d.ts');
let mod: Promise<Mod> | null = null;
const three = () => (mod ??= import('../three/thumbs3d.ts'));

async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    await queue.shift()!();
    await new Promise((r) => setTimeout(r, 0)); // um retrato por vez, sem travar a interface
  }
  busy = false;
}

function get(key: string, make: (m: Mod) => string): string {
  const hit = cache.get(key);
  if (hit) return hit;
  if (!loading.has(key)) {
    loading.add(key);
    queue.push(async () => {
      try { cache.set(key, make(await three())); } catch (e) { console.warn('retrato', key, e); cache.set(key, BLANK); }
      ver++; subs.forEach((f) => f());
    });
    void pump();
  }
  return BLANK;
}

export const buildingPortrait = (id: string, size = 160) => get(`b:${id}:${size}`, (m) => m.buildingThumb(id, size));
export const facePortrait = (look: unknown, size = 96) => { const L = normalizeLook(look); return get(`f:${lookKey(L)}:${size}`, (m) => m.faceThumb(L, size)); };
export const dioramaUrl = () => get('diorama', (m) => m.diorama(1040, 700));

function hash(s: string) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }

/** Aparência determinística a partir do nome (moradores, contratantes). */
export function npcLook(name: string): Look {
  let h = hash(name);
  const next = (n: number) => { h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return h % n; };
  return Object.fromEntries(Object.entries(LOOK_LIMITS).map(([k, n]) => [k, next(n)])) as unknown as Look;
}

export const npcPortrait = (name: string, size = 64) => facePortrait(npcLook(name), size);

export const regionName = (id: string) => REGION_BY_ID[id]?.name ?? id;
