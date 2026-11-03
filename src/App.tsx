import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './services/supabase.ts';
import { AuthScreen } from './components/AuthScreen.tsx';
import { FarmsScreen } from './components/FarmsScreen.tsx';
import { CharacterEditor } from './components/CharacterEditor.tsx';
import { GameScreen } from './components/GameScreen.tsx';
import { Toasts } from './components/ui.tsx';
import { normalizeLook, type Look } from './game/art/characters.ts';
import { sound } from './game/audio.ts';
import { music } from './game/music.ts';

export interface Me { id: string; username: string; look: Look; fresh: boolean }

type Screen = { s: 'loading' } | { s: 'auth' } | { s: 'farms' } | { s: 'character'; back: 'farms' | 'game' } | { s: 'game'; farm: string };

const LAST_FARM = 'sm-last-farm';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [screen, setScreen] = useState<Screen>({ s: 'loading' });

  const loadMe = useCallback(async (s: Session) => {
    const { data, error } = await supabase.from('profiles').select('username, character_config').eq('user_id', s.user.id).maybeSingle();
    if (error || !data) { setScreen({ s: 'auth' }); return; }
    const cfg = data.character_config as Record<string, number>;
    const m: Me = { id: s.user.id, username: data.username, look: normalizeLook(cfg), fresh: !cfg || Object.keys(cfg).length === 0 };
    setMe(m);
    if (m.fresh) { setScreen({ s: 'character', back: 'farms' }); return; }
    // recuperação de sessão: volta direto para a última fazenda aberta
    let last: string | null = null;
    try { last = localStorage.getItem(LAST_FARM); } catch { /* sem storage */ }
    setScreen(last ? { s: 'game', farm: last } : { s: 'farms' });
  }, []);

  // áudio só pode começar depois de um gesto do usuário
  useEffect(() => {
    const go = () => { sound.unlock(); music.start(); };
    window.addEventListener('pointerdown', go, { once: true });
    window.addEventListener('keydown', go, { once: true });
    return () => { window.removeEventListener('pointerdown', go); window.removeEventListener('keydown', go); };
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) void loadMe(data.session); else setScreen({ s: 'auth' });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((ev, s) => {
      setSession(s);
      if (ev === 'SIGNED_OUT') { setMe(null); setScreen({ s: 'auth' }); }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadMe]);

  const openFarm = (id: string) => { try { localStorage.setItem(LAST_FARM, id); } catch { /* */ } setScreen({ s: 'game', farm: id }); };
  const leaveFarm = () => { try { localStorage.removeItem(LAST_FARM); } catch { /* */ } setScreen({ s: 'farms' }); };

  return (
    <>
      {screen.s === 'loading' && <div className="splash"><div className="splash-plate">Sítio Mutirão</div></div>}
      {screen.s === 'auth' && <AuthScreen onDone={(s) => void loadMe(s)} />}
      {screen.s === 'farms' && me && session && (
        <FarmsScreen me={me} onOpen={openFarm} onEditCharacter={() => setScreen({ s: 'character', back: 'farms' })} />
      )}
      {screen.s === 'character' && me && (
        <CharacterEditor
          me={me}
          onSaved={(look) => { setMe({ ...me, look, fresh: false }); setScreen(screen.back === 'game' ? { s: 'farms' } : { s: 'farms' }); }}
        />
      )}
      {screen.s === 'game' && me && (
        <GameScreen key={screen.farm} farmId={screen.farm} me={me} onExit={leaveFarm} onLookChange={(look) => setMe({ ...me, look })} />
      )}
      <Toasts />
    </>
  );
}
