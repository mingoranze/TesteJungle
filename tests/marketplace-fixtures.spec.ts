import { expect, test } from '@playwright/test';
import { decimalString, quantity } from '../src/domain/contracts';
import {
  createMarketplaceStore,
  type MarketplaceStorage,
} from '../src/mocks/marketplace-store';
import { marketplaceScenarioOptions } from '../src/mocks/marketplace-fixtures';

function createMemoryStorage(): MarketplaceStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('fixtures oferecem catálogo variado e dados relacionados para pelo menos dois usuários', () => {
  const state = createMarketplaceStore(null).read();

  expect(state.nfts.length).toBeGreaterThanOrEqual(12);
  expect(new Set(state.nfts.map(({ collectionId }) => collectionId)).size).toBeGreaterThan(1);
  expect(state.profiles).toHaveLength(2);
  expect(state.wallets.every((wallet) => state.profiles.some(({ userId }) => userId === wallet.userId))).toBe(true);
  expect(state.favorites.every((favorite) => state.profiles.some(({ userId }) => userId === favorite.userId)
    && state.nfts.some(({ id }) => id === favorite.nftId))).toBe(true);
  expect(state.carts.every((cart) => cart.items.every((item) => state.nfts.some(({ id }) => id === item.nftId)))).toBe(true);
  expect(state.orders.some(({ status }) => status === 'pendente')).toBe(true);
  expect(state.orders.some(({ status }) => status === 'confirmado')).toBe(true);
  expect(marketplaceScenarioOptions.map(({ id }) => id)).toEqual(['default', 'empty-catalog']);
});

test('estado é persistido entre instâncias, isolado em leituras e restaurado pelo reset', () => {
  const storage = createMemoryStorage();
  const store = createMarketplaceStore(storage);
  const initialState = store.read();

  store.update((draft) => {
    draft.favorites.push({
      userId: 'user-caio',
      nftId: 'nft-003',
      createdAt: '2026-02-01T10:00:00.000Z',
    });
  });

  const refreshedStore = createMarketplaceStore(storage);
  expect(refreshedStore.read().favorites).toHaveLength(initialState.favorites.length + 1);

  const detachedSnapshot = refreshedStore.read();
  detachedSnapshot.nfts.pop();
  expect(refreshedStore.read().nfts).toHaveLength(initialState.nfts.length);

  expect(store.selectScenario('empty-catalog').nfts).toHaveLength(0);
  expect(createMarketplaceStore(storage).read().profiles).toHaveLength(2);
  expect(store.reset().scenario).toBe('empty-catalog');
  expect(store.reset('default').nfts).toHaveLength(initialState.nfts.length);
  expect(store.read().favorites).toHaveLength(initialState.favorites.length);
});

test('rejeita mutações que quebrariam referências e mantém o estado anterior', () => {
  const store = createMarketplaceStore(null);
  const initialVersion = store.read().carts[0].version;

  expect(() => store.update((draft) => {
    draft.carts[0].items.push({
      nftId: 'nft-inexistente',
      editionId: 'edition-invalid',
      quantity: quantity(1),
      unitPriceEth: decimalString('0.1'),
    });
  })).toThrow('contém um item inválido');

  expect(store.read().carts[0].version).toBe(initialVersion);
});

test('migra o estado persistido da versão anterior sem perder usuários, favoritos ou pedidos', () => {
  const storage = createMemoryStorage();
  const legacyState = JSON.parse(JSON.stringify(createMarketplaceStore(null).read())) as Record<string, unknown>;
  legacyState.schemaVersion = 1;
  delete legacyState.credentials;
  delete legacyState.sessions;
  delete legacyState.orderRequests;
  delete legacyState.orderOwners;
  storage.setItem('kurio.marketplace.state.v1', JSON.stringify(legacyState));

  const migratedState = createMarketplaceStore(storage).read();
  expect(migratedState.schemaVersion).toBe(10);
  expect(migratedState.profiles).toHaveLength(2);
  expect(migratedState.favorites).toHaveLength(3);
  expect(migratedState.orderOwners['order-0001']).toBe('user-ana');
  expect(migratedState.credentials['user-ana'].hash).toHaveLength(64);
  expect(JSON.parse(storage.getItem('kurio.marketplace.state.v1') ?? '{}').schemaVersion).toBe(10);
});

test('migra snapshot da etapa 2.2 preservando pedidos, credenciais e sessões válidas', () => {
  const storage = createMemoryStorage();
  const previousState = JSON.parse(JSON.stringify(createMarketplaceStore(null).read())) as Record<string, unknown>;
  previousState.schemaVersion = 2;
  delete previousState.networkScenario;
  const sessions = previousState.sessions as Record<string, unknown>;
  sessions['test-session-token'] = { userId: 'user-ana', expiresAt: Date.now() + 60_000 };
  storage.setItem('kurio.marketplace.state.v1', JSON.stringify(previousState));

  const migratedState = createMarketplaceStore(storage).read();
  expect(migratedState.schemaVersion).toBe(10);
  expect(migratedState.networkScenario).toBe('success');
  expect(migratedState.orderOwners['order-0002']).toBe('user-ana');
  expect(migratedState.sessions['test-session-token'].userId).toBe('user-ana');
});

test('migra catálogo persistido da etapa 3 e preserva alterações de preço posteriores', () => {
  const storage = createMemoryStorage();
  const previousState = JSON.parse(JSON.stringify(createMarketplaceStore(null).read())) as Record<string, unknown>;
  previousState.schemaVersion = 3;
  const previousNfts = previousState.nfts as Array<Record<string, unknown>>;
  const emerald = previousNfts.find(({ id }) => id === 'nft-001');
  const updatedNft = previousNfts.find(({ id }) => id === 'nft-004');
  expect(emerald).toBeTruthy();
  expect(updatedNft).toBeTruthy();
  if (!emerald || !updatedNft) throw new Error('NFTs de fixture ausentes.');
  emerald.title = 'Aurora Fragment';
  emerald.priceEth = '0.18';
  emerald.availableEditions = 12;
  updatedNft.priceEth = '0.41';
  updatedNft.availableEditions = 0;
  updatedNft.version = 3;
  storage.setItem('kurio.marketplace.state.v1', JSON.stringify(previousState));

  const migratedState = createMarketplaceStore(storage).read();
  expect(migratedState.schemaVersion).toBe(10);
  expect(migratedState.nfts.find(({ id }) => id === 'nft-001')).toMatchObject({
    title: 'Emerald Ape #042',
    priceEth: '1.19',
    availableEditions: 50,
  });
  expect(migratedState.nfts.find(({ id }) => id === 'nft-004')).toMatchObject({
    title: 'Cosmic Bloom #118',
    priceEth: '0.41',
    availableEditions: 0,
    version: 3,
  });
  expect(migratedState.nfts.find(({ id }) => id === 'nft-001')?.imageUrl).toBeTruthy();
});

test('migra snapshot da etapa 5 para atualizar a descrição mobile preservando preço e disponibilidade', () => {
  const storage = createMemoryStorage();
  const previousState = JSON.parse(JSON.stringify(createMarketplaceStore(null).read())) as Record<string, unknown>;
  previousState.schemaVersion = 5;
  const previousNfts = previousState.nfts as Array<Record<string, unknown>>;
  const emerald = previousNfts.find(({ id }) => id === 'nft-001');
  if (!emerald) throw new Error('NFT Emerald Ape ausente no snapshot.');
  emerald.description = 'Descrição antiga.';
  emerald.detailSections = [];
  emerald.priceEth = '0.89';
  emerald.availableEditions = 8;
  emerald.version = 2;
  storage.setItem('kurio.marketplace.state.v1', JSON.stringify(previousState));

  const migratedState = createMarketplaceStore(storage).read();
  const migratedEmerald = migratedState.nfts.find(({ id }) => id === 'nft-001');
  expect(migratedState.schemaVersion).toBe(10);
  expect(migratedEmerald).toMatchObject({
    description: 'Um colecionável digital 1/50 finalizado à mão da coleção Kurio Editions, verificado na Ethereum.',
    priceEth: '0.89',
    availableEditions: 8,
    version: 2,
  });
  expect(migratedEmerald?.detailSections?.[0].body).toContain('Cada atributo fica armazenado nos metadados do token');
  expect(migratedState.networkScenario).toBe(previousState.networkScenario);
});

test('migra snapshot da etapa 4 adicionando username, ENS e campos completos de carteira', () => {
  const storage = createMemoryStorage();
  const previousState = JSON.parse(JSON.stringify(createMarketplaceStore(null).read())) as Record<string, unknown>;
  previousState.schemaVersion = 6;
  const previousProfiles = previousState.profiles as Array<Record<string, unknown>>;
  for (const profile of previousProfiles) {
    delete profile.username;
    delete profile.ensName;
    delete profile.walletNickname;
  }
  previousProfiles.push({ userId: 'user-legacy', name: 'Legado', email: 'ana.silva@legacy.test', avatarUrl: null });
  const previousWallets = previousState.wallets as Array<Record<string, unknown>>;
  for (const wallet of previousWallets) {
    for (const field of ['displayName', 'nickname', 'profileName', 'walletType', 'referralCode', 'email', 'ensName', 'alternateAddress']) {
      delete wallet[field];
    }
  }
  previousWallets.push({
    id: 'wallet-ana-extra',
    userId: 'user-ana',
    address: '0x4444444444444444444444444444444444444444',
    network: 'Polygon',
    role: 'secundaria',
  });
  storage.setItem('kurio.marketplace.state.v1', JSON.stringify(previousState));

  const migratedState = createMarketplaceStore(storage).read();
  expect(migratedState.schemaVersion).toBe(10);
  expect(migratedState.profiles.find(({ userId }) => userId === 'user-ana')).toMatchObject({
    username: 'ana.silva',
    ensName: 'anasilva.eth',
  });
  // Username derivado do e-mail colide com o do fixture e recebe sufixo único.
  expect(migratedState.profiles.find(({ userId }) => userId === 'user-legacy')?.username).toBe('ana.silva-2');
  expect(migratedState.wallets.filter(({ userId }) => userId === 'user-ana')).toHaveLength(2);
  expect(migratedState.wallets.find(({ id }) => id === 'wallet-caio-main')).toMatchObject({
    walletType: 'Coinbase',
    referralCode: 'KURIO-CAIO',
    alternateAddress: null,
  });
});

test('migra snapshot da etapa 5 adicionando cupom aos carrinhos e IDs de token do catálogo', () => {
  const storage = createMemoryStorage();
  const previousState = JSON.parse(JSON.stringify(createMarketplaceStore(null).read())) as Record<string, unknown>;
  previousState.schemaVersion = 7;
  const carts = previousState.carts as Array<Record<string, unknown>>;
  for (const cart of carts) delete cart.couponCode;
  const nfts = previousState.nfts as Array<Record<string, unknown>>;
  const violet = nfts.find(({ id }) => id === 'nft-005');
  if (!violet) throw new Error('NFT de fixture ausente.');
  delete violet.tokenId;
  violet.priceEth = '1.49';
  violet.version = 2;
  storage.setItem('kurio.marketplace.state.v1', JSON.stringify(previousState));

  const migratedState = createMarketplaceStore(storage).read();
  expect(migratedState.schemaVersion).toBe(10);
  expect(migratedState.carts.every(({ couponCode }) => couponCode === null)).toBe(true);
  expect(migratedState.carts.find(({ userId }) => userId === 'user-ana')?.items).toHaveLength(3);
  expect(migratedState.nfts.find(({ id }) => id === 'nft-005')).toMatchObject({ tokenId: '#0009', priceEth: '1.49', version: 2 });
});
