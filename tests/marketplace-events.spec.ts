import { expect, test } from '@playwright/test';

async function postJson(page: import('@playwright/test').Page, path: string, body: unknown, token?: string) {
  return page.evaluate(async ({ requestPath, requestBody, bearerToken }) => {
    const response = await fetch(requestPath, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      },
      body: JSON.stringify(requestBody),
    });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  }, { requestPath: path, requestBody: body, bearerToken: token });
}

test('socket.io-client no navegador recebe nft.updated e REST retorna o mesmo recurso', async ({ page }) => {
  await page.goto('/foundation');
  await expect(page.getByTestId('socket-status')).toHaveText('conectado');
  await expect(page.getByTestId('marketplace-socket-status')).toHaveText('conectado');
  expect((await postJson(page, '/api/mock/scenario', { scenario: 'price-change' })).status).toBe(200);

  await page.reload();
  await expect(page.getByTestId('marketplace-socket-status')).toHaveText('conectado');
  const trigger = await postJson(page, '/api/mock/scenario/trigger', { nftId: 'nft-004' });
  expect(trigger.status).toBe(202);
  await expect(page.getByTestId('marketplace-event-name')).toHaveText('nft.updated');
  await expect(page.getByTestId('marketplace-event-resource')).toHaveText('nft-004');
  await expect(page.getByTestId('marketplace-event-version')).toHaveText('3');

  const nft = await page.evaluate(async () => (await fetch('/api/nfts/nft-004')).json());
  expect(nft).toMatchObject({ id: 'nft-004', priceEth: '1.39', version: 3 });
  expect(trigger.body).toMatchObject({ resource: nft });
});

test('pedido confirmado e recibo continuam consultáveis após refresh', async ({ page }) => {
  await page.goto('/foundation');
  await expect(page.getByTestId('marketplace-socket-status')).toHaveText('conectado');
  expect((await postJson(page, '/api/mock/scenario', { scenario: 'order-confirm' })).status).toBe(200);

  const login = await page.evaluate(async () => {
    const response = await fetch('/api/session/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ana@kurio.test', password: 'kurio-demo' }),
    });
    return {
      status: response.status,
      session: await response.json() as { session: { token: string } },
    };
  });
  expect(login.status).toBe(200);

  await page.reload();
  await expect(page.getByTestId('marketplace-socket-status')).toHaveText('conectado');
  const trigger = await postJson(
    page,
    '/api/mock/scenario/trigger',
    { orderId: 'order-0002' },
    login.session.session.token,
  );
  expect(trigger.status).toBe(202);
  expect(trigger.body).toMatchObject({
    version: 2,
    resource: { id: 'order-0002', status: 'confirmado', version: 2 },
  });

  const receipt = await page.evaluate(async (token) => (
    (await fetch('/api/orders/order-0002/receipt', { headers: { Authorization: `Bearer ${token}` } })).json()
  ), login.session.session.token);
  expect(receipt).toMatchObject({ orderId: 'order-0002', status: 'confirmado' });

  await page.reload();
  await expect(page.getByTestId('marketplace-socket-status')).toHaveText('conectado');
  const refreshedOrder = await page.evaluate(async (token) => (
    (await fetch('/api/orders/order-0002', { headers: { Authorization: `Bearer ${token}` } })).json()
  ), login.session.session.token);
  expect(refreshedOrder).toMatchObject({ id: 'order-0002', status: 'confirmado', version: 2 });
  const refreshedReceipt = await page.evaluate(async (token) => (
    (await fetch('/api/orders/order-0002/receipt', { headers: { Authorization: `Bearer ${token}` } })).json()
  ), login.session.session.token);
  expect(refreshedReceipt).toMatchObject({ orderId: 'order-0002', status: 'confirmado' });
  await expect(page.getByTestId('marketplace-event-name')).not.toHaveText('order.updated');
});
