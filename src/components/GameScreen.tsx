import { useCallback, useEffect, useRef, useState } from 'react';
import type Phaser from 'phaser';
import { store } from '../game/state/store.ts';
import { realtime } from '../game/multiplayer/realtime.ts';
import { bus, type PanelId } from '../game/bus.ts';
import { sound } from '../game/audio.ts';
import { Hud } from './Hud.tsx';
import { Panels } from './panels/Panels.tsx';
import type { Me } from '../App.tsx';
import type { Look } from '../game/art/characters.ts';

export function GameScreen({ farmId, me, onExit, onLookChange }: { farmId: string; me: Me; onExit: () => void; onLookChange: (l: Look) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<Phaser.Game | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [progress, setProgress] = useState(0);
  const [panel, setPanel] = useState<PanelId | null>(null);

  useEffect(() => {
    let alive = true;
    const offs = [
      bus.on('boot:progress', (p: number) => setProgress(0.3 + p * 0.7)),
      bus.on('world:ready', () => alive && setPhase('ready')),
      bus.on('panel', (p: PanelId) => setPanel(p)),
    ];
    (async () => {
      try {
        await store.load(farmId);
        if (!alive) return;
        setProgress(0.3);
        // Phaser só é baixado quando o jogo abre (login e menus ficam leves)
        const [{ createGame }] = await Promise.all([import('../game/createGame.ts'), realtime.connect(farmId, { u: me.id, name: me.username, look: me.look as unknown as Record<string, number> })]);
        if (!alive || !host.current) return;
        game.current = createGame(host.current, { id: me.id, name: me.username, look: me.look as unknown as Record<string, number> });
      } catch (e) {
        console.warn(e);
        if (alive) setPhase('error');
      }
    })();
    return () => {
      alive = false;
      offs.forEach((f) => f());
      realtime.disconnect();
      game.current?.destroy(true);
      game.current = null;
      store.reset();
    };
  }, [farmId, me.id, me.username]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => setPanel(null), []);

  if (phase === 'error') {
    return (
      <main className="splash">
        <div className="panel splash-err">
          <h2>Não foi possível abrir esta fazenda</h2>
          <p className="muted">Talvez você tenha saído dela, ou a conexão caiu. Volte à lista e tente de novo.</p>
          <button className="btn btn-primary" onClick={onExit}>Voltar às fazendas</button>
        </div>
      </main>
    );
  }

  return (
    <div className="game" onPointerDown={() => sound.unlock()}>
      <div className="game-canvas" ref={host} data-testid="game-canvas" />
      {phase === 'loading' && (
        <div className="loading">
          <div className="loading-plate">
            <span className="logo">Sítio<br />Mutirão</span>
            <div className="bar bar-ipe"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>
            <small>{progress < 0.3 ? 'Abrindo a porteira…' : 'Preparando a terra…'}</small>
          </div>
        </div>
      )}
      {phase === 'ready' && (
        <>
          <Hud me={me} onOpen={setPanel} panelOpen={!!panel} />
          {panel && <Panels panel={panel} onClose={close} me={me} onExit={onExit} onLookChange={(l) => { onLookChange(l); bus.emit('look', l); void realtime.updateLook(l as unknown as Record<string, number>); }} />}
        </>
      )}
    </div>
  );
}
