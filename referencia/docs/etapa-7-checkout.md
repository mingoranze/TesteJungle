# Etapa 7 — Checkout, pedidos e recibo

Implementação dos itens 7.1, 7.2 e 7.3 do [PRD](../PRD.md), sobre os handlers da etapa 2, a sessão/carteiras da etapa 5 e o carrinho/cotação/Socket.IO da etapa 6.

## Rotas

| Rota | Acesso | Conteúdo |
| --- | --- | --- |
| `/pagamento` | privada | Frame "Pagamento": perfil do colecionador, seus NFTs, cotação, carteira e rede, "Confirmar compra" → diálogo de revisão |
| `/pedidos/$orderId` | privada | Status do pedido: pendente, recusado ou recibo confirmado (frame "Confirmação de Pedido") |
| `/pedidos/$orderId/transacao` | privada | Explorador de blocos **simulado** (destino de "Ver no Etherscan") |

Acesso direto e refresh funcionam nas três rotas; sem sessão, redirecionam para `/login?redirect=…`. O placeholder `checkout-pending-page.tsx` da etapa 6 foi removido.

## Migração coordenada de contrato

Contratos, fixtures, store, handlers, testes e esta documentação foram atualizados juntos:

- `Order` passa a guardar o **snapshot da compra**: `items: OrderItem[]` (item do carrinho + `title`, `tokenId`, `imageUrl`, `editionLabel`, `lineTotalEth`), `quote` revalidada, `walletId`, `walletAddress`, `network`, `provider`, `collector` (dados do formulário), `failureReason` (`PAYMENT_REFUSED` | `AVAILABILITY_CONFLICT`) e `updatedAt`. `isTerminalOrderStatus()` define `confirmado`/`recusado` como terminais.
- `OrderReceipt` ganhou `network`, `provider` e `blockNumber`; itens são `OrderItem` (o recibo não consulta o catálogo).
- `CreateOrderRequest` passou a `{ walletAddress, connectionId, network, provider, cartVersion, expectedTotalEth, couponCode, collector }`, com cabeçalho `Idempotency-Key`. Resposta: `{ order }`.
- **Novos** `POST /api/wallet-connections` `{ walletId, provider, network }` → `WalletConnection` e `DELETE /api/wallet-connections/:id`. Erros: `404` carteira de outro usuário, `422 NETWORK_MISMATCH` (rede diferente da cadastrada), `422 WALLET_CONNECTION_REJECTED`.
- Snapshot do store na **versão 10**, com `orderSettlements` (liquidações agendadas). A cadeia 1–9 continua igual; a migração 9 → 10 aplica o snapshot conhecido aos pedidos do fixture e, para pedidos antigos sem itens registrados, mantém snapshot vazio em vez de inventar dados. O pedido pendente do fixture (`order-0002`) recebeu um snapshot próprio (Golden Beat ×1).
- Novos cenários de rede: `payment-refused` (rede recusa automaticamente), `wallet-connection-refused` e `wallet-disconnect` (a conexão cai no envio).

### `POST /api/orders` — ordem das verificações

1. Formato, `Idempotency-Key` e dados do colecionador (`400`, com `details.fields`).
2. Carteira do próprio usuário (`403`).
3. **Idempotência**: mesma chave + mesmo conteúdo devolvem o pedido existente (`200`), mesmo após timeout ou queda da conexão — a conexão fica fora da impressão digital. Conteúdo diferente → `409 IDEMPOTENCY_CONFLICT`.
4. Conexão válida para carteira/provedor/rede → senão `409 WALLET_DISCONNECTED`.
5. Pedido pendente do mesmo carrinho → `409 ORDER_ALREADY_PENDING` com `details.orderId`.
6. Revalidação: carrinho vazio (`409 CART_EMPTY`), divergências de preço/estoque (`409 CART_OUT_OF_DATE`), versão do carrinho, cupom ou total diferentes do revisado (`409 QUOTE_CHANGED` com `details.quote`).

Pedido novo nasce `pendente` e emite `order.updated` (versão 1).

### Liquidação simulada (`src/mocks/marketplace-order-settlement.ts`)

- Fora dos cenários manuais (`order-confirm`/`order-refuse`), o pedido é liquidado **1,5 s** depois da criação: confirmado, ou recusado em `payment-refused`. Sem estoque suficiente para o snapshot no momento da liquidação, é recusado com `AVAILABILITY_CONFLICT`.
- A liquidação é uma única mutação persistida: estado/versão do pedido, estoque, recibo e carrinho. Depois dela são publicados `nft.updated` (estoque) e `order.updated` (somente para o dono).
- Confirmação remove do carrinho **apenas** os itens e quantidades do snapshot (itens adicionados enquanto o pedido estava pendente permanecem) e consome o cupom usado. Recusa não altera o carrinho.
- O agendamento fica em `orderSettlements`; como os timers do mock vivem na página, leituras de pedidos (`GET /orders`, `/orders/:id`, recibo) e a inicialização do mock aplicam liquidações vencidas — um refresh não deixa o pedido preso em `pendente`.
- Os gatilhos `order-confirm`/`order-refuse` da etapa 2.3 agora usam o mesmo caminho (antes usavam o carrinho atual como recibo).

## Pagamento e revisão (7.1)

- **Formulário** com os campos do frame, pré-preenchido com a carteira principal e o perfil. "Usar outra carteira?" preenche com a secundária. Validação no cliente igual à da API; o endereço precisa ser de uma carteira cadastrada e a rede precisa ser a cadastrada para ela. Erros usam `aria-invalid`/`aria-describedby` e o foco vai ao primeiro campo inválido.
- **Carteira e rede**: o provedor (WalletConnect, MetaMask, Coinbase Wallet) é o mesmo estado do campo "Tipo de carteira".
- **Revisão** (diálogo): ao abrir, carrinho e cotação são reconsultados. Mostra carteira, rede, provedor e a cotação revalidada. Se os valores mudaram desde o que estava na tela, exige "Confirmar novos valores"; divergências do carrinho (por exemplo, `nft.updated` durante a revisão) exigem "Aceitar alterações e recalcular" e depois a nova confirmação. O botão de pagamento só habilita com cotação atual, valores confirmados e carteira conectada.
- **Conexão simulada**: "Conectar {provedor}" chama a API; recusa e queda (`WALLET_DISCONNECTED`) informam o motivo e voltam ao estado desconectado; "Desconectar" encerra a conexão.
- Visitante não chega aqui (rota privada); pedido pendente para o mesmo carrinho mostra "Acompanhar pedido" e desabilita "Confirmar compra".

## Criação e recuperação de pedidos (7.2)

- **Chave de idempotência** por tentativa (`order-attempt.ts`): guardada no `sessionStorage` por usuário junto com a impressão digital do conteúdo revisado. Mesmo conteúdo → mesma chave (cliques repetidos, retentativas e até após refresh); conteúdo diferente → nova chave. É descartada quando a API devolve o pedido.
- Envio protegido contra clique duplo (botão desabilitado + trava síncrona). Falhas sem resposta conclusiva (rede, timeout, 5xx — inclusive `504 ORDER_RESPONSE_TIMEOUT`) são reenviadas automaticamente até 2 vezes com a **mesma chave**; persistindo, "Tentar novamente" reenvia a mesma solicitação.
- **`order.updated`** no `useMarketplaceRealtime` (mesmo `socket.io-client` da etapa 6): payload validado; o mesmo controle de `eventId`/versão descarta duplicatas e versões antigas; o cache do pedido só aceita versão maior e **nunca sai de um estado terminal**. Estado terminal invalida carrinho e recibo (REST). A chave fica na partição privada do usuário da conexão; a conexão é recriada e descartada a cada troca de sessão, então eventos da sessão anterior não alcançam o pedido atual.
- **Reconexão**: além de catálogo e carrinho, pedidos carregados antes da (re)conexão são reconsultados via REST.
- A tela do pedido funciona por acesso direto e refresh; o estado vem sempre de `GET /orders/:id`.

## Confirmação e recibo (7.3)

- O recibo só aparece com o pedido `confirmado` pela API simulada; antes disso a tela mostra "Pagamento em processamento" com o snapshot.
- O recibo reproduz o snapshot (`GET /orders/:id/receipt`): itens, edições, taxa, total, carteira, rede e hash, sem consultar o catálogo — testado alterando título/preço do NFT após a compra.
- Recusa mostra o motivo, informa que nada foi cobrado e que os itens continuam no carrinho, com "Tentar novamente" e "Voltar ao carrinho".
- "Ver no Etherscan" abre o **explorador simulado** interno, que declara ser uma demonstração; hash e bloco são gerados pelo mock e o contrato exibido é um endereço fictício.

## Fidelidade visual

Comparação com `imagensReferencia/Desktop/Pagamento.png` e `Desktop/Confirmação de Pedido.png` (1440 px) e `Mobile/Pagamento.png` (414 × 896) usando capturas Playwright nos mesmos viewports, além dos frames `Desktop / Pagamento` (11:2862), `Desktop / Confirmação de Pedido` (11:4385, modal 578 px) e `Mobile / Pagamento` (16:748) consultados no Figma. O ícone "thank-you" foi exportado do Figma (`src/assets/thank-you.svg`, nó 11:5150). Composição, colunas (763 px / 405 px), linhas de 70 px, cartões e rádios em contorno laranja, modal de 578 px com cabeçalho de 156 px, faixa de metadados, tabela "NFTs / Edições / Subtotal", totais e barra inferior conferidos. Divergências registradas:

- Campos pré-preenchidos com a carteira/perfil do usuário (no frame aparecem vazios), como na etapa 5.
- IDs de token do Violet Nomad/Ivory Baron seguem o fixture decidido na etapa 6 (`#0009`/`#0552`), não `#0314`/`#0088` do frame de pagamento.
- No mobile, o frame não tem os campos do colecionador; eles ficam num painel recolhível "Dados do colecionador", aberto automaticamente quando há erro. Carteira principal mostra o endereço curto e a reserva o ENS, como no frame; o menu "⋮" é decorativo.
- Diálogo de revisão, mensagens, tela de pedido pendente/recusado e explorador simulado não existem no Figma; seguem `StatusMessage`, `Dialog` e os tokens da etapa 3.
- Recibo com cupom mostra a linha "Desconto" (o frame não tem cupom). No mobile (sem frame), o recibo ocupa a tela inteira.
- "Tem um código promocional? Aplique aqui" abre o mesmo formulário de cupom do carrinho.

## Verificação

- `npm run typecheck`, `npm run lint`, `npm run build`
- `npx playwright test` — 71 testes, incluindo:
  - `tests/checkout-api.spec.ts`: conexão (posse, rede, recusa), pedido exige conexão e é recuperável pela chave após desconexão, bloqueio de pedido pendente duplicado, desconexão no envio, revalidação de total/versão/cupom/disponibilidade e dados do colecionador, confirmação automática com recibo-snapshot removendo só o comprado, recusa preservando o carrinho, liquidação vencida aplicada na leitura.
  - `tests/checkout.spec.ts`: compra ponta a ponta até o recibo e explorador; recusa; conexão recusada e desconexão; timeout + clique duplo recuperando o mesmo pedido; pedido pendente após refresh, bloqueio de nova compra e confirmação recuperada pela reconciliação após queda do socket; mudança de preço por Socket.IO durante a revisão; validação/foco/Escape; layout mobile 390 px sem overflow.
  - `tests/marketplace-api.spec.ts`, `tests/marketplace-scenarios.spec.ts`, `tests/marketplace-fixtures.spec.ts` e `tests/cart.spec.ts` atualizados ao novo contrato (schema 10, corpo do pedido e tela real de pagamento).
- `npm run test:e2e:demo` — mesmos 71 testes contra o build de demonstração.
- O aviso de chunk acima de 500 kB continua; divisão de código fica para a auditoria de desempenho da etapa 8.
