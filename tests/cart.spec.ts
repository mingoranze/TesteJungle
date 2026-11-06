import { expect, test, type Page } from '@playwright/test';

async function mockPost(page: Page, path: string, body: unknown = {}) {
  return page.evaluate(async ([url, payload]) => {
    const response = await fetch(url as string, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) as Record<string, unknown> : {} };
  }, [path, body] as const);
}

async function signIn(page: Page, email = 'ana@kurio.test') {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('E-mail').fill(email);
  await dialog.getByLabel('Senha', { exact: true }).fill('kurio-demo');
  await dialog.getByRole('button', { name: 'Entrar', exact: true }).click();
}

async function waitForRealtime(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('data-realtime', 'connected');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Kurio — início' }).waitFor();
  expect((await mockPost(page, '/api/mock/reset', { scenario: 'default' })).status).toBe(200);
});

test('visitante adiciona, altera, aplica cupom e o carrinho sobrevive ao refresh', async ({ page }) => {
  await page.goto('/nfts/nft-001');
  await page.getByRole('button', { name: 'Aumentar quantidade' }).click();
  await page.getByRole('button', { name: 'Comprar', exact: true }).click();
  await expect(page).toHaveURL(/\/carrinho$/);
  await expect(page.getByRole('link', { name: 'Carrinho, 2 itens' })).toBeVisible();

  const row = page.getByTestId('cart-item').filter({ hasText: 'Emerald Ape #042' });
  await expect(row.getByText('ID do token: #0042')).toBeVisible();
  await expect(row.getByTestId('cart-line-total')).toHaveText('2.38 ETH');
  await expect(page.getByTestId('quote-subtotal')).toHaveText('2.38 ETH');
  await expect(page.getByTestId('quote-fee')).toHaveText('0.016 ETH');
  await expect(page.getByTestId('quote-total')).toHaveText('2.396 ETH');

  await row.getByRole('button', { name: 'Aumentar quantidade de Emerald Ape #042' }).click();
  await expect(row.getByTestId('cart-line-total')).toHaveText('3.57 ETH');
  await expect(page.getByTestId('quote-total')).toHaveText('3.586 ETH');

  const coupon = page.getByLabel('Código promocional');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByText('Informe o código promocional.')).toBeVisible();
  await coupon.fill('PROMO');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Cupom inválido' })).toBeVisible();
  await expect(coupon).toHaveAttribute('aria-invalid', 'true');
  await coupon.fill('WELCOME10');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByText('Cupom WELCOME10 aplicado.')).toBeVisible();
  await expect(page.getByTestId('quote-discount')).toHaveText('(-) 0.357');
  await expect(page.getByTestId('quote-total')).toHaveText('3.229 ETH');

  await page.reload();
  await expect(page.getByTestId('cart-item')).toHaveCount(1);
  await expect(page.getByTestId('cart-line-total')).toHaveText('3.57 ETH');
  await expect(page.getByText('Cupom WELCOME10 aplicado.')).toBeVisible();
  await expect(page.getByTestId('quote-total')).toHaveText('3.229 ETH');

  await page.getByRole('button', { name: 'Remover cupom' }).click();
  await expect(page.getByTestId('quote-discount')).toHaveText('(-) 00.00');
  await page.getByRole('button', { name: 'Remover Emerald Ape #042 do carrinho' }).click();
  await expect(page.getByText('Seu carrinho está vazio.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Conectar e finalizar' })).toBeDisabled();
});

test('limite de edição é respeitado e o resumo mostra skeleton enquanto a cotação carrega', async ({ page }) => {
  await page.goto('/nfts/nft-004');
  for (let step = 0; step < 3; step += 1) await page.getByRole('button', { name: 'Aumentar quantidade' }).click();
  await page.getByRole('button', { name: 'Comprar', exact: true }).click();
  await expect(page).toHaveURL(/\/carrinho$/);
  const row = page.getByTestId('cart-item').filter({ hasText: 'Cosmic Bloom #118' });
  await expect(row.getByRole('button', { name: 'Aumentar quantidade de Cosmic Bloom #118' })).toBeDisabled();

  await page.goto('/nfts/nft-004');
  await page.getByRole('button', { name: 'Comprar', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'excede as edições disponíveis' })).toBeVisible();

  // Falhas armadas vivem na memória da página: arma após carregar e navega sem recarregar.
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Carrinho, 4 itens' })).toBeVisible();
  expect((await mockPost(page, '/api/mock/fail-next', { method: 'POST', pathPrefix: '/api/quotes', count: 2, delayMs: 1200 })).status).toBe(201);
  await page.getByRole('link', { name: 'Carrinho, 4 itens' }).click();
  await expect(page.getByTestId('quote-skeleton')).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'temporariamente indisponível' })).toBeVisible({ timeout: 8_000 });
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByTestId('quote-total')).toHaveText('5.176 ETH');
});

test('itens do visitante são incorporados ao carrinho da conta ao entrar pelo checkout', async ({ page }) => {
  await page.goto('/nfts/nft-001');
  await page.getByRole('button', { name: 'Comprar', exact: true }).click();
  await expect(page).toHaveURL(/\/carrinho$/);
  await page.getByRole('button', { name: 'Conectar e finalizar' }).click();
  await expect(page).toHaveURL(/\/login\?redirect=%2Fcarrinho$/);
  await signIn(page);
  await expect(page).toHaveURL(/\/carrinho$/);

  await expect(page.getByTestId('cart-item')).toHaveCount(3);
  await expect(page.getByTestId('cart-item').filter({ hasText: 'Emerald Ape #042' }).getByTestId('cart-line-total'))
    .toHaveText('3.57 ETH');
  await expect(page.getByRole('link', { name: 'Carrinho, 18 itens' })).toBeVisible();
  await expect(page.getByTestId('quote-total')).toHaveText('28.036 ETH');

  await page.reload();
  await expect(page.getByTestId('cart-item')).toHaveCount(3);
  await page.getByRole('button', { name: 'Conectar e finalizar' }).click();
  await expect(page).toHaveURL(/\/pagamento$/);
  await expect(page.getByRole('heading', { name: 'Perfil do colecionador' })).toBeVisible();
  await expect(page.getByTestId('checkout-item')).toHaveCount(3);

  // Logout limpa o carrinho privado: o visitante volta a ver apenas o próprio carrinho (vazio).
  await page.goto('/perfil');
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('link', { name: 'Entrar' })).toBeVisible();
  await page.goto('/carrinho');
  await expect(page.getByText('Seu carrinho está vazio.')).toBeVisible();
});

test('nft.updated durante o carrinho informa a mudança e bloqueia a cotação antiga até o aceite', async ({ page }) => {
  expect((await mockPost(page, '/api/mock/scenario', { scenario: 'price-change' })).status).toBe(200);
  await page.goto('/login?redirect=%2Fcarrinho');
  await signIn(page);
  await expect(page).toHaveURL(/\/carrinho$/);
  await waitForRealtime(page);
  await expect(page.getByTestId('quote-total')).toHaveText('26.846 ETH');

  const trigger = await mockPost(page, '/api/mock/scenario/trigger', { nftId: 'nft-001' });
  expect(trigger.status).toBe(202);

  await expect(page.getByTestId('realtime-notice')).toContainText('Emerald Ape #042: preço atualizado de 1.19 para 1.29 ETH');
  const issues = page.getByTestId('cart-issues');
  await expect(issues).toContainText('Emerald Ape #042: preço mudou de 1.19 para 1.29 ETH');
  await expect(page.getByTestId('quote-summary')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Conectar e finalizar' })).toBeDisabled();

  await page.getByRole('button', { name: 'Aceitar alterações e recalcular' }).click();
  await expect(issues).toHaveCount(0);
  await expect(page.getByTestId('cart-item').filter({ hasText: 'Emerald Ape #042' }).getByTestId('cart-line-total'))
    .toHaveText('2.58 ETH');
  await expect(page.getByTestId('quote-total')).toHaveText('27.046 ETH');
  await expect(page.getByRole('button', { name: 'Conectar e finalizar' })).toBeEnabled();
});

test('edição esgotada por evento é removida ao aceitar e o catálogo reflete a disponibilidade', async ({ page }) => {
  expect((await mockPost(page, '/api/mock/scenario', { scenario: 'edition-sold-out' })).status).toBe(200);
  expect((await mockPost(page, '/api/cart/items', { nftId: 'nft-004', quantity: 1 })).status).toBe(201);
  expect((await mockPost(page, '/api/cart/items', { nftId: 'nft-007', quantity: 1 })).status).toBe(201);
  await page.goto('/carrinho');
  await waitForRealtime(page);
  await expect(page.getByTestId('cart-item')).toHaveCount(2);

  await mockPost(page, '/api/mock/scenario/trigger', { nftId: 'nft-004' });
  await expect(page.getByTestId('realtime-notice')).toContainText('Cosmic Bloom #118 esgotou');
  await expect(page.getByTestId('cart-issues')).toContainText('esgotado — será removido');
  await page.getByRole('button', { name: 'Aceitar alterações e recalcular' }).click();
  await expect(page.getByTestId('cart-item')).toHaveCount(1);
  await expect(page.getByTestId('quote-total')).toHaveText('1.006 ETH');

  await page.goto('/nfts/nft-004');
  await expect(page.getByRole('button', { name: 'Comprar', exact: true })).toBeDisabled();
});

test('detalhe ignora eventos duplicados ou antigos e reconcilia via REST após reconexão', async ({ page }) => {
  expect((await mockPost(page, '/api/mock/scenario', { scenario: 'price-change' })).status).toBe(200);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/nfts/nft-004');
  await waitForRealtime(page);
  const detail = page.getByRole('region', { name: 'Cosmic Bloom #118' });
  await expect(detail.getByText('1.29 ETH', { exact: true })).toBeVisible();

  const first = await mockPost(page, '/api/mock/scenario/trigger', { nftId: 'nft-004' });
  await expect(detail.getByText('1.39 ETH', { exact: true })).toBeVisible();
  const second = await mockPost(page, '/api/mock/scenario/trigger', { nftId: 'nft-004' });
  await expect(detail.getByText('1.49 ETH', { exact: true })).toBeVisible();
  await expect(detail.getByText('O preço foi atualizado de 1.39 para 1.49 ETH.')).toBeVisible();

  // Reenvio do evento antigo (v3) e duplicata do atual (v4): nada regride nem gera novo aviso.
  expect((await mockPost(page, '/api/mock/socket/replay', { eventId: first.body.eventId })).status).toBe(202);
  expect((await mockPost(page, '/api/mock/socket/replay', { eventId: second.body.eventId })).status).toBe(202);
  await page.waitForTimeout(800);
  await expect(detail.getByText('1.49 ETH', { exact: true })).toBeVisible();
  await expect(detail.getByText('O preço foi atualizado de 1.39 para 1.49 ETH.')).toBeVisible();

  // Desconexão: o evento publicado sem conexão se perde e é recuperado pela reconciliação REST.
  expect((await mockPost(page, '/api/mock/socket/disconnect')).status).toBe(204);
  await mockPost(page, '/api/mock/scenario/trigger', { nftId: 'nft-004' });
  await waitForRealtime(page);
  await expect(detail.getByText('1.59 ETH', { exact: true })).toBeVisible();
});

test('carrinho mobile segue o frame: cartões, resumo fixo e sem navegação inferior', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const nftId of ['nft-001', 'nft-005', 'nft-006', 'nft-007']) {
    expect((await mockPost(page, '/api/cart/items', { nftId, quantity: 1 })).status).toBe(201);
  }
  await page.goto('/carrinho');
  await expect(page.getByRole('heading', { name: 'Carrinho de NFTs' })).toBeVisible();
  await expect(page.getByTestId('cart-item')).toHaveCount(4);
  await expect(page.getByText('Edição: 1/10').first()).toBeVisible();
  await expect(page.getByTestId('quote-total')).toHaveText('5.376 ETH');
  await expect(page.getByRole('navigation', { name: 'Navegação móvel' })).toHaveCount(0);

  const summary = page.getByRole('complementary', { name: 'Resumo da carteira' });
  const box = await summary.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(844);
  await expect(page.getByRole('button', { name: 'Conectar e finalizar' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.setViewportSize({ width: 768, height: 1024 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(768);
  await expect(page.getByRole('heading', { name: 'Colecionadores também viram' })).toBeVisible();
});
