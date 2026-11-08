import { useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabase.ts';
import {
  SKINS, HAIR_STYLES, HAIR_COLORS, SHIRT_STYLES, CLOTH_COLORS, PANTS_COLORS, HATS, ACCESSORIES, LOOK_LIMITS, BODIES, SHOE_COLORS, EYES, FACES, LEGS, type Look,
} from '../game/art/characters.ts';
import { COSMETIC_OF } from '../data/catalog.ts';
import { store } from '../game/state/store.ts';
import type { Me } from '../App.tsx';

type Field = keyof Look;
const TABS = ['Corpo', 'Rosto', 'Cabelo', 'Roupa', 'Extras'] as const;
const GROUPS: { label: string; field: Field; names?: string[]; colors?: string[]; tab: (typeof TABS)[number] }[] = [
  { label: 'Corpo', field: 'body', names: BODIES, tab: 'Corpo' },
  { label: 'Olhos', field: 'eyes', names: EYES, tab: 'Rosto' },
  { label: 'Detalhes do rosto', field: 'face', names: FACES, tab: 'Rosto' },
  { label: 'Pernas', field: 'legs', names: LEGS, tab: 'Roupa' },
  { label: 'Pele', field: 'skin', colors: SKINS, tab: 'Corpo' },
  { label: 'Cabelo', field: 'hair', names: HAIR_STYLES, tab: 'Cabelo' },
  { label: 'Cor do cabelo', field: 'hairColor', colors: HAIR_COLORS, tab: 'Cabelo' },
  { label: 'Roupa', field: 'shirt', names: SHIRT_STYLES, tab: 'Roupa' },
  { label: 'Cor da roupa', field: 'shirtColor', colors: CLOTH_COLORS, tab: 'Roupa' },
  { label: 'Cor da calça ou saia', field: 'pants', colors: PANTS_COLORS, tab: 'Roupa' },
  { label: 'Chapéu', field: 'hat', names: HATS, tab: 'Extras' },
  { label: 'Cor do chapéu', field: 'hatColor', colors: CLOTH_COLORS, tab: 'Extras' },
  { label: 'Acessório', field: 'acc', names: ACCESSORIES, tab: 'Extras' },
  { label: 'Calçado', field: 'shoes', colors: SHOE_COLORS, tab: 'Roupa' },
];

/** Itens pagos ainda não liberados (comprados na Loja; ficam na conta). */
function lockedOf(f: Field, v: number) {
  const c = COSMETIC_OF(f, v);
  return c && !(store.me()?.owned ?? []).includes(c.id) ? c : null;
}
const clean = (l: Look): Look => { const o = { ...l }; for (const k of Object.keys(o) as Field[]) if (lockedOf(k, o[k])) o[k] = 0; return o; };


/** Prévia 3D animada (o mesmo modelo do jogo): respira, anda, trabalha e comemora; ou a pose escolhida. */
type Preview = { setLook: (l: unknown) => void; setPose: (p: string | null, ry?: number) => void; dispose: () => void };
const PICKS: [string, string | null, number][] = [['Animar', null, 0], ['Frente', 'idle', 0], ['Lado', 'walk', Math.PI / 2], ['Costas', 'idle', Math.PI], ['Festa', 'celebrate', 0]];
function LivePreview({ look }: { look: Look; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pv = useRef<Preview | null>(null);
  const [pick, setPick] = useState(0);
  useEffect(() => {
    let alive = true;
    void import('../game/three/thumbs3d.ts').then((m) => { if (!alive || !ref.current) return; pv.current = m.mountPreview(ref.current); pv.current.setLook(look); });
    return () => { alive = false; pv.current?.dispose(); pv.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { pv.current?.setLook(look); }, [look]);
  useEffect(() => { const [, p, ry] = PICKS[pick]; pv.current?.setPose(p, ry); }, [pick]);
  return (
    <>
      <div className="pedestal3d"><canvas ref={ref} className="char-3d" data-testid="look-preview" /></div>
      <div className="char-dirs" role="group" aria-label="Pose da prévia">
        {PICKS.map(([n], i) => <button key={n} className={`chip${pick === i ? ' on' : ''}`} onClick={() => setPick(i)} aria-pressed={pick === i}>{n}</button>)}
      </div>
    </>
  );
}

export function CharacterEditor({ me, onSaved, embedded }: { me: Me; onSaved: (l: Look) => void; embedded?: boolean }) {
  const [look, setLook] = useState<Look>(me.look);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Corpo');
  const [err, setErr] = useState('');
  const set = (f: Field, v: number) => setLook({ ...look, [f]: v });
  const random = () => setLook(clean(Object.fromEntries(Object.entries(LOOK_LIMITS).map(([k, n]) => [k, Math.floor(Math.random() * n)])) as unknown as Look));
  const blocked = (Object.keys(look) as Field[]).some((k) => lockedOf(k, look[k]));

  const save = async () => {
    setBusy(true); setErr('');
    const { error } = await supabase.from('profiles').update({ character_config: look }).eq('user_id', me.id);
    setBusy(false);
    if (error) { setErr('Não foi possível salvar a aparência.'); return; }
    onSaved(look);
  };

  return (
    <main className={embedded ? 'char char-embedded' : 'char'}>
      {!embedded && <h1 className="farms-title">{me.fresh ? 'Quem vai trabalhar na roça?' : 'Sua aparência'}</h1>}
      <div className="char-grid">
        <div className="char-preview panel">
          <LivePreview look={look} scale={1.9} />
          <strong>{me.username}</strong>
          <button className="btn btn-ghost btn-sm" onClick={random}>Sortear visual</button>
        </div>
        <div className="char-options">
          <div className="tabs char-tabs">{TABS.map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
          {GROUPS.filter((g) => g.tab === tab).map((g) => (
            <fieldset key={g.field} className="opt">
              <legend>{g.label}</legend>
              <div className="opt-row">
                {g.colors
                  ? g.colors.map((c, i) => { const lk = lockedOf(g.field, i); return (
                    <button key={c} className={`swatch${look[g.field] === i ? ' on' : ''}${lk ? ' locked' : ''}`} style={{ background: c }} onClick={() => set(g.field, i)} aria-label={`${g.label} ${i + 1}${lk ? ' (bloqueado)' : ''}`} aria-pressed={look[g.field] === i} title={lk ? `${lk.name}: libere na Loja` : undefined} />
                  ); })
                  : g.names!.map((n, i) => { const lk = lockedOf(g.field, i); return (
                    <button key={n} className={`chip${look[g.field] === i ? ' on' : ''}${lk ? ' locked' : ''}`} onClick={() => set(g.field, i)} aria-pressed={look[g.field] === i} title={lk ? 'Libere na Loja' : undefined}>{lk ? '🔒 ' : ''}{n}</button>
                  ); })}
              </div>
            </fieldset>
          ))}
        </div>
      </div>
      {blocked && <p className="note">Alguns itens escolhidos estão bloqueados (🔒). Libere na Loja para poder vestir.</p>}
      {err && <p className="form-err" role="alert">{err}</p>}
      <div className="char-save"><button className="btn btn-primary btn-lg" onClick={save} disabled={busy || blocked} data-testid="save-look">{busy ? 'Salvando…' : 'Salvar aparência'}</button></div>
    </main>
  );
}
