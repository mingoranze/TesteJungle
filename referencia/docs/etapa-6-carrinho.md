# Etapa 6 — Carrinho, cotação e sincronização de catálogo

Implementação dos itens 6.1 e 6.2 do [PRD](../PRD.md), sobre os handlers da etapa 2, o detalhe da etapa 4 e a sessão da etapa 5.

## Rotas

| Rota | Acesso | Conteúdo |
| --- | --- | --- |
| `/carrinho` | pública | Itens, cupom, resumo da cotação e recomendações (visitante ou usuário) |
| `/pagamento` | privada | Destino de “Conectar e finalizar”. Até a etapa 7 informa que o pagamento não está disponível e que nenhum pedido foi criado — não simula compra |

O ícone de carrinho do cabeçalho (desktop) e da navegação móvel leva a `/carrinho` e mostra a quantidade total de unidades. “Mercado” fica ativo no cabeçalho em `/carrinho` e `/nfts/*`, como no frame. No detalhe, “Comprar” adiciona a edição/quantidade escolhidas e abre o carrinho; o botão de carrinho do mobile só adiciona.

## Migração coordenada de contrato

Contratos, fixtures, store, handlers, testes e esta documentação foram atualizados juntos:

- `Cart.couponCode: string | null` — o cupom aplicado fica no carrinho e sobrevive a refresh/login.
- **Novo** `CartResponse = Cart & { issues: CartIssue[] }`, retornado por todos os endpoints de carrinho. `CartIssue` descreve divergências calculadas a cada leitura entre o item e o catálogo: `price-changed`, `quantity-exceeds` ou `unavailable`, com preço registrado, preço atual, quantidade e unidades disponíveis.
- `Quote` ganhou `cartVersion` e `couponCode`. A UI só exibe a cotação cuja `cartVersion` é a versão atual do carrinho.
- `CartItemInput.editionId` (opcional). Edições têm identificador estável `<nftId>-edition-NN` derivado de `editionOptions` (`nftEditions()` em `contracts.ts`); o limite por item é `min(disponíveis − outras edições do mesmo NFT no carrinho, limite da edição)` — `1/10` limita a 10, `ABERTA` e NFTs sem edições declaradas usam só a disponibilidade.
- Endpoints:
  - `POST /api/cart/items` `{ nftId, quantity, editionId? }`; `PATCH`/`DELETE /api/cart/items/:nftId` aceitam `editionId` (corpo ou query; sem ele, o único item do NFT). Conflito → `409 AVAILABILITY_CONFLICT` com `details.availableQuantity`. Alterar quantidade **não** atualiza o preço registrado.
  - **Novo** `PUT /api/cart/coupon` `{ couponCode }` → `422 COUPON_INVALID` / `COUPON_EXPIRED` (cenários `coupon-invalid`/`coupon-expired` também interceptam esta rota), `409 CART_EMPTY`; `DELETE /api/cart/coupon` remove.
  - **Novo** `POST /api/cart/reconcile` aceita as divergências: aplica o preço atual, reduz quantidades excedentes e remove itens esgotados.
  - `POST /api/quotes` passa a atender também o visitante e usa o cupom do carrinho quando o corpo não traz `couponCode`. Carrinho com divergências → `409 CART_OUT_OF_DATE` com `details.issues`.
- Login e cadastro incorporam o carrinho do visitante ao do usuário **na mesma mutação que cria a sessão**: quantidades da mesma edição são somadas, itens novos são acrescentados, o cupom do visitante é mantido se o usuário não tiver um, e o carrinho do visitante é esvaziado (um novo login não reaplica itens). Excesso de disponibilidade após a soma vira divergência para o usuário revisar, em vez de descartar unidades silenciosamente.
- Fixtures alinhados ao frame desktop do carrinho (que prevalece sobre o mobile onde os dois se contradizem): o carrinho da Ana é Emerald Ape ×2 (edição 1/50), Violet Nomad ×6 e Ivory Baron ×9 — subtotal 26.83, taxa 0.016, total 26.846. Para isso, Violet Nomad passou a 10 edições disponíveis e Ivory Baron a 12. Violet Nomad/Ivory Baron receberam os IDs de token `#0009`/`#0552`; Ivory Baron e Golden Beat receberam as edições `1/10` e `1/50` do frame mobile. O carrinho do visitante começa vazio.
- Taxa de rede da cotação: `0.016 ETH` (valor do frame).
- Snapshot do store na **versão 8**. A versão 7 é migrada adicionando `couponCode: null` e os metadados do catálogo (preservando preço/estoque alterados por eventos); as versões 1–6 seguem a cadeia anterior e também recebem o cupom.
- Controles de mock para testes e demonstração (fora do fluxo do produto): `POST /api/mock/socket/disconnect` derruba as conexões Socket.IO; `POST /api/mock/socket/replay` `{ eventId }` reenvia um evento já publicado (mesmo `eventId`/versão), simulando entrega duplicada ou fora de ordem.

## Carrinho (6.1)

- **Cache:** visitante em `['cart', 'guest']`; usuário em `['private', userId, 'cart']`, descartado no logout/troca de usuário pela limpeza da etapa 5. A consulta espera a sessão resolver, porque a API identifica o carrinho pelo cookie. Mutations gravam o carrinho retornado somente se pertencer à sessão atual e não for mais antigo que o cache; `404`/`409` recarregam o carrinho.
- **Cotação:** chave `[...carrinho, 'quote', cartVersion]` — qualquer alteração gera nova consulta e o resumo volta ao skeleton shimmer em vez de mostrar valores antigos. A cotação é renovada antes de `expiresAt`. Subtotal, desconto, taxa e total vêm da API; o total de cada linha é calculado no cliente com aritmética decimal exata (`src/lib/decimal.ts`, BigInt), sem `Number`.
- **Estados:** skeleton da lista e do resumo; vazio com retorno ao mercado; falha do carrinho e da cotação com “Tentar novamente”; atualização em segundo plano anunciada a leitores de tela. Quantidade e remoção ficam desabilitadas enquanto a operação do item está pendente.
- **Cupom:** validação no cliente para campo vazio; erros da API no campo (`aria-invalid`, `aria-describedby`, `role="alert"`); cupom aplicado aparece com “Remover cupom”.
- **Finalizar:** só habilitado com cotação atual e sem divergências. Visitante vai para `/login?redirect=/carrinho` e volta com o carrinho incorporado.

## Atualizações `nft.updated` (6.2)

`src/features/realtime/use-marketplace-realtime.ts` é montado no shell e usa o `socket.io-client` (polling Engine.IO interceptado pelo MSW, como na etapa 1), agora **com reconexão automática**. O estado da conexão fica em `<html data-realtime="connecting|connected|disconnected">` para diagnóstico e testes.

- **Identidade e versão:** o payload é validado (`eventId`, `version`, `resource.id`, `resource.version === version`). `createEventGuard()` descarta `eventId` repetido e versão menor ou igual à última aplicada para o recurso.
- **Aplicação:** detalhe e itens das listas são substituídos somente por versões mais novas; listas e detalhe ativos são reconsultados via REST (a invalidação cancela consultas antigas em voo, então respostas obsoletas não regridem a tela). Se o NFT está no carrinho, o carrinho é recarregado — a API devolve a divergência — e um aviso (`role="status"`) informa preço antigo/novo ou esgotamento. O detalhe aberto também informa a mudança.
- **Sem cotação velha:** com divergência, o resumo some, “Conectar e finalizar” fica desabilitado e a lista mostra cada mudança com “Aceitar alterações e recalcular” (`POST /cart/reconcile`). A cotação só volta depois do aceite.
- **Reconexão:** a cada `connect`, o controle de duplicatas é reiniciado e catálogo, detalhes e carrinho ativos carregados antes da conexão são reconsultados via REST, recuperando eventos perdidos durante a queda.
- **Sessão e ciclo de vida:** a conexão é recriada quando a sessão muda e, autenticada, é registrada em `session-subscriptions` — logout, troca de usuário e expiração a encerram antes de expor a nova sessão; listeners de conexão anterior são ignorados. Ao desmontar, listeners são removidos e o socket é desconectado.

## Fidelidade visual

Comparação com `imagensReferencia/Desktop/Carrinho de NFTs.png` (1440 px) e `Mobile/Carrinho de NFTs.png` (414 × 896) usando capturas Playwright nos mesmos viewports: trilha, tabela (colunas em 120/431/569/705 px, linhas de 70 px com imagem 70 × 70), controles de quantidade em pílula, resumo de 332 px com campo de cupom acoplado a “Aplicar”, linhas de 32 px, “Taxa estimada”, total em destaque, botão e “Continuar explorando”; carrossel “Colecionadores também viram” com 5 cartões e indicadores. No mobile: cabeçalho com voltar, cartões de 100 px com edição e total da linha, controles circulares, painel inferior fixo com cupom em pílula e botão em gradiente, sem navegação inferior. Divergências registradas:

- Com a Ana logada, o desktop reproduz itens, quantidades e valores do frame; desconto sem cupom aparece como `(-) 00.00`, como no frame.
- Os frames se contradizem: o mobile mostra Violet Nomad como “Edição: 1/1” (limite de 1 unidade), incompatível com as 6 unidades do desktop. Por decisão do usuário prevalece o desktop, e no mobile o Violet mostra o ID do token no lugar da edição. O subtotal do frame mobile (8.92) também não fecha com a soma dos itens (8.14); a tela mostra a soma real.
- No mobile, a lixeira do cartão fica oculta e aparece ao passar o ponteiro/tocar no cartão ou ao receber foco pelo teclado, como o ícone sobreposto do frame.
- Avisos de divergência, mensagens de erro e o painel de cupom aplicado não existem no frame; seguem `StatusMessage` e os tokens da etapa 3.
- Tablet (768 px) usa os cartões do mobile com o resumo abaixo da lista, sem painel fixo.

## Verificação

- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run build:demo`
- `npx playwright test` — 56 testes, incluindo:
  - `tests/cart-api.spec.ts`: edição/disponibilidade, cupom válido/inválido/expirado/carrinho vazio, cotação decimal com cupom do carrinho, fusão visitante → usuário sem duplicação e sem vazar para outro usuário, divergências de preço/esgotamento, `CART_OUT_OF_DATE` e reconciliação.
  - `tests/cart.spec.ts`: fluxo do visitante com cupom e refresh; limite de edição e skeleton/falha/nova tentativa da cotação; fusão ao entrar pelo checkout, rota privada `/pagamento` e logout; `nft.updated` durante o carrinho com aviso, bloqueio da cotação antiga e aceite; edição esgotada; duplicata/evento antigo sem regressão e reconciliação REST após desconexão; layout mobile 390 px e tablet 768 px sem overflow.
  - `tests/realtime-unit.spec.ts`: guarda de eventos e aritmética decimal.
  - `tests/marketplace-fixtures.spec.ts`: migração do snapshot 7 → 8.
- `npm run test:e2e:demo` — mesmos testes contra o build de demonstração.
- O build informa o chunk principal com ~522 kB (168 kB gzip); a divisão de código fica para a auditoria de desempenho da etapa 8.
