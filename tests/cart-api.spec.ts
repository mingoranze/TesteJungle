import { setupServer } from 'msw/node';
import { expect, test } from '@playwright/test';
import { marketplaceHandlers } from '../src/mocks/marketplace-handlers';
import { readMarketplaceState, resetMarketplaceState } from '../src/mocks/marketplace-store';

const server = setupServer(...marketplaceHandlers);
const apiBaseUrl = 'http://localhost/api';

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
test.afterAll(() => server.close());
test.beforeEach(() => {
  resetMarketplaceState('default');
});

async function api(path: string, init: RequestInit = {}) {
  return fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
}

async function json(path: string, init: RequestInit = {}) {
  const response = await api(path, init);
  return { status: response.status, body: await response.json() };
}

async function login(email = 'ana@kurio.test') {
  const response = await api('/session/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'kurio-demo' }),
  });
  expect(response.status).toBe(200);
  return { Cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' };
}

test('carrinho do visitante respeita edição e disponibilidade, aplica cupom e cota com precisão decimal', async () => {
  expect((await json('/cart')).body).toMatchObject({ userId: null, items: [], couponCode: null, issues: [] });

  // nft-001 declara edições ['1/10', '1/10', '1/50', 'ABERTA']; a segunda edição limita a 10 unidades.
  let response = await json('/cart/items', {
    method: 'POST',
    body: JSON.stringify({ nftId: 'nft-001', editionId: 'nft-001-edition-02', quantity: 10 }),
  });
  expect(response.status).toBe(201);
  response = await json('/cart/items', {
    method: 'POST',
    body: JSON.stringify({ nftId: 'nft-001', editionId: 'nft-001-edition-02', quantity: 1 }),
  });
  expect(response).toMatchObject({ status: 409, body: { error: { code: 'AVAILABILITY_CONFLICT', details: { availableQuantity: 10 } } } });
  expect((await json('/cart/items', {
    method: 'POST',
    body: JSON.stringify({ nftId: 'nft-001', editionId: 'nft-001-edition-99', quantity: 1 }),
  })).status).toBe(404);

  // Outra edição do mesmo NFT divide a disponibilidade total (50).
  response = await json('/cart/items', {
    method: 'POST',
    body: JSON.stringify({ nftId: 'nft-001', editionId: 'nft-001-edition-04', quantity: 41 }),
  });
  expect(response).toMatchObject({ status: 409, body: { error: { details: { availableQuantity: 40 } } } });

  response = await json('/cart/items/nft-001', {
    method: 'PATCH',
    body: JSON.stringify({ editionId: 'nft-001-edition-02', quantity: 3 }),
  });
  expect(response.body.items).toEqual([
    { nftId: 'nft-001', editionId: 'nft-001-edition-02', quantity: 3, unitPriceEth: '1.19' },
  ]);
  await json('/cart/items', { method: 'POST', body: JSON.stringify({ nftId: 'nft-009', quantity: 2 }) });

  let quote = await json('/quotes', { method: 'POST', body: '{}' });
  expect(quote.body).toMatchObject({
    cartVersion: response.body.version + 1,
    couponCode: null,
    subtotalEth: '4.35',
    discountEth: '0',
    networkFeeEth: '0.016',
    totalEth: '4.366',
  });

  expect((await json('/cart/coupon', { method: 'PUT', body: JSON.stringify({ couponCode: 'NOPE' }) })).body)
    .toMatchObject({ error: { code: 'COUPON_INVALID' } });
  const withCoupon = await json('/cart/coupon', { method: 'PUT', body: JSON.stringify({ couponCode: 'welcome10' }) });
  expect(withCoupon.body).toMatchObject({ couponCode: 'WELCOME10' });
  quote = await json('/quotes', { method: 'POST', body: '{}' });
  expect(quote.body).toMatchObject({
    cartVersion: withCoupon.body.version,
    couponCode: 'WELCOME10',
    subtotalEth: '4.35',
    discountEth: '0.435',
    totalEth: '3.931',
  });

  const withoutCoupon = await json('/cart/coupon', { method: 'DELETE' });
  expect(withoutCoupon.body).toMatchObject({ couponCode: null });
  expect((await json('/quotes', { method: 'POST', body: '{}' })).body).toMatchObject({ discountEth: '0' });

  response = await json('/cart/items/nft-009', { method: 'DELETE' });
  expect(response.body.items).toHaveLength(1);
  expect(readMarketplaceState().carts.find(({ userId }) => userId === null)?.items).toHaveLength(1);
});

test('cupom expirado e cupom em carrinho vazio são recusados', async () => {
  expect((await json('/cart/coupon', { method: 'PUT', body: JSON.stringify({ couponCode: 'WELCOME10' }) })).body)
    .toMatchObject({ error: { code: 'CART_EMPTY' } });
  expect((await json('/mock/scenario', { method: 'POST', body: JSON.stringify({ scenario: 'coupon-expired' }) })).status).toBe(200);
  await json('/cart/items', { method: 'POST', body: JSON.stringify({ nftId: 'nft-009', quantity: 1 }) });
  const expired = await json('/cart/coupon', { method: 'PUT', body: JSON.stringify({ couponCode: 'WELCOME10' }) });
  expect(expired).toMatchObject({ status: 422, body: { error: { code: 'COUPON_EXPIRED' } } });
  expect((await json('/cart')).body.couponCode).toBeNull();
});

test('carrinho do visitante é incorporado ao autenticar sem perda nem duplicação', async () => {
  await json('/cart/items', {
    method: 'POST',
    body: JSON.stringify({ nftId: 'nft-001', editionId: 'nft-001-edition-03', quantity: 2 }),
  });
  await json('/cart/items', { method: 'POST', body: JSON.stringify({ nftId: 'nft-007', quantity: 1 }) });
  await json('/cart/coupon', { method: 'PUT', body: JSON.stringify({ couponCode: 'WELCOME10' }) });

  const cookie = await login();
  const cart = (await json('/cart', { headers: cookie })).body;
  expect(cart).toMatchObject({ userId: 'user-ana', couponCode: 'WELCOME10', issues: [] });
  expect(cart.items).toEqual([
    { nftId: 'nft-001', editionId: 'nft-001-edition-03', quantity: 4, unitPriceEth: '1.19' },
    { nftId: 'nft-005', editionId: 'nft-005-edition-01', quantity: 6, unitPriceEth: '1.39' },
    { nftId: 'nft-006', editionId: 'nft-006-edition-01', quantity: 9, unitPriceEth: '1.79' },
    { nftId: 'nft-007', editionId: 'nft-007-edition-01', quantity: 1, unitPriceEth: '0.99' },
  ]);
  // O MSW em Node guarda o cookie da sessão; o carrinho do visitante é conferido no estado simulado.
  expect(readMarketplaceState().carts.find(({ userId }) => userId === null))
    .toMatchObject({ items: [], couponCode: null });

  // Um novo login não reaplica itens já incorporados; outro usuário não recebe o carrinho da Ana.
  await login();
  expect((await json('/cart', { headers: cookie })).body.items).toHaveLength(4);
  const caio = await login('caio@kurio.test');
  expect((await json('/cart', { headers: caio })).body.items).toEqual([]);
});

test('mudança de preço e esgotamento geram divergências; cotação exige aceite e o aceite reconcilia', async () => {
  expect((await json('/mock/scenario', { method: 'POST', body: JSON.stringify({ scenario: 'price-change' }) })).status).toBe(200);
  const cookie = await login();
  const before = (await json('/quotes', { method: 'POST', headers: cookie, body: '{}' })).body;
  expect(before).toMatchObject({ subtotalEth: '26.83', networkFeeEth: '0.016', totalEth: '26.846' });

  const event = (await json('/mock/scenario/trigger', { method: 'POST', body: JSON.stringify({ nftId: 'nft-001' }) })).body;
  expect(event).toMatchObject({ version: 2, resource: { id: 'nft-001', priceEth: '1.29' } });

  const cart = (await json('/cart', { headers: cookie })).body;
  expect(cart.issues).toEqual([{
    nftId: 'nft-001',
    editionId: 'nft-001-edition-03',
    kinds: ['price-changed'],
    unitPriceEth: '1.19',
    currentPriceEth: '1.29',
    quantity: 2,
    availableQuantity: 50,
  }]);
  const stale = await json('/quotes', { method: 'POST', headers: cookie, body: '{}' });
  expect(stale).toMatchObject({ status: 409, body: { error: { code: 'CART_OUT_OF_DATE', details: { issues: cart.issues } } } });

  // Alterar quantidade não aceita silenciosamente o novo preço.
  const patched = (await json('/cart/items/nft-005', { method: 'PATCH', headers: cookie, body: JSON.stringify({ quantity: 5 }) })).body;
  expect(patched.issues).toHaveLength(1);

  const reconciled = (await json('/cart/reconcile', { method: 'POST', headers: cookie })).body;
  expect(reconciled.issues).toEqual([]);
  expect(reconciled.items[0]).toMatchObject({ nftId: 'nft-001', unitPriceEth: '1.29' });
  expect((await json('/quotes', { method: 'POST', headers: cookie, body: '{}' })).body)
    .toMatchObject({ cartVersion: reconciled.version, subtotalEth: '25.64', totalEth: '25.656' });

  expect((await json('/mock/scenario', { method: 'POST', body: JSON.stringify({ scenario: 'edition-sold-out' }) })).status).toBe(200);
  await json('/cart/items', { method: 'POST', body: JSON.stringify({ nftId: 'nft-004', quantity: 2 }) });
  await json('/cart/items', { method: 'POST', body: JSON.stringify({ nftId: 'nft-007', quantity: 1 }) });
  await json('/mock/scenario/trigger', { method: 'POST', body: JSON.stringify({ nftId: 'nft-004' }) });
  const soldOut = (await json('/cart')).body;
  expect(soldOut.issues).toMatchObject([{ nftId: 'nft-004', kinds: ['unavailable'], availableQuantity: 0 }]);
  const afterAccept = (await json('/cart/reconcile', { method: 'POST' })).body;
  expect(afterAccept.items.map(({ nftId }: { nftId: string }) => nftId)).toEqual(['nft-007']);
  expect(afterAccept.issues).toEqual([]);
});
