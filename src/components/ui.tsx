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

/** Medalhão esmaltado com um ícone pintado (ui_*, item) ou uma imagem. */
export function Medal({ icon, src, size = 48, tone = 'esm' }: { icon?: string; src?: string; size?: number; tone?: 'esm' | 'ipe' | 'anil' | 'folha' }) {
  return (
    <span className={`medal medal-${tone}`} style={{ width: size, height: size }}>
      <img src={src ?? iconUrl(icon!, 96)} alt="" draggable={false} />
    </span>
  );
}

/** Número que conta até o novo valor (moedas, XP). */
export function useCountUp(value: number, ms = 650) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now(), a = from.current, b = value;
    if (a === b) return;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(a + (b - a) * e));
      if (k < 1) raf = requestAnimationFrame(step); else from.current = b;
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); from.current = b; };
  }, [value, ms]);
  return shown;
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
            <span>{Math.min(have, q)}/{q}</span>
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

export function Sheet({ title, subtitle, icon, src, onClose, children, wide }: { title: string; subtitle?: string; icon?: string; src?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    ref.current?.focus();
    play('open');
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <section className={`sheet${wide ? ' sheet-wide' : ''}`} role="dialog" aria-label={title} ref={ref} tabIndex={-1}>
      <header className="sheet-head">
        {(icon || src) && <Medal icon={icon} src={src} size={54} tone="ipe" />}
        <div className="sheet-title"><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <button className="icon-btn close" onClick={onClose} aria-label="Fechar painel">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" /></svg>
        </button>
      </header>
      <div className="sheet-body">{children}</div>
    </section>
  );
}

/** Seção com título bordado. */
export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="sec">
      <div className="sec-head"><h3>{title}</h3>{aside}</div>
      {children}
    </section>
  );
}

export function Bar({ value, max, tone = 'ipe' }: { value: number; max: number; tone?: 'ipe' | 'folha' | 'chita' }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return <div className={`bar bar-${tone}`} role="progressbar" aria-valuenow={value} aria-valuemax={max}><span style={{ width: `${pct}%` }} /></div>;
}

/** Anel de progresso (filas de produção). */
export function Ring({ value, max, size = 46, children }: { value: number; max: number; size?: number; children?: ReactNode }) {
  const r = size / 2 - 4, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, value / Math.max(1, max)));
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" />
        <circle cx={size / 2} cy={size / 2} r={r} className={p >= 1 ? 'ring-fg done' : 'ring-fg'} strokeDasharray={c} strokeDashoffset={c * (1 - p)} />
      </svg>
      <span className="ring-in">{children}</span>
    </span>
  );
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

interface Toast { id: number; kind: string; text: string; icon?: string }

export function Toasts() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => bus.on('toast', (t: { kind: string; text: string; icon?: string }) => {
    const id = Math.random();
    setList((l) => (l.some((x) => x.text === t.text) ? l : [...l.slice(-2), { id, ...t }]));
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 3400);
  }), []);
  const def: Record<string, string> = { ok: 'star', warn: 'ui_lock', info: 'ui_chat' };
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <img src={iconUrl(t.icon ?? def[t.kind] ?? 'ui_chat', 64)} width={28} height={28} alt="" />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Janela de celebração centralizada. */
export function Modal({ title, kicker, children, onClose, action = 'Continuar' }: { title: string; kicker?: string; children: ReactNode; onClose: () => void; action?: string }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal panel" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="confetti" aria-hidden>{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>
        {kicker && <span className="modal-kicker">{kicker}</span>}
        <h2 className="modal-title">{title}</h2>
        {children}
        <button className="btn btn-primary btn-lg" onClick={onClose} autoFocus>{action}</button>
      </div>
    </div>
  );
}

export const toast = (text: string, kind: 'ok' | 'warn' | 'info' = 'info', icon?: string) => bus.emit('toast', { kind, text, icon });
