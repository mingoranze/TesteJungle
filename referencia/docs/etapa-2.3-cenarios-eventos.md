# Etapa 2.3 — Cenários de rede e eventos simulados

Implementação limitada ao item 2.3 do [PRD](../PRD.md), integrada aos handlers REST da [etapa 2.2](./etapa-2.2-handlers-rest.md) e ao transporte Socket.IO por polling aprovado na etapa 1. Não foram adicionadas telas nem consumidores de domínio.

## Seleção e reset dos cenários

`GET /api/mock/scenarios` lista as opções e o cenário ativo. `POST /api/mock/scenario`, com `{ "scenario": "<id>" }`, seleciona um cenário e reinicializa os dados para um fixture conhecido: `default` restaura o marketplace padrão, `empty-catalog` carrega o fixture vazio e os demais cenários usam o fixture padrão. Selecionar também encerra as conexões Socket.IO abertas e limpa o cookie da sessão, para que testes possam começar de um estado previsível.

`POST /api/mock/reset`, já existente, restaura o fixture selecionado e o cenário de rede `success`, revoga as sessões e encerra as conexões. O cenário ativo também fica no snapshot persistido; estado de pedido, recibo e seleção continuam disponíveis após refresh.

| Cenário | Comportamento |
| --- | --- |
| `success` | Respostas REST normais com o fixture padrão. |
| `empty-catalog` | Catálogo vazio e coleções relacionadas consistentes. |
| `variable-latency` | Adiciona atraso determinístico variável às requisições REST. |
| `out-of-order` | Em consultas concorrentes ao catálogo, página 2 responde antes da página 1. |
| `timeout` | Aguarda mais que o timeout de 10 s do Axios e retorna `504 NETWORK_TIMEOUT`; clientes que abortam antes encerram a espera. |
| `unavailable` | Retorna `503 SERVICE_UNAVAILABLE`. |
| `http-4xx` / `http-5xx` | Retornam erros controlados `422` / `500`. |
| `session-expired` | A próxima requisição que não seja de sessão revoga sessões e retorna `401 SESSION_EXPIRED`; requisições seguintes passam a usar o fluxo normal de não autenticado. |
| `registration-conflict` | Cadastro retorna conflito `409 EMAIL_ALREADY_REGISTERED`. |
| `coupon-invalid` / `coupon-expired` | Cotação ou pedido com cupom retorna `422 COUPON_INVALID` / `COUPON_EXPIRED`. |
| `price-change` | O gatilho atualiza preço/versão de um NFT e emite `nft.updated`. |
| `edition-sold-out` | O gatilho zera as edições disponíveis, atualiza a versão e emite `nft.updated`; operações REST subsequentes observam indisponibilidade. |
| `order-timeout-after-create` | Cria e persiste o pedido pendente, emite `order.updated` e responde `504 ORDER_RESPONSE_TIMEOUT`; repetir a mesma chave e conteúdo recupera o mesmo pedido. |
| `order-confirm` / `order-refuse` | O gatilho leva um pedido pendente a um estado terminal e emite `order.updated`; confirmação também cria o recibo e emite os eventos `nft.updated` para o estoque atualizado. |

O cabeçalho `x-mock-failure: transient` continua disponível para uma falha `503` por requisição, sem alterar o cenário selecionado.

## Gatilhos de alteração e consistência REST/evento

`POST /api/mock/scenario/trigger` executa a alteração do cenário ativo:

- `price-change` e `edition-sold-out`: aceita `nftId` opcional e usa `nft-004` por padrão. O envelope `nft.updated` tem `eventId`, `version`, `resource` e `occurredAt`; a resposta do gatilho e `GET /api/nfts/:nftId` apresentam o mesmo recurso atualizado.
- `order-confirm` e `order-refuse`: exige sessão do proprietário; aceita `orderId` opcional e usa `order-0002` (pendente no fixture) por padrão. A resposta REST e `GET /api/orders/:orderId` refletem o mesmo estado/versionamento emitido em `order.updated`. Após confirmação, o recibo fica disponível em `GET /api/orders/:orderId/receipt`.
- Gatilhos que não correspondem ao cenário ativo retornam `409 SCENARIO_NOT_TRIGGERABLE`; recursos ausentes retornam `404`.

A alteração de preço/estoque mantém versões crescentes e pode deixar itens já colocados no carrinho defasados, para que operações REST posteriores representem o conflito de disponibilidade em vez de rejeitar a atualização simulada. A confirmação atualiza estoque, snapshot do recibo e carrinho na mesma mutação persistida.

## Socket.IO no cliente

O transporte mantém Engine.IO v4 sobre long-polling/MSW e usa `socket.io-client`; `src/mocks/marketplace-socket-client.ts` expõe `connectMarketplaceSocket()`. Eventos de NFT são publicados às conexões ativas. `order.updated` é direcionado apenas às conexões autenticadas do proprietário; o cliente pode autenticar a conexão com `auth: { token }` usando o token retornado pelo login/cadastro. Reset, expiração da sessão ou troca de cenário encerram as conexões para impedir que listeners antigos recebam atualizações posteriores.

## Verificação

- `tests/marketplace-scenarios.spec.ts`: seleção/reset, catálogo vazio, latência variável, resposta fora de ordem, timeout cancelado, indisponibilidade, HTTP 4xx/5xx, expiração, conflitos de cadastro/cupom, mudanças de preço/estoque, timeout após criação/idempotência e recusa de pedido.
- `tests/marketplace-events.spec.ts`: o cliente no navegador recebe atualizações de NFT, e mudanças REST correspondem ao evento; confirmação e recibo sobrevivem a refresh.
- `tests/marketplace-socket-auth.spec.ts`: o evento `order.updated` chega ao socket do proprietário e não a uma conexão anônima.
- `tests/marketplace-fixtures.spec.ts`: persistência e migração de snapshots das etapas anteriores.

Comando focado: `npx playwright test tests/marketplace-scenarios.spec.ts tests/marketplace-events.spec.ts tests/marketplace-socket-auth.spec.ts tests/marketplace-fixtures.spec.ts`.
