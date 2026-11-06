import { setupServer } from 'msw/node';
import { expect, test } from '@playwright/test';
import { marketplaceHandlers } from '../src/mocks/marketplace-handlers';
import { connectMarketplaceSocket } from '../src/mocks/marketplace-socket-client';
import { resetMarketplaceState } from '../src/mocks/marketplace-store';
import { socketIoPollingHandlers } from '../src/mocks/socket-io-polling';

const server = setupServer(...marketplaceHandlers, ...socketIoPollingHandlers);
const apiBaseUrl = 'http://localhost/api';

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

async function waitForConnection(socket: ReturnType<typeof connectMarketplaceSocket>) {
  if (socket.connected) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket.IO não conectou dentro do prazo.')), 3_000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

test('socket.io-client autoriza order.updated apenas para o proprietário', async () => {
  const selected = await api('/mock/scenario', {
    method: 'POST',
    body: JSON.stringify({ scenario: 'order-confirm' }),
  });
  expect(selected.status).toBe(200);

  const anonymousSocket = connectMarketplaceSocket(undefined, 'http://localhost');
  const anonymousEvents: unknown[] = [];
  anonymousSocket.on('order.updated', (event) => anonymousEvents.push(event));
  await waitForConnection(anonymousSocket);

  const login = await api('/session/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ana@kurio.test', password: 'kurio-demo' }),
  });
  const session = await login.json() as { session: { token: string } };
  const ownerSocket = connectMarketplaceSocket(session.session.token, 'http://localhost');
  const ownerEvents: unknown[] = [];
  ownerSocket.on('order.updated', (event) => ownerEvents.push(event));

  try {
    await Promise.all([waitForConnection(ownerSocket), waitForConnection(anonymousSocket)]);
    const trigger = await api('/mock/scenario/trigger', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.session.token}` },
      body: JSON.stringify({ orderId: 'order-0002' }),
    });
    expect(trigger.status).toBe(202);
    await expect.poll(() => ownerEvents.length).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(ownerEvents[0]).toMatchObject({
      eventId: expect.any(String),
      version: 2,
      resource: { id: 'order-0002', status: 'confirmado', version: 2 },
    });
    expect(anonymousEvents).toHaveLength(0);
  } finally {
    ownerSocket.disconnect();
    anonymousSocket.disconnect();
  }
});
