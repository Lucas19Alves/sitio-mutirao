# Sítio Mutirão: design de progressão (v1.1)

Este documento descreve o que está implementado. As fontes da verdade são os catálogos versionados em `src/data/` (gerados para o servidor em `supabase/migrations/20261102000003_catalog.sql`) e as funções do esquema `game` na migration `20261104000007_progression.sql`.

## Princípios

- **Uma fazenda, várias trilhas.** Nível da fazenda, campanha principal, campos, regiões, ferramentas, prédios, personagem e pets avançam em paralelo. Cada trilha destrava algo nas outras.
- **Revelação progressiva.** A HUD mostra só a missão principal atual. Campos, obstáculos e prédios aparecem no mundo desde o começo, com placa ou rótulo dizendo o que falta.
- **O estado real manda.** As missões se completam pelo estado verdadeiro da fazenda (prédio construído, campo aberto, região liberada, contadores). Se a fazenda já fez a tarefa, a missão já nasce pronta. Clientes e missões geradas só pedem o que a fazenda já consegue produzir.
- **Tudo validado no servidor.** Toda ação passa por `farm_act`, que trava a linha da fazenda e é idempotente por lote. Isso vale para resgatar missões, abrir campos, remover obstáculos, comprar pets, melhorias e cosméticos e acelerar timers.

## Trilhas

| Trilha | Onde | Níveis | Destrava |
|---|---|---|---|
| Fazenda | XP de tudo | 30 | conteúdo por nível; +25×nível moedas e +2 💎 por nível |
| Campanha principal | `MAIN` em `src/data/missions.ts` | 40 missões (grafo) | campos, regiões, prédios e marcos com cristais |
| Campos especializados | `src/data/fields.ts` | 11 campos × 3 níveis | culturas, mais canteiros, crescimento mais rápido, +1 por colheita no nível 3 |
| Regiões e obstáculos | `src/data/obstacles.ts` + regiões | 6 regiões + pontes | recursos, prédios e campos novos |
| Ferramentas | `TOOLS` | até 5 níveis | nós de nível maior, menos golpes, +1 por nível acima do exigido |
| Prédios | `BUILDINGS` | até 3–5 níveis | produção, fila, capacidade e balcão maior; visual cresce e ganha bandeira |
| Personagem | `PERKS` + mochila | botas 3, luvas 3, mochila 6 | velocidade, ritmo de trabalho e capacidade |
| Pets | `PETS` | 7 pets × 5 níveis | bônus moderado para quem leva o pet |

## Campanha principal (grafo)

Cada missão tem `after` (pré-requisitos) e um objetivo (`goal`) que o servidor confere com `game.goal_ok`. A HUD mostra a primeira missão aberta. O painel Missões mostra até três delas.

Ramos principais:

1. **Primeiros passos** (m01–m07): madeira, mochila no celeiro, trigo, Bancada, primeiros clientes, cordas e mochila maior.
2. **Expansão para o Pomar** (m08–m09): Horta de Raízes, depois a árvore caída (exige machado). O pomar dá cristais.
3. **Cadeia do pão** (m10–m15): Serraria, tábuas, Milharal, Moinho, Padaria, pães.
4. **Bosque e ferramentas** (m16–m23): Horta de Tomates (precisa do Poço), Celeiro maior, ajudante, pet, mato fechado (foice), Campo de Batatas, Galpão, machado reforçado.
5. **Rio e pontes** (m24–m28): deslizamento (pá), pontes (obra própria, exige Serraria e nível 10), Algodoal, Tecelagem, 25 clientes.
6. **Colinas, vale e planalto** (m29–m40): Morangal, portão (picareta 2), Ferraria, Girassóis, Vinhedo, caminhão quebrado (pá 2), Jardim de Flores, Aboboral (precisa das pontes), Grande Oficina, barco (machado 3), Joalheria e nível 30.

Recompensas: moedas e XP sempre; cristais nos marcos (abrir regiões, pontes, prédios-chave). O resgate grava o id em `progression.mdone`. Missão repetida devolve `already_unlocked`.

## Missões geradas

`game.act_mref` mantém:

- **3 secundárias:** trocam quando são resgatadas.
- **3 diárias:** renovadas por data em America/Sao_Paulo. Ficam marcadas `done` depois do resgate, para não ser possível resgatar duas vezes no mesmo dia.
- **1 cooperativa:** a partir do nível 3. A meta é multiplicada pelo número de membros e vale o trabalho de todos.

A geração (`game.gen_mission`) sorteia entre:

- coletar ou produzir itens que `game.item_ok` confirma serem obtíveis agora (região, campo, prédio e ferramenta);
- atender clientes, plantar ou guardar no celeiro.

A meta escala com o nível. Cada missão guarda o valor do contador no momento em que foi criada (`base`), então só conta o que for feito depois.

## Campos especializados

Cada campo é uma entidade `f:<id>` com nível de 1 a 3:

- canteiros em 50/75/100% da área;
- tempo de crescimento ×1 / ×0,88 / ×0,76;
- +1 por colheita no nível 3.

Abrir pede:

- região aberta;
- nível da fazenda;
- às vezes um prédio (Tomates → Poço) ou um obstáculo (Aboboral → pontes);
- moedas e materiais.

A melhoria exige o nível do campo + 3 por nível. O plantio e a colheita são automáticos quando o jogador anda pelos canteiros. Cada campo planta a sua cultura. O Jardim de Flores deixa escolher entre rosa, tulipa e lavanda.

O antigo campo genérico (`field`) virou o Campo de Trigo na migration. Os canteiros recomeçam vazios.

## Obstáculos físicos

Não existe compra de quadrados. Cada região fechada tem um bloqueio visível na estrada:

| Obstáculo | Região | Ferramenta exigida |
|---|---|---|
| árvore caída | Pomar | machado 1 |
| mato fechado | Bosque | foice 1 |
| deslizamento | Rio | pá 1 |
| portão enferrujado | Colinas | picareta 2 |
| caminhão quebrado | Vale | pá 2 |
| passagem alagada com barco | Planalto | machado 3 |

As **pontes do rio** são uma obra à parte (`o:pontes`): sem elas, as faixas das pontes não são caminháveis e o Aboboral fica inacessível.

Cada obstáculo mostra no mundo o nome e o status ("nível X", "precisa de…", "obra NN%", "pronto para remover"). Chegando perto, abre o painel com requisitos e materiais. Os materiais vêm de qualquer membro (obra coletiva com bônus de cooperação). Ao concluir, o obstáculo afunda e encolhe com poeira e confete, a câmera foca e o caminho abre para todos. A conclusão dá cristais.

## Clientes do balcão

O Quadro de Pedidos virou o **Balcão de Atendimento**. Cada pedido aberto é um cliente 3D (aparência estável a partir do nome) na fila em frente ao balcão:

- 3/4/5 clientes conforme o nível do balcão;
- balão com ícones, quantidades e recompensa;
- verde quando dá para atender com a mochila + estoque.

Ao entregar, o cliente comemora, agradece e vai embora, e outro chega. `game.gen_order` só escolhe itens obtíveis. Com 12% de chance (a partir do nível 4) chega um **cliente especial**: pedido maior, paga mais e dá cristais.

A entrega usa primeiro a mochila de quem entrega e depois o estoque. A trava por fazenda impede entrega dupla.

## Pets

Os pets (cachorro, gata, coelho, pato, galinha, raposa e coruja) têm:

- raridade;
- habilidade: coleta, colheita, moedas, XP ou achar cristal;
- 5 níveis de experiência, ganha ao coletar e atender.

O bônus é moderado (8–32% de chance de +1, ou 4–18% sobre a recompensa) e vale só para quem leva o pet. Os pets seguem o dono no mundo 3D, para todos os jogadores. Os comuns são comprados com moedas; os raros e o épico, com cristais. A compra é única por jogador.

## Personagem

- **Corpo masculino ou feminino** com proporções próprias:
  - masculino: ombros largos e sobrancelhas grossas;
  - feminino: cintura marcada, quadril e saia, cílios e lábios.
- Personalizáveis: pele, cabelo, cores, roupa, calças, calçados, chapéus e acessórios.
- A maior parte é livre. Alguns chapéus, acessórios e calçados são liberados na Loja e ficam na conta (`profiles.owned`).
- Um gatilho no banco devolve ao padrão qualquer item pago não liberado.
- Trocar o visual acontece no ateliê da Casa da Fazenda.
- Melhorias por jogador:
  - botas: +7% de velocidade por nível;
  - luvas: +15% no ritmo do trabalho por nível;
  - mochila: 6 tamanhos.

## Interface

- **Topo:** avatar com anel de XP e nível, moedas, cristais, mochila, status de conexão e menu "⋯".
- **Missão:** pílula compacta no canto. O centro fica livre para o mundo.
- **Base:** Missões, Fazenda (central com Estoque, Balcão, Mercado, Obras, Campos, Ferramentas, Progresso e Ajustes), Loja, Mochila e Personagem.
- **Painéis:** são folhas adaptáveis. Os de proximidade (prédios, campos, obstáculos, balcão) abrem e fecham sozinhos.

## Cooperação (v1.2)

O jogo é uma fazendinha cooperativa: estoque, obras, clientes, campos e metas são de todos. Personagem, pets, mochila e visual são de cada um. Os recursos coop dão motivo para jogar junto sem punir quem joga sozinho.

- **Sino do Mutirão.** Fica na Casa da Fazenda e também no painel Equipe.
  - Qualquer membro toca (a partir do nível 3).
  - Por 10 minutos, toda coleta e colheita de qualquer membro tem 35% de chance de +1.
  - Depois disso o sino descansa 3 horas.
  - O mundo mostra brilho dourado em volta dos jogadores e um aviso na HUD com o tempo restante.
- **Feira da Vila.** Meta semanal da fazenda inteira, renovada às segundas (fuso de São Paulo):
  - três produtos que a fazenda já consegue fazer;
  - a meta cresce com o nível e com o número de membros;
  - três faixas: 35%, 70% e 100%;
  - a entrega usa a mochila e depois o estoque;
  - cada faixa é resgatada uma vez por semana;
  - com 2+ pessoas contribuindo (15% ou mais cada), cada faixa paga +25% de moedas e +1 💎.
- **Presentes.** Passar itens da sua mochila direto para a mochila de um colega. Serve para quem coleta abastecer quem está no balcão ou na feira. Se a mochila do colega estiver cheia, o presente é recusado.
- **Sinais no mapa.** "Vem cá!", "Preciso de ajuda aqui", "Bora colher!", "Vamos terminar a obra!" e "Valeu, equipe!". Aparecem como argola pulsante e etiqueta no mundo para todos. Quem recebe vê um aviso com o botão "Ir", e o personagem anda até o lugar. É só tempo real, nada é gravado.
- **Equipe.** Painel com quem está jogando, contribuições de cada um (coleta, produção, clientes, obras, presentes), pet de cada um, "Ir até" e "Dar presente".
- **Mural.** As 30 últimas conquistas da fazenda: clientes, missões, obras (marcando quando foram em equipe), campos, pets, ferramentas, sino, feira, presentes e ajudantes. Quando um colega conquista algo, aparece um aviso na tela.

## HUD (v1.2)

- Avatar com rosto, nível e XP; moedas, cristais e mochila.
- Pilha da equipe (quem está jogando) e menu "⋯".
- A missão principal mostra uma barrinha de progresso.
- Fichas de estado: sino tocando (com contagem regressiva) e feira da semana (% e "prêmio!").
- Botão 📣 para sinais rápidos.
- Tocar no mundo fecha o menu aberto.
- Tocar num cliente leva até o balcão.
- Missões: botão "Receber todas as prontas" (útil para fazendas antigas que já cumpriram etapas).
- Campos ainda fechados aparecem só com cerca e placa, sem canteiros soltos.

## Expansão (v1.3)

O mapa cresceu de 64×52 para 100×80 tiles, com 11 regiões. Os IDs dos recursos das 7 regiões antigas não mudaram.

| Região | Nível | Obstáculo (ferramenta) | Conteúdo |
|---|---|---|---|
| Pastagem | 10 | porteira emperrada (machado 2), depois das pontes | Galinheiro (ovo), Estábulo (leite), Laticínio (queijo, manteiga, iogurte), Engenho (açúcar, rapadura), Casa de Farinha (farinha de mandioca, tapioca); campos de Aveia, Mandioca e Canavial |
| Lago das Garças | 13 | galhada na trilha (foice 2) | lago com pesca (lambari com vara 1, tilápia com vara 2), Peixaria (peixe frito, defumado, moqueca) |
| Cafezal da Serra | 18 | barranco da serra (pá 2) | bananeiras, cacaueiros, campo de Café, Torrefação (café torrado, café com leite), Confeitaria (chocolate, brigadeiro, bolo de banana) |
| Mata da Cachoeira | 25 | mata fechada (machado 4) | bambu, açaizeiros, madeira de lei, cristal; Ateliê de Bambu (flauta, luminária), Quiosque de Açaí |

Outras novidades de conteúdo:

- **Ferramenta nova:** Vara de Pescar, 3 níveis.
- **Nível máximo:** passou de 30 para 40.
- **Campanha:** 63 missões principais. As 23 novas formam ramos ligados aos antigos (pontes → pastagem; colinas → pesca; vale → cafezal; planalto + confeitaria → mata). A última é a "Lenda do Mutirão", no nível 40.
- **Contratos novos:** Festa Junina, Peixada, Café da manhã da pousada, Aniversário na praça e Feira de artesanato.
- **Ajudantes novos:** Pescador e Vaqueira.
- **Pets novos:** Cabrita Mel, Capivara Zen e Louro José.
- **Clientes novos:** 8 nomes.

## Sensação de jogo (v1.3)

- **Colisão:**
  - árvores, pedras, arbustos e troncos da decoração bloqueiam a passagem, e a rota por toque desvia deles;
  - os campos têm cerca de verdade, com entrada pela porteira;
  - esbarrar em colegas, clientes e ajudantes empurra de leve.
- **Itens coletados:** saltam com gravidade, quicam (achatando no impacto) e são puxados para a mochila.
- **Som:**
  - sintetizador com compressor e reverb curto;
  - passos por piso (grama, terra, madeira das pontes, água, terra arada);
  - golpes com timbre de cada ferramenta e respingo na pesca;
  - sino com bronze inarmônico;
  - sons próprios para venda, depósito, presente, missão, desbloqueio e abrir ou fechar painel.
- **Dopamina:**
  - cada coleta seguida (até 3,2 s) sobe uma nota na escala pentatônica;
  - a cada 5 aparece "Combo xN!" com confete e um selo na tela;
  - quando a missão principal fica pronta, o jogo toca um som de "pronto" e mostra um aviso;
  - receber missão tem fanfarra própria.

## Personagem (v1.3)

- **Rosto:** 5 olhos e 6 detalhes (sardas, bochechas, bigode, barba, cavanhaque).
- **Cabelo:** 11 estilos, incluindo coque, moicano, longo solto, franja e maria-chiquinha. 12 cores.
- **Roupa:** 7 estilos (vestido, moletom e colete são novos), pernas em calça, bermuda ou saia, e 14 cores.
- **Extras:** 9 chapéus (vaqueiro, boina, coroa de flores) e 8 acessórios (brincos, cachecol, flor no cabelo).
- **Tons de pele:** 8.
- **Editor:** separado em abas (Corpo, Rosto, Cabelo, Roupa, Extras).
- **Itens pagos novos:** chapéu de vaqueiro, coroa de flores, cachecol, flor no cabelo e moletom.

## Voz e permissões (v1.3)

- **Ao abrir o jogo**, uma tela pede de uma vez microfone, notificações, som e armazenamento persistente. Ela aparece enquanto o microfone ou as notificações ainda não tiverem resposta.
- **Voz da fazenda (WebRTC em malha):**
  - a combinação da conexão vai pelo canal Realtime da fazenda;
  - o volume é por proximidade (cheio até 6 tiles, cai até 12% a 24 tiles) ou "Todos";
  - o nome de quem está falando ganha 🔊;
  - há um botão 🎙️ para silenciar;
  - sem microfone, o jogador entra só ouvindo.
- **Notificações do sistema** (com o jogo em segundo plano): um colega chamou você ou conquistou algo.
- **Limite conhecido:** só há servidores STUN, sem TURN. Em algumas redes muito fechadas (alguns 4G corporativos) a conexão de voz pode não fechar.
