import { setupServer } from 'msw/node';
import { expect, test } from '@playwright/test';
import { marketplaceHandlers } from '../src/mocks/marketplace-handlers';
import { ORDER_SETTLEMENT_DELAY_MS } from '../src/mocks/marketplace-order-settlement';
import { readMarketplaceState, resetMarketplaceState, updateMarketplaceState } from '../src/mocks/marketplace-store';
import { anaPrimaryWallet, connectWallet, reviewedOrderBody } from './support/order-request';

const server = setupServer(...marketplaceHandlers);
const apiBaseUrl = 'http://localhost/api';

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
test.afterAll(() => server.close());
test.beforeEach(async () => {
  // O reset via API também limpa conexões de carteira e timers de liquidação do mock.
  await api('/mock/reset', { method: 'POST', body: '{}' });
  resetMarketplaceState('default');
});

async function api(path: string, init: RequestInit = {}) {
  return fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
}

async function login(email = 'ana@kurio.test') {
  const response = await api('/session/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'kurio-demo' }),
  });
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')?.split(';')[0] as string;
}

async function selectScenario(scenario: string) {
  expect((await api('/mock/scenario', { method: 'POST', body: JSON.stringify({ scenario }) })).status).toBe(200);
}

function postOrder(cookie: string, key: string, body: unknown) {
  return api('/orders', {
    method: 'POST',
    headers: { Cookie: cookie, 'Idempotency-Key': key },
    body: JSON.stringify(body),
  });
}

async function waitForStatus(cookie: string, orderId: string, status: string) {
  await expect.poll(async () => (await (await api(`/orders/${orderId}`, { headers: { Cookie: cookie } })).json()).status, {
    timeout: ORDER_SETTLEMENT_DELAY_MS + 3_000,
  }).toBe(status);
}

test('conexão de carteira valida posse e rede e simula recusa do provedor', async () => {
  const cookie = await login();
  const connect = (body: unknown) => api('/wallet-connections', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify(body) });

  expect((await connect({ walletId: 'wallet-caio-main', provider: 'MetaMask', network: 'Ethereum' })).status).toBe(404);
  const mismatch = await connect({ walletId: 'wallet-ana-main', provider: 'MetaMask', network: 'Polygon' });
  expect(mismatch.status).toBe(422);
  expect((await mismatch.json()).error.code).toBe('NETWORK_MISMATCH');
  const connected = await connect({ walletId: 'wallet-ana-main', provider: 'MetaMask', network: 'Ethereum' });
  expect(connected.status).toBe(201);
  expect(await connected.json()).toMatchObject({ walletId: 'wallet-ana-main', address: anaPrimaryWallet.address });

  await selectScenario('wallet-connection-refused');
  const refusedCookie = await login();
  const refused = await api('/wallet-connections', {
    method: 'POST',
    headers: { Cookie: refusedCookie },
    body: JSON.stringify({ walletId: 'wallet-ana-main', provider: 'MetaMask', network: 'Ethereum' }),
  });
  expect(refused.status).toBe(422);
  expect((await refused.json()).error.code).toBe('WALLET_CONNECTION_REJECTED');
});

test('pedido exige carteira conectada e é recuperável pela chave mesmo após desconexão', async () => {
  const cookie = await login();
  const connection = await connectWallet(api, cookie);
  const body = await reviewedOrderBody(api, cookie, connection.id);

  const notConnected = await postOrder(cookie, 'no-connection', { ...body, connectionId: 'conn-inexistente' });
  expect(notConnected.status).toBe(409);
  expect((await notConnected.json()).error.code).toBe('WALLET_DISCONNECTED');

  const created = await postOrder(cookie, 'with-connection', body);
  expect(created.status).toBe(201);
  const { order } = await created.json();
  await api(`/wallet-connections/${connection.id}`, { method: 'DELETE', headers: { Cookie: cookie } });
  // Reenvio após a queda da conexão: mesma chave e mesmo conteúdo recuperam o mesmo pedido.
  const retry = await postOrder(cookie, 'with-connection', body);
  expect(retry.status).toBe(200);
  expect((await retry.json()).order.id).toBe(order.id);

  // Um segundo pedido para o mesmo carrinho enquanto o primeiro está pendente é bloqueado.
  const again = await connectWallet(api, cookie);
  const duplicate = await postOrder(cookie, 'another-key', { ...body, connectionId: again.id });
  expect(duplicate.status).toBe(409);
  expect(await duplicate.json()).toMatchObject({ error: { code: 'ORDER_ALREADY_PENDING', details: { orderId: order.id } } });
});

test('cenário de desconexão no envio exige reconectar', async () => {
  await selectScenario('wallet-disconnect');
  const cookie = await login();
  const connection = await connectWallet(api, cookie);
  const response = await postOrder(cookie, 'disconnect', await reviewedOrderBody(api, cookie, connection.id));
  expect(response.status).toBe(409);
  expect((await response.json()).error.code).toBe('WALLET_DISCONNECTED');
  expect(readMarketplaceState().orders).toHaveLength(2);
});

test('revalida total, cupom, versão do carrinho e disponibilidade antes de criar o pedido', async () => {
  const cookie = await login();
  const connection = await connectWallet(api, cookie);
  const body = await reviewedOrderBody(api, cookie, connection.id);
  expect(body.expectedTotalEth).toBe('26.846');

  const wrongTotal = await postOrder(cookie, 'wrong-total', { ...body, expectedTotalEth: '26.000' });
  expect(wrongTotal.status).toBe(409);
  expect(await wrongTotal.json()).toMatchObject({ error: { code: 'QUOTE_CHANGED', details: { quote: { totalEth: '26.846' } } } });
  expect((await postOrder(cookie, 'stale-version', { ...body, cartVersion: body.cartVersion - 1 })).status).toBe(409);

  // Cupom aplicado depois da revisão: a confirmação antiga não vale mais.
  expect((await api('/cart/coupon', { method: 'PUT', headers: { Cookie: cookie }, body: JSON.stringify({ couponCode: 'WELCOME10' }) })).status).toBe(200);
  const couponChanged = await postOrder(cookie, 'coupon-changed', body);
  expect((await couponChanged.json()).error.code).toBe('QUOTE_CHANGED');

  // Mudança de preço concorrente: o carrinho fica divergente e o pedido é recusado com as divergências.
  updateMarketplaceState((draft) => {
    const nft = draft.nfts.find(({ id }) => id === 'nft-005');
    if (!nft) throw new Error('NFT ausente');
    nft.priceEth = '1.49' as typeof nft.priceEth;
    nft.version += 1;
  });
  const outOfDate = await postOrder(cookie, 'out-of-date', { ...body, couponCode: 'WELCOME10' });
  expect(outOfDate.status).toBe(409);
  expect(await outOfDate.json()).toMatchObject({ error: { code: 'CART_OUT_OF_DATE' } });

  const invalidCollector = await postOrder(cookie, 'invalid-collector', {
    ...body,
    collector: { ...body.collector, email: 'invalido', ensName: 'sem-sufixo' },
  });
  expect(invalidCollector.status).toBe(400);
  expect((await invalidCollector.json()).error.details.fields).toMatchObject({ email: expect.any(String), ensName: expect.any(String) });
  expect(readMarketplaceState().orders).toHaveLength(2);
});

test('confirmação automática gera recibo com snapshot e remove do carrinho só o que foi comprado', async () => {
  const cookie = await login();
  const connection = await connectWallet(api, cookie);
  const body = await reviewedOrderBody(api, cookie, connection.id);
  const { order } = await (await postOrder(cookie, 'auto-confirm', body)).json();
  expect(order).toMatchObject({
    status: 'pendente',
    network: 'Ethereum',
    provider: 'MetaMask',
    quote: { totalEth: '26.846' },
    items: [
      expect.objectContaining({ title: 'Emerald Ape #042', quantity: 2, lineTotalEth: '2.38' }),
      expect.objectContaining({ title: 'Violet Nomad #314', quantity: 6, lineTotalEth: '8.34' }),
      expect.objectContaining({ title: 'Ivory Baron #088', quantity: 9, lineTotalEth: '16.11' }),
    ],
  });
  expect((await api(`/orders/${order.id}/receipt`, { headers: { Cookie: cookie } })).status).toBe(404);

  // Enquanto o pedido está pendente o usuário adiciona outro NFT: ele não pode ser removido na confirmação.
  expect((await api('/cart/items', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ nftId: 'nft-007', quantity: 1 }) })).status).toBe(201);
  const stockBefore = readMarketplaceState().nfts.find(({ id }) => id === 'nft-001')?.availableEditions ?? 0;

  await waitForStatus(cookie, order.id, 'confirmado');
  const confirmed = await (await api(`/orders/${order.id}`, { headers: { Cookie: cookie } })).json();
  expect(confirmed).toMatchObject({ status: 'confirmado', version: 2, failureReason: null });
  const cart = await (await api('/cart', { headers: { Cookie: cookie } })).json();
  expect(cart.items).toEqual([expect.objectContaining({ nftId: 'nft-007', quantity: 1 })]);
  expect(readMarketplaceState().nfts.find(({ id }) => id === 'nft-001')?.availableEditions).toBe(stockBefore - 2);

  // Alteração posterior do catálogo não muda o recibo.
  updateMarketplaceState((draft) => {
    const nft = draft.nfts.find(({ id }) => id === 'nft-001');
    if (!nft) throw new Error('NFT ausente');
    nft.title = 'Título alterado';
    nft.priceEth = '9.99' as typeof nft.priceEth;
    nft.version += 1;
  });
  const receipt = await (await api(`/orders/${order.id}/receipt`, { headers: { Cookie: cookie } })).json();
  expect(receipt).toMatchObject({
    orderId: order.id,
    walletAddress: anaPrimaryWallet.address,
    network: 'Ethereum',
    provider: 'MetaMask',
    quote: { totalEth: '26.846', networkFeeEth: '0.016' },
    items: [expect.objectContaining({ title: 'Emerald Ape #042', unitPriceEth: '1.19' }), expect.anything(), expect.anything()],
  });
  expect(receipt.transactionReference).toMatch(/^0x[a-f\d]{64}$/);
});

test('pagamento recusado é terminal e preserva o carrinho', async () => {
  await selectScenario('payment-refused');
  const cookie = await login();
  const cartBefore = await (await api('/cart', { headers: { Cookie: cookie } })).json();
  const connection = await connectWallet(api, cookie);
  const { order } = await (await postOrder(cookie, 'refused', await reviewedOrderBody(api, cookie, connection.id))).json();
  await waitForStatus(cookie, order.id, 'recusado');
  expect(await (await api(`/orders/${order.id}`, { headers: { Cookie: cookie } })).json())
    .toMatchObject({ status: 'recusado', failureReason: 'PAYMENT_REFUSED' });
  expect((await api(`/orders/${order.id}/receipt`, { headers: { Cookie: cookie } })).status).toBe(404);
  const cartAfter = await (await api('/cart', { headers: { Cookie: cookie } })).json();
  expect(cartAfter.items).toEqual(cartBefore.items);

  // Depois da recusa, uma nova tentativa (nova chave) é permitida para o mesmo carrinho.
  const retryConnection = await connectWallet(api, cookie);
  expect((await postOrder(cookie, 'refused-retry', await reviewedOrderBody(api, cookie, retryConnection.id))).status).toBe(201);
});

test('liquidação vencida é aplicada na leitura (refresh do mock sem timer ativo)', async () => {
  await selectScenario('order-confirm');
  const cookie = await login();
  const connection = await connectWallet(api, cookie);
  const { order } = await (await postOrder(cookie, 'manual', await reviewedOrderBody(api, cookie, connection.id))).json();
  expect(readMarketplaceState().orderSettlements[order.id]).toBeUndefined();

  // Simula um snapshot persistido com liquidação vencida e nenhum timer em memória.
  updateMarketplaceState((draft) => {
    draft.orderSettlements[order.id] = Date.now() - 1;
  });
  const read = await (await api(`/orders/${order.id}`, { headers: { Cookie: cookie } })).json();
  expect(read).toMatchObject({ status: 'confirmado', version: 2 });
  expect(readMarketplaceState().orderSettlements).toEqual({});
});
