# Sítio Mutirão v1.0 — migração para 3D real e gameplay automático

## 1. Auditoria (v0.3)

| Área | Hoje | Destino |
| --- | --- | --- |
| Motor do mundo | Phaser 4 (WebGL 2D), `src/game/scenes/*` | **Substituir** por Three.js (`src/game/three/*`). Phaser sai do projeto. |
| Arte | Canvas 2D pintado (`art/cartoon/*`), sprites e tileset | **Substituir** por modelos 3D procedurais (geometria real, materiais, sombras). Ícones 2D da interface (`art/icons.ts`) ficam. |
| Câmera | Ortográfica top-down | **Substituir** por `PerspectiveCamera` elevada (~55°) seguindo o jogador. |
| Personagens | Spritesheet 2D | **Substituir** por `SkinnedMesh` com esqueleto e `AnimationMixer` (clipes com crossfade). Mesmo `Look` salvo no Supabase. |
| Interação | Toque/`E` em cada objeto | **Substituir** por proximidade: coleta e trabalho automáticos, painéis contextuais que abrem e fecham sozinhos. |
| Inventário | Coleta vai direto ao estoque compartilhado | **Novo**: mochila por jogador (persistida e validada no servidor) + depósito no Celeiro/Armazém. |
| Lógica do mapa | Grade 64×52 de 32 px, nós determinísticos, `buildWalkGrid` | **Preservar** (1 tile = 1 unidade 3D). Mesmos ids de nós no cliente e servidor. |
| Estado/rede | `store.ts`, `realtime.ts` (Broadcast + Presence), `farm_act` | **Preservar**; posição continua em px lógicos. |
| Economia/progressão | 30 níveis, 7 regiões, 25 prédios, receitas, pedidos, contratos, 42 missões | **Preservar** e ampliar (mochila, ajudantes). |
| HUD/painéis React | `Hud.tsx`, `panels/*` | **Preservar** painéis; HUD redesenhada e painéis de prédio passam a ser contextuais. |
| Áudio | WebAudio procedural (sfx + trilha) | **Preservar**. |

## 2. Design brief
- **Promessa**: cuidar de um sítio 3D com os amigos, andando por ele: chegar perto já é trabalhar.
- **Verbo principal**: mover-se (joystick/WASD). Secundários: escolher receita, vender, contribuir, contratar.
- **A cada 5–30 s**: o personagem corta/minera/ceifa/colhe sozinho ao chegar perto; a mochila enche.
- **A cada 1–5 min**: descarregar no celeiro, produzir, vender, entregar pedido, contribuir em obra, subir de nível.
- **Pressão**: mochila e celeiro limitados; recursos com recarga; pedidos com prazo de troca; metas de missão.
- **Recompensa**: moedas, XP, desbloqueios (prédios, regiões, ferramentas, mochila maior, ajudantes).
- **Jogador melhor**: rotas eficientes (mochila cheia → celeiro → mercado), ferramenta certa, divisão de tarefas entre amigos.
- **Não-objetivos**: combate, sobrevivência, física realista, primeira pessoa.

## 3. Contrato do ciclo
`O jogador anda até recursos para enchê-los na mochila enquanto a capacidade limitada força idas ao celeiro; descarregar e vender dá moedas/XP que compram melhorias; mochila cheia ou ferramenta insuficiente é comunicada na hora e o jogador só precisa caminhar até o lugar certo.`

## 4. Plano do mapa (mesma grade)
Início no Sítio (casa, celeiro, carrinho de vendas, quadro de pedidos, campo 4×3). Primeira decisão: árvores e capim a 3–6 tiles do spawn; celeiro a 8 tiles. Marcos: moinho (pás girando), celeiro vermelho, rio com pontes ao sul. Regiões bloqueadas cercadas e cobertas por névoa baixa com placa 3D.

## 5. Backend (migration 6)
- `farm_members.bag jsonb` + `bag_tier int`; capacidade = `CONFIG.bagCap[tier]`.
- `harvest`/`reap` passam a encher a mochila (`bag_full` quando não cabe).
- `deposit`: mochila → estoque compartilhado até o limite do celeiro (parcial, devolve o resto).
- `sell` aceita `src: 'bag'` (vender direto da mochila no mercado).
- `bag`: compra o próximo tamanho de mochila.
- `hire` / `wclaim`: ajudantes que produzem recursos ao longo do tempo no estoque (validado por tempo no servidor).
- Delta e estado incluem mochila e ajudantes. Tudo dentro do `farm_act` (lock por fazenda, idempotência por lote).

## 6. Arquitetura do cliente 3D
```
src/game/three/
  Engine.ts          renderer, loop único, resize, qualidade, diagnósticos
  CameraRig.ts       câmera elevada com suavização, zoom e limites
  World.ts           terreno, água, caminhos, decoração instanciada
  kit/materials.ts   biblioteca de materiais por papel
  kit/nature.ts      árvores, pedras, minérios, capim, flores (fábricas + instancing)
  kit/buildings.ts   prédios por especificação (paredes, telhado, portas, janelas, adereços)
  kit/crops.ts       canteiros e cultivos (6 estágios)
  kit/character.ts   personagem com esqueleto + clipes
  Player.ts          controle, colisão (círculos/caixas), mochila visual
  Interaction.ts     alvos por proximidade (frente > perto > tarefa > utilizável), histerese
  Fx.ts              partículas em pool, itens voando, números flutuantes
  Ambient.ts         animais, vento, fumaça, água
  WorldGame.ts       cola: estado da fazenda ↔ cena, rede, eventos
```
Limites: ≤150 draw calls e ≤300k triângulos no celular, 1 luz com sombra (1024), DPR ≤1.5 no celular.
