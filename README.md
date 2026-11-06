# Kurio — NFT Marketplace

Marketplace de NFTs em **React + TypeScript** com descoberta, conta, carrinho, checkout e recibo, rodando inteiramente sobre **APIs simuladas** (MSW) e **eventos em tempo real** via `socket.io-client`. Nenhum backend, blockchain, extensão de carteira ou gateway de pagamento real é necessário.

**Demo publicada:** _URL_PENDENTE_

- Contratos REST e de eventos, sessão, carrinho, cache, reconciliação, limitações e desvios do Figma: [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## Sumário

- [Stack](#stack)
- [Como executar](#como-executar)
- [Scripts](#scripts)
- [Usuários de demonstração](#usuários-de-demonstração)
- [Tutorial: criando uma carteira no perfil](#tutorial-criando-uma-carteira-no-perfil)
- [Rotas](#rotas)
- [Arquitetura](#arquitetura)
- [Camada simulada (MSW + Socket.IO)](#camada-simulada-msw--socketio)
- [Cenários de rede](#cenários-de-rede)
- [Reproduzindo os fluxos de falha](#reproduzindo-os-fluxos-de-falha)
- [Testes e qualidade](#testes-e-qualidade)
- [Deploy](#deploy)
- [Decisões e desvios do Figma](#decisões-e-desvios-do-figma)
- [Documentação por etapa](#documentação-por-etapa)

---

## Stack

| Área | Tecnologia |
| --- | --- |
| UI | React 19, TypeScript, Vite |
| Estilo | Tailwind CSS v4, shadcn/ui (adaptado à identidade do Figma) |
| Roteamento | TanStack Router (search params tipados, rotas privadas, 404) |
| Dados | TanStack Query + Axios (cancelamento por `AbortSignal`, erros normalizados) |
| Tempo real | `socket.io-client` sobre Engine.IO long-polling |
| Mocks | MSW (REST + transporte Socket.IO interceptado no service worker) |
| Testes | Playwright (E2E, regressão visual, Axe) |
| Performance | Lighthouse |

---

## Como executar

Pré-requisito: Node.js 20+.

```sh
npm ci
npm run dev
```

Abra o endereço exibido pelo Vite (por padrão `http://localhost:5173`). Não é preciso criar `.env`: os arquivos versionados já configuram cada modo.

| Variável | Padrão | Uso |
| --- | --- | --- |
| `VITE_ENABLE_MOCKS` | `true` em `.env.development` e `.env.demo`; ausente no `build` padrão | Registra o service worker do MSW (REST + Socket.IO simulado) antes de renderizar |
| `VITE_API_BASE_URL` | `/api` | Base do cliente Axios |
| `VITE_SOCKET_URL` | mesma origem | Origem do servidor Socket.IO |

Para sobrescrever localmente, copie [`.env.example`](.env.example) para `.env.local`, que é ignorado pelo git.

> O service worker `public/mockServiceWorker.js` já está versionado. Se for apagado, recrie com `npx msw init public --save`.

Build de demonstração (produção com mocks ligados):

```sh
npm run build:demo
npm run preview
```

---

## Scripts

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento com MSW |
| `npm run build` | Build de produção |
| `npm run build:demo` | Build de produção com mocks habilitados |
| `npm run preview` | Serve o último build localmente |
| `npm run typecheck` | Verificação de tipos (`tsc -b`) |
| `npm run lint` | ESLint |
| `npm run test:e2e` | Playwright — Chromium desktop e mobile |
| `npm run test:e2e:mobile` | Apenas o projeto `chromium-mobile` |
| `npm run test:e2e:demo` | Gera o build de demonstração e roda a suíte contra ele |
| `npm run test:e2e:ui` | Playwright em modo interativo |
| `npm run audit:lighthouse` | Build de demonstração + 3 medições Lighthouse por tela/perfil |

---

## Usuários de demonstração

| Usuário | E-mail | Senha |
| --- | --- | --- |
| Ana | `ana@kurio.test` | `kurio-demo` |
| Caio | `caio@kurio.test` | `kurio-demo` |

Também é possível criar uma conta nova em `/cadastro`. Os dados ficam no `localStorage` (snapshot versionado do mock) e sobrevivem a refresh. Senhas nunca são guardadas em claro (hash PBKDF2-SHA-256 com salt).

Cupom válido: **`WELCOME10`** (10% de desconto). Taxa de rede fixa: `0.016 ETH`.

---

## Tutorial: criando uma carteira no perfil

Carteiras cadastradas no perfil são as que aparecem no **pagamento** e que recebem os NFTs comprados. Cada usuário pode ter **uma carteira principal** e **uma secundária**; a secundária só pode ser criada depois da principal.

> Os usuários de demonstração já têm carteiras. Para seguir o tutorial do zero, crie uma conta nova.

### 1. Entre na sua conta

1. Acesse `/cadastro` e crie uma conta (nome, e-mail, usuário de 3–30 caracteres `[a-z0-9_.-]` e senha de 8–128 caracteres) — ou entre em `/login`.
2. Após entrar, clique em **Perfil** no cabeçalho.

### 2. Abra a aba Carteiras

No menu lateral **Meu perfil**, clique em **Carteiras** (ou acesse `/perfil/carteiras`). No mobile, o menu vira uma faixa horizontal rolável no topo.

Se ainda não houver carteira principal, o formulário vem pré-preenchido com nome, usuário, e-mail, ENS e apelido do seu perfil. O link **Adicionar**, ao lado de "Carteira principal", leva o foco ao primeiro campo.

### 3. Preencha a carteira principal

Todos os campos são obrigatórios, exceto o ENS/carteira secundária.

| Campo | Regra | Exemplo |
| --- | --- | --- |
| Nome de exibição | Não pode ficar vazio | `Minha carteira` |
| Apelido da carteira | Até 40 caracteres | `principal` |
| Rede | `Ethereum` ou `Polygon` | `Ethereum` |
| Nome do perfil | Não pode ficar vazio | `colecionador` |
| Endereço da carteira | `0x` + 40 caracteres hexadecimais | `0x1234567890abcdef1234567890abcdef12345678` |
| ENS ou carteira secundária *(opcional)* | Endereço `0x` ou nome terminado em `.eth` | `meunome.eth` |
| Tipo de carteira | `MetaMask`, `WalletConnect` ou `Coinbase` | `MetaMask` |
| Código de indicação | 4 a 20 letras, números ou hífen | `KURIO-2026` |
| E-mail | E-mail válido | `voce@exemplo.com` |
| Nome ENS | 3 a 63 letras minúsculas, números ou hífen (o sufixo `.eth` é fixo) | `meunome` |

> Os endereços são fictícios: nenhuma blockchain é consultada. Use qualquer valor que respeite o formato.

### 4. Salve

Clique em **Salvar carteira**. Em caso de erro, a mensagem aparece abaixo do campo e o foco vai para o primeiro campo inválido. Erros possíveis da API:

- `409 WALLET_ADDRESS_DUPLICATE` — você já cadastrou esse endereço;
- `409 WALLET_ROLE_TAKEN` — já existe uma carteira principal (ou secundária);
- `409 PRIMARY_WALLET_REQUIRED` — tentativa de criar a secundária sem ter a principal;
- `400 VALIDATION_ERROR` — algum campo fora do formato.

Depois de salva, a carteira persiste após refresh e passa a ser a carteira pré-selecionada em `/pagamento`.

### 5. (Opcional) Adicione a carteira secundária

1. Na seção **Carteira secundária**, clique em **Adicionar**.
2. Marque **Igual à carteira principal** para copiar rede, tipo, nome, perfil, e-mail, ENS e código de indicação. **Endereço e apelido continuam próprios** — informe um endereço diferente do principal.
3. Clique em **Salvar carteira**.

No pagamento, o link **"Usar outra carteira?"** troca o formulário para a carteira secundária.

### Editar ou remover

- Para editar, altere os campos e clique em **Salvar carteira** de novo.
- Para remover, clique em **Remover** e confirme na própria linha (ou **Cancelar**). Se você remover a principal e houver uma secundária, a secundária é promovida a principal.

### Usando a carteira na compra

Em `/pagamento`, a rede escolhida precisa ser **a mesma cadastrada para a carteira** (senão `422 NETWORK_MISMATCH`). Clique em **Confirmar compra** para abrir a revisão; nela, **Conectar {provedor}** simula a conexão e **Pagar** envia o pedido.

---

## Rotas

| Rota | Acesso | Conteúdo |
| --- | --- | --- |
| `/` | pública | Início: destaques, busca, filtros, ordenação e paginação sincronizados com a URL |
| `/nfts/$nftId` | pública | Detalhe do NFT: galeria, edição, quantidade, favorito, compra |
| `/login`, `/cadastro` | pública | Autenticação (`?redirect=` preserva o destino; `reason=expired` na expiração) |
| `/carrinho` | pública | Itens, cupom, cotação e recomendações (visitante ou usuário) |
| `/perfil` | privada | Dados do perfil, avatar e alteração de senha |
| `/perfil/carteiras` | privada | Carteiras principal e secundária |
| `/perfil/favoritos` | privada | Lista de interesse |
| `/pagamento` | privada | Formulário, carteira/rede, revisão e envio do pedido |
| `/pedidos/$orderId` | privada | Pedido pendente, recusado ou recibo confirmado |
| `/pedidos/$orderId/transacao` | privada | Explorador de blocos **simulado** |
| `/foundation` | pública | Prova técnica REST + Socket.IO da etapa 1 |

Toda rota funciona por acesso direto e refresh. Sem sessão, rotas privadas redirecionam para `/login?redirect=<destino>` (somente caminhos internos são aceitos). Rotas inexistentes exibem uma página 404.

---

## Arquitetura

```
src/
├── components/     # UI reutilizável (shadcn/ui adaptado, botões, campos, skeleton, mensagens)
├── domain/         # Contratos tipados: sessão, NFT, carrinho, cotação, pedido, perfil, carteira, eventos
├── features/       # Telas e hooks por domínio
│   ├── discovery/  #   início, catálogo, detalhe
│   ├── session/    #   login, cadastro, sessão, redirect seguro, subscriptions
│   ├── account/    #   perfil, carteiras, favoritos
│   ├── favorites/  #   hooks de favoritos (otimista + rollback)
│   ├── cart/       #   carrinho e cotação
│   ├── checkout/   #   pagamento, revisão, pedido, recibo, idempotência
│   └── realtime/   #   socket, guarda de eventos, avisos
├── lib/            # Axios, Query client, aritmética decimal (BigInt), utilitários
├── mocks/          # MSW: fixtures, store persistido, handlers, cenários, Socket.IO polling
├── router.tsx
└── main.tsx
```

Princípios adotados:

- **Contratos antes dos consumidores.** Componentes não contêm respostas fictícias; todo dado vem do Axios → MSW.
- **ETH como string decimal** no transporte e nos cálculos (`src/lib/decimal.ts`, BigInt); quantidades são inteiras.
- **Isolamento por usuário.** Chaves privadas usam `['private', userId, ...]`; logout e troca de usuário cancelam e removem essa partição e encerram subscriptions/sockets da sessão anterior.
- **Cache.** `staleTime` 30 s, `gcTime` 5 min, 1 retry só para falha de rede/servidor, sem retry de mutation. Eventos invalidam queries; a reconciliação é sempre via REST.
- **Cotação atrelada à versão do carrinho.** A UI só exibe a cotação cuja `cartVersion` é a atual; qualquer alteração volta o resumo ao skeleton.
- **Pedido idempotente.** `Idempotency-Key` por tentativa (guardada no `sessionStorage` com a impressão digital do conteúdo); cliques repetidos e reenvios após timeout recuperam o mesmo pedido.
- **Confirmação só da API.** O recibo aparece apenas com o pedido `confirmado`; `confirmado` e `recusado` são terminais.

Contratos, política de sessão, carrinho, cache, reconciliação REST/Socket.IO e limitações estão detalhados em [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## Camada simulada (MSW + Socket.IO)

MSW não implementa servidor Socket.IO. Para usar o `socket.io-client` real sem atalhos na UI, o service worker intercepta o transporte **HTTP long-polling do Engine.IO v4** (`upgrades: []`, sem WebSocket). Isso funciona igual em desenvolvimento, no build estático e no deploy.

- O estado do mock (`src/mocks/marketplace-store.ts`) é um snapshot versionado no `localStorage`, validado a cada mutação e migrado entre versões.
- Eventos `nft.updated` e `order.updated` têm `eventId`, `version`, `resource` e `occurredAt`. O cliente descarta duplicatas e versões antigas; após reconexão, reconsulta via REST os recursos ativos.
- `order.updated` é entregue só às conexões autenticadas do dono do pedido.
- Pedidos são liquidados automaticamente **1,5 s** após a criação (confirmados, ou recusados no cenário `payment-refused`/sem estoque). Liquidações vencidas são aplicadas na leitura, então um refresh não deixa o pedido preso em `pendente`.

Endpoints principais: `/api/session*`, `/api/nfts`, `/api/favorites`, `/api/cart*`, `/api/quotes`, `/api/profile*`, `/api/wallets`, `/api/wallet-connections`, `/api/orders*`. Erros seguem `{ "error": { "code", "message", "details?" } }`. A tabela completa de endpoints e códigos está em [`ARCHITECTURE.md`](ARCHITECTURE.md#2-contratos-rest).

---

## Cenários de rede

Selecione com `POST /api/mock/scenario` `{ "scenario": "<id>" }` e dispare alterações com `POST /api/mock/scenario/trigger`. `GET /api/mock/scenarios` lista os cenários e mostra o ativo. `POST /api/mock/reset` `{}` restaura o fixture padrão e o cenário `success`.

Selecionar um cenário reinicializa os dados e **encerra a sessão**: recarregue a página e entre de novo. O cenário ativo fica salvo e sobrevive a refresh, até um novo `reset`.

| Cenário | Comportamento |
| --- | --- |
| `success` / `empty-catalog` | Normal / catálogo vazio |
| `variable-latency`, `out-of-order`, `timeout`, `unavailable` | Latência, respostas fora de ordem, timeout (504), 503 |
| `http-4xx` / `http-5xx` | Erros 422 / 500 controlados |
| `session-expired` | Próxima requisição retorna `401 SESSION_EXPIRED` |
| `registration-conflict` | Cadastro em conflito |
| `coupon-invalid` / `coupon-expired` | Cupom rejeitado |
| `price-change` / `edition-sold-out` | Gatilho altera preço/estoque e emite `nft.updated` |
| `order-timeout-after-create` | Pedido criado, resposta em `504`; mesma chave recupera o pedido |
| `order-confirm` / `order-refuse` | Gatilho manual leva o pedido ao estado terminal |
| `payment-refused`, `wallet-connection-refused`, `wallet-disconnect` | Recusa de pagamento, de conexão e queda no envio |

Controles extras para testes:

| Endpoint | Corpo | Efeito |
| --- | --- | --- |
| `POST /api/mock/fail-next` | `{ method, pathPrefix, count?, delayMs? }` | As próximas `count` (1–10) requisições correspondentes respondem `503`, opcionalmente com atraso (até 5000 ms). Não troca o cenário nem derruba a sessão |
| `POST /api/mock/socket/disconnect` | — | Derruba as conexões Socket.IO. O cliente reconecta e reconcilia via REST |
| `POST /api/mock/socket/replay` | `{ eventId }` | Reenvia um evento já publicado (duplicata ou evento antigo) |
| Cabeçalho `x-mock-failure: transient` | — | Falha `503` em uma única requisição |

---

## Reproduzindo os fluxos de falha

Os cenários são controlados pela própria API simulada, e não há painel na interface. Funciona igual em `npm run dev`, em `npm run preview` e na URL publicada. Abra o DevTools (F12) → **Console** numa página da aplicação e defina o atalho abaixo. As requisições passam pelo service worker do MSW, como as da aplicação.

```js
const mock = (path, body = {}) =>
  fetch(`/api/mock/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => (r.status === 204 ? null : r.json()));
```

Para voltar ao estado conhecido a qualquer momento: `await mock('reset')` e recarregar.

Nos passos abaixo, "entrar como Ana" é `ana@kurio.test` / `kurio-demo`. O carrinho da Ana já vem com Emerald Ape (`nft-001`), Violet Nomad (`nft-005`) e Ivory Baron (`nft-006`), e ela já tem carteira cadastrada.

| Fluxo | Passos | Resultado esperado |
| --- | --- | --- |
| Pagamento recusado | `await mock('scenario', { scenario: 'payment-refused' })` → recarregar → entrar como Ana → `/carrinho` → **Conectar e finalizar** → **Confirmar compra** → no diálogo de revisão, **Conectar {carteira}** → **Pagar** | O pedido fica `pendente` e é recusado em ~1,5 s. A tela informa que nada foi cobrado; os itens continuam no carrinho |
| Timeout após criar o pedido | `scenario: 'order-timeout-after-create'` → mesma compra | A resposta é `504`. A aplicação reenvia com a mesma `Idempotency-Key` e mostra **o mesmo** pedido, sem duplicar |
| Clique repetido | Cenário `success` → na revisão, clicar várias vezes em **Pagar** | Um único pedido criado |
| Mudança de preço no checkout | `scenario: 'price-change'` → recarregar → entrar como Ana → abrir `/pagamento` → `await mock('scenario/trigger', { nftId: 'nft-005' })` | `nft.updated` chega pelo Socket.IO; aviso de preço antigo/novo; a cotação é bloqueada até **Aceitar alterações e recalcular** e confirmar os novos valores |
| Edição esgotada | `scenario: 'edition-sold-out'` → igual ao anterior, no `/carrinho` ou `/pagamento` | Item marcado como esgotado; finalizar fica bloqueado até aceitar a remoção |
| Pedido pendente + refresh/reconexão | `scenario: 'order-confirm'` → entrar como Ana → abrir `/pedidos/order-0002` → recarregar → `await mock('socket/disconnect')` → `await mock('scenario/trigger')` | O pedido continua `pendente` após o refresh. Depois do gatilho, vira `confirmado` com recibo (por evento ou pela reconciliação REST após reconectar) |
| Pedido recusado manualmente | `scenario: 'order-refuse'` → igual ao anterior | O pedido vira `recusado` (estado terminal) |
| Evento duplicado/antigo | Depois de um `price-change`, copiar o `eventId` da resposta do gatilho → `await mock('socket/replay', { eventId })` | Nada muda: o cliente descarta `eventId` repetido e versão antiga |
| Carteira recusa a conexão | `scenario: 'wallet-connection-refused'` → entrar → `/pagamento` → **Confirmar compra** → **Conectar {carteira}** | Mensagem de recusa; a carteira continua desconectada |
| Carteira desconecta no envio | `scenario: 'wallet-disconnect'` → entrar → `/pagamento` → **Confirmar compra** → conectar → **Pagar** | `409 WALLET_DISCONNECTED`; a UI pede nova conexão. Reenviar recupera o mesmo pedido pela chave |
| Sessão expirada | `scenario: 'session-expired'` → recarregar → entrar → navegar para `/perfil` | A próxima requisição responde `401 SESSION_EXPIRED` → redireciona para `/login?redirect=/perfil&reason=expired`; ao entrar, volta ao perfil |
| Conflito de cadastro | `scenario: 'registration-conflict'` → `/cadastro` com dados novos | Erro de e-mail já cadastrado no campo |
| Cupom inválido/expirado | `scenario: 'coupon-invalid'` (ou `'coupon-expired'`) → `/carrinho` → aplicar `WELCOME10` | Erro no campo do cupom; a cotação não muda |
| Catálogo indisponível | `scenario: 'unavailable'` (ou `'http-5xx'`, `'timeout'`) → recarregar `/` | Mensagem de falha com **Tentar novamente**. `await mock('reset')` e tentar de novo recupera |
| Carregamento lento | `scenario: 'variable-latency'` → navegar entre início, detalhe e carrinho | Skeletons shimmer com as dimensões do conteúdo |
| Catálogo vazio | `scenario: 'empty-catalog'` → recarregar `/` | Estado vazio |
| Falha de favorito (rollback) | Entrar como Ana → `await mock('fail-next', { method: 'PUT', pathPrefix: '/api/favorites' })` → favoritar um NFT no detalhe | O coração muda na hora (otimista) e volta ao estado anterior quando a API falha |
| Queda do Socket.IO | `await mock('socket/disconnect')` | `<html data-realtime>` passa a `disconnected`, depois `connected`; os dados ativos são reconsultados via REST |

As mesmas situações são automatizadas nas specs Playwright (veja [Testes e qualidade](#testes-e-qualidade)).

---

## Testes e qualidade

```sh
npm ci
npx playwright install chromium
npm run test:e2e
```

- **84 testes** em Chromium desktop (1440 × 900) e mobile (390 × 844), também executados contra o build de demonstração (`npm run test:e2e:demo`).
- Relatório HTML em `playwright-report/`; traces em `test-results/` quando há falha.
- **Regressão visual** (`tests/visual-regression.spec.ts`): início, detalhe, carrinho e pagamento em desktop e mobile. Atualize com `npx playwright test tests/visual-regression.spec.ts --update-snapshots`.
- **Acessibilidade** (`tests/quality.spec.ts`): Axe WCAG 2/2.1 A/AA e ausência de overflow horizontal em 390, 768 e 1440 px; teclado e foco nas specs de cada fluxo.

### Lighthouse

`npm run audit:lighthouse` gera o build de demonstração, sobe um preview isolado e faz 3 medições por tela/perfil. Relatórios em `reports/lighthouse/` e medianas em [`reports/lighthouse/summary.json`](reports/lighthouse/summary.json). O comando falha se alguma mediana ficar abaixo de Performance 90 / Accessibility 95 / Best Practices 95 / SEO 90.

| Tela | Perfil | Perf. | A11y | BP | SEO | LCP | CLS | TBT |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Início | Mobile | 91 | 98 | 100 | 100 | 3.254 ms | 0.000 | 24 ms |
| Detalhe | Mobile | 90 | 100 | 100 | 100 | 3.246 ms | 0.000 | 11 ms |
| Início | Desktop | 100 | 100 | 100 | 100 | 725 ms | 0.000 | 0 ms |
| Detalhe | Desktop | 92 | 97 | 100 | 100 | 718 ms | 0.170 | 0 ms |

---

## Deploy

Hospedagem estática na **Vercel**, ligada ao repositório GitHub: cada push na `main` gera um novo deploy, então a URL pública acompanha o código entregue.

O [`vercel.json`](vercel.json) define toda a configuração, e o painel não precisa de ajuste manual:

- `installCommand: npm ci` e `buildCommand: npm run build:demo` → build de produção **com** MSW e o Socket.IO simulado. O `npm run build` padrão não define `VITE_ENABLE_MOCKS` e sai sem mocks.
- `outputDirectory: dist`.
- Rewrite de qualquer rota para `index.html`, para que acesso direto e refresh funcionem em todas as rotas, inclusive as privadas e `/login?redirect=…`. Arquivos estáticos (assets e `mockServiceWorker.js`) são servidos antes do rewrite.
- `mockServiceWorker.js` com `Cache-Control: no-cache`, para que um novo deploy nunca rode com um worker antigo.

Nenhuma variável de ambiente é necessária na Vercel: `.env.demo` já está versionado.

Para publicar um fork: em [vercel.com/new](https://vercel.com/new), importe o repositório e mantenha as configurações detectadas.

---

## Decisões e desvios do Figma

- Fonte monoespaçada do sistema: os arquivos de fonte do Figma não estavam disponíveis.
- Telas sem frame mobile (perfil, carteiras, confirmação) foram adaptadas em coluna única seguindo o sistema visual.
- Onde os frames de carrinho desktop e mobile se contradizem, prevalece o desktop.
- Estados sem frame (skeleton, erro, vazio, diálogo de revisão, pedido pendente/recusado, explorador) seguem os tokens e componentes da etapa 3.
- Ações fora do escopo (login social, "Esqueceu a senha?", Atividade, Ofertas, Arquivos baixados, Suporte) aparecem como no Figma, mas informam que não estão disponíveis — nunca simulam sucesso.
- "Ver no Etherscan" abre um explorador **simulado** interno, identificado como demonstração.

Lista completa por tela nas seções "Fidelidade visual" dos docs de cada etapa.

---

## Documentação por etapa

| Etapa | Documento |
| --- | --- |
| 0 — Baseline e inventário visual | [etapa-0-baseline.md](referencia/docs/etapa-0-baseline.md) |
| 1 — Fundação técnica e prova dos riscos | [etapa-1-fundacao.md](referencia/docs/etapa-1-fundacao.md) |
| 2.1 — Fixtures e estado | [etapa-2.1-fixtures.md](referencia/docs/etapa-2.1-fixtures.md) |
| 2.2 — Handlers REST | [etapa-2.2-handlers-rest.md](referencia/docs/etapa-2.2-handlers-rest.md) |
| 2.3 — Cenários e eventos | [etapa-2.3-cenarios-eventos.md](referencia/docs/etapa-2.3-cenarios-eventos.md) |
| 3 — Sistema visual | [etapa-3-sistema-visual.md](referencia/docs/etapa-3-sistema-visual.md) |
| 4 — Descoberta | [etapa-4-descoberta.md](referencia/docs/etapa-4-descoberta.md) |
| 5 — Conta, perfil, carteiras e favoritos | [etapa-5-conta.md](referencia/docs/etapa-5-conta.md) |
| 6 — Carrinho e sincronização | [etapa-6-carrinho.md](referencia/docs/etapa-6-carrinho.md) |
| 7 — Checkout, pedidos e recibo | [etapa-7-checkout.md](referencia/docs/etapa-7-checkout.md) |
| 8 — Validação e qualidade | [etapa-8-validacao.md](referencia/docs/etapa-8-validacao.md) |
