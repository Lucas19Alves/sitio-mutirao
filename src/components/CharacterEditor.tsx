import { useState } from 'react';
import { supabase } from '../services/supabase.ts';
import {
  SKINS, HAIR_STYLES, HAIR_COLORS, SHIRT_STYLES, CLOTH_COLORS, PANTS_COLORS, HATS, ACCESSORIES, LOOK_LIMITS, type Look,
} from '../game/art/characters.ts';
import { Portrait } from './FarmsScreen.tsx';
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
          <div className="pedestal"><Portrait look={look} scale={2.2} className="char-portrait" /></div>
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
