# Banco de dados (Supabase / Postgres 17)

Princípio: o banco guarda **só o que precisa persistir**. Catálogo estático (itens, receitas, prédios, níveis, missões, contratos, posição dos nós do mapa) fica em `src/data/*.ts`; o servidor recebe uma cópia gerada em uma única linha (`game.catalog`) para validar ações. Posição de personagem e animação **nunca** vão para o banco — trafegam só por Broadcast.

Uma fazenda típica ocupa ~1 linha em `farms`, 2–4 em `farm_members`, ~30 em `farm_inventory`, ~25 em `farm_entities` e 4–6 em `farm_orders`.

## Tabelas (`public`)

| Tabela | Chave | Conteúdo |
| --- | --- | --- |
| `profiles` | `user_id` | `username` (único, `^[a-z0-9_]{3,20}$`), `character_config` (jsonb < 1 KB) |
| `farms` | `id` | `name`, `owner_id`, `invite_code` (único), `level`, `xp`, `coins` (≥ 0), `reputation`, `rev` (revisão para sincronização), `progression` (regiões, tiers de ferramenta, missão atual, contrato atual, contadores), `nodes` (`{nóId: renasceEmMs}` só dos nós esgotados) |
| `farm_members` | `(farm_id, user_id)` | `role` (owner/member), `stats` (contribuição por membro), `last_batch` (idempotência) |
| `farm_inventory` | `(farm_id, item_id)` | `quantity` (≥ 0). Linhas com 0 são apagadas. |
| `farm_entities` | `(farm_id, entity_key)` | Prédios, campo e projetos: `kind`, `level`, `state` (`q` fila de produção, `p` canteiros, `proj` projeto coletivo em andamento) |
| `farm_orders` | `(farm_id, slot)` | Pedidos (slots 0–4) e contrato coletivo (slot 99): `items`, `reward`, `progress` (`got`, `by`) |

Diferença em relação à sugestão do enunciado: `farm_entities` não tem `position_x/y` porque cada prédio tem um lote fixo definido no catálogo (o mapa é desenhado em torno deles). Isso elimina uma classe de validação (sobreposição) e economiza colunas.

Índices: PKs/únicos + `farm_members(user_id)` (usado pela RLS e por `my_farms`) + `farms(owner_id)` (FK). As demais FKs (`farm_id`) já são a primeira coluna das PKs.

## Esquema `game` (não exposto pela API)

- `game.catalog` — 1 linha com o catálogo do servidor (gerado por `npm run gen:catalog`). RLS ligada e sem políticas: inacessível pela API.
- Funções internas: `is_member`, `shares_farm`, `topic_member` (autorização), `pay`, `inv_add`, `inv_take`, `capacity`, `add_xp`, `stat`, `gen_order`, `gen_contract`, `act_*` (uma por tipo de ação), `do_action`, `delta`, `members_json`, `handle_new_user`.

## RLS

Todas as tabelas expostas têm RLS. `anon` não tem nenhum privilégio; `authenticated` só tem `SELECT` (e `UPDATE` da coluna `character_config` do próprio perfil).

| Tabela | Política |
| --- | --- |
| `profiles` | ver o próprio perfil ou de quem divide fazenda comigo; editar só a própria aparência |
| `farms`, `farm_members`, `farm_inventory`, `farm_entities`, `farm_orders` | ver apenas se sou membro da fazenda |
| `realtime.messages` | ler/enviar Broadcast e Presence no tópico `farm:<id>` apenas se sou membro |

Nenhuma tabela aceita `INSERT/UPDATE/DELETE` do cliente: **moedas, XP, estoque, prédios e níveis só mudam pelas RPCs.** O teste `tests/backend.mjs` confirma que um `update` direto em `farms.coins` não tem efeito.

## RPCs públicas (`SECURITY DEFINER`, `search_path = ''`, `EXECUTE` só para `authenticated`)

| Função | O que faz |
| --- | --- |
| `create_farm(p_name)` | Cria a fazenda, o código de convite, prédios iniciais, 3 pedidos e o 1º contrato |
| `join_farm(p_code)` | Entra pelo código (máx. 4 membros) e avisa o canal |
| `leave_farm(p_farm)` | Sai; transfere a posse ou apaga a fazenda se ficar vazia |
| `my_farms()` | Lista minhas fazendas |
| `get_farm_state(p_farm)` | Snapshot completo (1 chamada ao abrir e após reconexão) |
| `farm_act(p_farm, p_batch, p_actions)` | Aplica um **lote** de até 40 ações |

Os linters do Supabase alertam "SECURITY DEFINER executável por authenticated" para essas seis: é intencional — são a API do jogo e cada uma confere `auth.uid()` e a participação na fazenda antes de qualquer coisa.

### Como `farm_act` garante consistência

1. Confere membro e **trava a linha da fazenda** (`SELECT … FOR UPDATE`): ações de jogadores diferentes da mesma fazenda são serializadas. Dois jogadores não gastam o mesmo recurso nem colhem o mesmo nó.
2. Se `p_batch` é igual ao último lote do jogador, devolve `dup` sem reaplicar (reenvio após queda de rede não duplica recompensa).
3. Cada ação roda num sub-bloco com `EXCEPTION`: uma ação inválida é desfeita sozinha e vira um código de erro (`missing_item:wood:3`, `storage_full`, `node_depleted`…), as válidas seguem.
4. Valida tudo contra o catálogo do servidor: nível, região, ferramenta, tempo de crescimento/produção (relógio do servidor), capacidade do celeiro, custos.
5. Incrementa `rev`, monta um delta só com o que mudou e o envia com `realtime.send(…, 'sync', 'farm:<id>', true)` — o **próprio banco** avisa os outros jogadores. O cliente aplica deltas em ordem de `rev`; se perceber lacuna, recarrega o snapshot.

Tipos de ação: `harvest`, `plant`, `reap`, `craft`, `collect`, `sell`, `tool`, `give` (projeto coletivo), `order`, `skip`, `cgive` (contrato), `quest`.

## Edge Function `auth-signup`

O `/signup` do Supabase Auth recusa domínios de e-mail de teste/inexistentes. O cadastro por username passa por esta função, que cria o usuário com a Admin API usando `username@jogadores.fazenda.invalid` (domínio reservado pela RFC 2606, nunca recebe e-mail), já confirmado, com `app_metadata.username`. O gatilho `game.handle_new_user` cria o perfil. Senha, hash e sessão continuam inteiramente no Supabase Auth; o login usa `signInWithPassword` normalmente.

- `verify_jwt = false` (é o ponto de cadastro público).
- Usa `SUPABASE_SECRET_KEYS` (ou `SUPABASE_SERVICE_ROLE_KEY` legado) só dentro da função.
- Domínio configurável com o secret `USERNAME_EMAIL_DOMAIN`.

## Realtime

Um canal privado por fazenda: `farm:<id>`.

| Evento | Origem | Frequência |
| --- | --- | --- |
| Presence | cada cliente | ao entrar/sair |
| `pos` (Broadcast) | cliente que está andando | até 5/s, só em movimento + 1 ao parar |
| `emote` | cliente | raro |
| `sync` | **banco** (`realtime.send`) | 1 por lote de ações |
| `members` | banco | ao entrar/sair membro |

## Limpeza de contas de teste

Os testes criam contas `ta_*`, `tb_*`, `coop_a_*`, `coop_b_*` e `vitrine_*`. Para apagá-las (apaga também perfis e fazendas em cascata):

```sql
delete from auth.users where email ~ '^(ta|tb|coop_a|coop_b|vitrine)_[a-z0-9_]+@jogadores\.fazenda\.invalid$';
```
