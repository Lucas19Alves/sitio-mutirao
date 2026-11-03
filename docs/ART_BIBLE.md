# Bíblia visual — Sítio Mutirão v0.3

## Câmera e perspectiva
- **Top-down ortográfico.** Eixos X/Y alinhados à tela, grade retangular de 32 px de mundo por tile. Nada de losangos nem rotação do mapa.
- Volume vem da **arte em 3/4 frontal** (fachada + telhado vistos de cima e de frente), de **sombras projetadas para baixo-direita** e da **ordenação por Y** (quem está mais abaixo na tela é desenhado por cima).
- Câmera segue o personagem com suavização e zona morta pequena; limitada às bordas do mapa.

## Escala (mundo)
| Elemento | Tamanho no mundo |
| --- | --- |
| Tile | 32 × 32 |
| Personagem | ~40 × 52 (cabeça ≈ 45% da altura; quadro 80×124 a 2×) |
| Árvore comum | 56–72 de largura, 80–96 de altura |
| Árvore antiga / pinheiro | 80–100 × 110–130 |
| Canteiro | 64 × 64 (2 × 2 tiles) |
| Prédio | largura = tiles × 32; telhado sobe ~0,7 tile acima do lote |

Todos os sprites são pintados a **2×** e exibidos a 0,5 (nítidos até zoom ~2,4).

## Luz, sombra e contorno
- Luz vem do **topo-esquerda**. Faces voltadas para cima/esquerda recebem realce; base e lado direito escurecem.
- Sombra no chão: elipse/forma suave `rgba(34, 52, 24, .28)` deslocada para **baixo-direita**.
- Contorno: **2,4 px** (a 2×; 1,2–1,8 px em detalhes pequenos) em marrom quente escuro `#4a3423`, cantos arredondados (`lineJoin: round`). Nunca preto puro.
- Volume com **gradientes**: cada forma tem tom base, sombra (-22%) e realce (+18%); brilho especular pequeno e branco a 35% em superfícies lisas (frutas, vidro, metal).

## Formas
- Orgânicas e arredondadas: copas em "nuvem" de 5–7 lóbulos, telhados com beiral curvo, pedras facetadas suaves.
- Personagens chibi: cabeça grande, olhos com brilho, bochechas rosadas, mãos e botas arredondadas.

## Paleta
| Papel | Cores |
| --- | --- |
| Grama | `#7cbf4f` base, `#6aad43` sombra, `#94d062` realce, variações por região |
| Plantação / folhas jovens | `#a6d86b`, `#8cc152` |
| Folhagem de árvore | `#5da443` / `#3f7f3a` (antigas) / `#2f6b45` (pinheiro) |
| Terra / caminhos | `#d9b27a` caminho, `#b88a52` borda, `#7a5230` solo arado |
| Madeira | `#b9824e`, `#8d5a33`, `#6b3f22` |
| Pedra | `#a7adb2`, `#868c92` |
| Água / céu | `#5fb6dc`, `#3f93be`, espuma `#e6f6fb` |
| Recompensas | ouro `#f6c445`, `#e0a21c` |
| Telhados | terracota `#d0633f`, vermelho `#c4473f`, azul `#4f7fb8`, verde `#5f9a4a`, roxo `#8a5fb3` |
| Interface | papel `#fffdf6`, tinta `#3b2c22`, verde-folha `#3f8a4a`, céu `#4a9fd8`, ouro `#f6c445`, tomate `#e2574c` |

Saturação moderada; nenhum tom neon. O verde da grama nunca compete com o amarelo das recompensas.

## Vida no mundo (ambiente)
- Árvores balançam ±1,2° com fase aleatória (só as visíveis); grama alta e flores oscilam.
- Água: ondulação contínua (camada que desliza), brilhos ocasionais.
- Nuvens projetam sombras que atravessam o mapa; pássaros cruzam o céu de vez em quando; borboletas nas áreas floridas; galinhas ciscando perto da casa; fumaça nas chaminés de prédios produzindo.
- Tudo escalonado pela **qualidade gráfica** (Alta / Média / Baixa) e desligado por **Reduzir movimento**.

## Feedback (game feel)
Três níveis:
- **Pequeno** (golpe, toque): squash & stretch no alvo, 4–6 partículas, som curto.
- **Médio** (coleta, colheita, produção pronta): itens saltam em arco, número flutuante, partículas, ícone voa até o estoque.
- **Grande** (prédio concluído, região aberta, subida de nível): poeira + confete, escala com overshoot, tremor leve de câmera (só aqui), janela de celebração.
Movimento sempre com easing (Back/Sine/Cubic); nada linear.

## Implementação
| Família | Arquivo | Atlas |
| --- | --- | --- |
| Pincéis (contorno, volume, sombra) | `src/game/art/cartoon/paint.ts` | — |
| Terreno (tileset 64 px com extrusão de 2 px, 84 tiles) | `cartoon/terrain.ts` | `terrain` |
| Árvores, arbustos, flores, pedras, minérios | `cartoon/nature.ts` | `nature` |
| Prédios, obras, lotes, pontes | `cartoon/buildings.ts`, `cartoon/props.ts` | `bld` |
| Canteiros e cultivos (6 estágios) | `cartoon/crops.ts` | `crops` |
| Partículas, cerca, bichos, nuvem | `cartoon/props.ts` | `fx` |
| Personagens (17 colunas × 4 linhas, 80×124) | `art/characters.ts` | `ch_<aparência>` |

Pranchas de contato para revisão: `node tests/e2e/contact.mjs /src/game/art/cartoon/crops.ts allCropArts saida.png 0.8` (com o servidor de desenvolvimento ligado).

## Interface
- Papel claro, cantos 16–20 px, contorno fino `#3b2c22` a 2 px, sombra suave. Cada categoria tem uma cor de fita: Estoque verde, Mercado ouro, Projetos madeira, Pedidos céu, Ferramentas aço, Progresso uva.
- Tipografia: **Sniglet** (títulos, números de HUD) + **Atkinson Hyperlegible** (texto).
- Mobile em retrato é o layout principal: barra superior compacta, mundo livre no centro, joystick à esquerda, botão de ação à direita, navegação inferior com 5 itens. Desktop tem layout próprio (hotbar inferior, rastreador de missão à esquerda, minimapa no canto).
