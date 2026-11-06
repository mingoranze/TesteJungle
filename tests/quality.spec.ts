import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const viewports = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

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
  await page.goto('/login?redirect=%2Fperfil');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('E-mail').fill('ana@kurio.test');
  await dialog.getByLabel('Senha', { exact: true }).fill('kurio-demo');
  await dialog.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/perfil$/);
}

async function assertNoHorizontalOverflow(page: Page, width: number, route: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `overflow horizontal em ${route} a ${width}px`).toBeLessThanOrEqual(0);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Kurio — início' }).waitFor();
  expect(await postJson(page, '/api/mock/reset', { scenario: 'default' })).toBe(200);
});

test('rotas principais não transbordam em 390, 768 e 1440 px', async ({ page }) => {
  await signIn(page);
  const routes = [
    '/',
    '/nfts/nft-001',
    '/carrinho',
    '/perfil',
    '/perfil/carteiras',
    '/perfil/favoritos',
    '/pagamento',
    '/pedidos/order-0002',
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(route);
      await expect(page.getByRole('main')).toBeVisible();
      await assertNoHorizontalOverflow(page, viewport.width, route);
    }
  }
});

test('telas principais passam a auditoria automatizada WCAG 2 A/AA e 2.1 A/AA', async ({ page }) => {
  await signIn(page);
  const routes = ['/', '/nfts/nft-001', '/carrinho', '/perfil', '/perfil/carteiras', '/pagamento'];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(route);
      await expect(page.getByRole('main')).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations, `${route} a ${viewport.width}px`).toEqual([]);
    }
  }
});

test('respeita a preferência por movimento reduzido', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const animationDuration = await page.evaluate(() => {
    const element = document.createElement('div');
    element.className = 'skeleton-shimmer';
    document.body.append(element);
    const duration = getComputedStyle(element).animationDuration;
    element.remove();
    return duration;
  });
  expect(Number.parseFloat(animationDuration)).toBeLessThan(0.01);
});
