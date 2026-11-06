# Etapa 0 — Baseline, inventário visual e critérios de aceite

Registro inicial da etapa 0 do [PRD](../PRD.md), elaborado em 2026-11-05. Este documento separa evidências locais confirmadas de informações que dependem do acesso aos frames-fonte do Figma.

## 1. Baseline do repositório

- Branch observada: `master`.
- Último commit observado: `e1c6ae1` (`Primeiro commit, vou conectar com o servidor remoto no github`).
- O único arquivo rastreado no baseline é `Documento de avaliacao.md`. `PRD.md` e `imagensReferencia/` existem no checkout, mas estavam não rastreados.
- Não há código de aplicação, `package.json`, lockfile, configuração de build, scripts, testes ou comandos de execução.
- Portanto, ainda não existe baseline executável para validar. Isso não é uma falha de build: a aplicação não foi iniciada; a configuração e prova executável pertencem à etapa 1. Não instalar dependências nem implementar funcionalidades nesta etapa.
- Convenção observada: documentos Markdown na raiz e referências PNG em `imagensReferencia/Desktop/` e `imagensReferencia/Mobile/`. Ainda não há convenção de código/pastas.

## 2. Acesso ao Figma e limites do inventário

Fonte indicada em [Documento de avaliação](../Documento%20de%20avaliacao.md): [Frontend Challenge — Figma](https://www.figma.com/design/Ff0SksUi7UFtPWUO8kyNtw/Frontend-Challenge?node-id=0-1).

A página respondeu com o título “Frontend Challenge – Figma”, mas a visualização dos frames permaneceu em carregamento e registrou respostas 401/403. Assim, o link foi confirmado, mas **não foi possível confirmar acesso aos frames nem inspecionar no Figma medidas, fontes, componentes, variantes, estados ou assets originais**. Os PNG locais são referências visuais, não substitutos dos arquivos-fonte.

Por orientação do usuário, as imagens em `imagensReferencia/` foram inspecionadas e são a referência visual disponível para este inventário. As observações abaixo descrevem somente o que está visível nessas capturas; não comprovam que incluam todos os estados ou especificações do arquivo Figma.

## 3. Inventário de referências locais

Os arquivos disponíveis são PNGs. As dimensões abaixo são as dimensões nativas dos arquivos, não dimensões de viewport confirmadas no Figma.

| Tela | Referência desktop | Dimensão | Referência mobile | Dimensão |
|---|---|---:|---|---:|
| Início | [Início.png](../imagensReferencia/Desktop/Início.png) | 1440 × 3668 | [Início.png](../imagensReferencia/Mobile/Início.png) | 414 × 896 |
| Detalhes do NFT | [Detalhes do NFT.png](../imagensReferencia/Desktop/Detalhes%20do%20NFT.png) | 1440 × 2246 | [Detalhes do NFT.png](../imagensReferencia/Mobile/Detalhes%20do%20NFT.png) | 414 × 896 |
| Carrinho de NFTs | [Carrinho de NFTs.png](../imagensReferencia/Desktop/Carrinho%20de%20NFTs.png) | 1440 × 1754 | [Carrinho de NFTs.png](../imagensReferencia/Mobile/Carrinho%20de%20NFTs.png) | 414 × 896 |
| Pagamento | [Pagamento.png](../imagensReferencia/Desktop/Pagamento.png) | 1440 × 1657 | [Pagamento.png](../imagensReferencia/Mobile/Pagamento.png) | 414 × 896 |
| Confirmação de pedido | [Confirmação de Pedido.png](../imagensReferencia/Desktop/Confirmação%20de%20Pedido.png) | 1440 × 1657 | **Pendente** | — |
| Login | [Login.png](../imagensReferencia/Desktop/Login.png) | 1440 × 1981 | [Login.png](../imagensReferencia/Mobile/Login.png) | 414 × 896 |
| Cadastro | [Cadastro.png](../imagensReferencia/Desktop/Cadastro.png) | 1440 × 1981 | [Cadastro.png](../imagensReferencia/Mobile/Cadastro.png) | 414 × 896 |
| Perfil do colecionador | [Perfil do Colecionador.png](../imagensReferencia/Desktop/Perfil%20do%20Colecionador.png) | 1440 × 1080 | **Pendente** | — |
| Carteiras | [Carteiras.png](../imagensReferencia/Desktop/Carteiras.png) | 1440 × 1080 | **Pendente** | — |

Inventário: 9 referências desktop e 6 mobile, todas em PNG; não foram encontrados arquivos de fonte, exports de assets isolados ou metadados de origem/licença. A procedência e as licenças dos materiais não estão documentadas no checkout e precisam ser confirmadas antes de reutilizar assets fora da finalidade de referência.

### Elementos e composição observados

- **Sistema visual comum:** fundo quase preto/marrom, superfícies marrom-escuras, acentos laranja, texto claro e tons dourados secundários; tipografia visualmente monoespaçada; bordas finas, cantos arredondados e imagens de NFTs como principal elemento gráfico.
- **Navegação e conteúdo:** marca Kurio; header desktop com links, busca, carrinho e entrada; rodapé editorial/informativo repetido nas páginas desktop. As referências mobile mostram busca/filtros e navegação inferior na tela inicial.
- **Início:** hero de destaque, navegação/categorias e filtros de catálogo desktop, cards de NFT, paginação, chamadas editoriais e rodapé. No mobile, hero compacto, abas de catálogo, cards em duas colunas e navegação inferior.
- **Detalhes do NFT:** desktop com trilha de navegação, miniaturas/galeria, preço, avaliações, edição, quantidade, compra/favorito, metadados, abas de detalhes/avaliações e coleção relacionada. Mobile usa imagem em destaque, painel sobreposto de informações e barra inferior com quantidade, preço e ações.
- **Carrinho:** desktop com itens em linhas/tabela e resumo lateral para cupom, subtotal, desconto, taxa e total; inclui recomendações. Mobile lista cards de itens e mantém cupom/resumo/ação de checkout em painel inferior.
- **Pagamento:** desktop distribui formulário do colecionador e revisão do carrinho em duas colunas, com seleção de carteira/rede e confirmação. Mobile apresenta carteiras cadastradas, opções de carteira/rede, total e ação de confirmação.
- **Confirmação:** captura desktop mostra um painel de sucesso com identificador/data/carteira, itens, taxas, total e link de exploração simulado. Não há captura mobile.
- **Login e cadastro:** desktop mostra cada formulário em overlay central sobre o início, com fechamento e opções de provedores sociais; mobile mostra páginas independentes com campos, ação principal e links para alternar entre entrar/cadastrar.
- **Perfil:** navegação lateral de conta e formulário com dados, avatar e alteração de senha. Não há captura mobile.
- **Carteiras:** usa a mesma navegação lateral; formulário da carteira principal e seção separada para carteira secundária, com opção de adicionar. Não há captura mobile.

As capturas mostram layouts preenchidos/estáticos; não foram identificadas referências dedicadas para skeleton, carregamento, vazio, falha, validação, menu aberto, foco ou confirmação de ações. Esses estados funcionais continuam sendo requisitos do PRD e devem ser desenhados seguindo o sistema visual confirmado, sem afirmar que aparecem nas imagens.

### Checklist visual por tela e viewport

Viewports obrigatórios do PRD: **390, 768 e 1440 px**. Os arquivos mobile têm 414 px de largura e os desktop 1440 px; 390 e 768 px não têm capturas dedicadas. Não tratar redimensionamento de screenshot como baseline para esses viewports.

| Tela | Referência disponível | 390 px | 768 px | 1440 px | Figma: medidas/fontes/estados/assets |
|---|---|---|---|---|---|
| Início | Desktop e mobile; estruturas descritas acima | Validar | Validar | Validar | Figma não acessível |
| Detalhes do NFT | Desktop e mobile; galeria, edição e ações | Validar | Validar | Validar | Figma não acessível |
| Carrinho de NFTs | Desktop e mobile; lista e resumo | Validar | Validar | Validar | Figma não acessível |
| Pagamento | Desktop e mobile; formulário/revisão | Validar | Validar | Validar | Figma não acessível |
| Confirmação de pedido | Desktop; mobile ausente | Adaptar e validar | Validar | Validar | Figma não acessível |
| Login | Desktop overlay e mobile independente | Validar | Validar | Validar | Figma não acessível |
| Cadastro | Desktop overlay e mobile independente | Validar | Validar | Validar | Figma não acessível |
| Perfil do colecionador | Desktop; mobile ausente | Adaptar e validar | Validar | Validar | Figma não acessível |
| Carteiras | Desktop; mobile ausente | Adaptar e validar | Validar | Validar | Figma não acessível |

Antes do polimento visual, completar o checklist com composição, dimensões dos componentes, tipografia, cores, espaçamentos, estados (carregamento, vazio, erro, sucesso e interação) e referências aos assets originais de cada frame. Os itens mobile sem referência devem seguir o sistema visual confirmado no Figma, sem presumir um frame inexistente.

## 4. Matriz rastreável de aceite

IDs estáveis para associar implementação, cenários e evidências nas etapas seguintes. “Etapa” indica onde o critério será implementado/verificado, não que esteja concluído agora.

| ID | Critério verificável | Evidência futura | Etapa |
|---|---|---|---|
| VIS-01 | As nove telas correspondem ao Figma e funcionam em 390, 768 e 1440 px, sem overflow indevido. | Comparação com Figma e baselines visuais; registrar desvios. | 0, 3–8 |
| VIS-02 | Perfil, carteiras e confirmação também funcionam em mobile, apesar da ausência de referência mobile local. | Verificação visual e funcional nos três viewports. | 3, 5, 7, 8 |
| CAT-01 | Busca, filtros combinados, ordenação, paginação e histórico refletem o estado da URL e da API. | E2E com refresh, voltar/avançar e parâmetros. | 4, 8 |
| NFT-01 | Detalhe direto, inexistente, indisponível e limite de quantidade têm tratamento explícito. | E2E de detalhe e estados de erro/indisponibilidade. | 4, 8 |
| ACC-01 | Cadastro, login, sessão persistida/expirada, logout e troca de usuário preservam o retorno e isolam dados privados. | E2E de conta e inspeção de cache/subscriptions por usuário. | 5, 8 |
| ACC-02 | Perfil, avatar, senha e carteiras validam erros e persistem alterações confirmadas. | E2E com refresh e erros de validação. | 5, 8 |
| FAV-01 | Favoritos persistem por usuário; falha otimista reverte sem vazar entre sessões. | E2E de sucesso, falha/rollback e troca de usuário. | 5, 8 |
| CART-01 | Carrinho suporta edição, remoção, cupom, persistência e incorporação dos itens do visitante ao login. | E2E antes/depois de refresh e login. | 6, 8 |
| PRICE-01 | Cotação conserva ETH como string decimal e revalida preço, disponibilidade, cupom e taxas antes da confirmação. Mudanças exigem nova confirmação. | Cenário de alteração concorrente e valores observáveis. | 6–8 |
| RT-01 | `nft.updated` e `order.updated` usam Socket.IO no cliente; duplicatas/versões antigas não regridem estado; reconexão reconcilia via REST. | E2E com `socket.io-client`, evento duplicado/antigo e desconexão. | 1, 2, 6–8 |
| ORDER-01 | Criar pedido é idempotente; timeout recupera o mesmo pedido; estados terminais não regridem; recibo conserva snapshot. | E2E de clique repetido, timeout, refresh e recibo. | 1, 2, 7, 8 |
| MOCK-01 | MSW cobre REST e cenários determinísticos em desenvolvimento, testes e build de demonstração; reset restaura estado conhecido. | Testes de handlers, persistência/reset e smoke test do build. | 1, 2, 8, 9 |
| A11Y-01 | Teclado, foco, semântica, labels, mensagens, alternativas, contraste, zoom e movimento reduzido são verificados. | Checklist e execução Playwright por viewport. | 3–8 |
| PERF-01 | Início e detalhe têm três auditorias Lighthouse por perfil (mobile/desktop); medianas reportadas contra as metas do PRD. | Relatórios HTML/JSON, versões, ambiente, LCP/CLS/TBT. | 8 |
| DEP-01 | Rotas previstas abrem diretamente e sobrevivem a refresh no deploy; mocks e eventos permanecem disponíveis. | Smoke test da URL publicada por rota e fluxo principal. | 1, 9 |

### Grupos E2E requeridos

1. Busca, filtros combinados, ordenação, paginação e histórico.
2. Acesso direto ao detalhe e NFT inexistente.
3. Cadastro, login, expiração, logout e troca de usuário.
4. Favoritos, falha da mutation e recuperação.
5. Carrinho, quantidades, remoção, cupom, refresh e login.
6. Compra do catálogo ao recibo confirmado.
7. Recusa/falha de pagamento, clique repetido e timeout recuperando o mesmo pedido.
8. Perfil, avatar, senha e carteiras, inclusive erros.
9. Mudança de preço/disponibilidade por Socket.IO durante checkout.
10. Eventos antigos/duplicados, desconexão e retomada de pedido pendente.
11. Navegação por teclado, foco de diálogos e validação de formulários.
12. Skeletons com lentidão, feedback de falha e recuperação por nova tentativa.

Os testes devem isolar estado e observar resultados na interface e operações; REST passa pelos handlers MSW e tempo real pelo `socket.io-client`. Fluxos principais devem rodar em Chromium desktop e mobile; regressão visual versionada para início, detalhe, carrinho e pagamento.

## 5. Decisões e riscos registrados

| ID | Decisão ou risco | Tratamento / próximo passo |
|---|---|---|
| DEC-01 | Não selecionar transporte de eventos nem assumir compatibilidade entre MSW, Socket.IO e deploy antes da prova. | Na etapa 1.2, exercitar Axios/MSW REST e `socket.io-client` com o binding/protocolo escolhido no navegador e build pretendido; registrar decisão reproduzível e limitações. |
| RSK-01 | Consistência entre respostas REST, eventos e reset de dados pode divergir. | Definir uma fonte de estado simulada por domínio; provar persistência, isolamento e reset integral antes de expandir os fluxos. |
| RSK-02 | Persistência local de mocks pode expor estado privado ou tornar E2E não determinístico. | Na etapa 2, definir mecanismo/versão de persistência e reset; testar isolamento por usuário e estado inicial por teste. |
| RSK-03 | SPA publicada pode falhar em acesso direto/refresh; worker/socket mock pode não estar disponível no build. | Na etapa 1.2 testar ambiente de deploy pretendido e fallback de rotas; na etapa 9 validar URL pública, mocks, eventos e refresh. |
| RSK-04 | Falta acesso aos frames e aos metadados/licenças de assets. | Obter acesso/exportação do Figma e documentação de origem antes de confirmar fidelidade visual ou reutilizar assets originais. |
| RSK-05 | Não há aplicação inicial para executar. | Etapa 1 estabelece estrutura e baseline executável; etapa 0 não cria funcionalidades nem scaffold. |

## 6. Status da etapa 0

- **Concluído:** baseline do checkout e inventário dos 15 PNGs; associação das referências às telas; dimensões nativas verificadas; viewports e telas mobile ausentes registrados; matriz de aceite e riscos definidos.
- **Pendente externo:** acesso funcional aos frames do Figma, confirmação de detalhes visuais e origem/licenças dos assets.
- **Pendente de etapa posterior:** baseline executável, decisões comprovadas de transporte/persistência/deploy e implementação dos testes. Não são declarados como concluídos nesta etapa.
- **Próximo bloqueio para fidelidade visual:** liberar acesso de leitura ao arquivo Figma ou fornecer exports/fontes/assets e informações de licença. Enquanto isso, somente trabalho independente do detalhe visual pode avançar, conforme o PRD.
