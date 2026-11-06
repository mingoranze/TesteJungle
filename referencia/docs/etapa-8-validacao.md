# Etapa 8 — Validação integrada, regressão e qualidade

Implementação dos itens 8.1, 8.2 e 8.3 do [PRD](../PRD.md). A suíte usa os handlers MSW e o cliente Socket.IO da aplicação; nenhum backend privado é necessário.

## 8.1 Playwright E2E

`npm run test:e2e` executa Chromium desktop e mobile e publica o relatório HTML em `playwright-report/`. Traces são mantidos em `test-results/` quando há falha. Para reproduzir em um checkout limpo:

```sh
npm ci
npx playwright install chromium
npm run test:e2e
```

O projeto `chromium` usa 1440 × 900; `chromium-mobile` usa Chromium com viewport de 390 × 844 e toque. O estado é reiniciado para cada cenário e as medições de viewport verificam 390, 768 e 1440 px.

Validação final: `npm run test:e2e` e `npm run test:e2e:demo` passaram com 84 testes cada.

| Grupo do PRD | Cobertura principal |
| --- | --- |
| Busca, filtros, ordenação, paginação e histórico | `discovery.spec.ts` |
| Detalhe por URL direta e NFT inexistente | `discovery.spec.ts` |
| Cadastro, login, expiração, logout e troca de usuário | `account.spec.ts` |
| Favoritos, falha de mutation e recuperação | `account.spec.ts` |
| Carrinho, quantidades, remoção, cupom e persistência | `cart.spec.ts` |
| Compra do catálogo ao recibo confirmado | `checkout.spec.ts`, `mobile.spec.ts` |
| Recusa, clique repetido, timeout e idempotência | `checkout.spec.ts`, `checkout-api.spec.ts` |
| Perfil, avatar, senha, carteiras e validações | `account.spec.ts`, `mobile.spec.ts` |
| Mudança de preço/disponibilidade durante checkout | `checkout.spec.ts`, `cart.spec.ts` |
| Evento duplicado/antigo, desconexão e retomada | `cart.spec.ts`, `checkout.spec.ts`, `realtime-unit.spec.ts` |
| Teclado, foco de diálogos e validação | `design-system.spec.ts`, `account.spec.ts`, `checkout.spec.ts` |
| Skeleton, latência, falha e nova tentativa | `cart.spec.ts`, `discovery.spec.ts`, `marketplace-scenarios.spec.ts` |

`visual-regression.spec.ts` mantém snapshots versionados de início, detalhe, carrinho e pagamento, em desktop e mobile, com animações desativadas durante a captura. Atualizações intencionais devem ser revistas e geradas com:

```sh
npx playwright test tests/visual-regression.spec.ts --update-snapshots
```

## 8.2 Acessibilidade e responsividade

`quality.spec.ts` verifica ausência de overflow horizontal nas rotas de início, detalhe, carrinho, perfil, carteiras, favoritos, pagamento e pedido nos três viewports. O Axe audita início, detalhe, carrinho, perfil, carteiras e pagamento em 390, 768 e 1440 px contra WCAG 2 A/AA e 2.1 A/AA. Os testes de teclado e foco dos formulários/diálogos permanecem nas specs de cada fluxo. `mobile.spec.ts` cobre compra confirmada, perfil e carteiras em Chromium mobile.

## 8.3 Lighthouse

`npm run audit:lighthouse` gera primeiro o build de demonstração otimizado (mocks habilitados) e então inicia um preview local isolado. O runner confirma que o servidor está servindo arquivos de produção, não o servidor de desenvolvimento, e executa três medições para início e detalhe nos perfis mobile (390 × 844) e desktop, usando o Chromium instalado pelo Playwright. Cada medição gera HTML e JSON em `reports/lighthouse/`; `summary.json` registra versões, condições, LCP, CLS, TBT, scores e medianas das três execuções. O processo retorna código diferente de zero se uma mediana ficar abaixo das metas do PRD (Performance 90, Accessibility 95, Best Practices 95 e SEO 90).

### Resultado desta execução

As medianas abaixo agregam três medições por tela e perfil. Todas atendem às metas do PRD:

| Tela | Perfil | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Início | Mobile | 91 | 98 | 100 | 100 | 3.254 ms | 0.000 | 24 ms |
| Detalhe | Mobile | 90 | 100 | 100 | 100 | 3.246 ms | 0.000 | 11 ms |
| Início | Desktop | 100 | 100 | 100 | 100 | 725 ms | 0.000 | 0 ms |
| Detalhe | Desktop | 92 | 97 | 100 | 100 | 718 ms | 0.170 | 0 ms |

O CLS de 0.170 no detalhe desktop foi atribuído pelo Lighthouse ao footer, que se desloca quando o conteúdo da rota termina de carregar; a pontuação de Performance permanece acima da meta. O relatório por medição inclui os diagnósticos restantes para análise.

Os resultados e arquivos gerados são registrados em [`reports/lighthouse/summary.json`](../../reports/lighthouse/summary.json). As versões de Lighthouse, Playwright, Vite, Node e Chromium, bem como o ambiente e as condições da auditoria, estão no resumo. Metas não atingidas permanecem explicitamente sinalizadas no resumo e devem ser tratadas antes da conclusão da etapa.
