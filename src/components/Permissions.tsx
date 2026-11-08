// Tela de permissões ao abrir o jogo: microfone (voz com a equipe), notificações (avisos com o
// jogo em segundo plano), som e armazenamento persistente. Navegadores exigem um toque do
// jogador para abrir esses pedidos, por isso tudo sai de um botão só.
import { useEffect, useState } from 'react';
import { voice } from '../game/multiplayer/voice.ts';
import { sound } from '../game/audio.ts';
import { music } from '../game/music.ts';

type State = 'granted' | 'denied' | 'prompt' | 'unsupported';

async function query(name: string): Promise<State> {
  try { const r = await navigator.permissions.query({ name: name as PermissionName }); return r.state as State; } catch { return 'prompt'; }
}

/** Situação atual de cada permissão (sem pedir nada). */
export async function permissionStatus() {
  const mic: State = 'mediaDevices' in navigator ? await query('microphone') : 'unsupported';
  const notif: State = 'Notification' in window ? (Notification.permission === 'default' ? 'prompt' : Notification.permission as State) : 'unsupported';
  const storage: State = navigator.storage?.persisted ? ((await navigator.storage.persisted()) ? 'granted' : 'prompt') : 'unsupported';
  return { mic, notif, storage };
}

const ROWS = [
  { k: 'mic', icon: '🎙️', title: 'Microfone', desc: 'Para conversar por voz com a sua equipe enquanto joga.' },
  { k: 'notif', icon: '🔔', title: 'Notificações', desc: 'Avisos quando um colega chama você, o sino toca ou a feira fecha, mesmo com o jogo em segundo plano.' },
  { k: 'sound', icon: '🎵', title: 'Som e música', desc: 'Efeitos, passos e a trilha da fazenda.' },
  { k: 'storage', icon: '💾', title: 'Guardar no aparelho', desc: 'Mantém suas preferências e acelera a abertura do jogo.' },
] as const;

export function PermissionGate({ onDone }: { onDone: () => void }) {
  const [st, setSt] = useState<Record<string, State>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { void permissionStatus().then((s) => setSt({ ...s, sound: 'prompt' })); }, []);

  const askAll = async () => {
    setBusy(true);
    const out: Record<string, State> = { ...st };
    sound.unlock(); music.start(); out.sound = 'granted';
    const m = await voice.ensureMic(); out.mic = m ? 'granted' : 'denied';
    if ('Notification' in window) { try { const r = await Notification.requestPermission(); out.notif = r === 'default' ? 'prompt' : r as State; } catch { out.notif = 'denied'; } }
    if (navigator.storage?.persist) { try { out.storage = (await navigator.storage.persist()) ? 'granted' : 'denied'; } catch { out.storage = 'denied'; } }
    setSt(out); setBusy(false);
    try { localStorage.setItem('sm-perms-asked', '1'); } catch { /* */ }
    setTimeout(onDone, 700);
  };

  return (
    <div className="perm-wrap" role="dialog" aria-modal="true" aria-labelledby="perm-title">
      <div className="perm card-paper">
        <h2 id="perm-title">Antes de começar</h2>
        <p className="muted">O Sítio Mutirão é melhor jogado junto. Para isso, o jogo precisa de algumas permissões:</p>
        <ul className="perm-list">
          {ROWS.map((r) => {
            const s = st[r.k];
            return (
              <li key={r.k} className={s ?? ''}>
                <span className="perm-ico">{r.icon}</span>
                <div className="grow"><strong>{r.title}</strong><small>{r.desc}</small></div>
                <em>{s === 'granted' ? '✔ liberado' : s === 'denied' ? 'bloqueado' : s === 'unsupported' ? 'indisponível' : ''}</em>
              </li>
            );
          })}
        </ul>
        <button className="btn btn-primary btn-lg" onClick={askAll} disabled={busy} data-testid="perm-allow">{busy ? 'Pedindo…' : 'Permitir tudo e jogar'}</button>
        <button className="btn btn-quiet" onClick={onDone} data-testid="perm-skip">Agora não</button>
        <p className="hint">Se algo ficar bloqueado, dá para liberar depois no cadeado da barra de endereço do navegador. Sem microfone você ainda ouve a equipe.</p>
      </div>
    </div>
  );
}

/** Mostra a tela se alguma permissão ainda não foi respondida. */
export async function needsPermissions() {
  const s = await permissionStatus();
  return s.mic === 'prompt' || s.notif === 'prompt';
}

/** Notificação do sistema quando o jogo está em segundo plano. */
export function notify(title: string, body: string) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
    new Notification(title, { body, icon: '/icons/icon-192.png', tag: 'sitio-mutirao' });
  } catch { /* sem notificações */ }
}
