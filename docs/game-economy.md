# Sítio Mutirão: economia (v1.1)

Os valores abaixo saem dos catálogos em `src/data/` (preços, custos, recompensas) e das funções `game.*` da migration `20261104000007_progression.sql`. Para rebalancear:

1. Edite `src/data/`.
2. Rode `npm run gen:catalog` e `node scripts/check-catalog.mjs`.
3. Aplique o catálogo no Supabase.

## Moedas

| | Moeda | Cristal 💎 |
|---|---|---|
| De quem é | caixa da fazenda (compartilhado) | da fazenda (compartilhado) |
| Para que serve | economia do dia a dia: sementes, obras, campos, ferramentas, melhorias, pets comuns | moeda rara: pets raros, itens de visual especiais, acelerar esperas longas |
| Como ganhar | clientes, mercado, missões, níveis, contratos | jogando: níveis, marcos, diárias, cooperativas, clientes especiais, pet raposa |
| Dinheiro real | não existe | não existe |

Os itens ficam no estoque compartilhado (celeiro/armazém) ou na mochila individual. A mochila é individual. O estoque, as obras e os clientes são de todos.

## Fontes (faucets)

### Moedas

| Fonte | Valor |
|---|---|
| Cliente comum | ~1,35× o valor de mercado do pedido + XP |
| Cliente especial (12%, nível 4+) | pedido ~1,8× maior, paga ~1,6× o mercado, +1 💎 (+2 a partir do nível 15) |
| Mercado | preço do item (+10/15/20% com o prédio Mercado) |
| Missões principais | 11.470 moedas e 2.522 XP no total da campanha |
| Secundárias e diárias | ~0,55× o valor da meta + XP |
| Cooperativa | ~0,8× o valor da meta (multiplicada pelo número de membros) |
| Subir de nível | 25 × nível |
| Obra coletiva com 2+ membros | 10% das moedas da obra de volta + XP extra |
| Pet gata | +4–12% nas moedas dos clientes |

### Cristais

| Fonte | Total |
|---|---|
| Início | 5 |
| Por nível | 2 × 29 níveis = 58 |
| Região aberta ou pontes reconstruídas | 3 cada, 21 no total |
| Marcos da campanha | 57 no total |
| Diárias | 1 cada, até 3 por dia |
| Cooperativa | 3 por missão |
| Clientes especiais | 1–2 |
| Pet raposa | 4–10% de chance de +1 por atendimento |

Sem contar as recorrentes, a campanha completa rende ~141 💎. Com as diárias, um jogador ativo ganha ~3–6 💎 por dia.

## Gastos (sinks)

### Moedas

| Gasto | Valor |
|---|---|
| Sementes | a cada plantio |
| Campos | 43.720 moedas para abrir e levar os 11 campos ao nível 3, mais materiais |
| Regiões | 13.750 moedas, mais materiais |
| Pontes | 400 moedas, mais tábuas, vigas, cordas e pedras |
| Ferramentas | 26.190 moedas até o nível máximo, mais materiais |
| Prédios e melhorias | obras coletivas com moedas e materiais |
| Melhorias do personagem | 8.500 moedas por jogador (botas e luvas) |
| Mochila | 5 melhorias por jogador |
| Pets comuns | 3.500 moedas para os quatro |
| Itens de visual | 1.300 moedas |
| Ajudantes | contratação e treino |
| Aceleração curta | esperas de até 60 s, 2 moedas por segundo |

### Cristais

| Gasto | Valor |
|---|---|
| Pets raros | galinha 12 💎, raposa 20 💎, coruja 35 💎 (67 no total) |
| Itens de visual especiais | 13 💎 |
| Aceleração | 1 💎 a cada 3 minutos restantes (plantio ou fila de produção) |

## Controle de inflação

- **Custos exponenciais, renda linear.** O XP por nível vai de 40 a 2.490. A meta dos clientes cresce com o nível (25 + 14×nível) e o custo das melhorias cresce mais rápido que isso.
- **Os gastos acompanham as fontes.**
  - Cada região, campo e ferramenta nova pede materiais da região anterior. Isso puxa os itens do estoque para fora da economia.
  - O celeiro tem limite.
  - A mochila precisa ser descarregada.
- **O bônus dos pets é limitado.** Ele vale só para o dono, e o teto é de 12–32% conforme a habilidade.
- **Os cristais ficam caros de propósito.**
  - Acelerar uma colheita de 10 minutos custa 4 💎, que equivalem a ~1 dia de diárias.
  - Esperas curtas saem em moedas, então ninguém precisa de cristal para jogar.
- **Missões geradas usam metas absolutas.** Elas guardam o contador no momento em que foram criadas (`base`) e só contam o que for feito depois. Não é possível resgatar com progresso antigo.
- **Clientes não travam.** Eles só pedem itens que a fazenda consegue obter (`game.item_ok`). O pedido sempre tem saída.

## Segurança da economia

- Toda transação acontece dentro de `farm_act`. A função trava a linha da fazenda (`FOR UPDATE`), não repete o mesmo lote (`last_batch`) e roda cada ação em uma subtransação.
- **Missões:**
  - A principal fica registrada em `progression.mdone` e não pode ser resgatada duas vezes.
  - A diária fica marcada como recebida no dia.
  - A secundária e a cooperativa são trocadas no mesmo instante do resgate.
- **Clientes:** o pedido é regenerado na mesma transação da entrega, o que impede entrega dupla.
- **Aceleração:** o custo é recalculado no servidor com o horário do servidor. Pedido já pronto devolve `already_ready`.
- **Visual:** `profiles.owned` só é escrito pelo servidor. Um gatilho em `profiles` devolve ao padrão itens pagos não liberados.
- **Saldos:** cristais e moedas têm `check (>= 0)` no banco.
