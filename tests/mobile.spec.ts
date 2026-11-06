import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function postJson(page: Page, path: string, body: unknown) {
  return page.evaluate(async ([url, payload]) => {
    const response = await fetch(url as string, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.status;
  }, [path, body] as const);
}

async function signIn(page: Page) {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('E-mail').fill('ana@kurio.test');
  await dialog.getByLabel('Senha', { exact: true }).fill('kurio-demo');
  await dialog.getByRole('button', { name: 'Entrar', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
  expect(await postJson(page, '/api/mock/reset', { scenario: 'default' })).toBe(200);
});

test('mobile percorre catálogo, carrinho e checkout até o recibo confirmado', async ({ page }) => {
  await page.goto('/nfts/nft-001');
  await page.getByRole('button', { name: 'Comprar NFT' }).click();
  await expect(page).toHaveURL(/\/carrinho$/);
  await expect(page.getByTestId('cart-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Conectar e finalizar' }).click();
  await expect(page).toHaveURL(/\/login\?redirect=%2Fcarrinho$/);

  await signIn(page);
  await expect(page).toHaveURL(/\/carrinho$/);
  await expect(page.getByTestId('cart-item')).toHaveCount(3);
  await page.getByRole('button', { name: 'Conectar e finalizar' }).click();
  await expect(page).toHaveURL(/\/pagamento$/);
  await expect(page.getByTestId('checkout-mobile-total')).toContainText('28.036 ETH');

  await page.getByRole('button', { name: 'Confirmar compra' }).click();
  const review = page.getByTestId('review-dialog');
  await expect(review).toBeVisible();
  await review.getByRole('button', { name: 'Conectar MetaMask' }).click();
  await expect(review.getByTestId('wallet-connection-status')).toContainText('MetaMask conectada');
  await review.getByTestId('confirm-payment').click();
  await expect(page.getByTestId('order-pending')).toBeVisible();

  const receipt = page.getByTestId('receipt-dialog');
  await expect(receipt).toBeVisible({ timeout: 10_000 });
  await expect(receipt.getByTestId('receipt-total')).toHaveText('28.036 ETH');
  await expect(receipt.getByTestId('order-item')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations, 'recibo mobile').toEqual([]);
});

test('perfil e carteiras permanecem acessíveis em viewport mobile', async ({ page }) => {
  await page.goto('/login?redirect=%2Fperfil');
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Perfil do colecionador' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole('navigation', { name: 'Menu do perfil' }).getByRole('link', { name: 'Carteiras' }).click();
  await expect(page.getByRole('heading', { name: 'Carteira principal' })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Carteira principal' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
