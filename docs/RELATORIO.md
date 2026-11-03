# Relatório — Sítio Mutirão v0.1

Primeira versão jogável de um jogo cooperativo de fazenda: várias pessoas na **mesma** fazenda, com estoque, moedas, ferramentas e progressão compartilhados e validados no servidor.

## O que foi implementado

### Mundo e jogabilidade
- Mapa de 64×52 tiles com **7 regiões** (Sítio Inicial, Pomar, Bosque, Margem do Rio, Colinas, Vale das Flores, Planalto Industrial), rio com duas pontes, caminhos, bordas de floresta e névoa nas regiões bloqueadas com placa de requisito.
- **199 nós de recurso** de 19 tipos (árvores, árvores antigas, capim, junco, pedras, rochedos, frutíferas, ervas, cogumelos, argila, areia, carvão, cobre, ferro, flores do campo, ouro, cristal), com versão esgotada e renascimento por tempo. Golpes por coleta dependem do tier da ferramenta.
- **Campo com 12 canteiros** (6/9/12 conforme a Casa) e **estufa** com canteiros extras; 13 cultivos em 3 estágios visuais. Poço acelera o crescimento.
- **25 construções**, todas com função: 4 iniciais (Casa, Celeiro, Carroça de Vendas, Quadro de Pedidos), 16 produtoras com filas (Bancada, Serraria, Moinho, Padaria, Carpintaria, Cozinha, Tecelagem, Olaria, Fundição, Ferraria, Vidraria, Prensa, Apiário, Floricultura, Grande Oficina, Joalheria) e 5 utilitárias (Poço, Galpão de Ferramentas, Mercado, Estufa, Armazém). Melhorias de nível em todas as que fazem sentido.
- **46 receitas** em cadeias (trigo → farinha → pão; madeira → tábua → móveis; algodão → fio → tecido; argila → tijolo; minério + carvão → lingote → pregos/peças; areia → vidro → pote → mel; …).
- **4 ferramentas** com tiers (Machado 3, Picareta 3, Foice 2, Pá 2) que liberam recursos e aumentam o rendimento.
- **Mercado** com venda por quantidade, bônus do prédio Mercado e aba de **lucratividade** (lucro por produção e por minuto).
- **Pedidos** gerados no servidor a partir do que a fazenda já consegue produzir (3–5 vagas) e **13 contratos coletivos** com entrega parcial por qualquer membro.
- **42 missões** em sequência que apresentam cada mecânica.
- **30 níveis**, recompensa em moedas a cada nível, tela de progressão com o que cada nível libera e “próximo desbloqueio” sempre visível na HUD.
- Personagens procedurais com **6 tons de pele, 6 cabelos, 7 cores de cabelo, 4 roupas, 10 cores, 6 calças, 6 chapéus, 5 acessórios**, salvos no Supabase. Animações: parado, caminhada, trabalho (golpe/colheita) e carregando recursos, em 4 direções.
- Feedback: lascas ao golpear, ícone voando até o personagem, texto flutuante, confete ao subir de nível, fumaça nas chaminés e moinho girando quando há produção, barra de progresso sobre obras, ícone do produto pronto sobre o prédio, sons sintetizados (WebAudio).

### Cooperação
- Fazenda criada por um jogador e acessada por **código de convite** (até 4 membros).
- **Projetos coletivos** para toda construção, melhoria e expansão de região: qualquer membro entrega parte dos materiais/moedas, a qualquer hora; o quadro mostra necessário, entregue, estoque disponível e **quem contribuiu** (com porcentagem).
- **Bônus de cooperação**: obra concluída com 2+ membros contribuindo (≥ 15% do valor cada) dá +25% de XP, +2 de reputação e 10% das moedas de volta; contrato coletivo nas mesmas condições paga +30%.
- Estatísticas por membro (coletado, produzido, entregue em projetos).
- Nada exige que os dois estejam online ao mesmo tempo; a fazenda persiste com qualquer membro offline.
- Frases rápidas (“Me ajuda aqui!”, “Vou colher”…) exibidas sobre o personagem para todos.

### Multiplayer e backend
- **Auth por username + senha** (Supabase Auth; Edge Function de cadastro; sem e-mail real), login, logout, sessão persistente, troca de senha com confirmação da senha atual.
- **Estado transitório** por Broadcast (posição/animação até 5/s só em movimento) e **Presence** (quem está online). Nada disso vai para o banco.
- **Estado persistente** só via RPC `farm_act`: trava a fazenda, valida cada ação contra o catálogo do servidor, aplica, incrementa a revisão e o **próprio banco** envia o delta pelo canal (`realtime.send`).
- **Lotes**: coletas esperam até 1,2 s para sair juntas (até 40 ações por requisição).
- **Idempotência** por id de lote; **reconexão automática** com backoff, ressincronização completa ao voltar, ao detectar lacuna de revisão ou ao voltar a aba para o primeiro plano.
- **RLS** em todas as tabelas, inclusive autorização dos canais privados do Realtime.

### Interface
Telas de entrada/cadastro, criação de personagem, lista de fazendas (criar / entrar por código), carregamento, HUD (nível com anel de XP, moedas, reputação, ocupação do celeiro, missão atual, próximo desbloqueio, membros online, estado da conexão), painéis de Estoque, Mercado, Projetos, Pedidos/Contratos, Ferramentas, Prédio (filas e receitas), Plantio, Progressão e Ajustes (convite, membros, som, aparência, senha, sair).
Desktop: WASD/setas, clique, roda para zoom, `E`/espaço para interagir, `Esc` fecha painéis. Celular: toque para andar/interagir, botão de ação contextual, arrastar para olhar o mapa, pinça para zoom, painéis como folha inferior, safe areas do iOS, retrato e paisagem. PWA instalável (manifest + service worker).

## Versão 0.2: isométrico, trilha sonora e interface

- Mundo reescrito em **projeção isométrica 2:1** (ilha com laterais de terra, cachoeira, floresta em volta). Prédios desenhados como caixas 3D com faces iluminadas, janelas com floreiras, portas, placas do produto, chaminés com fumaça e pás do moinho girando. Canteiros e cultivos em losango. Seleção por toque/mouse com anel de destaque; teclado convertido para as diagonais da grade.
- **Trilha sonora generativa** calma do campo + ambiência; liga/desliga na HUD e volumes separados em Ajustes; pausa quando a aba sai do primeiro plano.
- **HUD e menus refeitos**: medalhão de nível com anel de XP, fita com o nome da fazenda, pílulas de recursos com contagem animada e "+N", minimapa clicável, rastreador de missão com ícone do objetivo e recompensas, dock com ícones pintados, botão de ação com ícone do alvo, toasts com ícone, janelas de celebração (subida de nível com desbloqueios e nova região), painéis com cabeçalho anil em chita e medalhão, retrato isométrico de cada prédio, receitas em fluxo insumo → produto, filas em anéis de progresso, cartões de plantio, rostos procedurais dos moradores, tela de entrada com diorama isométrico.

## Versão 0.3: redesign cartoon top-down e mobile-first

- **Câmera 2D top-down ortográfica** (o isométrico foi removido): tilemap do Phaser em três camadas (grama por bioma com variações, mescla suave entre regiões, caminhos com autotile e água), rio com ondulação deslizante e brilhos, pontes de tábua, cerca no campo, ordenação por Y, câmera com zona morta e limites, zoom por pinça/roda/botões, arrastar para olhar.
- **Arte cartoon nova** (procedural, sem assets de terceiros): 25 prédios em 3/4 frontal com telhado de telhas, frontão, portas, janelas com floreiras, chaminés com fumaça, placas e adereços por ofício; árvores, arbustos, flores, pedras e minérios com contorno marrom quente, gradiente e sombra suave; canteiros com sulcos e 13 cultivos em 6 estágios (solo preparado, semente, broto, crescendo, adulta, pronta).
- **Personagens chibi**: cabeça grande, olhos com brilho, sobrancelhas, bochechas, roupas, sapatos, 6 cabelos, 6 chapéus, acessórios; poses parado (respiração), caminhada, ferramenta, agachado (plantar/colher), comemoração e carregando, em 4 direções; expressões (feliz, concentrado). Prévia animada no editor; a aparência continua salva em `profiles.character_config`.
- **Game feel e vida**: squash & stretch nos golpes, lascas de madeira/pedra/grama, folhas, poeira, brilhos; itens saltam em arco, voam até o personagem e depois até o botão Estoque; prédio concluído “brota” com elástico, poeira, confete e tremor leve; árvores e flores balançam (só as visíveis), copas e telhados ficam translúcidos quando o personagem passa atrás; nuvens com sombra, pássaros, borboletas, galinhas ciscando, folhas caindo, fumaça.
- **Interface mobile-first** em papel claro com fitas de cor por categoria: barra superior compacta, navegação inferior (Estoque, Mercado, Projetos, Pedidos, Mais), joystick virtual, botão de ação grande com ícone do alvo, toque longo descreve o objeto, destaque no mundo (anel + etiqueta com o nome e o atalho, em vermelho quando falta ferramenta), minimapa recolhível, missão em pílula/cartão. Desktop: hotbar flutuante, painel lateral, zoom. Paisagem: navegação vertical.
- **Ajustes de gráficos**: qualidade Alta/Média/Leve (densidade de decoração e bichos), partículas, reduzir movimento, joystick. Preferências do aparelho ficam no navegador; o progresso continua só no Supabase.
- Nenhuma migration, tabela, política RLS ou RPC foi alterada; nenhuma dependência atualizada.
- QA: `tests/e2e/viewports.mjs` abre a fazenda em 320×640, 360×800, 390×844, 430×932, 768×1024, 1366×768, 1920×1080 e 844×390 (paisagem), tira prints do mundo e de um painel e acusa rolagem horizontal ou HUD fora da tela (todas ok); `tests/e2e/contact.mjs` gera pranchas de contato da arte; E2E cooperativo e testes de backend passando.

## O que foi verificado (e como)

| # | Cenário | Verificação |
| --- | --- | --- |
| 1 | Cadastro de dois usuários | E2E (UI) + `test:backend` |
| 2 | Login simultâneo | E2E: dois contextos independentes (desktop 1280×800 e iPhone 13) |
| 3 | Criação de fazenda | E2E (UI) |
| 4 | Entrada por convite | E2E (UI, código lido da fazenda) |
| 5 | Ver os dois personagens | E2E: avatar remoto existe nos dois clientes; membros “online” na HUD |
| 6 | Movimento sincronizado | E2E: A anda com o teclado; posição de A em B converge para menos de 8 px |
| 7 | Coleta simultânea | E2E: cada um corta uma árvore pela interação do jogo; mesmo nó ao mesmo tempo → só 1 sucesso (também no `test:backend`) |
| 8 | Inventário compartilhado | E2E: estoque idêntico nos dois clientes; `test:backend`: venda simultânea do mesmo estoque → só uma passa |
| 9 | Venda | E2E (UI de venda); saldo atualizado no outro cliente |
| 10 | Construção | E2E: B (celular) inicia e completa a Bancada no Quadro de Projetos; A vê o prédio |
| 11 | Progressão | E2E: duas missões recebidas pela UI; XP/nível/missão iguais nos dois |
| 12 | Reconexão | E2E: B fica offline, HUD mostra “reconectando”, A vende, B volta “online” com o saldo novo |
| 13 | Persistência | E2E: B recarrega e volta direto para a fazenda com o mesmo estado |
| 14 | Layout | E2E: sem overflow horizontal e HUD essencial visível em desktop e celular; screenshots revisadas |
| — | Console sem erros | E2E falha se houver erro de console/página (ignora só erros esperados de rede durante o teste offline) |
| — | Segurança | `test:backend`: não-membro não lê a fazenda; `update` direto de moedas não tem efeito; username duplicado recusado; advisors do Supabase revisados |
| — | Catálogo | `npm run check`: referências, prédios sem sobreposição, todas as portas e nós alcançáveis, todo custo obtível no nível em que é pedido |

Também foi feita revisão visual com uma fazenda de vitrine avançada via SQL (todas as regiões e prédios) em 1440×900 e 390×844.

Durante os testes apareceu uma condição de corrida real (quem entrava não via quem já estava quando o Presence chegava antes da cena do Phaser); foi corrigida guardando o último estado de presença/posição e aplicando-o quando a cena nasce.

## Skills utilizadas

| Skill | Uso |
| --- | --- |
| Phaser (oficiais: `v4-new-features`, `v3-to-v4-migration`, `game-setup-and-config`, `graphics-and-shapes` e demais instaladas) | Phaser 4 (não 3), APIs atuais de texturas a partir de canvas, Scale RESIZE, sem FX/pipelines antigos |
| `supabase` | Changelog/docs atuais (chaves publicáveis, Realtime Authorization, `realtime.send`, secrets de Edge Function), checklist de segurança, advisors |
| `supabase-postgres-best-practices` | `(select auth.uid())` nas políticas, transações curtas com trava por fazenda, FKs indexadas, constraints de domínio |
| `webapp-testing` | Método reconhecimento → ação com Playwright, screenshots e captura de console (em Node, pois a máquina não tem Python) |
| `frontend-design` | Identidade própria (“louça esmaltada” + chita), tipografia Sniglet + Atkinson Hyperlegible, painéis que não cobrem o mundo |
| `ponytail` | Menor solução completa: zero dependências além de Phaser/React/supabase-js, arte procedural em vez de assets, um único RPC de ações |
| `caveman`, `superpowers` (`writing-plans`, `systematic-debugging`, `verification-before-completion`, …) | Instaladas; usadas como disciplina de plano e de verificação antes de declarar algo pronto |

## Estrutura do banco

Seis tabelas em `public` (`profiles`, `farms`, `farm_members`, `farm_inventory`, `farm_entities`, `farm_orders`) + `game.catalog`. Detalhes, RLS e RPCs em [DATABASE.md](DATABASE.md).

## Como criar duas contas para testar

1. `npm run dev` e abra `http://localhost:5173` em dois navegadores (ou um normal e um anônimo; ou um no celular na mesma rede usando o IP que o Vite mostra).
2. Em cada um: **Criar conta** com username (3–20 letras minúsculas, números ou `_`) e senha de 8+ caracteres, e escolha a aparência.
3. No primeiro: **Criar fazenda**. Em **Ajustes → Convide alguém**, copie o código de 6 letras.
4. No segundo: **Entrar com código**.

## Como publicar

Vercel ou Netlify (configs incluídas). Variáveis: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_USERNAME_EMAIL_DOMAIN`. Depois, cadastre a URL publicada em Authentication → URL Configuration. Passo a passo no README.

## Limites atuais (plano Free do Supabase)

Limites consultados na documentação atual (Realtime Limits/Pricing, Project Pausing, Database Size): 200 conexões Realtime simultâneas, 100 mensagens/s, 2 milhões de mensagens/mês, cota de 500 MB de banco (disco fixo de 2 GB; somente leitura a 95% do disco), projeto pausado após uma janela de 7 dias com pouca atividade.

- **Mensagens Realtime** são o gargalo. Cada mensagem enviada e cada entrega contam. Andar gera até 5 envios/s por jogador em movimento, mais as entregas aos colegas; numa fazenda de 2 isso dá ~10 mensagens/s enquanto alguém anda. Estimativa: da ordem de **50–100 horas-jogador por mês** no projeto inteiro. Acima disso: plano Pro (5 milhões incluídos) ou reduzir a taxa para 3/s.
- **Conexões**: 200 simultâneas = no máximo ~200 jogadores online ao mesmo tempo no projeto.
- **Banco**: uma fazenda ocupa poucos KB; 500 MB comportam dezenas de milhares de fazendas. As mensagens enviadas por `realtime.send` ficam na tabela particionada `realtime.messages` por poucos dias (limpeza automática do Supabase).
- **Pausa por inatividade**: projetos Free com pouca atividade de banco ao longo de 7 dias são pausados (há aviso por e-mail antes; algumas requisições por dia já evitam). Planos pagos não pausam.
- **Cadastro**: a Edge Function não tem limite de taxa próprio; um volume abusivo de cadastros exigiria captcha (Supabase Auth suporta hCaptcha/Turnstile) ou limite por IP.
- **Proteção contra senhas vazadas** do Supabase Auth exige plano pago (aviso do advisor).

## Limitações conhecidas

- Sem recuperação de senha (não há e-mail no cadastro, por decisão de projeto). A troca de senha com sessão ativa funciona.
- O servidor não valida distância entre o personagem e o recurso (posição não é persistida por economia); um cliente modificado poderia coletar à distância, mas ainda respeitando ferramenta, região, renascimento e capacidade.
- Mensagens de Broadcast de um membro (posição, frases) não são assinadas pelo servidor; um membro malicioso só conseguiria afetar a exibição para os colegas, nunca o estado salvo.
- Posição do personagem é lembrada só no próprio aparelho.
- Pedidos de moradores são gerados por sorteio ponderado; ainda não há personagens NPC andando no mapa.
- O conteúdo do nível 26 em diante usa os mesmos prédios (colar, contratos finais); há espaço para novas regiões/receitas no fim da curva.
- Sem trilha sonora (apenas efeitos).

## Próximas funcionalidades recomendadas

1. NPCs visitantes que trazem os pedidos até o quadro e reagem às entregas.
2. Pedidos sazonais / eventos semanais cooperativos com placar da fazenda.
3. Decoração livre (cercas, caminhos, flores) com posicionamento por grade — persistido como uma lista compacta no `farm_entities`.
4. Animais (galinheiro, curral) como nova cadeia de produção.
5. Validação de proximidade aproximada no servidor (última posição conhecida enviada junto do lote).
6. Mapa-múndi em miniatura e marcadores de onde cada colega está.
7. Tradução para inglês/espanhol (todas as strings já estão concentradas nos componentes e no catálogo).
8. Captcha no cadastro e limite de taxa por IP na Edge Function antes de divulgar publicamente.
