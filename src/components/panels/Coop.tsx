// Painéis cooperativos: Equipe (membros, presentes, sinais e mural), Feira da Vila e Sino do Mutirão.
import { useEffect, useState } from 'react';
import {
  COOP, PINGS, ITEM_BY_ID, MAIN_BY_ID, FIELD_BY_ID, PET_BY_ID, TOOL_BY_ID, WORKER_BY_ID, BUILDING_BY_ID, REGION_BY_ID, OBSTACLE_BY_ID,
  type ToolId,
} from '../../data/catalog.ts';
import { useFarm, useTicker } from '../../hooks/useStore.ts';
import { store, type LogEntry, type Member } from '../../game/state/store.ts';
import { bus } from '../../game/bus.ts';
import { level } from '../../game/rules.ts';
import { Sheet, Btn, Bar, Section, ItemIcon, Qty, toast } from '../ui.tsx';
import { act } from './Panels.tsx';
import { Portrait } from '../FarmsScreen.tsx';
import { normalizeLook } from '../../game/art/characters.ts';
import { fmt, fmtTime } from '../../utils/format.ts';
import { play } from '../../game/audio.ts';
import type { Me } from '../../App.tsx';
import { useSyncExternalStore } from 'react';
import { voice } from '../../game/multiplayer/voice.ts';

// ---------------------------------------------------------------- mural
function projName(k: string) {
  const id = k.slice(2);
  if (k.startsWith('r:')) return REGION_BY_ID[id]?.name ?? id;
  if (k.startsWith('o:')) return OBSTACLE_BY_ID[id]?.name ?? id;
  return BUILDING_BY_ID[id]?.name ?? id;
}

/** Frase curta do mural ("Ana atendeu Dona Cida"). */
export function logText(e: LogEntry): { icon: string; text: string } {
  const who = e.u === store.myId ? 'Você' : store.memberName(e.u);
  switch (e.k) {
    case 'order': return { icon: '🧺', text: `${who} atendeu ${e.x ?? 'um cliente'}${e.g ? ` (+${fmt(e.g)} moedas)` : ''}` };
    case 'main': return { icon: '📜', text: `${who} concluiu a missão "${MAIN_BY_ID[e.x ?? '']?.title ?? e.x}"` };
    case 'fopen': return { icon: '🌱', text: `${who} abriu o ${FIELD_BY_ID[e.x ?? '']?.name ?? 'campo'}` };
    case 'fup': return { icon: '🌾', text: `${who} melhorou o ${FIELD_BY_ID[e.x ?? '']?.name ?? 'campo'}` };
    case 'built': return { icon: e.coop ? '🤝' : '🔨', text: `${who} terminou a obra: ${projName(e.x ?? '')}${e.coop ? ' (em equipe!)' : ''}` };
    case 'pet': return { icon: '🐾', text: `${who} adotou ${PET_BY_ID[e.x ?? '']?.name ?? 'um pet'}` };
    case 'tool': return { icon: '🛠️', text: `${who} melhorou ${TOOL_BY_ID[e.x as ToolId]?.name ?? 'uma ferramenta'}` };
    case 'mission': return { icon: '✅', text: `${who} completou uma missão ${e.x === 'daily' ? 'diária' : e.x === 'coop' ? 'cooperativa' : 'secundária'}` };
    case 'bell': return { icon: '🔔', text: `${who} tocou o Sino do Mutirão` };
    case 'fair': return { icon: '🎪', text: `${who} levou ${e.q ?? ''} ${ITEM_BY_ID[e.x ?? '']?.name ?? ''} para a feira` };
    case 'fairtier': return { icon: '🏅', text: `${who} recebeu a ${COOP.fair.tiers[Number(e.x)]?.name ?? 'faixa'} da feira` };
    case 'gift': return { icon: '🎁', text: `${who} deu ${e.q ?? ''} ${ITEM_BY_ID[e.x ?? '']?.name ?? ''} para ${e.to === store.myId ? 'você' : store.memberName(e.to ?? '')}` };
    case 'hire': return { icon: '👷', text: `${who} contratou ${WORKER_BY_ID[e.x ?? '']?.name ?? 'um ajudante'}` };
    default: return { icon: '⭐', text: `${who} fez algo pela fazenda` };
  }
}

const ago = (at: number) => { const s = Math.max(0, Math.round((store.now() - at) / 1000)); return s < 60 ? 'agora' : s < 3600 ? `há ${Math.floor(s / 60)} min` : s < 86400 ? `há ${Math.floor(s / 3600)} h` : `há ${Math.floor(s / 86400)} d`; };

export function Feed({ limit = 30 }: { limit?: number }) {
  const s = useFarm();
  const log = s.farm!.progression.log ?? [];
  if (!log.length) return <p className="muted small">Nada por aqui ainda. As conquistas da equipe aparecem neste mural.</p>;
  return (
    <ul className="feed">
      {log.slice(0, limit).map((e, i) => { const t = logText(e); return <li key={`${e.at}${i}`}><span className="feed-ico">{t.icon}</span><span className="grow">{t.text}</span><small>{ago(e.at)}</small></li>; })}
    </ul>
  );
}

// ---------------------------------------------------------------- sino
export function BellCard() {
  const s = useFarm();
  useTicker(1000);
  const b = s.farm!.progression.bell;
  const now = s.now();
  const on = (b?.until ?? 0) > now, wait = Math.max(0, (b?.next ?? 0) - now);
  const lock = level() < COOP.bell.level ? `Nível ${COOP.bell.level}` : null;
  const ring = async () => { const r = await act({ t: 'bell' }); if (r.ok) { bus.emit('cheer'); } };
  return (
    <section className={`panel bell-card${on ? ' on' : ''}`} data-testid="bell-card">
      <div className="row"><span className="bell-ico" aria-hidden>🔔</span>
        <div className="grow"><strong>Sino do Mutirão</strong>
          <p className="muted small">Por {COOP.bell.ms / 60000} minutos, toda a equipe tem {Math.round(COOP.bell.chance * 100)}% de chance de +1 em cada coleta e colheita. Avise o grupo antes de tocar!</p></div></div>
      {on ? <div className="row"><Bar value={(b!.until - now)} max={COOP.bell.ms} tone="folha" /><span className="small">{fmtTime(b!.until - now)}</span></div>
        : <Btn small disabled={!!lock || wait > 0} onClick={ring} testid="bell-ring">{lock ?? (wait > 0 ? `Descansando: ${fmtTime(wait)}` : 'Tocar o sino')}</Btn>}
      {b?.by && on && <p className="small note">Tocado por {b.by === s.myId ? 'você' : s.memberName(b.by)}.</p>}
    </section>
  );
}

// ---------------------------------------------------------------- feira
export function FairPanel({ onClose }: { onClose: () => void }) {
  const s = useFarm();
  useEffect(() => { void store.act({ t: 'fair' }); }, []);
  const f = s.farm!.progression.fair;
  const bag = s.bag();
  if (!f) return <Sheet title="Feira da Vila" icon="ui_coins" onClose={onClose}><p className="muted">Montando as barracas…</p></Sheet>;
  let need = 0, got = 0;
  for (const [k, q] of Object.entries(f.goal)) { const p = ITEM_BY_ID[k].price; need += q * p; got += Math.min(q, f.got[k] ?? 0) * p; }
  const pct = need ? got / need : 0;
  const total = Object.values(f.by).reduce((a, b) => a + b, 0) || 1;
  const give = async (i: string, q: number) => { const r = await act({ t: 'fgive', i, q }); if (r.ok) { play('pop'); toast(`Entregue! Feira em ${r.pct}%`, 'ok'); } };
  const claim = async (t: number) => { const r = await act({ t: 'fclaim', tier: t }); if (r.ok) { play('level'); bus.emit('cheer'); toast(`${COOP.fair.tiers[t].name}! +${fmt(Number(r.g))} moedas e ${r.cr} 💎${r.coop ? ' (bônus de equipe)' : ''}`, 'ok'); } };
  return (
    <Sheet title="Feira da Vila" subtitle="Meta da semana para a fazenda inteira · renova toda segunda" icon="ui_coins" onClose={onClose}>
      <div className="fair-head">
        <div className="row"><Bar value={got} max={need} tone="ipe" /><b>{Math.floor(pct * 100)}%</b></div>
        <div className="fair-tiers">
          {COOP.fair.tiers.map((t, i) => {
            const claimed = f.claimed.includes(String(i)), ok = pct >= t.pct;
            return (
              <div key={i} className={`fair-tier${claimed ? ' claimed' : ok ? ' ready' : ''}`} style={{ ['--x' as string]: `${t.pct * 100}%` }}>
                <span>{['🎀', '🥈', '🥇'][i]}</span><strong>{t.name}</strong><small>{Math.round(t.pct * 100)}% · 💎 {t.cr}</small>
                {claimed ? <em>recebida</em> : <Btn small disabled={!ok} onClick={() => claim(i)} testid={`fair-claim-${i}`}>{ok ? 'Receber' : `${Math.round(t.pct * 100)}%`}</Btn>}
              </div>
            );
          })}
        </div>
      </div>
      <Section title="O que a vila pediu">
        <ul className="need">
          {Object.entries(f.goal).map(([k, q]) => {
            const g = f.got[k] ?? 0, rem = Math.max(0, q - g), have = s.qty(k) + (bag[k] ?? 0);
            return (
              <li key={k} className={rem === 0 ? 'done' : ''}>
                <ItemIcon id={k} size={30} />
                <span className="grow">{ITEM_BY_ID[k].name}<small>{Math.min(g, q)}/{q}{rem > 0 ? ` · com você e no estoque: ${have}` : ' · completo!'}</small></span>
                {rem > 0 && <Btn small disabled={have === 0} onClick={() => give(k, Math.min(rem, have))} testid={`fair-give-${k}`}>Levar {Math.min(rem, have) || ''}</Btn>}
              </li>
            );
          })}
        </ul>
      </Section>
      {Object.keys(f.by).length > 0 && (
        <Section title="Quem ajudou">
          {Object.entries(f.by).sort((a, b) => b[1] - a[1]).map(([u, v]) => (
            <div key={u} className="contrib-row"><span>{u === s.myId ? 'Você' : s.memberName(u)}</span><Bar value={v} max={total} tone="folha" /><span className="small">{Math.round((v / total) * 100)}%</span></div>
          ))}
          <p className="small note">Com 2 ou mais pessoas ajudando de verdade, cada faixa paga +25% de moedas e +1 💎.</p>
        </Section>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- voz
function VoiceCard({ me }: { me: Me }) {
  useSyncExternalStore(voice.subscribe, voice.getVersion);
  return (
    <section className={`panel voice-card${voice.on ? ' on' : ''}`} data-testid="voice-card">
      <div className="row"><span className="bell-ico" aria-hidden>🎧</span>
        <div className="grow"><strong>Voz da fazenda</strong>
          <p className="muted small">{voice.on ? `Conectado com ${voice.peerCount()} ${voice.peerCount() === 1 ? 'pessoa' : 'pessoas'}.` : 'Converse por voz com quem está jogando.'}{voice.micDenied ? ' Microfone bloqueado: você só ouve.' : ''}</p></div></div>
      {voice.on ? (
        <div className="row wrap">
          <Btn small kind={voice.micOn ? 'primary' : 'ghost'} onClick={() => voice.setMic(!voice.micOn)} disabled={voice.micDenied}>{voice.micOn ? '🎙️ Microfone ligado' : '🔇 Microfone desligado'}</Btn>
          <div className="seg"><button className={voice.mode === 'near' ? 'on' : ''} onClick={() => voice.setMode('near')}>Por perto</button><button className={voice.mode === 'all' ? 'on' : ''} onClick={() => voice.setMode('all')}>Todos</button></div>
          <Btn small kind="quiet" onClick={() => voice.leave()}>Sair da voz</Btn>
        </div>
      ) : <Btn small onClick={() => void voice.join(me.id)} testid="voice-join">Entrar na voz</Btn>}
    </section>
  );
}

// ---------------------------------------------------------------- equipe
function GiftBox({ to, onDone }: { to: Member; onDone: () => void }) {
  const s = useFarm();
  const bag = s.bag();
  const ids = Object.keys(bag).filter((k) => bag[k] > 0);
  const [sel, setSel] = useState<string | null>(ids[0] ?? null);
  const [q, setQ] = useState(1);
  if (!ids.length) return <p className="muted small">Sua mochila está vazia. Colete algo para presentear.</p>;
  const send = async () => {
    if (!sel) return;
    const r = await act({ t: 'gift', u: to.user_id, i: sel, q: Math.min(q, bag[sel]) });
    if (r.ok) { play('gift'); toast(`Você deu ${r.q} ${ITEM_BY_ID[sel].name} para ${to.username}.`, 'ok'); onDone(); }
  };
  return (
    <div className="gift">
      <div className="bag-row">{ids.map((k) => <button key={k} className={`bag-item${sel === k ? ' on' : ''}`} onClick={() => { setSel(k); setQ(Math.min(q, bag[k])); }}><ItemIcon id={k} size={28} /><b>{bag[k]}</b></button>)}</div>
      {sel && <div className="row"><Qty value={Math.min(q, bag[sel])} max={bag[sel]} onChange={setQ} /><Btn small onClick={send} testid="gift-send">Dar {Math.min(q, bag[sel])} {ITEM_BY_ID[sel].name}</Btn></div>}
    </div>
  );
}

export function TeamPanel({ me, onClose }: { me: Me; onClose: () => void }) {
  const s = useFarm();
  const [gift, setGift] = useState<string | null>(null);
  const others = s.members.filter((m) => m.user_id !== me.id);
  return (
    <Sheet title="Equipe" subtitle={`${s.online.size || 1} jogando agora · ${s.members.length} na fazenda`} icon="ui_people" onClose={onClose}>
      <VoiceCard me={me} />
      <Section title="Avisar o grupo">
        <div className="ping-row">{PINGS.map((p) => <button key={p.k} className="chip" onClick={() => { bus.emit('ping', p.k); onClose(); }} data-testid={`ping-${p.k}`}>{p.icon} {p.text}</button>)}</div>
      </Section>
      <ul className="team">
        {s.members.map((m) => {
          const on = s.online.has(m.user_id) || m.user_id === me.id;
          const used = Object.values(m.bag ?? {}).reduce((a, b) => a + b, 0);
          const pet = m.pets?.eq ? PET_BY_ID[m.pets.eq] : null;
          return (
            <li key={m.user_id} className={`panel team-card${on ? ' on' : ''}`}>
              <div className="row">
                <Portrait look={normalizeLook(m.user_id === me.id ? me.look : m.look)} className="team-face" />
                <div className="grow">
                  <strong>{m.username}{m.user_id === me.id ? ' (você)' : ''}</strong>{m.role === 'owner' && <em className="tag">fundador</em>}
                  <span className="small muted">{on ? '● jogando agora' : 'fora do jogo'} · 🎒 {used}{pet ? ` · ${pet.name}` : ''}</span>
                </div>
              </div>
              <div className="team-stats">
                <span>🌾 {fmt(m.stats.harvest ?? 0)}</span><span>🏭 {fmt(m.stats.craft ?? 0)}</span><span>🧺 {fmt(m.stats.orders ?? 0)}</span><span>🔨 {fmt(m.stats.give ?? 0)}</span><span>🎁 {fmt(m.stats.gift ?? 0)}</span>
              </div>
              {m.user_id !== me.id && (
                <div className="row wrap">
                  <Btn small kind="ghost" disabled={!on} onClick={() => { bus.emit('gotoMember', m.user_id); onClose(); }}>Ir até</Btn>
                  <Btn small kind="ghost" onClick={() => setGift(gift === m.user_id ? null : m.user_id)} testid={`gift-${m.username}`}>Dar presente</Btn>
                </div>
              )}
              {gift === m.user_id && <GiftBox to={m} onDone={() => setGift(null)} />}
            </li>
          );
        })}
      </ul>
      {others.length === 0 && <p className="note">Jogar junto rende mais! Chame alguém com o código de convite em Ajustes: obras, feira e missões cooperativas pagam bônus de equipe.</p>}
      <BellCard />
      <Btn small kind="ghost" onClick={() => bus.emit('panel', 'fair')}>🎪 Feira da Vila</Btn>
      <Section title="Mural da fazenda"><Feed /></Section>
    </Sheet>
  );
}
