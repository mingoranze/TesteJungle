import { expect, test, type Page } from '@playwright/test';

async function resetMocks(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
  const status = await page.evaluate(async () => {
    const response = await fetch('/api/mock/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'default' }),
    });
    return response.status;
  });
  expect(status).toBe(200);
}

async function capture(page: Page, name: string) {
  await expect(page.getByRole('main')).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: 'disabled',
    caret: 'hide',
    fullPage: true,
  });
}

async function signIn(page: Page) {
  await page.goto('/login?redirect=%2Fpagamento');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('E-mail').fill('ana@kurio.test');
  await dialog.getByLabel('Senha', { exact: true }).fill('kurio-demo');
  await dialog.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/pagamento$/);
}

test.beforeEach(async ({ page }) => resetMocks(page));

test('baseline visual: início', async ({ page }) => {
  await page.goto('/');
  await capture(page, 'home');
});

test('baseline visual: detalhe', async ({ page }) => {
  await page.goto('/nfts/nft-001');
  await capture(page, 'detail');
});

test('baseline visual: carrinho', async ({ page }) => {
  await page.goto('/carrinho');
  await capture(page, 'cart');
});

test('baseline visual: pagamento', async ({ page }) => {
  await signIn(page);
  await capture(page, 'payment');
});
