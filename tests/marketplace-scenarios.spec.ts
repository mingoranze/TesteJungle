import { setupServer } from 'msw/node';
import { expect, test } from '@playwright/test';
import { marketplaceHandlers } from '../src/mocks/marketplace-handlers';
import { resetMarketplaceState } from '../src/mocks/marketplace-store';
import { marketplaceNetworkScenarios } from '../src/mocks/marketplace-network-scenarios';
import { connectWallet, reviewedOrderBody } from './support/order-request';

const server = setupServer(...marketplaceHandlers);
const apiBaseUrl = 'http://localhost/api';
const demoPassword = 'kurio-demo';

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

async function selectScenario(scenario: string) {
  const response = await api('/mock/scenario', {
    method: 'POST',
    body: JSON.stringify({ scenario }),
  });
  expect(response.status).toBe(200);
  return response.json();
}

async function login() {
  const response = await api('/session/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ana@kurio.test', password: demoPassword }),
  });
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')?.split(';')[0] as string;
}

function withCookie(cookie: string): HeadersInit {
  return { Cookie: cookie };
}

test('cenários de rede são enumeráveis, selecionáveis e resetáveis para estado conhecido', async () => {
  const catalog = await (await api('/mock/scenarios')).json();
  expect(catalog.active).toBe('success');
  expect(catalog.scenarios).toEqual(marketplaceNetworkScenarios);

  const empty = await selectScenario('empty-catalog');
  expect(empty).toMatchObject({ active: 'empty-catalog', fixture: 'empty-catalog', counts: { nfts: 0 } });
  expect(await (await api('/nfts')).json()).toMatchObject({ total: 0, items: [] });

  const success = await selectScenario('success');
  expect(success).toMatchObject({ active: 'success', fixture: 'default', counts: { nfts: 36 } });
  expect(await (await api('/nfts')).json()).toMatchObject({ total: 36 });
  expect((await api('/mock/scenario', {
    method: 'POST',
    body: JSON.stringify({ scenario: 'unknown' }),
  })).status).toBe(400);
});

test('latência variável e respostas fora de ordem são reproduzíveis', async () => {
  await selectScenario('variable-latency');
  const start = Date.now();
  expect((await api('/nfts?page=2&pageSize=1')).status).toBe(200);
  expect(Date.now() - start).toBeGreaterThanOrEqual(35);

  await selectScenario('out-of-order');
  const completionOrder: number[] = [];
  await Promise.all([1, 2].map(async (page) => {
    const response = await api(`/nfts?page=${page}&pageSize=1`);
    expect(response.status).toBe(200);
    completionOrder.push(page);
  }));
  expect(completionOrder).toEqual([2, 1]);
});

test('timeout, indisponibilidade, respostas HTTP 4xx/5xx e expiração de sessão são selecionáveis', async () => {
  await selectScenario('timeout');
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), 50);
  await expect(api('/nfts', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  clearTimeout(abortTimer);
  await selectScenario('unavailable');
  expect((await api('/nfts')).status).toBe(503);
  await selectScenario('http-4xx');
  expect(await (await api('/nfts')).json()).toMatchObject({
    error: { code: 'SCENARIO_HTTP_4XX' },
  });
  expect((await api('/nfts')).status).toBe(422);
  await selectScenario('http-5xx');
  expect((await api('/nfts')).status).toBe(500);

  await selectScenario('session-expired');
  const cookie = await login();
  const expiredResponse = await api('/profile', { headers: withCookie(cookie) });
  expect(expiredResponse.status).toBe(401);
  expect(await expiredResponse.json()).toMatchObject({ error: { code: 'SESSION_EXPIRED' } });
  expect((await api('/profile', { headers: withCookie(cookie) })).status).toBe(401);
});

test('conflito de cadastro e cupons inválido/expirado retornam erros estáveis', async () => {
  await selectScenario('registration-conflict');
  const conflict = await api('/session/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Nova pessoa', email: 'novo@kurio.test', password: 'senha-segura-123' }),
  });
  expect(conflict.status).toBe(409);
  expect(await conflict.json()).toMatchObject({ error: { code: 'EMAIL_ALREADY_REGISTERED' } });

  await selectScenario('coupon-invalid');
  let cookie = await login();
  let quote = await api('/quotes', {
    method: 'POST',
    headers: withCookie(cookie),
    body: JSON.stringify({ couponCode: 'WELCOME10' }),
  });
  expect(quote.status).toBe(422);
  expect(await quote.json()).toMatchObject({ error: { code: 'COUPON_INVALID' } });

  await selectScenario('coupon-expired');
  cookie = await login();
  quote = await api('/quotes', {
    method: 'POST',
    headers: withCookie(cookie),
    body: JSON.stringify({ couponCode: 'WELCOME10' }),
  });
  expect(quote.status).toBe(422);
  expect(await quote.json()).toMatchObject({ error: { code: 'COUPON_EXPIRED' } });
});

test('mudança de preço e edição esgotada atualizam os recursos REST', async () => {
  await selectScenario('price-change');
  const priceEvent = await api('/mock/scenario/trigger', { method: 'POST', body: JSON.stringify({ nftId: 'nft-004' }) });
  expect(priceEvent.status).toBe(202);
  expect(await priceEvent.json()).toMatchObject({
    version: 3,
    resource: { id: 'nft-004', priceEth: '1.39', version: 3 },
  });
  expect(await (await api('/nfts/nft-004')).json()).toMatchObject({ priceEth: '1.39', version: 3 });

  await selectScenario('edition-sold-out');
  const soldOutEvent = await api('/mock/scenario/trigger', {
    method: 'POST',
    body: JSON.stringify({ nftId: 'nft-004' }),
  });
  expect(await soldOutEvent.json()).toMatchObject({
    resource: { id: 'nft-004', availableEditions: 0, version: 3 },
  });
  expect(await (await api('/nfts/nft-004')).json()).toMatchObject({ availableEditions: 0 });
  const cookie = await login();
  expect((await api('/cart/items', {
    method: 'POST',
    headers: withCookie(cookie),
    body: JSON.stringify({ nftId: 'nft-004', quantity: 1 }),
  })).status).toBe(409);
});

test('timeout após criação recupera o mesmo pedido pela chave de idempotência', async () => {
  await selectScenario('order-timeout-after-create');
  const cookie = await login();
  const connection = await connectWallet(api, cookie);
  const request = {
    method: 'POST',
    headers: { ...withCookie(cookie), 'Idempotency-Key': 'retry-after-timeout' },
    body: JSON.stringify(await reviewedOrderBody(api, cookie, connection.id)),
  };

  const timeout = await api('/orders', request);
  expect(timeout.status).toBe(504);
  expect(await timeout.json()).toMatchObject({ error: { code: 'ORDER_RESPONSE_TIMEOUT' } });
  const orders = await (await api('/orders', { headers: withCookie(cookie) })).json();
  const createdOrder = orders.find((order: { idempotencyKey: string }) => order.idempotencyKey === 'retry-after-timeout');
  expect(createdOrder).toMatchObject({ status: 'pendente', version: 1 });
  const retry = await api('/orders', request);
  expect(retry.status).toBe(200);
  expect(await retry.json()).toEqual({ order: createdOrder });
});

test('pedido recusado emite estado terminal consultável sem recibo', async () => {
  await selectScenario('order-refuse');
  const cookie = await login();
  const response = await api('/mock/scenario/trigger', {
    method: 'POST',
    headers: withCookie(cookie),
    body: JSON.stringify({ orderId: 'order-0002' }),
  });
  expect(response.status).toBe(202);
  expect(await response.json()).toMatchObject({
    version: 2,
    resource: { id: 'order-0002', status: 'recusado', version: 2 },
  });
  expect(await (await api('/orders/order-0002', { headers: withCookie(cookie) })).json())
    .toMatchObject({ status: 'recusado', version: 2 });
  expect((await api('/orders/order-0002/receipt', { headers: withCookie(cookie) })).status).toBe(404);
});
