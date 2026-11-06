# Etapa 1 — Fundação técnica e prova dos riscos

Implementação correspondente às seções 1.1–1.3 do [PRD](../PRD.md). Não inclui telas nem dados do catálogo.

## Base criada

- React + TypeScript + Vite; Tailwind CSS v4 e configuração shadcn/ui (`components.json`, `cn` e `components/ui`).
- TanStack Router com rota inicial, rota de prova, validação tipada de search params, 404 e fallback SPA.
- TanStack Query com política inicial de cache/retry, cancelamento por `AbortSignal` e utilitário de limpeza de queries privadas.
- Axios com cliente comum e normalização tipada de erros HTTP/rede.
- Contratos transversais para sessão, NFT, favorito, carrinho, cotação, pedido/recibo, perfil, carteira e envelope de eventos. ETH é representado por string decimal; quantidades são inteiros positivos; pedidos têm chave de idempotência e estados terminais.
- ESLint e Playwright, além de scripts de desenvolvimento, build, build de demonstração, preview e verificação de tipos.

## Prova REST e Socket.IO

O mock é ativado por `VITE_ENABLE_MOCKS=true`: por padrão no modo de desenvolvimento e no `build:demo`; pode ser desabilitado em outros builds. MSW usa um único estado em memória para os endpoints REST e a publicação do evento. `Resetar cenário` restaura o estado determinístico.

MSW não implementa servidor Socket.IO. Para manter `socket.io-client` real e não contornar o transporte com chamadas diretas da UI, a prova intercepta pelo service worker o transporte HTTP long-polling Engine.IO v4 usado pelo Socket.IO. Upgrade para WebSocket não é anunciado (`upgrades: []`). O endpoint REST de demonstração altera o estado e publica um pacote Socket.IO; o listener invalida a query e a UI recebe o novo estado via Axios/MSW.

Comandos reproduzíveis:

1. `npm install`
2. `npx msw init public --save` (necessário uma vez para criar `public/mockServiceWorker.js`)
3. `npm run dev` e abrir `/foundation`
4. `npm run build:demo` seguido de `npm run preview`
5. `npm run typecheck`, `npm run lint`, `npm run test:e2e` e `npm run test:e2e:demo`

O teste E2E cobre acesso direto, refresh, leitura REST, conexão Socket.IO, evento e reset.

## Decisões e limites

- **Transporte escolhido para a prova:** Socket.IO sobre Engine.IO polling interceptado por MSW. A compatibilidade está provada no navegador de desenvolvimento e no build estático local de demonstração; não equivale a teste de uma URL pública nem de WebSocket.
- **Deploy previsto:** Vercel como hospedagem estática, com rewrite para `index.html` em `vercel.json`. A publicação e o teste de rota na URL pública ficam para a etapa 9.
- **Cache:** `staleTime` de 30 s, `gcTime` de 5 min, uma nova tentativa somente para falha de rede/servidor, sem retry de mutation; consultas recebem o `AbortSignal` do TanStack Query. Eventos invalidam queries e a reconciliação acontece via REST, não por mutação direta de cache.
- **Isolamento:** futuras chaves privadas usam o prefixo `['private', userId, ...]`; `clearPrivateQueryCache()` cancela e remove essa partição no logout/troca de usuário. Não há persistência de cache nem dados privados nesta etapa.
- **Limite da prova:** O polling simulado implementa somente handshake, conexão, pacotes de evento, heartbeat e encerramento necessários ao cenário; não substitui um servidor Socket.IO completo. A solução evita WebSocket para manter o mock no service worker em desenvolvimento e em hosting estático.

## Aceite

- [x] Aplicação inicia e gera build.
- [x] Acesso direto e refresh em rota de teste, com fallback para rota inexistente.
- [x] Prova REST Axios/MSW e reset determinístico.
- [x] Evento via `socket.io-client` sem transporte alternativo na UI.
- [x] Contratos e políticas iniciais documentados e usados nos clientes de transporte.
- [x] Testes automatizados para os critérios da etapa.
