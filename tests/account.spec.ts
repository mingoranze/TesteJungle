import { expect, test, type Page } from '@playwright/test';

const demoPassword = 'kurio-demo';
const homeUrl = /^http:\/\/127\.0\.0\.1:4173\/(\?page=1)?$/;
// PNG 1×1 válido para exercitar o upload e o redimensionamento do avatar no navegador.
const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function mockPost(page: Page, path: string, body: unknown) {
  return page.evaluate(async ([url, payload]) => {
    const response = await fetch(url as string, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.status;
  }, [path, body] as const);
}

async function signIn(page: Page, email: string, password = demoPassword) {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('E-mail').fill(email);
  await dialog.getByLabel('Senha', { exact: true }).fill(password);
  await dialog.getByRole('button', { name: 'Entrar', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Kurio — início' }).waitFor();
  expect(await mockPost(page, '/api/mock/reset', { scenario: 'default' })).toBe(200);
});

test('rota privada preserva o destino, login valida campos e a sessão sobrevive ao refresh', async ({ page }) => {
  await page.goto('/perfil/carteiras');
  await expect(page).toHaveURL(/\/login\?redirect=%2Fperfil%2Fcarteiras$/);
  const dialog = page.getByRole('dialog', { name: 'Entrar' });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(dialog.getByText('Informe um e-mail válido.')).toBeVisible();
  await expect(dialog.getByText('A senha deve ter entre 8 e 128 caracteres.')).toBeVisible();
  await expect(dialog.getByLabel('E-mail')).toBeFocused();
  await expect(dialog.getByLabel('E-mail')).toHaveAttribute('aria-invalid', 'true');

  await signIn(page, 'ana@kurio.test', 'senha-incorreta');
  await expect(dialog.getByRole('alert')).toContainText('E-mail ou senha incorretos.');

  await dialog.getByRole('button', { name: 'Esqueceu a senha?' }).click();
  await expect(dialog.getByText('A recuperação de senha não está disponível nesta demonstração.', { exact: false })).toBeVisible();

  await signIn(page, 'ana@kurio.test');
  await expect(page).toHaveURL(/\/perfil\/carteiras$/);
  const principal = page.getByRole('form', { name: 'Carteira principal' });
  await expect(principal.getByLabel('Endereço da carteira')).toHaveValue('0x1111111111111111111111111111111111111111');

  await page.reload();
  await expect(page).toHaveURL(/\/perfil\/carteiras$/);
  await expect(principal.getByLabel('Endereço da carteira')).toHaveValue('0x1111111111111111111111111111111111111111');
  await expect(page.getByRole('banner').getByRole('link', { name: 'Perfil' })).toBeVisible();
});

test('redirecionamento pós-login aceita apenas caminhos internos', async ({ page }) => {
  await page.goto('/login?redirect=%2F%2Fexemplo.com%2Fphishing');
  await signIn(page, 'ana@kurio.test');
  await expect(page).toHaveURL(homeUrl);
});

test('cadastro valida campos, trata conflitos e autentica o novo colecionador', async ({ page }) => {
  await page.goto('/cadastro');
  const dialog = page.getByRole('dialog', { name: 'Criar perfil de colecionador' });
  await dialog.getByLabel('Nome de usuário').fill('ab');
  await dialog.getByLabel('E-mail').fill('novo@kurio.test');
  await dialog.getByLabel('Senha', { exact: true }).fill('senha-segura-1');
  await dialog.getByLabel('Confirmar senha').fill('senha-diferente');
  await dialog.getByRole('button', { name: 'Criar conta' }).click();
  await expect(dialog.getByText('Use de 3 a 30 letras', { exact: false })).toBeVisible();
  await expect(dialog.getByText('As senhas não coincidem.')).toBeVisible();

  await dialog.getByLabel('Nome de usuário').fill('novo.colecionador');
  await dialog.getByLabel('Confirmar senha').fill('senha-segura-1');
  await dialog.getByLabel('E-mail').fill('ana@kurio.test');
  await dialog.getByRole('button', { name: 'Criar conta' }).click();
  await expect(dialog.getByText('Já existe uma conta com este e-mail.')).toBeVisible();

  await dialog.getByLabel('E-mail').fill('novo@kurio.test');
  await dialog.getByLabel('Nome de usuário').fill('ANA.SILVA');
  await dialog.getByRole('button', { name: 'Criar conta' }).click();
  await expect(dialog.getByText('Este nome de usuário já está em uso.')).toBeVisible();

  await dialog.getByLabel('Nome de usuário').fill('novo.colecionador');
  await dialog.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(homeUrl);
  await page.getByRole('banner').getByRole('link', { name: 'Perfil' }).click();
  await expect(page.getByLabel('Nome de usuário')).toHaveValue('novo.colecionador');
  await expect(page.getByLabel('E-mail')).toHaveValue('novo@kurio.test');

  // A conta continua válida após refresh e o cadastro não guarda a senha em claro.
  await page.reload();
  await expect(page.getByLabel('Nome de usuário')).toHaveValue('novo.colecionador');
  const persisted = await page.evaluate(() => localStorage.getItem('kurio.marketplace.state.v1') ?? '');
  expect(persisted).not.toContain('senha-segura-1');
});

test('expiração da sessão durante a navegação leva ao login e retoma o destino', async ({ page }) => {
  await page.goto('/login?redirect=%2Fperfil');
  await signIn(page, 'ana@kurio.test');
  await expect(page.getByRole('heading', { name: 'Perfil do colecionador' })).toBeVisible();

  expect(await mockPost(page, '/api/mock/scenario', { scenario: 'session-expired' })).toBe(200);
  await page.getByRole('navigation', { name: 'Menu do perfil' }).getByRole('link', { name: 'Carteiras' }).click();

  await expect(page).toHaveURL(/\/login\?redirect=%2Fperfil%2Fcarteiras&reason=expired$/);
  await expect(page.getByText('Sua sessão expirou. Entre novamente para continuar.')).toBeVisible();

  await signIn(page, 'ana@kurio.test');
  await expect(page).toHaveURL(/\/perfil\/carteiras$/);
  await expect(page.getByRole('heading', { name: 'Carteira principal' })).toBeVisible();
});

test('logout e troca de usuário limpam dados privados sem misturar favoritos', async ({ page }) => {
  await page.goto('/login?redirect=%2Fperfil%2Ffavoritos');
  await signIn(page, 'ana@kurio.test');
  await expect(page.getByRole('link', { name: 'Ver detalhes de Emerald Ape #042' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver detalhes de Golden Beat #207' })).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(homeUrl);
  await expect(page.getByRole('banner').getByRole('link', { name: 'Entrar' })).toBeVisible();
  await page.goto('/perfil/favoritos');
  await expect(page).toHaveURL(/\/login\?redirect=%2Fperfil%2Ffavoritos$/);
  await signIn(page, 'caio@kurio.test');
  await expect(page.getByRole('link', { name: 'Ver detalhes de Sage Nomad #009' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver detalhes de Emerald Ape #042' })).toHaveCount(0);

  await page.goto('/nfts/nft-001');
  await expect(page.getByRole('button', { name: 'Favoritar NFT' })).toHaveAttribute('aria-pressed', 'false');
});

test('favorito aplica atualização otimista, desfaz em falha e persiste após nova tentativa', async ({ page }) => {
  await page.goto('/login?redirect=%2Fnfts%2Fnft-003');
  await signIn(page, 'ana@kurio.test');
  const favoriteButton = page.getByRole('button', { name: 'Favoritar NFT' });
  await expect(favoriteButton).toHaveAttribute('aria-pressed', 'false');

  expect(await mockPost(page, '/api/mock/fail-next', {
    method: 'PUT',
    pathPrefix: '/api/favorites/',
    delayMs: 800,
  })).toBe(201);
  await favoriteButton.click();
  // Otimista: o estado muda antes da resposta da API.
  await expect(page.getByRole('button', { name: 'Remover dos favoritos' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('alert')).toContainText('O favorito foi restaurado; tente novamente.');
  await expect(favoriteButton).toHaveAttribute('aria-pressed', 'false');

  await favoriteButton.click();
  await expect(page.getByText('NFT adicionado aos favoritos.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Remover dos favoritos' })).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/perfil/favoritos');
  await expect(page.getByRole('link', { name: 'Ver detalhes de Neon Vessel #552' })).toBeVisible();
  await page.getByRole('button', { name: 'Remover Neon Vessel #552 da lista de interesse' }).click();
  await expect(page.getByRole('link', { name: 'Ver detalhes de Neon Vessel #552' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Ver detalhes de Emerald Ape #042' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver detalhes de Neon Vessel #552' })).toHaveCount(0);
});

test('perfil edita dados, avatar e senha com validação e persistência', async ({ page }) => {
  await page.goto('/login?redirect=%2Fperfil');
  await signIn(page, 'ana@kurio.test');
  const displayName = page.getByLabel('Nome de exibição');
  await expect(displayName).toHaveValue('Ana Silva');

  await displayName.fill('');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Informe um nome de exibição com até 80 caracteres.')).toBeVisible();
  await expect(displayName).toBeFocused();

  await displayName.fill('Ana Colecionadora');
  await page.getByLabel('Nome ENS').fill('ana-colecao');
  await page.getByLabel('Arquivo do avatar').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: tinyPng });
  await expect(page.getByRole('img', { name: 'Avatar atual' })).toBeVisible();
  await page.getByLabel('Senha atual').fill('senha-errada');
  await page.getByLabel('Nova senha', { exact: true }).fill('nova-senha-123');
  await page.getByLabel('Confirmar nova senha').fill('nova-senha-123');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('A senha atual está incorreta.').first()).toBeVisible();

  await page.getByLabel('Senha atual').fill(demoPassword);
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Perfil e senha atualizados.' })).toBeVisible();
  await expect(page.getByLabel('Senha atual')).toHaveValue('');

  await page.reload();
  await expect(page.getByLabel('Nome de exibição')).toHaveValue('Ana Colecionadora');
  await expect(page.getByLabel('Nome ENS')).toHaveValue('ana-colecao');
  await expect(page.getByRole('img', { name: 'Avatar atual' })).toHaveAttribute('src', /^data:image\/(webp|jpeg);base64,/);

  await page.getByRole('button', { name: 'Remover' }).click();
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Perfil atualizado.' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Avatar atual' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Sair' }).click();
  await page.goto('/login');
  await signIn(page, 'ana@kurio.test');
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('E-mail ou senha incorretos.');
  await signIn(page, 'ana@kurio.test', 'nova-senha-123');
  await expect(page).toHaveURL(homeUrl);
});

test('carteiras validam campos, editam a principal e cadastram a secundária', async ({ page }) => {
  await page.goto('/login?redirect=%2Fperfil%2Fcarteiras');
  await signIn(page, 'caio@kurio.test');
  const principal = page.getByRole('form', { name: 'Carteira principal' });
  await expect(principal.getByLabel('Endereço da carteira')).toHaveValue('0x3333333333333333333333333333333333333333');
  await expect(page.getByText('Você ainda não adicionou uma carteira secundária.')).toBeVisible();

  await principal.getByLabel('Apelido da carteira').fill('');
  await principal.getByRole('button', { name: 'Salvar carteira' }).click();
  await expect(principal.getByText('Informe um apelido com até 40 caracteres.')).toBeVisible();
  await principal.getByLabel('Apelido da carteira').fill('Cofre do Caio');
  await principal.getByRole('button', { name: 'Salvar carteira' }).click();
  await expect(principal.getByRole('status')).toHaveText('Carteira salva.');

  await page.getByLabel('Igual à carteira principal').check();
  const secondary = page.getByRole('form', { name: 'Carteira secundária' });
  await expect(secondary.getByLabel('Nome de exibição')).toHaveValue('Caio Nunes');
  await expect(secondary.getByLabel('Rede')).toHaveValue('Ethereum');
  await expect(secondary.getByLabel('Tipo de carteira')).toHaveValue('Coinbase');

  await secondary.getByLabel('Endereço da carteira').fill('0x123');
  await secondary.getByLabel('Apelido da carteira').fill('Reserva');
  await secondary.getByLabel('Rede').selectOption('Polygon');
  await secondary.getByRole('button', { name: 'Salvar carteira' }).click();
  await expect(secondary.getByText('Informe um endereço 0x com 40 caracteres hexadecimais.')).toBeVisible();

  await secondary.getByLabel('Endereço da carteira').fill('0x3333333333333333333333333333333333333333');
  await secondary.getByRole('button', { name: 'Salvar carteira' }).click();
  await expect(secondary.getByRole('alert')).toContainText('Este endereço já está cadastrado em outra carteira.');

  await secondary.getByLabel('Endereço da carteira').fill('0x7777777777777777777777777777777777777777');
  await secondary.getByRole('button', { name: 'Salvar carteira' }).click();
  await expect(page.getByRole('heading', { name: 'Carteira secundária' })).toBeVisible();
  await expect(secondary.getByLabel('Endereço da carteira')).toHaveValue('0x7777777777777777777777777777777777777777');

  await page.reload();
  await expect(principal.getByLabel('Apelido da carteira')).toHaveValue('Cofre do Caio');
  await expect(secondary.getByLabel('Endereço da carteira')).toHaveValue('0x7777777777777777777777777777777777777777');
  await expect(secondary.getByLabel('Rede')).toHaveValue('Polygon');
});

test('diálogo de acesso gerencia foco, fecha com Escape e funciona em tela móvel', async ({ page }) => {
  await page.goto('/login?redirect=%2Fnfts%2Fnft-001');
  const dialog = page.getByRole('dialog', { name: 'Entrar' });
  await expect(dialog.getByLabel('E-mail')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Senha', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/nfts\/nft-001$/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  const mobileDialog = page.getByRole('dialog', { name: 'Entrar' });
  await expect(mobileDialog.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegação móvel' })).toBeHidden();
  await mobileDialog.getByRole('link', { name: 'Novo na Kurio? Crie uma conta' }).click();
  await expect(page).toHaveURL(/\/cadastro$/);
  await expect(page.getByRole('dialog', { name: 'Criar perfil de colecionador' })
    .getByRole('button', { name: 'Criar perfil' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole('dialog').getByRole('link', { name: 'Já tem uma conta? Entre' }).click();
  await signIn(page, 'ana@kurio.test');
  await expect(page).toHaveURL(homeUrl);
  await page.goto('/perfil/carteiras');
  await expect(page.getByRole('heading', { name: 'Carteira principal' })).toBeVisible();
  const accountOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(accountOverflow).toBeLessThanOrEqual(0);
});
