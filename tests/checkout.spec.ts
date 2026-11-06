import { expect, test, type Page } from '@playwright/test';

async function mockRequest(page: Page, path: string, body: unknown = {}, method = 'POST') {
  return page.evaluate(async ([url, payload, verb]) => {
    const response = await fetch(url as string, {
      method: verb as string,
      headers: { 'Content-Type': 'application/json' },
      body: verb === 'GET' ? undefined : JSON.stringify(payload),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) as unknown : {} };
  }, [path, body, method] as const);
}

async function selectScenario(page: Page, scenario: string) {
  expect((await mockRequest(page, '/api/mock/scenario', { scenario })).status).toBe(200);
}

async function signInToCheckout(page: Page) {
  await page.goto('/login?redirect=%2Fpagamento');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('E-mail').fill('ana@kurio.test');
  await dialog.getByLabel('Senha', { exact: true }).fill('kurio-demo');
  await dialog.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/pagamento$/);
  await expect(page.getByTestId('quote-total')).toHaveText('26.846 ETH');
  await expect(page.locator('html')).toHaveAttribute('data-realtime', 'connected');
}

async function openReviewAndConnect(page: Page) {
  await page.getByRole('button', { name: 'Confirmar compra' }).click();
  const review = page.getByTestId('review-dialog');
  await expect(review).toBeVisible();
  await expect(review.getByTestId('quote-total')).toHaveText('26.846 ETH');
  await review.getByRole('button', { name: 'Conectar MetaMask' }).click();
  await expect(review.getByTestId('wallet-connection-status')).toContainText('MetaMask conectada');
  return review;
}

async function ordersCount(page: Page) {
  const response = await mockRequest(page, '/api/orders', {}, 'GET');
  return (response.body as unknown[]).length;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Kurio — início' }).waitFor();
  expect((await mockRequest(page, '/api/mock/reset', { scenario: 'default' })).status).toBe(200);
});

test('compra ponta a ponta: revisão, conexão, pedido pendente, confirmação e recibo com snapshot', async ({ page }) => {
  await signInToCheckout(page);
  await expect(page.getByLabel('Nome de exibição')).toHaveValue('Ana Silva');
  await expect(page.getByLabel('Endereço da carteira')).toHaveValue('0x1111111111111111111111111111111111111111');
  await expect(page.getByTestId('checkout-item')).toHaveCount(3);

  const review = await openReviewAndConnect(page);
  await expect(review.getByTestId('review-wallet')).toContainText('Cofre da Ana');
  await review.getByTestId('confirm-payment').click();

  await expect(page).toHaveURL(/\/pedidos\/order-/);
  await expect(page.getByTestId('order-pending')).toBeVisible();
  // A confirmação só aparece depois da confirmação simulada, recebida por Socket.IO.
  const receipt = page.getByTestId('receipt-dialog');
  await expect(receipt).toBeVisible({ timeout: 10_000 });
  await expect(receipt.getByRole('heading', { name: 'Seus NFTs agora estão na sua carteira' })).toBeVisible();
  await expect(receipt.getByTestId('order-item')).toHaveCount(3);
  await expect(receipt.getByTestId('receipt-total')).toHaveText('26.846 ETH');
  await expect(receipt.getByTestId('receipt-3')).toHaveText('MetaMask');
  const cart = await mockRequest(page, '/api/cart', {}, 'GET');
  expect((cart.body as { items: unknown[] }).items).toEqual([]);

  // Mudança posterior do catálogo não altera o recibo (snapshot).
  await selectScenarioKeepingState(page);
  await page.reload();
  await expect(receipt.getByTestId('receipt-total')).toHaveText('26.846 ETH');
  await expect(receipt.getByText('Emerald Ape #042')).toBeVisible();

  await receipt.getByRole('link', { name: 'Ver no Etherscan (explorador simulado)' }).click();
  await expect(page.getByRole('heading', { name: 'Explorador de blocos simulado' })).toBeVisible();
  await expect(page.getByTestId('tx-hash')).toHaveText(/^0x[a-f\d]{64}$/);
});

/** Altera um NFT comprado pelo gatilho de preço sem trocar de cenário (o estado é preservado). */
async function selectScenarioKeepingState(page: Page) {
  await page.evaluate(() => {
    const key = 'kurio.marketplace.state.v1';
    const state = JSON.parse(localStorage.getItem(key) ?? '{}');
    const nft = state.nfts.find((item: { id: string }) => item.id === 'nft-001');
    nft.title = 'Título alterado depois da compra';
    nft.priceEth = '9.99';
    nft.version += 1;
    localStorage.setItem(key, JSON.stringify(state));
  });
}

test('pagamento recusado é terminal, informa a falha e preserva o carrinho', async ({ page }) => {
  await selectScenario(page, 'payment-refused');
  await signInToCheckout(page);
  const review = await openReviewAndConnect(page);
  await review.getByTestId('confirm-payment').click();
  await expect(page.getByTestId('order-refused')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('alert')).toContainText('Nenhum valor foi cobrado');
  await expect(page.getByTestId('receipt-dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Voltar ao carrinho' }).click();
  await expect(page.getByTestId('cart-item')).toHaveCount(3);
  await expect(page.getByRole('link', { name: 'Carrinho, 17 itens' })).toBeVisible();
});

test('carteira recusa a conexão e desconexão no envio exige reconectar sem criar pedido', async ({ page }) => {
  await selectScenario(page, 'wallet-connection-refused');
  await signInToCheckout(page);
  await page.getByRole('button', { name: 'Confirmar compra' }).click();
  const review = page.getByTestId('review-dialog');
  await review.getByRole('button', { name: 'Conectar MetaMask' }).click();
  await expect(review.getByRole('alert')).toContainText('A conexão foi recusada na MetaMask');
  await expect(review.getByTestId('confirm-payment')).toBeDisabled();

  await page.keyboard.press('Escape');
  await expect(review).toHaveCount(0);
  await selectScenario(page, 'wallet-disconnect');
  await signInToCheckout(page);
  const second = await openReviewAndConnect(page);
  await second.getByTestId('confirm-payment').click();
  await expect(second.getByRole('alert')).toContainText('foi desconectada antes do envio');
  await expect(second.getByRole('button', { name: 'Conectar MetaMask' })).toBeVisible();
  await second.getByRole('button', { name: 'Conectar MetaMask' }).click();
  await second.getByRole('button', { name: 'Desconectar' }).click();
  await expect(second.getByRole('status').filter({ hasText: 'MetaMask desconectada' })).toBeVisible();
  expect(await ordersCount(page)).toBe(2);
});

test('timeout após criar e cliques repetidos recuperam o mesmo pedido pela chave de idempotência', async ({ page }) => {
  await selectScenario(page, 'order-timeout-after-create');
  await signInToCheckout(page);
  const review = await openReviewAndConnect(page);
  await review.getByTestId('confirm-payment').dblclick();
  // A primeira resposta expira (504); a retentativa automática usa a mesma chave e recupera o pedido.
  await expect(page).toHaveURL(/\/pedidos\/order-/, { timeout: 10_000 });
  await expect(page.getByTestId('receipt-dialog')).toBeVisible({ timeout: 10_000 });
  // Pedido criado no servidor uma única vez apesar do duplo clique e da retentativa.
  expect(await ordersCount(page)).toBe(3);
});

test('pedido pendente retoma após refresh e desconexão; confirmação chega pela reconciliação', async ({ page }) => {
  await selectScenario(page, 'order-confirm');
  await signInToCheckout(page);
  const review = await openReviewAndConnect(page);
  await review.getByTestId('confirm-payment').click();
  await expect(page.getByTestId('order-pending')).toBeVisible();
  const orderId = page.url().split('/pedidos/')[1];

  await page.reload();
  await expect(page.getByTestId('order-pending')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-realtime', 'connected');

  // Novo checkout para o mesmo carrinho aponta para o pedido em andamento em vez de criar outro.
  await page.goto('/pagamento');
  await expect(page.getByRole('link', { name: 'Acompanhar pedido' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar compra' })).toBeDisabled();
  await page.getByRole('link', { name: 'Acompanhar pedido' }).click();
  await expect(page.getByTestId('order-pending')).toBeVisible();

  // Queda do socket: a confirmação acontece sem conexão e é recuperada pelo REST ao reconectar.
  await expect(page.locator('html')).toHaveAttribute('data-realtime', 'connected');
  await mockRequest(page, '/api/mock/socket/disconnect');
  expect((await mockRequest(page, '/api/mock/scenario/trigger', { orderId })).status).toBe(202);
  await expect(page.getByTestId('receipt-dialog')).toBeVisible({ timeout: 10_000 });
  expect(await ordersCount(page)).toBe(3);
});

test('mudança de preço por Socket.IO durante a revisão exige aceitar e confirmar novos valores', async ({ page }) => {
  await selectScenario(page, 'price-change');
  await signInToCheckout(page);
  const review = await openReviewAndConnect(page);
  expect((await mockRequest(page, '/api/mock/scenario/trigger', { nftId: 'nft-005' })).status).toBe(202);
  await expect(review.getByTestId('review-issues')).toContainText('Violet Nomad #314');
  await expect(review.getByTestId('confirm-payment')).toBeDisabled();

  await review.getByRole('button', { name: 'Aceitar alterações e recalcular' }).click();
  await expect(review.getByTestId('review-quote-changed')).toContainText('novo total: 27.446 ETH');
  await expect(review.getByTestId('confirm-payment')).toBeDisabled();
  await review.getByRole('button', { name: 'Confirmar novos valores' }).click();
  await expect(review.getByTestId('confirm-payment')).toHaveText('Pagar 27.446 ETH');
  await review.getByTestId('confirm-payment').click();
  await expect(page.getByTestId('receipt-dialog').getByTestId('receipt-total')).toHaveText('27.446 ETH', { timeout: 10_000 });
});

test('formulário valida campos, leva o foco ao erro e o diálogo de revisão fecha com Escape', async ({ page }) => {
  await signInToCheckout(page);
  await page.getByLabel('E-mail').fill('email-invalido');
  await page.getByLabel('Endereço da carteira').fill('0x9999999999999999999999999999999999999999');
  await page.getByRole('button', { name: 'Confirmar compra' }).click();
  await expect(page.getByLabel('Endereço da carteira')).toBeFocused();
  await expect(page.getByLabel('Endereço da carteira')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Use o endereço de uma carteira cadastrada')).toBeVisible();
  await expect(page.getByText('Informe um e-mail válido.')).toBeVisible();
  await expect(page.getByTestId('review-dialog')).toHaveCount(0);

  // "Usar outra carteira?" preenche a carteira secundária, cadastrada na Polygon.
  await page.getByLabel('Usar outra carteira?').check();
  await expect(page.getByLabel('Endereço da carteira')).toHaveValue('0x2222222222222222222222222222222222222222');
  await expect(page.locator('#checkout-network')).toHaveValue('Polygon');
  await page.getByLabel('E-mail').fill('ana@kurio.test');
  await page.getByRole('button', { name: 'Confirmar compra' }).click();
  const review = page.getByTestId('review-dialog');
  await expect(review).toBeVisible();
  await expect(review).toContainText('Polygon');
  await page.keyboard.press('Escape');
  await expect(review).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Confirmar compra' })).toBeFocused();
});

test('pagamento mobile segue o frame: carteiras cadastradas, provedores, total e botão fixo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInToCheckout(page);
  await expect(page.getByRole('heading', { name: 'Pagamento com carteira' })).toBeVisible();
  await expect(page.getByTestId('checkout-wallet-card')).toHaveCount(2);
  await expect(page.getByTestId('checkout-mobile-total')).toContainText('26.846 ETH');
  await expect(page.getByRole('navigation', { name: 'Navegação móvel' })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.locator('#provider-mobile-Coinbase').check();
  await expect(page.locator('#provider-mobile-Coinbase')).toBeChecked();
  await page.getByText('Reserva').click();
  await page.getByRole('button', { name: 'Confirmar compra' }).click();
  // A carteira secundária usa WalletConnect no cadastro; a escolha do provedor é refeita pelo preenchimento.
  await expect(page.getByTestId('review-dialog')).toContainText('Polygon');
});
