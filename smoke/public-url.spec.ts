import { expect, test, type Page } from '@playwright/test';

/**
 * Smoke test do build publicado (PRD 9.2): acesso direto e refresh de todas as rotas,
 * rotas privadas com retorno pós-login, mocks REST, Socket.IO e compra ponta a ponta.
 * Execução: PUBLIC_URL=https://... npm run test:smoke
 */

async function mockPost(page: Page, path: string, body: unknown = {}) {
  return page.evaluate(async ([url, payload]) => {
    const response = await fetch(url as string, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.status;
  }, [path, body] as const);
}

async function waitForApp(page: Page) {
  await page.getByRole('link', { name: 'Kurio — início' }).first().waitFor();
}

async function waitForRealtime(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('data-realtime', 'connected', { timeout: 15_000 });
}

async function signIn(page: Page) {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('E-mail').fill('ana@kurio.test');
  await dialog.getByLabel('Senha', { exact: true }).fill('kurio-demo');
  await dialog.getByRole('button', { name: 'Entrar', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  expect(await mockPost(page, '/api/mock/reset', { scenario: 'default' })).toBe(200);
});

const publicRoutes: Array<[string, RegExp | string]> = [
  ['/', 'SEJA DONO DO FUTURO'],
  ['/?q=ape&sort=price-asc&page=1', 'Emerald Ape #042'],
  ['/nfts/nft-001', 'Emerald Ape #042'],
  ['/nfts/nao-existe', /não encontrado/i],
  ['/carrinho', /carrinho/i],
  ['/login', 'Entrar'],
  ['/cadastro', /Criar conta|Cadastr/i],
  ['/foundation', /Socket\.IO|REST/],
  ['/rota-que-nao-existe', 'Página não encontrada'],
];

for (const [path, marker] of publicRoutes) {
  test(`acesso direto e refresh: ${path}`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByText(marker).first()).toBeVisible();
    await page.reload();
    await expect(page.getByText(marker).first()).toBeVisible();
  });
}

const privateRoutes: Array<[string, RegExp | string]> = [
  ['/perfil', 'Ana Silva'],
  ['/perfil/carteiras', 'Carteira principal'],
  ['/perfil/favoritos', 'Emerald Ape #042'],
  ['/pagamento', 'Confirmar compra'],
  ['/pedidos/order-0002', /processamento|pendente/i],
  ['/pedidos/order-0001', /Seus NFTs agora estão na sua carteira/],
  ['/pedidos/order-0001/transacao', 'Explorador de blocos simulado'],
];

for (const [path, marker] of privateRoutes) {
  test(`rota privada redireciona, volta após login e sobrevive a refresh: ${path}`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/login\?redirect=/);
    await signIn(page);
    await expect(page).toHaveURL(new RegExp(`${path.replace(/[/.]/g, '\\$&')}$`));
    await expect(page.getByText(marker).first()).toBeVisible();
    await page.reload();
    await expect(page.getByText(marker).first()).toBeVisible();
  });
}

test('Socket.IO: nft.updated chega ao carrinho e bloqueia a cotação antiga', async ({ page }) => {
  expect(await mockPost(page, '/api/mock/scenario', { scenario: 'price-change' })).toBe(200);
  await page.goto('/login?redirect=%2Fcarrinho');
  await signIn(page);
  await expect(page).toHaveURL(/\/carrinho$/);
  await waitForRealtime(page);
  await expect(page.getByTestId('quote-total')).toHaveText('26.846 ETH');

  expect(await mockPost(page, '/api/mock/scenario/trigger', { nftId: 'nft-001' })).toBe(202);
  await expect(page.getByTestId('realtime-notice')).toContainText('preço atualizado de 1.19 para 1.29 ETH');
  await expect(page.getByRole('button', { name: 'Conectar e finalizar' })).toBeDisabled();
});

test('compra ponta a ponta até o recibo confirmado', async ({ page }) => {
  await page.goto('/login?redirect=%2Fpagamento');
  await signIn(page);
  await expect(page).toHaveURL(/\/pagamento$/);
  await waitForRealtime(page);
  await expect(page.getByTestId('quote-total')).toHaveText('26.846 ETH');

  await page.getByRole('button', { name: 'Confirmar compra' }).click();
  const review = page.getByTestId('review-dialog');
  await review.getByRole('button', { name: 'Conectar MetaMask' }).click();
  await expect(review.getByTestId('wallet-connection-status')).toContainText('MetaMask conectada');
  await review.getByTestId('confirm-payment').click();

  await expect(page).toHaveURL(/\/pedidos\/order-/);
  const receipt = page.getByTestId('receipt-dialog');
  await expect(receipt).toBeVisible({ timeout: 15_000 });
  await expect(receipt.getByTestId('receipt-total')).toHaveText('26.846 ETH');
  await page.reload();
  await expect(receipt.getByTestId('receipt-total')).toHaveText('26.846 ETH');
});
