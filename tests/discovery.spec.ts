import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await fetch('/api/mock/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'default' }),
    });
  });
});

test('catálogo sincroniza busca, filtros combinados, ordenação, paginação e histórico com a URL', async ({ page }) => {
  await expect(page.getByRole('link', { name: 'Ver detalhes de Emerald Ape #042' })).toBeVisible();
  const filters = page.getByRole('region', { name: 'Filtros do catálogo' });
  await expect(filters.getByRole('button', { name: 'Música (4)' })).toBeVisible();
  await expect(filters.getByRole('button', { name: 'Ethereum (12)' })).toBeVisible();
  await expect(filters.getByText('Preço: 0,22 - 2,08 ETH')).toBeVisible();

  await filters.getByRole('button', { name: /^Música/ }).click();
  await expect(page).toHaveURL(/category=musica/);
  await expect(page.getByRole('link', { name: /Neon Vessel #552/ })).toBeVisible();

  // Slider em centésimos de ETH: 100 = 1,00 ETH.
  await filters.getByLabel('Preço máximo em ETH').evaluate((element) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '100');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(filters.getByText('Preço: 0,22 - 1,00 ETH')).toBeVisible();
  await filters.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page).toHaveURL(/maxPriceEth=%22?1/);
  await expect(page.getByRole('link', { name: /Monument in Blue/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Neon Vessel #552/ })).toHaveCount(0);

  await filters.getByRole('button', { name: /^Solana/ }).click();
  await expect(page).toHaveURL(/network=solana/);
  await expect(page.getByRole('link', { name: /Monument in Blue/ })).toBeVisible();

  await page.getByLabel('Ordenar catálogo').first().selectOption('price-desc');
  await expect(page).toHaveURL(/sort=price-desc/);
  await page.goBack();
  await expect(page).not.toHaveURL(/sort=price-desc/);

  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await page.getByRole('button', { name: 'Próxima página' }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByRole('link', { name: /Pillar in Fog/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: /Pillar in Fog/ })).toBeVisible();
});

test('detalhe abre por URL direta, limita quantidade, trata ações e NFT inexistente', async ({ page }) => {
  await page.goto('/nfts/nft-001');
  const detail = page.getByRole('region', { name: 'Emerald Ape #042' });
  await expect(detail.getByRole('heading', { name: 'Emerald Ape #042' })).toBeVisible();
  await expect(page.getByText('1.19 ETH').first()).toBeVisible();
  const rating = detail.getByLabel('Avaliação 4.8 de 5, 19 avaliações');
  await expect(rating).toContainText('19 avaliações de colecionadores');
  await expect(rating.getByTestId('rating-stars').locator('svg')).toHaveCount(5);
  await expect(detail.getByText('Compartilhar este NFT:')).toBeVisible();
  await expect(page.getByText('Nova Sato recebe 5% de direitos autorais', { exact: false })).toBeVisible();
  await expect(page.getByText('Cada atributo fica armazenado nos metadados do token', { exact: false })).toBeVisible();
  await expect(page.getByText('A obra explora identidade, movimento e luz em um mundo digital sem fronteiras.')).toBeVisible();
  const decreaseButton = await detail.getByRole('button', { name: 'Diminuir quantidade' }).boundingBox();
  expect(decreaseButton?.width).toBe(24);
  expect(decreaseButton?.height).toBe(40);
  const thumbnailBackground = await page.getByRole('button', { name: 'Visualização 1 de Emerald Ape #042' })
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(thumbnailBackground).toBe('rgba(0, 0, 0, 0)');
  await expect(rating.getByTestId('rating-stars').locator('svg')).toHaveCount(5);
  const metadataLabelColor = await detail.locator('dt').first()
    .evaluate((element) => getComputedStyle(element).color);
  const metadataValueColor = await detail.locator('dd').first()
    .evaluate((element) => getComputedStyle(element).color);
  expect(metadataLabelColor).toBe(metadataValueColor);

  await detail.getByRole('button', { name: 'Aumentar quantidade' }).click();
  await expect(detail.getByLabel('Quantidade selecionada')).toHaveText('2');
  await detail.getByRole('button', { name: '1/10', exact: true }).first().click();
  for (let quantity = 1; quantity < 10; quantity += 1) {
    await detail.getByRole('button', { name: 'Aumentar quantidade' }).click();
  }
  await expect(detail.getByLabel('Quantidade selecionada')).toHaveText('10');
  await expect(detail.getByRole('button', { name: 'Aumentar quantidade' })).toBeDisabled();
  await detail.getByRole('button', { name: '1/50' }).click();

  await page.getByRole('button', { name: 'Comprar', exact: true }).click();
  await expect(page).toHaveURL(/\/carrinho$/);
  await expect(page.getByTestId('cart-item').filter({ hasText: 'Emerald Ape #042' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/nfts\/nft-001$/);
  await page.getByRole('button', { name: 'Favoritar NFT' }).click();
  await expect(page).toHaveURL(/\/login\?redirect=%2Fnfts%2Fnft-001/);
  await expect(page.getByRole('dialog', { name: 'Entrar' })).toBeVisible();

  await page.goto('/nfts/nft-does-not-exist');
  await expect(page.getByText('NFT não encontrado.', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Voltar ao catálogo' })).toBeVisible();

  await page.evaluate(async () => {
    await fetch('/api/mock/scenario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'edition-sold-out' }),
    });
    await fetch('/api/mock/scenario/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nftId: 'nft-001' }),
    });
  });
  await page.goto('/nfts/nft-001');
  await expect(page.getByText('Indisponível')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Comprar', exact: true })).toBeDisabled();
});

test('detalhe móvel preserva ações fixas e esconde a navegação inferior global', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/nfts/nft-001');
  await expect(page.getByRole('navigation', { name: 'Navegação móvel' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Comprar NFT' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Voltar ao catálogo' })).toBeVisible();
  const detail = page.getByRole('region', { name: 'Emerald Ape #042' });
  const informationPanel = await detail.boundingBox();
  const title = await page.getByRole('heading', { name: 'Emerald Ape #042' }).boundingBox();
  const artwork = await page.getByRole('img', { name: 'Arte do NFT Emerald Ape #042' }).boundingBox();
  const description = await detail.getByText(/Um colecionável digital 1\/50/).boundingBox();
  const collection = await detail.getByText('Kurio Apes').boundingBox();
  const attributes = await detail.getByText(/Óculos, Esmeralda, Raro/).boundingBox();
  const purchaseBar = await page.getByRole('button', { name: 'Comprar NFT' }).boundingBox();
  const decrementButton = await page.getByRole('button', { name: 'Diminuir quantidade' }).last().boundingBox();
  const cartButton = await page.getByRole('button', { name: 'Adicionar ao carrinho' }).boundingBox();
  expect(informationPanel).not.toBeNull();
  expect(title).not.toBeNull();
  expect(artwork).not.toBeNull();
  expect(description).not.toBeNull();
  expect(collection).not.toBeNull();
  expect(attributes).not.toBeNull();
  expect(purchaseBar).not.toBeNull();
  expect(decrementButton).not.toBeNull();
  expect(cartButton).not.toBeNull();
  expect(Math.round(artwork?.y ?? 0) + Math.round(artwork?.height ?? 0))
    .toBeGreaterThan(Math.round(informationPanel?.y ?? 0));
  expect(Math.round((artwork?.y ?? 0) + (artwork?.height ?? 0) - (informationPanel?.y ?? 0)))
    .toBeGreaterThanOrEqual(10);
  expect(Math.round((artwork?.y ?? 0) + (artwork?.height ?? 0) - (informationPanel?.y ?? 0)))
    .toBeLessThanOrEqual(16);
  expect(Math.round(artwork?.width ?? 0)).toBe(390 - 72);
  expect((description?.y ?? 0) + (description?.height ?? 0)).toBeLessThan(purchaseBar?.y ?? 0);
  expect((collection?.y ?? 0) + (collection?.height ?? 0)).toBeLessThan(purchaseBar?.y ?? 0);
  expect((attributes?.y ?? 0) + (attributes?.height ?? 0)).toBeLessThan(purchaseBar?.y ?? 0);
  expect(Math.round((purchaseBar?.y ?? 0) + (purchaseBar?.height ?? 0))).toBe(826);
  expect(Math.round((cartButton?.y ?? 0) + (cartButton?.height ?? 0))).toBe(826);
  expect(Math.round(decrementButton?.width ?? 0)).toBe(24);
  expect(Math.round(decrementButton?.height ?? 0)).toBe(24);
  await expect(detail.getByLabel('Avaliação 4.8 de 5, 19 avaliações')).toContainText('4.8');
  await expect(detail.getByLabel('Avaliação 4.8 de 5, 19 avaliações').locator('svg:visible')).toHaveCount(1);
  await expect(detail.getByText('Atributos:')).toBeVisible();
  const panelOverflow = await detail.evaluate((element) => getComputedStyle(element).overflowY);
  expect(panelOverflow).toBe('auto');
  const panelScroll = await detail.evaluate((element) => element.scrollHeight - element.clientHeight);
  expect(panelScroll).toBe(0);
});

test('busca é restaurada pela URL e o catálogo informa estado vazio e falha recuperável', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const search = page.getByRole('textbox', { name: 'Explorar coleções' });
  await search.fill('Emerald Ape');
  await search.press('Enter');
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByRole('link', { name: 'Ver detalhes de Emerald Ape #042' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver detalhes de Sage Nomad #009' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Busca: “Emerald Ape”')).toBeVisible();

  await page.evaluate(async () => {
    await fetch('/api/mock/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'empty-catalog' }),
    });
  });
  await page.reload();
  await expect(page.getByText('Nenhum NFT encontrado.', { exact: false })).toBeVisible();

  await page.evaluate(async () => {
    await fetch('/api/mock/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'default' }),
    });
    await fetch('/api/mock/scenario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'unavailable' }),
    });
  });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('temporariamente indisponível');
  await page.evaluate(async () => {
    await fetch('/api/mock/scenario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: 'success' }),
    });
  });
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('link', { name: 'Ver detalhes de Emerald Ape #042' })).toBeVisible();
});
