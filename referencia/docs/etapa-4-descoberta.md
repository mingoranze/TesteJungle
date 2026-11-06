# Etapa 4 — Descoberta: início, catálogo e detalhe do NFT

Implementação dos itens 4.1 e 4.2 do [PRD](../PRD.md), mantendo os contratos REST simulados da etapa 2 e o sistema visual da etapa 3.

## Início e catálogo

- A página inicial consulta `GET /api/nfts` com TanStack Query e Axios; o `AbortSignal` da consulta é repassado ao cliente para cancelar respostas obsoletas.
- Busca, coleção, limites mínimo/máximo de preço, ordenação e paginação são refletidos nos parâmetros da URL. Alterar busca ou filtros reinicia a página; recarregar e usar voltar/avançar restaura o estado.
- A consulta envia `q`, `collectionId`, `minPriceEth`, `maxPriceEth`, `sort`, `page` e `pageSize` para o handler existente.
- A tela cobre carregamento com skeleton shimmer, vazio, falha com nova tentativa e atualização em segundo plano.
- As opções visuais “Novos lançamentos” e “Em alta” ficam desabilitadas até que a API exponha datas de lançamento e métricas de popularidade. A rede também não é filtrável pelo contrato atual; os filtros ativos correspondem aos parâmetros REST implementados.

## Detalhe

- A rota `/nfts/$nftId` consulta o endpoint de detalhe, funciona por acesso direto/refresh e mostra estado de NFT inexistente e de erro recuperável.
- A tela exibe a arte e os metadados fornecidos pelo fixture, escolha de edição quando declarada, quantidade limitada pela disponibilidade, favoritos via REST e adição ao carrinho via REST como início do fluxo de compra.
- A navegação global inferior é ocultada no detalhe mobile para não competir com a barra fixa de compra.
- O detalhe mobile do Emerald Ape foi ajustado à referência PNG de 414 × 896: painel de informações sobreposto à arte, classificação junto ao título e barra inferior de quantidade/preço/compra; o posicionamento é coberto por teste geométrico.
- O detalhe desktop acompanha as referências adicionais: miniaturas sem cartão de fundo, cinco estrelas e contagem de avaliações, controles verticais de quantidade, metadados em tom secundário, links de compartilhamento e seções de procedência/direitos autorais. No mobile, o painel de informações se estende atrás da barra fixa de compra.
- A barra fixa mobile de quantidade e compra foi compactada e alinhada ao limite inferior da tela; a descrição curta, coleção e atributos permanecem visíveis sem rolagem.
- A arte do detalhe mobile usa 90% da largura disponível e o painel de informações sobrepõe discretamente sua borda inferior, liberando mais espaço para descrição e metadados; o teste valida a proporção, sobreposição e conteúdo acima da barra fixa.
- O catálogo mostra 9 cartões por página (grade 3 × 3) e 4 páginas (`1 2 3 4 >`), como no frame. Os oito NFTs nomeados nas capturas mantêm suas artes; o 8º cartão é, por decisão do usuário, igual à referência: só a arte dourada, sem nome nem preço visíveis (`Nft.showcaseOnly`; nome e preço ficam para leitores de tela e o detalhe/compra funcionam normalmente). Para completar as 4 páginas, o fixture tem 36 NFTs: os registros técnicos anteriores e registros de catálogo que reaproveitam as quatro artes (snapshot versão 9, migrado preservando preço/estoque alterados por eventos). As setas de paginação só aparecem quando há página anterior/seguinte. Somente o detalhe Emerald Ape contém os metadados específicos visíveis na referência; para os demais, a UI sinaliza explicitamente a ausência de descrição.
- O snapshot do mock está na versão 6: snapshots das versões anteriores recebem os novos dados/arte e metadados detalhados do catálogo, preservando preços e disponibilidade que já tenham sido alterados por eventos, além dos dados de sessão/carrinho/favoritos.
- O link de Figma enviado para o frame `70395-245` retorna erro 403 no navegador desta sessão; a comparação visual disponível nesta etapa usa os PNGs locais.

## Verificação

- `npm run typecheck`
- `npm run lint`
- `npx playwright test tests/discovery.spec.ts tests/marketplace-api.spec.ts`
- `npm run build`
