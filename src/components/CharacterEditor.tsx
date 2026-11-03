import { useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabase.ts';
import {
  SKINS, HAIR_STYLES, HAIR_COLORS, SHIRT_STYLES, CLOTH_COLORS, PANTS_COLORS, HATS, ACCESSORIES, LOOK_LIMITS, POSES, FW, FH, drawPreview, type Look, type Pose,
} from '../game/art/characters.ts';
import type { Me } from '../App.tsx';

type Field = keyof Look;
const GROUPS: { label: string; field: Field; names?: string[]; colors?: string[] }[] = [
  { label: 'Pele', field: 'skin', colors: SKINS },
  { label: 'Cabelo', field: 'hair', names: HAIR_STYLES },
  { label: 'Cor do cabelo', field: 'hairColor', colors: HAIR_COLORS },
  { label: 'Roupa', field: 'shirt', names: SHIRT_STYLES },
  { label: 'Cor da roupa', field: 'shirtColor', colors: CLOTH_COLORS },
  { label: 'Calça', field: 'pants', colors: PANTS_COLORS },
  { label: 'Chapéu', field: 'hat', names: HATS },
  { label: 'Cor do chapéu', field: 'hatColor', colors: CLOTH_COLORS },
  { label: 'Acessório', field: 'acc', names: ACCESSORIES },
];

/** Prévia animada: respira, caminha girando nas 4 direções e comemora; ou a pose escolhida. */
const SHOW: [Pose, number, number][] = [['idle', 0, 2400], ['walk', 0, 1400], ['walk', 1, 1400], ['walk', 3, 1400], ['walk', 2, 1400], ['work', 0, 1200], ['cheer', 0, 1300]];
const RATE: Record<Pose, number> = { idle: 2.2, walk: 9, work: 9, crouch: 4, cheer: 5, carry: 8 };
function LivePreview({ look, scale }: { look: Look; scale: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [pick, setPick] = useState<[Pose, number] | null>(null);
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0; const t0 = performance.now();
    const total = SHOW.reduce((n, s) => n + s[2], 0);
    const loop = (t: number) => {
      const el = ref.current; if (!el) return;
      let pose: Pose, row: number, local: number;
      if (pick) { [pose, row] = pick; local = t - t0; }
      else { let k = (t - t0) % total, i = 0; while (k > SHOW[i][2]) { k -= SHOW[i][2]; i++; } [pose, row] = SHOW[i]; local = k; }
      const f = reduce ? 0 : Math.floor((local / 1000) * RATE[pose]) % POSES[pose][1];
      drawPreview(el, look, row, pose, f);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [look, pick]);
  return (
    <>
      <div className="pedestal"><canvas ref={ref} className="char-portrait" width={FW * 2} height={FH * 2} style={{ width: FW * scale, height: FH * scale }} data-testid="look-preview" /></div>
      <div className="char-dirs" role="group" aria-label="Pose da prévia">
        {([['Andar', null], ['Frente', ['idle', 0]], ['Lado', ['walk', 2]], ['Costas', ['idle', 3]], ['Festa', ['cheer', 0]]] as [string, [Pose, number] | null][]).map(([n, v]) => (
          <button key={n} className={`chip${JSON.stringify(pick) === JSON.stringify(v) ? ' on' : ''}`} onClick={() => setPick(v)}>{n}</button>
        ))}
      </div>
    </>
  );
}

export function CharacterEditor({ me, onSaved, embedded }: { me: Me; onSaved: (l: Look) => void; embedded?: boolean }) {
  const [look, setLook] = useState<Look>(me.look);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (f: Field, v: number) => setLook({ ...look, [f]: v });
  const random = () => setLook(Object.fromEntries(Object.entries(LOOK_LIMITS).map(([k, n]) => [k, Math.floor(Math.random() * n)])) as unknown as Look);

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
          {GROUPS.map((g) => (
            <fieldset key={g.field} className="opt">
              <legend>{g.label}</legend>
              <div className="opt-row">
                {g.colors
                  ? g.colors.map((c, i) => (
                    <button key={c} className={`swatch${look[g.field] === i ? ' on' : ''}`} style={{ background: c }} onClick={() => set(g.field, i)} aria-label={`${g.label} ${i + 1}`} aria-pressed={look[g.field] === i} />
                  ))
                  : g.names!.map((n, i) => (
                    <button key={n} className={`chip${look[g.field] === i ? ' on' : ''}`} onClick={() => set(g.field, i)} aria-pressed={look[g.field] === i}>{n}</button>
                  ))}
              </div>
            </fieldset>
          ))}
        </div>
      </div>
      {err && <p className="form-err" role="alert">{err}</p>}
      <div className="char-save"><button className="btn btn-primary btn-lg" onClick={save} disabled={busy} data-testid="save-look">{busy ? 'Salvando…' : 'Salvar aparência'}</button></div>
    </main>
  );
}
