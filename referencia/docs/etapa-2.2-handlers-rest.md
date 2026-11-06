# Etapa 2.2 — Handlers REST

Implementação limitada ao item 2.2 do [PRD](../PRD.md), usando os contratos da etapa 1 e o estado persistido da [etapa 2.1](./etapa-2.1-fixtures.md). Os cenários de rede e a emissão de eventos Socket.IO pertencem à etapa 2.3 e não foram incluídos.

## Endpoints disponíveis

Os handlers ficam em `src/mocks/marketplace-handlers.ts` e são registrados junto aos handlers da prova técnica em `src/mocks/handlers.ts`.

| Domínio | Endpoints |
| --- | --- |
| Cenário | `POST /api/mock/reset` |
| Sessão/conta | `GET /api/session`, `POST /api/session/register`, `POST /api/session/login`, `POST /api/session/logout` |
| Catálogo | `GET /api/nfts`, `GET /api/nfts/:nftId` |
| Favoritos | `GET /api/favorites`, `PUT /api/favorites/:nftId`, `DELETE /api/favorites/:nftId` |
| Carrinho | `GET /api/cart`, `POST /api/cart/items`, `PATCH /api/cart/items/:nftId`, `DELETE /api/cart/items/:nftId` |
| Cotação | `POST /api/quotes` |
| Perfil | `GET /api/profile`, `PATCH /api/profile` |
| Carteiras | `GET /api/wallets`, `POST /api/wallets`, `PATCH /api/wallets/:walletId`, `DELETE /api/wallets/:walletId` |
| Pedidos/recibo | `GET /api/orders`, `POST /api/orders`, `GET /api/orders/:orderId`, `GET /api/orders/:orderId/receipt` |

O catálogo aceita `q`, `collectionId`, `minPriceEth`, `maxPriceEth`, `sort`, `page` e `pageSize`; retorna `items`, `total`, `page` e `pageSize`. A ordenação aceita relevância (ordem do fixture), preço crescente/decrescente e título crescente/decrescente. Preços e cálculos de cotação permanecem em strings decimais; a cotação usa unidades inteiras para evitar erros de ponto flutuante. O cupom simulado `WELCOME10` aplica 10% de desconto; a taxa de rede fixa é `0.005 ETH`.

## Sessão e isolamento

Cadastro valida nome, e-mail e tamanho da senha, normaliza o e-mail e responde conflito para e-mail já cadastrado. Login verifica as credenciais e logout revoga o token. A sessão usa cookie `HttpOnly`, `SameSite=Lax`, duração de 24 horas e token aleatório registrado no estado simulado. Senhas não são guardadas em claro: são armazenadas como hash PBKDF2-SHA-256 com salt individual.

As credenciais dos usuários do fixture padrão aceitam a senha demonstrativa `kurio-demo`. Endpoints privados exigem sessão e filtram perfil, favoritos, carrinho, carteiras e pedidos pelo usuário autenticado. O carrinho de visitante continua acessível sem sessão. `POST /api/mock/reset` aceita `default` ou `empty-catalog`, restaura o estado e limpa o cookie da sessão.

## Validação, erros e consistência

Erros REST usam o formato `{ "error": { "code": "...", "message": "...", "details": ... } }`, omitindo `details` quando não aplicável. Os handlers representam:

- `400 VALIDATION_ERROR` para JSON malformado, campos inválidos, filtros inválidos ou chave de idempotência ausente.
- `401 UNAUTHENTICATED` para endpoints privados sem sessão válida e `401 INVALID_CREDENTIALS` para credenciais incorretas.
- `403 FORBIDDEN` quando a carteira informada para o pedido não pertence ao usuário autenticado.
- `404 NOT_FOUND` para NFTs, itens, carteiras, pedidos ou recibos inexistentes/indisponíveis.
- `409` para cadastro duplicado, carrinho vazio, indisponibilidade e conflito de idempotência.
- `422 COUPON_INVALID` para cupom inválido ou expirado.
- `503 SERVICE_UNAVAILABLE` quando a requisição inclui `x-mock-failure: transient`, para exercitar falha transitória.

Alterações no carrinho verificam quantidades inteiras positivas e disponibilidade antes de atualizar a versão. Favoritos são idempotentes para inclusão e permanecem separados por usuário. Perfil permite atualizar nome e URL de avatar; carteiras permitem criar, editar, definir principal e remover, sempre no escopo do usuário.

`POST /api/orders` exige `Idempotency-Key`, sessão autenticada, carteira do próprio usuário e carrinho não vazio/disponível. A mesma chave, usuário e conteúdo de requisição recuperam o pedido existente; reutilizar a chave com conteúdo diferente ou por outro usuário retorna conflito. Pedido novo fica `pendente`; a resposta não declara compra concluída. A lista e os detalhes de pedidos/recibos são restritos ao proprietário, e recibos só são retornados quando já existem no fixture.

## Compatibilidade do estado persistido

A versão do snapshot do marketplace foi incrementada para incluir credenciais, sessões, associação de pedidos aos usuários e fingerprints de idempotência. Snapshots da versão anterior são migrados preservando os dados existentes e associando credenciais/posse dos pedidos de fixture quando disponíveis; sessões antigas não são reaproveitadas. O reset continua restaurando o cenário conhecido.

## Limites desta etapa

Não foram adicionados consumidores de API ou telas. Transições de pedido para confirmado/recusado, criação de recibo após pagamento, alterações de preço, latência/timeout e eventos Socket.IO permanecem para etapas posteriores. O cabeçalho de falha transitória serve apenas para testar a resposta HTTP 503; não implementa a matriz de cenários da etapa 2.3.

## Verificação

`npx playwright test tests/marketplace-api.spec.ts` cobre catálogo, cenários vazio e padrão, respostas de erro, autenticação e isolamento, cadastro/conflito, favoritos, carrinho, cotação, perfil, carteiras e idempotência/posse de pedidos. `tests/marketplace-fixtures.spec.ts` também verifica persistência, reset e migração de estado.
