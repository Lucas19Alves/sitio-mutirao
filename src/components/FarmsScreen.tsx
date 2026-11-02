import { useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabase.ts';
import { signOut } from '../services/auth.ts';
import { portrait } from '../game/art/characters.ts';
import { errorText } from '../utils/errors.ts';
import type { Me } from '../App.tsx';

interface FarmItem { id: string; name: string; level: number; invite_code: string; role: string; members: number }

export function Portrait({ look, scale = 1, className }: { look: Me['look']; scale?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = ref.current!; el.innerHTML = ''; el.appendChild(portrait(look, scale)); }, [look, scale]);
  return <div className={className ?? 'portrait'} ref={ref} aria-hidden />;
}

export function FarmsScreen({ me, onOpen, onEditCharacter }: { me: Me; onOpen: (id: string) => void; onEditCharacter: () => void }) {
  const [farms, setFarms] = useState<FarmItem[] | null>(null);
  const [name, setName] = useState(`Sítio de ${me.username}`.slice(0, 32));
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.rpc('my_farms').then(({ data, error }) => { if (error) setErr('Não foi possível carregar suas fazendas.'); setFarms((data as FarmItem[]) ?? []); });
  }, []);

  const run = async (fn: () => Promise<string>) => {
    setErr(''); setBusy(true);
    try { onOpen(await fn()); } catch (e) { setErr(errorText((e as Error).message)); } finally { setBusy(false); }
  };
  const create = () => run(async () => {
    const { data, error } = await supabase.rpc('create_farm', { p_name: name });
    if (error) throw new Error(error.message);
    return data as string;
  });
  const join = () => run(async () => {
    const { data, error } = await supabase.rpc('join_farm', { p_code: code });
    if (error) throw new Error(error.message);
    return data as string;
  });

  return (
    <main className="farms">
      <header className="farms-top">
        <div className="me-chip">
          <Portrait look={me.look} scale={0.6} className="me-portrait" />
          <div><strong>{me.username}</strong><button className="link" onClick={onEditCharacter}>Mudar aparência</button></div>
        </div>
        <button className="btn btn-quiet btn-sm" onClick={() => void signOut()}>Sair da conta</button>
      </header>

      <h1 className="farms-title">Suas fazendas</h1>
      {farms === null ? <p className="muted">Carregando…</p> : farms.length === 0 ? (
        <p className="muted">Você ainda não participa de nenhuma fazenda. Crie uma e chame alguém pelo código, ou entre com o código de um amigo.</p>
      ) : (
        <ul className="farm-list">
          {farms.map((f) => (
            <li key={f.id}>
              <button className="farm-row" onClick={() => onOpen(f.id)} data-testid="farm-row">
                <span className="farm-lv">{f.level}</span>
                <span className="farm-name">{f.name}<small>{f.members} {f.members === 1 ? 'membro' : 'membros'}, código {f.invite_code}</small></span>
                <span className="farm-go">Jogar</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="farms-actions">
        <form className="panel" onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <h2>Nova fazenda</h2>
          <p className="muted">Você recebe um código para convidar até 3 pessoas.</p>
          <label>Nome<input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} data-testid="farm-name" /></label>
          <button className="btn btn-primary" disabled={busy} data-testid="create-farm">Criar fazenda</button>
        </form>
        <form className="panel" onSubmit={(e) => { e.preventDefault(); void join(); }}>
          <h2>Entrar com código</h2>
          <p className="muted">Peça o código de 6 letras para quem criou a fazenda.</p>
          <label>Código<input value={code} maxLength={6} autoCapitalize="characters" onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="EX: K7PQ2M" data-testid="join-code" /></label>
          <button className="btn btn-primary" disabled={busy || code.length !== 6} data-testid="join-farm">Entrar na fazenda</button>
        </form>
      </div>
      {err && <p className="form-err" role="alert">{err}</p>}
    </main>
  );
}
