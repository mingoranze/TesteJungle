# Etapa 3 — Sistema visual e estrutura responsiva

Implementação dos itens 3.1, 3.2 e do trabalho visual disponível do item 3.3 do [PRD](../PRD.md). A home foi comparada com os frames `Desktop / Início` (Figma `2-2`, 1440 px) e `Mobile / Início` (Figma `14-5226`, 414 × 896 px), além das capturas correspondentes em `imagensReferencia`. Catálogo com dados e interações de produto continuam para as etapas seguintes.

## Sistema visual e componentes

- Tokens CSS para fundo, superfícies, texto, borda, cor primária, texto secundário, destaque e erro; a paleta definida no PRD está aplicada sem alterações.
- Tipografia baseada na família Inter já usada no projeto, com alternativas monoespaçadas para a home. Os arquivos de fonte do Figma não estão presentes; a home usa a pilha monoespaçada do sistema, seguindo a aparência visível nas capturas.
- Componentes reutilizáveis de botão, cartão, campo de entrada, skeleton shimmer e mensagem de estado em `src/components/ui/`.
- Shell da home com cabeçalho, navegação desktop, navegação móvel fixa e rodapé conforme as referências, mantendo o link para pular ao conteúdo e a rota de prova técnica.
- Foco visível, estados hover/desabilitado, redução de movimento e controles com alvos de toque adequados.

## Fidelidade visual (3.3)

- A home foi comparada manualmente com os frames `Desktop / Início` e `Mobile / Início` do Figma, em 1440 px e 414 × 896 px, e com `imagensReferencia/Desktop/Início.png` e `imagensReferencia/Mobile/Início.png`. A composição inclui hero, navegação, catálogo/coleções, destaques, diário e rodapé.
- As artes exportadas (`Frame 136.png` e `NFT Artwork 04/05/11.png`) são usadas diretamente na home, sem recortar ou substituir conteúdo das capturas.
- As capturas de telas de login, cadastro, carrinho, carteira, pagamento, pedido, perfil e detalhe do NFT não foram implementadas nesta etapa; pertencem às etapas de produto posteriores.
- A rota `/foundation` foi preservada como prova técnica, sem alterá-la para parecer uma tela do marketplace.
- O canvas do Figma está acessível pelo link fornecido. A comparação desta etapa se limita às telas visuais já implementadas que têm frames correspondentes; não foram criadas telas de domínio ainda previstas para as etapas seguintes.

## Responsividade e acessibilidade

O conteúdo limita sua largura em telas grandes, adapta espaçamento e tipografia em telas menores e reserva espaço para a navegação móvel. O teste Playwright verifica as larguras de 390, 768 e 1440 px nas rotas inicial e de prova técnica, incluindo overflow horizontal, navegação adaptada e acesso pelo teclado.

## Verificação

- `npm run typecheck`
- `npm run lint`
- `npx playwright test tests/design-system.spec.ts tests/foundation.spec.ts`
- `npm run build`

Resultado: as comparações disponíveis da home foram realizadas e as diferenças estruturais da tela anterior foram corrigidas. A etapa visual 3.3 foi executada para as telas da home que já existem e possuem frames correspondentes; telas de domínio das etapas seguintes permanecem fora deste escopo.
