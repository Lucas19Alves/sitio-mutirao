# Sítio Mutirão

Jogo web cooperativo de fazenda em estilo arcade. Duas a quatro pessoas cuidam da **mesma** propriedade: coletam recursos, plantam, produzem em cadeia, atendem pedidos, erguem prédios em projetos coletivos e abrem sete regiões. Estoque, moedas, ferramentas e progressão são da fazenda, não de cada jogador.

Roda no navegador (desktop, Android, iPhone, tablets) e pode ser instalado na tela inicial (PWA).

**Publicado em:** https://sitio-mutirao.vercel.app

## Tecnologias

| Camada | Uso |
| --- | --- |
| Phaser 4.2.1 | Mundo, sprites, animações, câmera, toque/teclado |
| React 19 + TypeScript 7 | Telas, HUD e painéis |
| Vite 8 | Desenvolvimento e build |
| Supabase | Auth (username + senha), Postgres com RLS, RPCs que validam a economia, Realtime (Broadcast + Presence), 1 Edge Function |
| Playwright | Testes E2E com dois navegadores independentes |

Toda a arte é procedural (Canvas 2D gerado no carregamento): nenhum asset de imagem é baixado.

## Como executar

Requisitos: Node 23.6+ (o script do catálogo usa o type stripping nativo do Node).

```bash
npm install
```

```bash
cp .env.example .env
```

Preencha o `.env` (ver abaixo) e rode:

```bash
npm run dev
```

Abra `http://localhost:5173`.

## Variáveis de ambiente

| Variável | Descrição |
| --- | --- |
| `VITE_SUPABASE_URL` | URL do projeto (`https://<ref>.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave **publicável** (`sb_publishable_...`). Nunca use a secret/service_role no cliente. |
| `VITE_USERNAME_EMAIL_DOMAIN` | Domínio interno para o login por username. Padrão `jogadores.fazenda.invalid`; deve ser igual ao da Edge Function. |

## Configurar o Supabase (projeto novo)

1. Crie um projeto em https://supabase.com/dashboard.
2. **Authentication → Sign In / Providers → Email**: desligue **Confirm email** (não há e-mail real no cadastro).
3. **Realtime → Settings**: desligue **Allow public access** (os canais do jogo são privados e autorizados por RLS).
4. Aplique as migrations de `supabase/migrations/` em ordem (abaixo).
5. Publique a Edge Function `auth-signup` **sem** verificação de JWT (ela é o cadastro público):

```bash
npx supabase functions deploy auth-signup --no-verify-jwt --project-ref SEU_REF
```

6. Copie URL e chave publicável para o `.env`.

### Aplicar as migrations

Com a CLI (pede a senha do banco):

```bash
npx supabase link --project-ref SEU_REF
```

```bash
npx supabase db push
```

Ou cole cada arquivo, em ordem, no **SQL Editor** do dashboard:

1. `20261102000001_schema.sql` — tabelas, RLS, gatilho de perfil, políticas do Realtime
2. `20261102000002_game_logic.sql` — funções do jogo e RPCs públicas
3. `20261102000003_catalog.sql` — catálogo que o servidor usa para validar (gerado)
4. `20261102000004_profile_trigger_update.sql` — correção do gatilho de perfil
5. `20261102000005_owner_index.sql` — índice da FK `farms.owner_id`

### Mudou o catálogo?

O catálogo (itens, receitas, prédios, níveis, pedidos) vive em `src/data/*.ts`. O servidor usa uma cópia gerada:

```bash
npm run check
```

```bash
npm run gen:catalog
```

Depois aplique de novo `20261102000003_catalog.sql` (é um upsert idempotente). Cliente e servidor precisam do mesmo catálogo.

## Testar o multiplayer

Manual: abra o jogo em dois navegadores diferentes (ou uma janela anônima), crie uma conta em cada, crie a fazenda em um, copie o código em **Ajustes → Convide alguém** e entre com ele no outro. Os dois personagens aparecem no mesmo mapa e o estoque é o mesmo.

Automático:

```bash
npm run test:backend
```

```bash
npx playwright install chromium
```

```bash
npm run test:e2e
```

`test:backend` cria duas contas e testa RLS, convite, coleta simultânea do mesmo nó, gasto duplo, idempotência e projeto coletivo direto nas RPCs. `test:e2e` usa dois contextos de navegador (desktop e iPhone 13) e cobre os 14 cenários do relatório (`docs/RELATORIO.md`). Ambos criam contas novas no projeto configurado no `.env`.

## Controles

| Ação | Desktop | Celular |
| --- | --- | --- |
| Andar | WASD / setas, ou clique no chão | Toque no chão |
| Interagir | Clique no objeto, ou `E` / espaço perto dele | Toque no objeto, ou botão amarelo de ação |
| Câmera | Arrastar, roda do mouse (zoom) | Arrastar, pinça (zoom) |
| Painéis | Barra inferior; `Esc` fecha | Barra inferior |

## Deploy

O projeto já tem `vercel.json` e `netlify.toml` (SPA + cache dos assets + `sw.js` sem cache).

- **Vercel**: importe o repositório, framework Vite, defina as três variáveis `VITE_*` e publique.
- **Netlify**: importe o repositório (build `npm run build`, pasta `dist`) e defina as mesmas variáveis.

Teste de fumaça no ambiente publicado (cria duas contas, desktop e celular):

```bash
node tests/e2e/smoke-prod.mjs https://sitio-mutirao.vercel.app
```

Depois do deploy, adicione a URL publicada em **Authentication → URL Configuration → Site URL** no Supabase.

## Estrutura

```
src/
  data/            catálogo estático (fonte única para cliente e servidor)
  game/
    art/           arte procedural: terreno, nós, prédios, cultivos, personagens, ícones
    scenes/        BootScene (gera texturas) e WorldScene (mundo, entrada, câmera)
    entities/      Avatar (local e remoto)
    systems/       pathfinding (A*)
    state/         store da fazenda: espelho do servidor + fila de ações em lote
    multiplayer/   canal Realtime: Presence, Broadcast de posição, sync do banco
    rules.ts       regras derivadas do catálogo (para a interface)
  components/      telas React, HUD e painéis
  services/        cliente Supabase e autenticação
supabase/
  migrations/      schema, RLS, lógica, catálogo
  functions/       auth-signup (cadastro por username)
scripts/           geração/checagem do catálogo, ícones do PWA
tests/             backend.mjs (RPCs) e e2e/ (Playwright)
docs/              banco de dados e relatório
```

Mais detalhes: [docs/DATABASE.md](docs/DATABASE.md) e [docs/RELATORIO.md](docs/RELATORIO.md).
