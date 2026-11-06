# Etapa 5 — Conta, sessão, perfil, carteiras e favoritos

Implementação dos itens 5.1, 5.2 e 5.3 do [PRD](../PRD.md), sobre os contratos da etapa 1, o domínio simulado da etapa 2, o sistema visual da etapa 3 e o detalhe do NFT da etapa 4.

## Rotas

| Rota | Acesso | Conteúdo |
| --- | --- | --- |
| `/login` | pública | Entrar (`?redirect=<caminho interno>&reason=expired`) |
| `/cadastro` | pública | Criar conta (`?redirect=` preservado entre as abas) |
| `/perfil` | privada | Dados do perfil, avatar e alteração de senha |
| `/perfil/carteiras` | privada | Carteira principal e secundária |
| `/perfil/favoritos` | privada | Lista de interesse (favoritos do usuário) |

As rotas privadas usam `beforeLoad` com `queryClient.ensureQueryData(sessionQueryOptions)`; sem sessão, redirecionam para `/login?redirect=<location.href>`. O destino aceita somente caminhos internos (`safeRedirect` rejeita `//host`, URLs absolutas, `\` e laços para `/login`/`/cadastro`). Acesso direto e refresh funcionam em todas as rotas.

## Sessão (5.1)

- **Login/cadastro** validam no cliente (e-mail, senha 8–128, usuário 3–30 `[a-z0-9_.-]`, confirmação) e exibem erros da API: credenciais inválidas como alerta; `EMAIL_ALREADY_REGISTERED` e `USERNAME_TAKEN` no campo correspondente. Campos inválidos recebem `aria-invalid`/`aria-describedby` e o foco vai ao primeiro erro.
- **Recuperação após refresh:** `GET /api/session` via TanStack Query (`['session']`).
- **Correção de transporte:** no navegador o header `Cookie` é proibido e não chega ao handler do MSW; até esta etapa a sessão por cookie só funcionava nos testes Node. Os handlers (REST e handshake Socket.IO) agora leem o argumento `cookies` do MSW, que inclui o cookie `HttpOnly` mantido no cookie store do MSW; em Node o header continua aceito.
- **Expiração:** o cliente Axios notifica respostas 401 de endpoints não-sessão. Se havia sessão no cache (ou o código é `SESSION_EXPIRED`), o ciclo de vida encerra a sessão local e navega para `/login?redirect=<destino atual>&reason=expired`; após entrar, o usuário volta ao destino.
- **Logout e troca de usuário:** `endLocalSession()`/`applyAuthenticatedSession()` descartam subscriptions registradas (`session-subscriptions.ts`), cancelam e removem a partição `['private', userId, ...]` e invalidam o carrinho. A troca de usuário (login com outra conta) também limpa o cache do usuário anterior. Os consumidores de socket autenticado das etapas 6/7 devem registrar seus listeners nesse registro.
- **Senhas:** nunca persistidas em claro (PBKDF2 já existente); o teste E2E de cadastro verifica o `localStorage`.
- **Ações fora do escopo** (Google, Facebook, “Esqueceu a senha?”) aparecem como no Figma, mas informam que não estão disponíveis na demonstração — não simulam sucesso.

## Perfil e carteiras (5.2)

### Migração coordenada de contrato

Os formulários do Figma exigem campos que o contrato não tinha. Contratos, fixtures, store, handlers, testes e esta documentação foram atualizados juntos:

- `Profile` ganhou `username` (único, sem diferenciar maiúsculas), `ensName` (`nome.eth`) e `walletNickname`.
- `Wallet` ganhou `displayName`, `nickname`, `profileName`, `walletType` (`MetaMask` | `WalletConnect` | `Coinbase`), `referralCode`, `email`, `ensName` e `alternateAddress` (ENS ou 0x, opcional).
- `POST /api/session/register` aceita `username` opcional (sugere um a partir do e-mail se ausente) e responde `409 USERNAME_TAKEN`.
- `PATCH /api/profile` aceita `name`, `username`, `email`, `ensName`, `walletNickname` e `avatarUrl` (http(s) ou data URL PNG/JPEG/WebP até ~300 KB); erros de validação retornam `details.fields`; conflitos de e-mail/usuário retornam 409.
- **Novo** `POST /api/profile/password` `{ currentPassword, newPassword }` → `204`; senha atual incorreta → `422 INVALID_CURRENT_PASSWORD` (não 401, pois a sessão continua válida). Revoga as demais sessões do usuário.
- `POST/PATCH /api/wallets` validam todos os campos obrigatórios do formulário. Cada usuário tem no máximo **uma principal e uma secundária** (`409 WALLET_ROLE_TAKEN`); secundária exige principal (`409 PRIMARY_WALLET_REQUIRED`); endereço repetido do mesmo usuário → `409 WALLET_ADDRESS_DUPLICATE`. `PATCH` com `role` troca os papéis entre as carteiras.
- Snapshot do store na **versão 7**. Snapshots 1–6 são migrados: perfis recebem username (do fixture ou derivado do e-mail, com sufixo se colidir), carteiras recebem os campos novos; carteiras secundárias excedentes de versões antigas são descartadas (mantém-se a primeira).

### Telas

- **Perfil:** campos do frame “Perfil do colecionador”, avatar com Alterar/Remover (o arquivo é recortado e reduzido para 192 px no navegador antes do envio) e bloco “Alterar senha”. Um único “Salvar” persiste o perfil e, se preenchida, a nova senha; o perfil salvo atualiza o cache mesmo que a troca de senha falhe.
- **Carteiras:** formulário do frame “Carteiras” para principal e secundária. “Igual à carteira principal” copia os dados de identificação da principal (rede, tipo, nome, perfil, e-mail, ENS, código) para a secundária; endereço e apelido continuam próprios. Remoção pede confirmação em linha. “Adicionar” da principal leva o foco ao formulário quando ainda não há carteira principal.
- **Menu “Meu perfil”:** Atividade, Ofertas, Arquivos baixados e Suporte estão fora do escopo; aparecem como no Figma com `aria-disabled` e indicação para leitores de tela, sem navegação simulada. “Lista de interesse” leva aos favoritos.
- **Mobile (sem frame):** perfil e carteiras usam uma coluna; o menu lateral vira uma faixa horizontal rolável com indicador inferior na aba ativa. Testado em 390 px sem overflow horizontal.

## Favoritos (5.3)

- `useFavorites()` consulta `['private', userId, 'favorites']`; `useToggleFavorite()` aplica atualização otimista, restaura o snapshot em falha e revalida no fim. A chave usa o usuário capturado no clique; após logout/troca, respostas tardias não recriam o cache do usuário anterior.
- O detalhe do NFT usa o estado real do servidor (antes era estado local). Visitante que clica em favoritar vai para `/login?redirect=/nfts/<id>`.
- `/perfil/favoritos` lista os NFTs favoritados (detalhes compartilham o cache público `nftKeys.detail`) e permite remover.

## Controle de mock para testes

`POST /api/mock/fail-next` `{ method, pathPrefix, count?, delayMs? }` arma falhas `503` pontuais para as próximas requisições correspondentes, sem trocar cenário nem revogar a sessão. Fica em memória do mock (não sobrevive a refresh) e é limpa por `POST /api/mock/reset`. Necessário porque o `page.route` do Playwright não intercepta requisições atendidas pelo service worker.

## Fidelidade visual

Comparação com `imagensReferencia/Desktop/{Login,Cadastro,Perfil do Colecionador,Carteiras}.png` (1440 px) e `Mobile/{Login,Cadastro}.png` (414 × 896): composição, posições verticais dos campos/botões/divisor (ajustadas medindo screenshots Playwright nos mesmos viewports), larguras (painel 500 px; campos 340 px no desktop e 358 px no mobile; colunas 417 px no perfil/carteiras), cores e textos conferidos. Divergências registradas:

- A home atrás do diálogo é a home atual da etapa 4 (coleções/filtros diferem do fundo do frame, que é ilustrativo).
- Fonte monoespaçada do sistema, como decidido na etapa 3 (arquivos de fonte do Figma ausentes).
- O cabeçalho mostra “Perfil” em vez de “Entrar” quando há sessão.
- Mensagens de erro/sucesso e o aviso “Clique em Salvar para aplicar o novo avatar” não existem nos frames; seguem o estilo de `StatusMessage`.
- Os frames mostram carteiras vazias; com dados, o formulário é preenchido (para a principal de um usuário sem carteira, pré-preenche nome, usuário, e-mail, ENS e apelido do perfil).

## Verificação

- `npm run typecheck`, `npm run lint`, `npm run build`
- `npx playwright test` — 42 testes, incluindo `tests/account.spec.ts` (9 cenários: rota privada e retorno, redirecionamento seguro, cadastro e conflitos, expiração, logout/troca de usuário sem vazamento, favorito otimista com rollback, perfil/avatar/senha, carteiras, foco/Escape/mobile) e novos casos em `tests/marketplace-api.spec.ts` e `tests/marketplace-fixtures.spec.ts`.
- `npm run test:e2e:demo` — mesmos 42 testes contra o build de demonstração.
