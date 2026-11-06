import { expect, test } from '@playwright/test';

test('acesso direto e refresh preservam a rota; REST e evento Socket.IO passam pelos mocks', async ({ page }) => {
  await page.goto('/foundation?scenario=direct');
  await expect(page.getByRole('heading', { name: 'Fundação técnica' })).toBeVisible();
  await expect(page.getByTestId('foundation-status')).toHaveText('ready');
  await expect(page.getByTestId('socket-status')).toHaveText('conectado');

  await page.reload();
  await expect(page.getByTestId('foundation-status')).toHaveText('ready');
  await expect(page).toHaveURL(/\/foundation\?scenario=direct/);

  await page.getByRole('button', { name: 'Emitir evento simulado' }).click();
  await expect(page.getByTestId('foundation-status')).toHaveText('updated');
  await expect(page.getByTestId('foundation-version')).toHaveText('1');

  await page.getByRole('button', { name: 'Resetar cenário' }).click();
  await expect(page.getByTestId('foundation-status')).toHaveText('ready');
  await expect(page.getByTestId('foundation-version')).toHaveText('0');
});

test('rotas inexistentes usam o fallback 404 do roteador', async ({ page }) => {
  await page.goto('/rota-inexistente');
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
});
