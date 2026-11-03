import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { signIn, signUp, validatePassword, validateUsername } from '../services/auth.ts';
import { dioramaUrl } from '../game/art/portraits.ts';
import { iconUrl } from '../game/art/icons.ts';
import { sound } from '../game/audio.ts';

function Diorama() {
  const [src] = useState(() => dioramaUrl());
  return <div className="diorama" aria-hidden><img src={src} alt="" /></div>;
}

export function AuthScreen({ onDone }: { onDone: (s: Session) => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    sound.unlock();
    setErr('');
    const u = validateUsername(username);
    if (u) return setErr(u);
    if (mode === 'up') {
      const p = validatePassword(password);
      if (p) return setErr(p);
      if (password !== confirm) return setErr('As senhas não conferem.');
    }
    setBusy(true);
    try {
      const s = mode === 'up' ? await signUp(username, password) : await signIn(username, password);
      if (s) onDone(s);
    } catch (x) {
      setErr((x as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <main className="auth">
      <div className="auth-hero">
        <h1 className="logo">Sítio<br />Mutirão</h1>
        <p className="tagline">Uma fazenda, vários donos. Plantem, construam e expandam a mesma terra — juntos.</p>
        <Diorama />
        <ul className="auth-feats">
          <li><img src={iconUrl('wheat')} alt="" width={28} height={28} />Colham e produzam com o estoque compartilhado</li>
          <li><img src={iconUrl('beam')} alt="" width={28} height={28} />Ergam prédios em projetos coletivos</li>
          <li><img src={iconUrl('crystal')} alt="" width={28} height={28} />Abram 7 regiões até o Planalto</li>
        </ul>
      </div>
      <form className="panel auth-card" onSubmit={submit}>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'in'} className={mode === 'in' ? 'on' : ''} onClick={() => { setMode('in'); setErr(''); }}>Entrar</button>
          <button type="button" role="tab" aria-selected={mode === 'up'} className={mode === 'up' ? 'on' : ''} onClick={() => { setMode('up'); setErr(''); }}>Criar conta</button>
        </div>
        <label>Username
          <input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))} placeholder="ex.: dona_cida" maxLength={20} />
        </label>
        <label>Senha
          <input name="password" type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {mode === 'up' && (
          <>
            <label>Repita a senha
              <input name="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
            <p className="hint">Sem e-mail no cadastro, então não há recuperação de senha. Guarde-a bem.</p>
          </>
        )}
        {err && <p className="form-err" role="alert">{err}</p>}
        <button className="btn btn-primary btn-lg" disabled={busy} type="submit">{busy ? 'Aguarde…' : mode === 'up' ? 'Criar conta e entrar' : 'Entrar'}</button>
      </form>
    </main>
  );
}
