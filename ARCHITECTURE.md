# Arquitetura — Kurio NFT Marketplace

Este documento descreve como a aplicação está organizada: contratos REST e de eventos, sessão, carrinho, cache, reconciliação entre REST e Socket.IO, limitações, decisões de UX e desvios do Figma. Instalação, comandos e reprodução de cenários estão no [README](README.md). O histórico detalhado de cada etapa está em [`referencia/docs/`](referencia/docs/).

---

## 1. Visão geral

```
 UI (React + Tailwind + shadcn/ui)
   │  hooks por domínio (src/features/*)
   ▼
 TanStack Router ── TanStack Query ── Axios (src/lib/api-client.ts)      socket.io-client
                                        │  /api/*                          │  /socket.io/?EIO=4&transport=polling
                                        ▼                                  ▼
                         ┌──────────── Service worker do MSW ────────────┐
                         │ handlers REST         transporte Engine.IO v4 │
                         │        └──── store único (localStorage) ─────┘│
                         └───────────────────────────────────────────────┘
```

- **Uma fonte de verdade.** REST e eventos leem e alteram o mesmo store simulado (`src/mocks/marketplace-store.ts`). Toda mudança simulada aparece tanto na resposta REST quanto no evento correspondente.
- **A UI não conhece os mocks.** Componentes e hooks só falam com Axios e `socket.io-client`. Não há respostas fictícias, setters chamados pelo mock nem escrita direta no cache a partir do mock.
- **Mocks por configuração.** `VITE_ENABLE_MOCKS=true` (modo `development` e `demo`) registra o worker antes de renderizar (`src/main.tsx`). O `npm run build` padrão não inclui mocks.

### Organização das pastas

| Pasta | Responsabilidade |
| --- | --- |
| `src/components/` | UI reutilizável: primitivas shadcn/ui adaptadas, layout (cabeçalho, rodapé, navegação móvel), campos, botões, skeleton, `StatusMessage`. Sem regra de negócio nem acesso a API. |
| `src/domain/contracts.ts` | Tipos e construtores dos contratos: `DecimalString`, `Quantity`, `IdempotencyKey`, recursos, requisições, erros e envelope de eventos. |
| `src/features/<domínio>/` | Telas, componentes específicos e hooks de dados: `discovery`, `session`, `account`, `favorites`, `cart`, `checkout`, `realtime`. |
| `src/lib/` | Cliente Axios, normalização de erros (`ApiError`), `QueryClient`, chaves de query, aritmética decimal com BigInt. |
| `src/mocks/` | MSW: fixtures, store persistido e migrado, handlers REST, cenários de rede, liquidação de pedidos e servidor Engine.IO por polling. |
| `tests/` | Playwright: E2E, contratos da API simulada, unidade (guarda de eventos, decimal), qualidade (Axe/overflow) e regressão visual. |

---

## 2. Contratos REST

Base: `VITE_API_BASE_URL` (padrão `/api`). Axios com `timeout` de 10 s e cancelamento pelo `AbortSignal` do TanStack Query.

### Formatos transversais

- **ETH** é sempre string decimal (`"0.016"`, `"26.846"`) no transporte e nos cálculos. O servidor simulado calcula em unidades inteiras e o cliente usa `src/lib/decimal.ts` (BigInt). `Number` nunca é usado para valores monetários.
- **Quantidades** são inteiros positivos (`Quantity`).
- **Recursos versionados** (`Nft`, `Cart`, `Order`) têm `version` inteiro crescente.
- **Erros** seguem `{ "error": { "code": string, "message": string, "details"?: unknown } }`. Erros de validação trazem `details.fields`. O Axios normaliza tudo em `ApiError { status, code, message, details }`, com `status: null` para falha de rede ou timeout.

### Endpoints

| Domínio | Endpoint | Observações |
| --- | --- | --- |
| Sessão | `GET /session` | Sessão atual ou visitante |
| | `POST /session/register` | `409 EMAIL_ALREADY_REGISTERED` / `USERNAME_TAKEN`. Incorpora o carrinho do visitante |
| | `POST /session/login` | `401 INVALID_CREDENTIALS`. Incorpora o carrinho do visitante |
| | `POST /session/logout` | Revoga o token |
| Catálogo | `GET /nfts` | `q`, `collectionId`, `category`, `network`, `minPriceEth`, `maxPriceEth`, `sort`, `page`, `pageSize` → `{ items, total, page, pageSize }` |
| | `GET /nfts/:nftId` | `404 NOT_FOUND` |
| Favoritos | `GET /favorites`, `PUT /favorites/:nftId`, `DELETE /favorites/:nftId` | Privado e idempotente |
| Carrinho | `GET /cart` | `CartResponse = Cart & { issues: CartIssue[] }` (visitante ou usuário) |
| | `POST /cart/items` `{ nftId, quantity, editionId? }` | `409 AVAILABILITY_CONFLICT` com `details.availableQuantity` |
| | `PATCH` / `DELETE /cart/items/:nftId` | `editionId` no corpo ou na query |
| | `PUT /cart/coupon` `{ couponCode }`, `DELETE /cart/coupon` | `422 COUPON_INVALID` / `COUPON_EXPIRED`, `409 CART_EMPTY` |
| | `POST /cart/reconcile` | Aceita divergências: preço atual, quantidade reduzida, remoção de esgotados |
| Cotação | `POST /quotes` | `{ currency, subtotalEth, discountEth, networkFeeEth, totalEth, cartVersion, couponCode, expiresAt }`. `409 CART_OUT_OF_DATE` com `details.issues` |
| Perfil | `GET /profile`, `PATCH /profile` | Avatar como URL http(s) ou data URL até ~300 KB |
| | `POST /profile/password` | `204`, ou `422 INVALID_CURRENT_PASSWORD`. Revoga as demais sessões |
| Carteiras | `GET`, `POST /wallets`, `PATCH`, `DELETE /wallets/:walletId` | Uma `principal` e uma `secundaria` por usuário. `409 WALLET_ROLE_TAKEN` / `PRIMARY_WALLET_REQUIRED` / `WALLET_ADDRESS_DUPLICATE` |
| Conexão de carteira | `POST /wallet-connections`, `DELETE /wallet-connections/:id` | `422 NETWORK_MISMATCH` / `WALLET_CONNECTION_REJECTED` |
| Pedidos | `GET /orders`, `GET /orders/:orderId`, `GET /orders/:orderId/receipt` | Restritos ao dono. O recibo só existe para pedido `confirmado` |
| | `POST /orders` + `Idempotency-Key` | Ver §5 |
| Mock (fora do produto) | `/mock/reset`, `/mock/scenarios`, `/mock/scenario`, `/mock/scenario/trigger`, `/mock/fail-next`, `/mock/socket/disconnect`, `/mock/socket/replay` | Controle de cenários para testes e demonstração ([README](README.md#cenários-de-rede)) |

Códigos comuns: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED` / `SESSION_EXPIRED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409` (conflitos), `422` (regra de negócio), `503 SERVICE_UNAVAILABLE`, `504 NETWORK_TIMEOUT`.

---

## 3. Eventos Socket.IO

### Transporte

O MSW não implementa um servidor Socket.IO. Para usar o `socket.io-client` real sem atalhos na UI, o service worker intercepta o **long-polling HTTP do Engine.IO v4** (`src/mocks/socket-io-polling.ts`). Isso cobre handshake, `connect` com `auth`, pacotes de evento, heartbeat e encerramento. O upgrade para WebSocket não é anunciado (`upgrades: []`). Assim o transporte funciona igual em desenvolvimento, no build estático e na Vercel, sem servidor.

### Envelope

```ts
interface EventEnvelope<T> {
  eventId: string;     // identidade única do evento
  version: number;     // igual a resource.version
  resource: T;         // recurso completo após a mudança
  occurredAt: string;  // ISO-8601
}
```

| Evento | Recurso | Destinatários | Emitido quando |
| --- | --- | --- | --- |
| `nft.updated` | `Nft` | Todas as conexões | Mudança de preço ou estoque (gatilhos de cenário, liquidação de pedido) |
| `order.updated` | `Order` | Só as conexões autenticadas (`auth: { token }`) do dono | Criação (v1) e liquidação (confirmado/recusado) |

### Consumo (`src/features/realtime/use-marketplace-realtime.ts`)

1. O payload é validado (`eventId`, `version`, `resource.id`, `resource.version === version`).
2. `createEventGuard()` descarta `eventId` repetido e versões menores ou iguais à última aplicada para o recurso.
3. O cache só aceita versões mais novas. Listas e detalhe ativos são **invalidados e reconsultados via REST**. A invalidação cancela consultas antigas em voo, então uma resposta obsoleta não regride a tela.
4. Um NFT que está no carrinho recarrega o carrinho. A API devolve a divergência e a UI avisa (`role="status"`).
5. `order.updated` nunca tira um pedido de estado terminal. Ao chegar a um estado terminal, carrinho e recibo são invalidados.

O estado da conexão fica exposto em `<html data-realtime="connecting|connected|disconnected">`, para diagnóstico e testes.

---

## 4. Sessão

- **Credencial:** cookie `HttpOnly`, `SameSite=Lax`, 24 h, com token aleatório registrado no store. No navegador, o handler lê o cookie pelo cookie store do MSW, porque o cabeçalho `Cookie` não chega ao service worker. O token também autentica o handshake do socket.
- **Senhas:** hash PBKDF2-SHA-256 com salt individual. Nunca são guardadas em claro.
- **Recuperação após refresh:** `GET /session` na query `['session']`.
- **Rotas privadas** (`/perfil/*`, `/pagamento`, `/pedidos/*`): `beforeLoad` com `ensureQueryData(session)`. Sem sessão, redirecionam para `/login?redirect=<destino>`. `safeRedirect` aceita só caminhos internos e rejeita `//host`, URLs absolutas, `\` e laços para `/login` e `/cadastro`.
- **Expiração:** um `401` fora dos endpoints de sessão encerra a sessão local e navega para `/login?redirect=<atual>&reason=expired`. Depois do login, o usuário volta ao destino. No checkout, a chave de idempotência sobrevive no `sessionStorage`.
- **Logout e troca de usuário:** `endLocalSession()` e `applyAuthenticatedSession()` encerram as subscriptions registradas (`session-subscriptions.ts`), incluindo o socket autenticado. Em seguida cancelam e removem a partição `['private', userId, …]` e invalidam o carrinho. Respostas tardias usam o `userId` capturado na origem e não recriam o cache do usuário anterior.

---

## 5. Carrinho, cotação e pedidos

### Carrinho

- O carrinho é do servidor simulado. O visitante é identificado pelo próprio navegador e tem cache `['cart', 'guest']`. O usuário tem cache `['private', userId, 'cart']`.
- O carrinho persiste após refresh (store no `localStorage`). O cupom aplicado fica em `Cart.couponCode`.
- **Login e cadastro incorporam o carrinho do visitante** na mesma mutação que cria a sessão: a mesma edição soma quantidades, itens novos são acrescentados, o cupom é mantido se o usuário não tiver um e o carrinho do visitante é esvaziado. Excesso de disponibilidade vira divergência para revisão, em vez de descarte silencioso.
- O limite por item é `min(disponíveis − outras edições do mesmo NFT, limite da edição)`.
- `issues` é recalculado a cada leitura: `price-changed`, `quantity-exceeds` e `unavailable`. Com divergências, a cotação e o botão de finalizar ficam bloqueados até o usuário aceitar (`POST /cart/reconcile`).

### Cotação

- Chave `[...carrinho, 'quote', cartVersion]`. A UI só exibe a cotação da versão atual do carrinho; qualquer alteração volta o resumo ao skeleton. A cotação é renovada antes de `expiresAt`.
- Subtotal, desconto, taxa (`0.016 ETH`) e total vêm da API. O cliente calcula apenas o total da linha, com BigInt.

### Pedido (`POST /orders`)

1. Valida o formato, o `Idempotency-Key` e os dados do colecionador.
2. Verifica a posse da carteira (`403`).
3. **Idempotência:** a mesma chave com o mesmo conteúdo devolve o pedido existente (também após timeout ou queda da carteira). Conteúdo diferente → `409 IDEMPOTENCY_CONFLICT`.
4. Exige conexão de carteira válida (`409 WALLET_DISCONNECTED`).
5. Bloqueia um segundo pedido pendente do mesmo carrinho (`409 ORDER_ALREADY_PENDING`).
6. Revalida o carrinho, a versão, o cupom e o total revisado (`409 CART_OUT_OF_DATE` / `QUOTE_CHANGED` com a nova cotação).

O pedido nasce `pendente`. A **liquidação simulada** acontece 1,5 s depois: `confirmado`, ou `recusado` (`PAYMENT_REFUSED`, ou `AVAILABILITY_CONFLICT` se faltar estoque). É uma única mutação persistida (pedido, estoque, recibo e carrinho), seguida de `nft.updated` e `order.updated`. Liquidações vencidas são aplicadas na leitura, então um refresh não deixa o pedido preso. `confirmado` e `recusado` são terminais.

No cliente, `order-attempt.ts` gera uma chave por tentativa e guarda no `sessionStorage` (por usuário) a chave e a impressão digital do conteúdo revisado. Com o mesmo conteúdo, a chave se mantém em cliques repetidos, retentativas e refresh. O envio tem trava síncrona contra clique duplo. Falhas inconclusivas (rede, 5xx, `504 ORDER_RESPONSE_TIMEOUT`) são reenviadas até 2 vezes com a mesma chave.

O **recibo** é um snapshot do pedido (`OrderItem` com título, token, imagem, edição e total da linha) e não consulta o catálogo. A confirmação remove do carrinho **apenas** os itens e as quantidades comprados. A recusa não altera o carrinho.

---

## 6. Estratégia de cache (TanStack Query)

| Parâmetro | Valor |
| --- | --- |
| `staleTime` | 30 s |
| `gcTime` | 5 min |
| Retry de query | 1, somente para falha de rede ou status ≥ 500 |
| Retry de mutation | nenhum. A idempotência do pedido é tratada explicitamente |
| `refetchOnWindowFocus` | desligado. A atualização vem de eventos e invalidações |

- **Chaves públicas:** `['nfts', 'list', params]`, `['nfts', 'detail', id]` e `['nfts', 'facets']`. **Privadas:** `['private', userId, domínio, …]`, removidas em bloco no logout e na troca de usuário.
- **Filtros, ordenação e paginação** vêm dos search params tipados do TanStack Router. A URL é a fonte de verdade; mudar um filtro volta para a página 1. `placeholderData` mantém a lista anterior durante a atualização em segundo plano, e o cancelamento descarta respostas obsoletas.
- **Mutations** gravam o recurso retornado somente quando ele pertence à sessão atual e não é mais antigo que o cache (comparação por `version`). `404` e `409` recarregam o recurso.
- **Atualização otimista com rollback:** favoritos (`useToggleFavorite`) guardam um snapshot, aplicam a mudança, restauram o snapshot em caso de falha e revalidam no fim.

---

## 7. Reconciliação REST ↔ Socket.IO

- Eventos **sinalizam** mudanças; o estado que a tela mostra é sempre reconciliado por REST (invalidação e refetch). O cache só aceita a versão do evento quando ela é mais nova.
- **Reconexão:** o `socket.io-client` reconecta automaticamente. A cada `connect`, o controle de duplicatas é reiniciado e catálogo, detalhes, carrinho e pedidos que estavam carregados são reconsultados via REST, recuperando eventos perdidos durante a queda.
- **Sessão anterior:** a conexão é recriada a cada mudança de sessão e registrada em `session-subscriptions`. Listeners de uma conexão antiga são ignorados, e a chave do pedido fica na partição do usuário daquela conexão. Por isso eventos de outra sessão não alteram o pedido atual.
- **Ciclo de vida:** ao desmontar o shell, os listeners são removidos e o socket é desconectado.

---

## 8. Persistência do mock

- O snapshot fica no `localStorage`, é versionado (versão atual: **10**), é validado a cada mutação e é **migrado** a partir das versões 1–9.
- `POST /api/mock/reset` restaura o fixture conhecido, revoga sessões, derruba sockets e limpa falhas armadas. Selecionar um cenário também reinicializa os dados e encerra a sessão.
- Os dados ficam no navegador de quem acessa: cada visitante da URL pública tem um estado independente.

---

## 9. Limitações

- **Socket.IO só por polling.** Não há WebSocket. O servidor simulado implementa apenas o subconjunto do protocolo que a aplicação usa; não substitui um servidor Socket.IO completo.
- **Timers do mock vivem na página.** Com a aba fechada, a liquidação é aplicada na próxima leitura, não em segundo plano.
- **Sem service worker, sem dados.** A navegação privada de alguns navegadores e políticas que bloqueiam service workers impedem os mocks. Nesse caso a aplicação mostra estados de erro.
- **Estado por navegador.** Não há compartilhamento entre dispositivos; limpar os dados do site volta ao fixture.
- **Cenários por console ou API.** Não há painel visual de cenários no produto, para não misturar controles de teste com a interface do Figma. O README traz os comandos.
- **Bundle.** O chunk principal tem cerca de 520 kB (cerca de 170 kB gzip). As medianas do Lighthouse atendem às metas mesmo assim.
- **CLS no detalhe desktop (0.17):** o rodapé se desloca quando a rota termina de carregar. A Performance (92) continua acima da meta.

---

## 10. Decisões de UX

- Skeletons shimmer em catálogo, detalhe e resumo do carrinho, com as mesmas dimensões do conteúdo. Com `prefers-reduced-motion`, ficam sem animação.
- Divergências de preço ou estoque nunca são aplicadas em silêncio: há um aviso, a cotação fica bloqueada e o usuário confirma com "Aceitar alterações e recalcular".
- A revisão do pedido (diálogo) reconsulta o carrinho e a cotação. Se os valores mudarem, exige "Confirmar novos valores".
- Recusa de pagamento informa o motivo, garante que nada foi cobrado e mantém os itens no carrinho.
- Formulários: validação no cliente igual à da API, `aria-invalid` e `aria-describedby`, foco no primeiro campo inválido, erros da API no campo correspondente.
- Diálogos e drawers com foco preso, fechamento por Escape e retorno do foco.
- Ações fora do escopo (login social, "Esqueceu a senha?", Atividade, Ofertas, Arquivos baixados, Suporte) aparecem como no Figma, com `aria-disabled` e aviso. Nunca simulam sucesso.
- "Ver no Etherscan" abre um explorador **simulado** interno, identificado como demonstração.

---

## 11. Desvios do Figma

| Tela / item | Desvio | Motivo |
| --- | --- | --- |
| Tipografia | Fonte monoespaçada do sistema | Arquivos de fonte do Figma indisponíveis |
| Perfil, carteiras e confirmação (mobile) | Coluna única. O menu do perfil vira uma faixa horizontal rolável | Não há frame mobile. Adaptado do sistema visual |
| Carrinho | Prevalece o frame desktop onde desktop e mobile se contradizem (Violet Nomad 1/1 × 6 unidades). O mobile mostra a soma real (8.14, não 8.92) | Decisão do usuário. Valores consistentes |
| Carrinho mobile | A lixeira aparece ao passar o ponteiro, tocar ou focar | Equivale ao ícone sobreposto do frame, mas acessível por teclado |
| Tablet (768 px) | Cartões do mobile com o resumo abaixo, sem painel fixo | Não há frame de tablet |
| Pagamento | Campos pré-preenchidos com a carteira e o perfil. IDs de token `#0009` e `#0552` | Dados reais do usuário. Fixture definido no carrinho |
| Pagamento (mobile) | Dados do colecionador num painel recolhível, aberto em caso de erro | O frame mobile não tem esses campos |
| Login e cadastro | A home real aparece atrás do diálogo. O cabeçalho mostra "Perfil" com sessão | O fundo do frame é ilustrativo |
| Recibo | Linha "Desconto" quando há cupom. Tela inteira no mobile | O frame não tem cupom nem versão mobile |
| Estados sem frame | Skeleton, erro, vazio, revisão, pedido pendente ou recusado, explorador, avisos | Seguem `StatusMessage`, `Dialog` e os tokens da etapa 3 |

A comparação por tela (medidas e capturas nos mesmos viewports) está nas seções "Fidelidade visual" de [`referencia/docs/`](referencia/docs/).
