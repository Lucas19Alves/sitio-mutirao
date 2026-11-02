import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ITEM_BY_ID, type Cost } from '../data/catalog.ts';
import { iconUrl } from '../game/art/icons.ts';
import { store } from '../game/state/store.ts';
import { bus } from '../game/bus.ts';
import { fmt } from '../utils/format.ts';
import { play } from '../game/audio.ts';

export function ItemIcon({ id, size = 32 }: { id: string; size?: number }) {
  return <img className="item-icon" src={iconUrl(id, 64)} width={size} height={size} alt={ITEM_BY_ID[id]?.name ?? ''} draggable={false} />;
}

export function Coins({ n, size = 18 }: { n: number; size?: number }) {
  return <span className="coins"><img src={iconUrl('coin', 64)} width={size} height={size} alt="moedas" />{fmt(n)}</span>;
}

/** Lista de custo; cada item mostra quanto o estoque tem. */
export function CostList({ cost, got }: { cost: Cost; got?: Record<string, number> }) {
  const coins = cost.coins ?? 0;
  return (
    <ul className="cost">
      {coins > 0 && (
        <li className={(got ? (got.coins ?? 0) >= coins : (store.farm?.coins ?? 0) >= coins) ? 'ok' : 'miss'}>
          <img src={iconUrl('coin', 64)} width={20} height={20} alt="" />
          <span>{got ? `${fmt(Math.min(coins, got.coins ?? 0))}/${fmt(coins)}` : fmt(coins)}</span>
        </li>
      )}
      {Object.entries(cost.items ?? {}).map(([k, q]) => {
        const have = got ? got[k] ?? 0 : store.qty(k);
        return (
          <li key={k} className={have >= q ? 'ok' : 'miss'} title={ITEM_BY_ID[k]?.name}>
            <ItemIcon id={k} size={20} />
            <span>{got ? `${Math.min(have, q)}/${q}` : `${Math.min(have, q)}/${q}`}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function Btn({ children, onClick, kind = 'primary', disabled, small, title, testid }: {
  children: ReactNode; onClick?: () => void | Promise<unknown>; kind?: 'primary' | 'ghost' | 'danger' | 'quiet'; disabled?: boolean; small?: boolean; title?: string; testid?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={`btn btn-${kind}${small ? ' btn-sm' : ''}`}
      disabled={disabled || busy}
      title={title}
      data-testid={testid}
      onClick={async () => {
        if (!onClick) return;
        play('click');
        const r = onClick();
        if (r instanceof Promise) { setBusy(true); try { await r; } finally { setBusy(false); } }
      }}
    >{children}</button>
  );
}

export function Sheet({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <section className={`sheet${wide ? ' sheet-wide' : ''}`} role="dialog" aria-label={title} ref={ref} tabIndex={-1}>
      <header className="sheet-head">
        <h2>{title}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Fechar painel">
          <svg viewBox="0 0 24 24" width="20" height="20"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
        </button>
      </header>
      <div className="sheet-body">{children}</div>
    </section>
  );
}

export function Bar({ value, max, tone = 'ipe' }: { value: number; max: number; tone?: 'ipe' | 'folha' | 'chita' }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return <div className={`bar bar-${tone}`} role="progressbar" aria-valuenow={value} aria-valuemax={max}><span style={{ width: `${pct}%` }} /></div>;
}

/** Seletor de quantidade com atalhos. */
export function Qty({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  const set = (n: number) => onChange(Math.max(1, Math.min(Math.max(1, max), n)));
  return (
    <div className="qty">
      <button onClick={() => set(value - 1)} aria-label="Menos">−</button>
      <input inputMode="numeric" value={value} onChange={(e) => set(Number(e.target.value.replace(/\D/g, '')) || 1)} aria-label="Quantidade" />
      <button onClick={() => set(value + 1)} aria-label="Mais">+</button>
      <button className="qty-max" onClick={() => set(max)}>tudo</button>
    </div>
  );
}

interface Toast { id: number; kind: string; text: string }

export function Toasts() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => bus.on('toast', (t: { kind: string; text: string }) => {
    const id = Math.random();
    setList((l) => (l.some((x) => x.text === t.text) ? l : [...l.slice(-2), { id, ...t }]));
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 3200);
  }), []);
  return <div className="toasts" aria-live="polite">{list.map((t) => <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>)}</div>;
}

export const toast = (text: string, kind: 'ok' | 'warn' | 'info' = 'info') => bus.emit('toast', { kind, text });
