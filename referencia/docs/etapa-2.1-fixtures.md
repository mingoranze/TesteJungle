# Etapa 2.1 — Fixtures e estado consistente

Implementação limitada ao item 2.1 do [PRD](../PRD.md). Os handlers de domínio, os cenários de rede e a interface para selecionar cenários pertencem às etapas 2.2 e 2.3 e não foram incluídos.

## Dados disponíveis

- 12 NFTs em três coleções, com preços ETH decimais em string, versões e disponibilidade.
- Dois perfis fictícios sem credenciais ou senhas armazenadas, três carteiras, favoritos separados por usuário e carrinhos por usuário mais um carrinho de visitante.
- Pedidos em estado pendente e confirmado; somente o pedido confirmado possui recibo com snapshot de itens, cotação e carteira.
- Cenários selecionáveis `default` e `empty-catalog`. Cada seleção carrega um fixture completo; o catálogo vazio mantém perfis/carteiras e remove referências a NFTs dos favoritos, carrinhos, pedidos e recibos.

## Estado, persistência e reset

`src/mocks/marketplace-store.ts` expõe leitura isolada, atualização transacional, seleção de cenário e reset. No navegador, o snapshot é salvo em `localStorage` sob uma chave versionada e é recuperado após refresh. Em ambientes sem `window`, o store mantém o estado em memória; testes podem injetar um armazenamento controlado.

Antes de persistir, o store valida identificadores únicos e referências entre usuários, NFTs, favoritos, carrinhos, carteiras, pedidos e recibos. Se uma mutação for inválida, a atualização é rejeitada e o snapshot anterior permanece intacto. JSON persistido inválido ou erro de armazenamento é informado explicitamente; `resetMarketplaceState()` restaura o cenário atual (ou o cenário padrão se ainda não houve seleção), e também aceita um cenário explícito.

Não há endpoints para acessar/alterar o domínio nesta etapa. O estado fica pronto para ser consumido pelos handlers da etapa 2.2, sem expandir a prova REST/Socket.IO da etapa 1.

## Verificação

`npx playwright test tests/marketplace-fixtures.spec.ts` valida variedade e vínculos dos fixtures, persistência entre instâncias, isolamento de snapshots, seleção/reset de cenários e rejeição de referências inválidas.
