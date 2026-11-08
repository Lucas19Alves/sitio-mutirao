import { useCallback, useEffect, useRef, useState } from 'react';
import { store } from '../game/state/store.ts';
import { realtime } from '../game/multiplayer/realtime.ts';
import { bus, type PanelId } from '../game/bus.ts';
import { sound, play } from '../game/audio.ts';
import { music } from '../game/music.ts';
import { iconUrl } from '../game/art/icons.ts';

const TIPS = [
  'Tudo no estoque é de todos: combinem quem coleta e quem produz.',
  'Obras coletivas com 2 ou mais membros rendem bônus de cooperação.',
  'Clientes no balcão pagam cerca de 35% a mais do que vender no mercado.',
  'Cristais vêm de missões, marcos, clientes especiais e níveis. Use com calma!',
  'Cada campo planta a sua cultura sozinho: é só andar pelos canteiros.',
  'Ferramentas melhores cortam com menos golpes e rendem mais.',
  'Toque num prédio para abrir a produção; colete quando o ícone aparecer.',
  'A fazenda continua salva quando você sai. Volte quando quiser.',
];
import { Hud } from './Hud.tsx';
import { PermissionGate, needsPermissions, notify } from './Permissions.tsx';
import { voice } from '../game/multiplayer/voice.ts';
import { PINGS } from '../data/catalog.ts';
import { logText } from './panels/Coop.tsx';
import type { LogEntry } from '../game/state/store.ts';
import { Panels } from './panels/Panels.tsx';
import type { Me } from '../App.tsx';
import type { Look } from '../game/art/characters.ts';

export function GameScreen({ farmId, me, onExit, onLookChange }: { farmId: string; me: Me; onExit: () => void; onLookChange: (l: Look) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<{ destroy: () => void } | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [progress, setProgress] = useState(0);
  const [panel, setPanel] = useState<PanelId | null>(null);
  // painel aberto pela proximidade de um prédio (fecha sozinho ao se afastar)
  const [ctx, setCtx] = useState(false);
  const ctxRef = useRef(false), panelRef = useRef<PanelId | null>(null), zoneRef = useRef(''), dismissed = useRef('');
  ctxRef.current = ctx; panelRef.current = panel;
  useEffect(() => { bus.emit('ctxpanel', ctx && !!panel); }, [ctx, panel]);
  const hadPanel = useRef(false);
  useEffect(() => { const on = !!panel; if (on !== hadPanel.current) play(on ? 'open' : 'close'); hadPanel.current = on; }, [panel]);
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  // ao abrir o jogo: tela de permissões (microfone, notificações, som, armazenamento)
  const [perm, setPerm] = useState<boolean | null>(null);
  useEffect(() => { if (phase === 'ready' && perm === null) void needsPermissions().then((n) => { setPerm(n); if (!n) void voice.join(me.id); }); }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const offs = [
      bus.on('net:ping', (p: { k: string; name: string }) => { const d = PINGS.find((x) => x.k === p.k); notify(`${d?.icon ?? '📍'} ${p.name}`, d?.text ?? 'Vem cá!'); }),
      bus.on('feed', (list: LogEntry[]) => { const e = list.find((x) => x.u !== me.id); if (e) { const t = logText(e); notify('Sítio Mutirão', `${t.icon} ${t.text}`); } }),
    ];
    return () => { offs.forEach((o) => o()); voice.leave(); };
  }, [me.id]);

  useEffect(() => {
    let alive = true;
    const offs = [
      bus.on('boot:progress', (p: number) => setProgress(0.3 + p * 0.7)),
      bus.on('world:ready', () => alive && setPhase('ready')),
      bus.on('panel', (p: PanelId) => { setCtx(false); setPanel(p); }),
      bus.on('zone', (z: { k: string; id?: string; f?: string } | null) => {
        const key = z ? `${z.k}:${z.id ?? z.f ?? ''}` : '';
        zoneRef.current = key;
        if (!z) { dismissed.current = ''; if (ctxRef.current) { setPanel(null); setCtx(false); } return; }
        if (dismissed.current === key) return;
        if (panelRef.current && !ctxRef.current) return; // um menu global aberto pelo jogador tem prioridade
        let next: PanelId; let focus = '';
        if (z.k === 'field') next = { field: (z as { f: string }).f };
        else if (z.k === 'obs') next = { obs: z.id! };
        else if (store.lvl(z.id!) >= 1) next = { b: z.id! };
        else { next = 'projects'; focus = `b:${z.id}`; }
        setCtx(true); setPanel(next);
        if (focus) setTimeout(() => bus.emit('projects:focus', focus), 40);
      }),
    ];
    (async () => {
      try {
        store.myId = me.id;
        await store.load(farmId);
        if (!alive) return;
        setProgress(0.3);
        // o motor 3D só é baixado quando o jogo abre (login e menus ficam leves)
        const [{ createWorld }] = await Promise.all([import('../game/three/Game3D.ts'), realtime.connect(farmId, { u: me.id, name: me.username, look: me.look as unknown as Record<string, number> })]);
        if (!alive || !host.current) return;
        game.current = createWorld(host.current, { id: me.id, name: me.username, look: me.look as unknown as Record<string, number> });
      } catch (e) {
        console.warn(e);
        if (alive) setPhase('error');
      }
    })();
    return () => {
      alive = false;
      offs.forEach((f) => f());
      realtime.disconnect();
      game.current?.destroy();
      game.current = null;
      store.reset();
    };
  }, [farmId, me.id, me.username]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => { if (ctxRef.current) dismissed.current = zoneRef.current; setCtx(false); setPanel(null); }, []);

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
    <div className="game" onPointerDown={() => { sound.unlock(); music.start(); }}>
      <div className="game-canvas" ref={host} data-testid="game-canvas" onPointerDown={() => { if (panelRef.current && !ctxRef.current) close(); }} />
      {phase === 'loading' && (
        <div className="loading">
          <div className="loading-plate">
            <span className="logo">Sítio<br />Mutirão</span>
            <div className="bar bar-ipe"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>
            <small>{progress < 0.3 ? 'Abrindo a porteira…' : progress < 0.6 ? 'Arando a terra…' : 'Erguendo os galpões…'}</small>
            <p className="tip"><img src={iconUrl('ui_chat', 64)} alt="" width={22} height={22} />{tip}</p>
          </div>
        </div>
      )}
      {phase === 'ready' && perm && <PermissionGate onDone={() => { setPerm(false); void voice.join(me.id); }} />}
      {phase === 'ready' && (
        <>
          <Hud me={me} onOpen={(p) => { setCtx(false); setPanel(p); }} panelOpen={!!panel && !ctx} panel={panel} />
          {panel && <div className={ctx ? 'ctx-panel' : undefined} data-testid={ctx ? 'ctx-panel' : undefined}><Panels panel={panel} onClose={close} me={me} onExit={onExit} onLookChange={(l) => { onLookChange(l); bus.emit('look', l); void realtime.updateLook(l as unknown as Record<string, number>); }} /></div>}
        </>
      )}
    </div>
  );
}
