import { setupServer } from 'msw/node';
import { expect, test } from '@playwright/test';
import { marketplaceHandlers } from '../src/mocks/marketplace-handlers';
import { readMarketplaceState, resetMarketplaceState } from '../src/mocks/marketplace-store';
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

async function login(email = 'ana@kurio.test') {
  const response = await api('/session/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: demoPassword }),
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  expect(cookie).toBeTruthy();
  return cookie as string;
}

function withCookie(cookie: string): HeadersInit {
  return { Cookie: cookie };
}

test('catálogo aplica busca, filtros, ordenação e paginação e trata recursos inválidos', async () => {
  const response = await api('/nfts?q=signal&collectionId=signals&sort=price-asc&page=1&pageSize=1');
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    total: 11,
    page: 1,
    pageSize: 1,
    items: [{ id: 'nft-012', priceEth: '0.22' }],
  });

  expect((await api('/nfts?page=0')).status).toBe(400);
  expect((await api('/nfts/not-a-nft')).status).toBe(404);
  expect((await api('/nfts', { headers: { 'x-mock-failure': 'transient' } })).status).toBe(503);

  const emptyResponse = await api('/mock/reset', {
    method: 'POST',
    body: JSON.stringify({ scenario: 'empty-catalog' }),
  });
  expect(emptyResponse.status).toBe(200);
  expect(await emptyResponse.json()).toMatchObject({ scenario: 'empty-catalog', counts: { nfts: 0 } });
  expect(await (await api('/nfts')).json()).toMatchObject({ total: 0, items: [] });
});

test('sessão, perfil, favoritos, carrinho, cotação e carteiras são autenticados e isolados', async () => {
  expect(await (await api('/profile')).status).toBe(401);
  const anaCookie = await login();
  const caioCookie = await login('caio@kurio.test');

  expect(await (await api('/profile', { headers: withCookie(anaCookie) })).json())
    .toMatchObject({ userId: 'user-ana', email: 'ana@kurio.test' });
  expect(await (await api('/profile', { headers: withCookie(caioCookie) })).json())
    .toMatchObject({ userId: 'user-caio', email: 'caio@kurio.test' });
  expect((await api('/session/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ana@kurio.test', password: 'wrong-password' }),
  })).status).toBe(401);

  expect((await api('/favorites', { headers: withCookie(caioCookie) })).status).toBe(200);
  const caioFavorites = await (await api('/favorites', { headers: withCookie(caioCookie) })).json();
  expect(caioFavorites).toEqual([{ userId: 'user-caio', nftId: 'nft-002', createdAt: '2026-01-17T10:00:00.000Z' }]);
  expect((await api('/favorites/nft-001', { method: 'PUT', headers: withCookie(caioCookie) })).status).toBe(201);
  expect((await api('/favorites', { headers: withCookie(caioCookie) })).json()).resolves.toHaveLength(2);
  expect((await api('/favorites/nft-001', { method: 'DELETE', headers: withCookie(caioCookie) })).status).toBe(204);

  const cartResponse = await api('/cart', { headers: withCookie(caioCookie) });
  expect(await cartResponse.json()).toMatchObject({ userId: 'user-caio', items: [] });
  expect((await api('/cart/items', {
    method: 'POST',
    headers: withCookie(caioCookie),
    body: JSON.stringify({ nftId: 'nft-003', quantity: 2 }),
  })).status).toBe(201);
  const concurrentAdds = await Promise.all([1, 2].map(() => api('/cart/items', {
    method: 'POST',
    headers: withCookie(caioCookie),
    body: JSON.stringify({ nftId: 'nft-003', quantity: 1 }),
  })));
  expect(concurrentAdds.map(({ status }) => status).sort()).toEqual([200, 200]);
  expect((await api('/cart/items', {
    method: 'POST',
    headers: withCookie(caioCookie),
    body: JSON.stringify({ nftId: 'nft-005', quantity: 11 }),
  })).status).toBe(409);
  const quoteResponse = await api('/quotes', {
    method: 'POST',
    headers: withCookie(caioCookie),
    body: JSON.stringify({ couponCode: 'WELCOME10' }),
  });
  expect(await quoteResponse.json()).toMatchObject({
    subtotalEth: '7.96',
    discountEth: '0.796',
    networkFeeEth: '0.016',
    totalEth: '7.18',
  });
  expect((await api('/quotes', {
    method: 'POST',
    headers: withCookie(caioCookie),
    body: JSON.stringify({ couponCode: 'INVALID' }),
  })).status).toBe(422);
  expect((await api('/wallets', { headers: withCookie(caioCookie) })).json()).resolves.toHaveLength(1);
  expect((await api('/profile', {
    method: 'PATCH',
    headers: withCookie(caioCookie),
    body: JSON.stringify({ name: 'Caio Atualizado' }),
  })).status).toBe(200);
  expect((await api('/session/logout', { method: 'POST', headers: withCookie(caioCookie) })).status).toBe(204);
  expect((await api('/profile', { headers: withCookie(caioCookie) })).status).toBe(401);
});

test('cadastro verifica conflitos e persiste apenas hash da senha', async () => {
  expect((await api('/session/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Ana', email: 'ANA@KURIO.TEST', password: demoPassword }),
  })).status).toBe(409);

  const response = await api('/session/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Nova Pessoa', email: 'nova@kurio.test', password: 'nova-senha-segura' }),
  });
  expect(response.status).toBe(201);
  const registeredUserId = (await response.clone().json()).session.userId as string;
  expect(readMarketplaceState().credentials[registeredUserId].hash).not.toContain('nova-senha-segura');
  expect(JSON.stringify(readMarketplaceState().credentials)).not.toContain('nova-senha-segura');
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  expect(cookie).toBeTruthy();
  expect(await (await api('/session', { headers: withCookie(cookie as string) })).json())
    .toMatchObject({ status: 'authenticated' });

  expect((await api('/session/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'nova@kurio.test', password: 'curta' }),
  })).status).toBe(400);
  expect((await api('/session/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'nova@kurio.test', password: 'outra-senha-valida' }),
  })).status).toBe(401);

  const duplicateRegistrations = await Promise.all(['senha-1-segura', 'senha-2-segura'].map((password) => api('/session/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Corrida', email: 'corrida@kurio.test', password }),
  })));
  expect(duplicateRegistrations.map(({ status }) => status).sort()).toEqual([201, 409]);
});

test('pedido usa idempotência persistente e restringe pedidos e recibos ao proprietário', async () => {
  const anaCookie = await login();
  const caioCookie = await login('caio@kurio.test');
  const connection = await connectWallet(api, anaCookie);
  const body = await reviewedOrderBody(api, anaCookie, connection.id);
  const request = {
    method: 'POST',
    headers: { ...withCookie(anaCookie), 'Idempotency-Key': 'order-idempotency-test' },
    body: JSON.stringify(body),
  };

  const firstResponse = await api('/orders', request);
  expect(firstResponse.status).toBe(201);
  const first = await firstResponse.json();
  expect(first.order).toMatchObject({ status: 'pendente', version: 1 });
  expect((await api('/orders', request)).status).toBe(200);
  expect((await api('/orders', {
    ...request,
    body: JSON.stringify({ ...body, walletAddress: '0x2222222222222222222222222222222222222222' }),
  })).status).toBe(409);
  expect((await api('/orders', {
    ...request,
    headers: { ...withCookie(anaCookie), 'Idempotency-Key': 'another-order-key' },
    body: JSON.stringify({ ...body, walletAddress: '0x3333333333333333333333333333333333333333' }),
  })).status).toBe(403);
  expect((await api('/orders', {
    ...request,
    headers: { ...withCookie(anaCookie), 'Idempotency-Key': 'unknown-order-field' },
    body: JSON.stringify({ ...body, unexpected: true }),
  })).status).toBe(400);

  const orderId = first.order.id as string;
  expect((await api(`/orders/${orderId}`, { headers: withCookie(anaCookie) })).status).toBe(200);
  expect((await api(`/orders/${orderId}`, { headers: withCookie(caioCookie) })).status).toBe(404);
  expect((await api('/orders/order-0001/receipt', { headers: withCookie(anaCookie) })).status).toBe(200);
  expect((await api('/orders/order-0001/receipt', { headers: withCookie(caioCookie) })).status).toBe(404);
  expect((await api('/orders', { headers: withCookie(anaCookie) })).json()).resolves.toEqual([
    expect.objectContaining({ id: 'order-0001' }),
    expect.objectContaining({ id: 'order-0002' }),
    expect.objectContaining({ id: orderId }),
  ]);
  expect((await api('/orders', { headers: withCookie(caioCookie) })).json()).resolves.toEqual([]);
});

test('perfil valida campos, conflitos de e-mail/usuário e aceita avatar como data URL', async () => {
  const anaCookie = await login();
  const invalid = await api('/profile', {
    method: 'PATCH',
    headers: withCookie(anaCookie),
    body: JSON.stringify({ username: 'a', ensName: 'sem-sufixo', avatarUrl: 'data:text/html;base64,PHA+' }),
  });
  expect(invalid.status).toBe(400);
  expect((await invalid.json()).error.details.fields).toMatchObject({
    username: expect.any(String),
    ensName: expect.any(String),
    avatarUrl: expect.any(String),
  });

  const usernameConflict = await api('/profile', {
    method: 'PATCH',
    headers: withCookie(anaCookie),
    body: JSON.stringify({ username: 'CAIO.NUNES' }),
  });
  expect(usernameConflict.status).toBe(409);
  expect((await usernameConflict.json()).error.code).toBe('USERNAME_TAKEN');
  expect((await api('/profile', {
    method: 'PATCH',
    headers: withCookie(anaCookie),
    body: JSON.stringify({ email: 'caio@kurio.test' }),
  })).status).toBe(409);

  const avatarUrl = 'data:image/png;base64,iVBORw0KGgo=';
  const updated = await api('/profile', {
    method: 'PATCH',
    headers: withCookie(anaCookie),
    body: JSON.stringify({
      name: 'Ana S.',
      username: 'ana.colecao',
      email: 'ANA.NOVA@kurio.test',
      ensName: 'AnaColecao.eth',
      walletNickname: 'Cofre principal',
      avatarUrl,
    }),
  });
  expect(updated.status).toBe(200);
  await expect(updated.json()).resolves.toMatchObject({
    name: 'Ana S.',
    username: 'ana.colecao',
    email: 'ana.nova@kurio.test',
    ensName: 'anacolecao.eth',
    walletNickname: 'Cofre principal',
    avatarUrl,
  });
  // O e-mail atualizado passa a valer para o login.
  expect((await api('/session/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ana.nova@kurio.test', password: demoPassword }),
  })).status).toBe(200);
});

test('alteração de senha exige senha atual, grava somente hash e revoga as demais sessões', async () => {
  expect((await api('/profile/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword: demoPassword, newPassword: 'nova-senha-123' }),
  })).status).toBe(401);
  const otherCookie = await login();
  const currentCookie = await login();
  const wrongCurrent = await api('/profile/password', {
    method: 'POST',
    headers: withCookie(currentCookie),
    body: JSON.stringify({ currentPassword: 'senha-errada', newPassword: 'nova-senha-123' }),
  });
  expect(wrongCurrent.status).toBe(422);
  expect((await wrongCurrent.json()).error.code).toBe('INVALID_CURRENT_PASSWORD');
  expect((await api('/profile/password', {
    method: 'POST',
    headers: withCookie(currentCookie),
    body: JSON.stringify({ currentPassword: demoPassword, newPassword: 'curta' }),
  })).status).toBe(400);

  expect((await api('/profile/password', {
    method: 'POST',
    headers: withCookie(currentCookie),
    body: JSON.stringify({ currentPassword: demoPassword, newPassword: 'nova-senha-123' }),
  })).status).toBe(204);
  expect(JSON.stringify(readMarketplaceState().credentials)).not.toContain('nova-senha-123');
  expect((await api('/profile', { headers: withCookie(currentCookie) })).status).toBe(200);
  expect((await api('/profile', { headers: withCookie(otherCookie) })).status).toBe(401);
  expect((await api('/session/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ana@kurio.test', password: demoPassword }),
  })).status).toBe(401);
  expect((await api('/session/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ana@kurio.test', password: 'nova-senha-123' }),
  })).status).toBe(200);
});

test('carteiras exigem campos do formulário e mantêm uma principal e uma secundária por usuário', async () => {
  const caioCookie = await login('caio@kurio.test');
  const walletBody = {
    displayName: 'Caio Nunes',
    nickname: 'Reserva',
    profileName: 'caio.nunes',
    network: 'Polygon',
    address: '0x5555555555555555555555555555555555555555',
    walletType: 'MetaMask',
    referralCode: 'kurio-caio',
    email: 'caio@kurio.test',
    ensName: 'caionunes.eth',
    alternateAddress: '',
  };
  const missing = await api('/wallets', {
    method: 'POST',
    headers: withCookie(caioCookie),
    body: JSON.stringify({ address: walletBody.address, network: 'Polygon' }),
  });
  expect(missing.status).toBe(400);
  expect((await missing.json()).error.details.fields).toHaveProperty('displayName');

  expect((await api('/wallets', {
    method: 'POST',
    headers: withCookie(caioCookie),
    body: JSON.stringify({ ...walletBody, role: 'principal' }),
  })).status).toBe(409);
  expect((await api('/wallets', {
    method: 'POST',
    headers: withCookie(caioCookie),
    body: JSON.stringify({ ...walletBody, address: '0x3333333333333333333333333333333333333333' }),
  })).status).toBe(409);

  const created = await api('/wallets', {
    method: 'POST',
    headers: withCookie(caioCookie),
    body: JSON.stringify({ ...walletBody, alternateAddress: null }),
  });
  expect(created.status).toBe(201);
  const secondary = await created.json();
  expect(secondary).toMatchObject({ role: 'secundaria', referralCode: 'KURIO-CAIO', alternateAddress: null });
  expect((await api('/wallets', {
    method: 'POST',
    headers: withCookie(caioCookie),
    body: JSON.stringify({ ...walletBody, address: '0x6666666666666666666666666666666666666666' }),
  })).status).toBe(409);

  const promoted = await api(`/wallets/${secondary.id}`, {
    method: 'PATCH',
    headers: withCookie(caioCookie),
    body: JSON.stringify({ role: 'principal', nickname: 'Nova principal' }),
  });
  expect(promoted.status).toBe(200);
  const wallets = await (await api('/wallets', { headers: withCookie(caioCookie) })).json() as Array<{ id: string; role: string }>;
  expect(wallets.find(({ id }) => id === secondary.id)?.role).toBe('principal');
  expect(wallets.find(({ id }) => id === 'wallet-caio-main')?.role).toBe('secundaria');

  const anaCookie = await login();
  expect((await api(`/wallets/${secondary.id}`, {
    method: 'PATCH',
    headers: withCookie(anaCookie),
    body: JSON.stringify({ nickname: 'Invasão' }),
  })).status).toBe(404);
});
