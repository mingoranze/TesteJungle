import {
  marketplaceScenarios,
  type MarketplaceScenarioId,
  type MarketplaceSeed,
} from './marketplace-fixtures';
import {
  isMarketplaceNetworkScenarioId,
  type MarketplaceNetworkScenarioId,
} from './marketplace-network-scenarios';

const STORAGE_KEY = 'kurio.marketplace.state.v1';
const SCHEMA_VERSION = 10;

export interface MarketplaceState extends MarketplaceSeed {
  schemaVersion: typeof SCHEMA_VERSION;
  scenario: MarketplaceScenarioId;
  networkScenario: MarketplaceNetworkScenarioId;
}

export interface MarketplaceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface MarketplaceStore {
  read(): MarketplaceState;
  update(mutator: (draft: MarketplaceState) => void): MarketplaceState;
  selectScenario(scenario: MarketplaceScenarioId): MarketplaceState;
  selectNetworkScenario(scenario: MarketplaceNetworkScenarioId): MarketplaceState;
  reset(scenario?: MarketplaceScenarioId): MarketplaceState;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasUniqueIds(items: readonly { id: string }[]) {
  return new Set(items.map(({ id }) => id)).size === items.length;
}

function assertMarketplaceState(value: unknown): asserts value is MarketplaceState {
  if (!isRecord(value)
    || value.schemaVersion !== SCHEMA_VERSION
    || typeof value.scenario !== 'string'
    || !Object.hasOwn(marketplaceScenarios, value.scenario)
    || !isMarketplaceNetworkScenarioId(value.networkScenario)
    || !Array.isArray(value.nfts)
    || !Array.isArray(value.profiles)
    || !Array.isArray(value.wallets)
    || !Array.isArray(value.favorites)
    || !Array.isArray(value.carts)
    || !Array.isArray(value.orders)
    || !Array.isArray(value.receipts)
    || !isRecord(value.credentials)
    || !isRecord(value.sessions)
    || !isRecord(value.orderRequests)
    || !isRecord(value.orderOwners)
    || !isRecord(value.orderSettlements)) {
    throw new TypeError('O estado persistido do marketplace tem um formato ou versão inválida.');
  }

  const state = value as unknown as MarketplaceState;
  const userIds = new Set(state.profiles.map((profile) => profile.userId));
  const nftIds = new Set(state.nfts.map((nft) => nft.id));
  const walletAddresses = new Set(state.wallets.map((wallet) => wallet.address));
  const favoriteKeys = new Set<string>();
  const idempotencyKeys = new Set<string>();

  if (!hasUniqueIds(state.nfts)
    || !hasUniqueIds(state.profiles.map(({ userId }) => ({ id: userId })))
    || !hasUniqueIds(state.wallets)
    || !hasUniqueIds(state.carts)
    || !hasUniqueIds(state.orders)
    || new Set(state.profiles.map(({ email }) => email)).size !== state.profiles.length
    || new Set(state.profiles.map(({ username }) => username?.toLowerCase())).size !== state.profiles.length) {
    throw new TypeError('O estado do marketplace contém identificadores duplicados.');
  }

  if (state.nfts.some((nft) => !Number.isSafeInteger(nft.availableEditions) || nft.availableEditions < 0)) {
    throw new TypeError('O estado do marketplace contém disponibilidade inválida.');
  }

  if (state.profiles.some((profile) => typeof profile.username !== 'string' || !profile.username)) {
    throw new TypeError('Todo perfil do marketplace deve possuir nome de usuário.');
  }

  const walletRoles = new Set<string>();
  for (const wallet of state.wallets) {
    if (!userIds.has(wallet.userId)) {
      throw new TypeError(`A carteira ${wallet.id} referencia um usuário inexistente.`);
    }
    const roleKey = `${wallet.userId}:${wallet.role}`;
    if (walletRoles.has(roleKey)) {
      throw new TypeError(`O usuário ${wallet.userId} possui mais de uma carteira ${wallet.role}.`);
    }
    walletRoles.add(roleKey);
  }

  for (const [userId, credential] of Object.entries(state.credentials)) {
    if (!userIds.has(userId) || !isRecord(credential)
      || typeof credential.salt !== 'string'
      || !/^[a-f\d]{64}$/i.test(credential.hash)) {
      throw new TypeError(`A credencial do usuário ${userId} tem um formato inválido.`);
    }
  }

  for (const [token, session] of Object.entries(state.sessions)) {
    if (!token || !isRecord(session) || !userIds.has(String(session.userId))
      || !Number.isSafeInteger(session.expiresAt) || Number(session.expiresAt) < 1) {
      throw new TypeError('O estado do marketplace contém uma sessão inválida.');
    }
  }

  for (const favorite of state.favorites) {
    const key = `${favorite.userId}:${favorite.nftId}`;
    if (!userIds.has(favorite.userId) || !nftIds.has(favorite.nftId) || favoriteKeys.has(key)) {
      throw new TypeError('O estado do marketplace contém um favorito sem referência válida ou duplicado.');
    }
    favoriteKeys.add(key);
  }

  const cartUserIds = new Set<string | null>();
  for (const cart of state.carts) {
    if ((cart.userId !== null && !userIds.has(cart.userId)) || cartUserIds.has(cart.userId)) {
      throw new TypeError(`O carrinho ${cart.id} referencia um usuário inexistente ou duplicado.`);
    }
    cartUserIds.add(cart.userId);
    if (cart.couponCode !== null && (typeof cart.couponCode !== 'string' || !cart.couponCode)) {
      throw new TypeError(`O carrinho ${cart.id} contém um cupom inválido.`);
    }

    const itemKeys = new Set<string>();
    for (const item of cart.items) {
      const nft = state.nfts.find(({ id }) => id === item.nftId);
      const key = `${item.nftId}:${item.editionId}`;
      if (!nft || !Number.isSafeInteger(item.quantity) || item.quantity < 1
        || itemKeys.has(key)) {
        throw new TypeError(`O carrinho ${cart.id} contém um item inválido ou duplicado.`);
      }
      itemKeys.add(key);
    }
  }

  const receiptOrderIds = new Set<string>();
  for (const order of state.orders) {
    if (idempotencyKeys.has(order.idempotencyKey)) {
      throw new TypeError('O estado do marketplace contém chaves de idempotência duplicadas.');
    }
    idempotencyKeys.add(order.idempotencyKey);
    if (!Array.isArray(order.items) || !isRecord(order.quote)
      || order.items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity < 1)) {
      throw new TypeError(`O pedido ${order.id} não possui um snapshot de compra válido.`);
    }
  }

  for (const [orderId, settleAt] of Object.entries(state.orderSettlements)) {
    const order = state.orders.find(({ id }) => id === orderId);
    if (!order || order.status !== 'pendente' || !Number.isSafeInteger(settleAt)) {
      throw new TypeError(`A liquidação agendada do pedido ${orderId} é inválida.`);
    }
  }

  for (const [key, request] of Object.entries(state.orderRequests)) {
    if (!idempotencyKeys.has(key) || typeof request !== 'string') {
      throw new TypeError('O estado do marketplace contém uma referência de idempotência inválida.');
    }
  }

  for (const [orderId, userId] of Object.entries(state.orderOwners)) {
    if (!state.orders.some(({ id }) => id === orderId) || !userIds.has(userId)) {
      throw new TypeError(`O pedido ${orderId} referencia um usuário inexistente.`);
    }
  }

  for (const receipt of state.receipts) {
    const order = state.orders.find(({ id }) => id === receipt.orderId);
    if (!order || order.status !== 'confirmado' || !walletAddresses.has(receipt.walletAddress)
      || receiptOrderIds.has(receipt.orderId)
      || receipt.items.some((item) => !nftIds.has(item.nftId))) {
      throw new TypeError(`O recibo do pedido ${receipt.orderId} não é consistente com o estado.`);
    }
    receiptOrderIds.add(receipt.orderId);
  }

  if (state.orders.some((order) => order.status === 'confirmado' && !receiptOrderIds.has(order.id))) {
    throw new TypeError('Todo pedido confirmado deve possuir um recibo consistente.');
  }
}

function createScenarioState(scenario: MarketplaceScenarioId): MarketplaceState {
  return {
    schemaVersion: SCHEMA_VERSION,
    scenario,
    networkScenario: 'success',
    ...clone(marketplaceScenarios[scenario]),
  };
}

function currentNftFixtures(value: Record<string, unknown>, scenario: string) {
  if (scenario === 'empty-catalog') return [];

  const previousNfts = Array.isArray(value.nfts) ? value.nfts : [];
  return marketplaceScenarios.default.nfts.map((fixture) => {
    const previous = previousNfts.find((item) => isRecord(item) && item.id === fixture.id);
    if (!isRecord(previous)) return fixture;

    const version = typeof previous.version === 'number' && Number.isSafeInteger(previous.version)
      ? previous.version
      : fixture.version;
    const changedSinceFixture = version > fixture.version;
    const availableEditions = typeof previous.availableEditions === 'number'
      && Number.isSafeInteger(previous.availableEditions)
      && previous.availableEditions >= 0
      ? previous.availableEditions
      : fixture.availableEditions;

    return {
      ...fixture,
      version: Math.max(version, fixture.version),
      ...(changedSinceFixture && typeof previous.priceEth === 'string'
        ? { priceEth: previous.priceEth }
        : {}),
      ...(changedSinceFixture ? { availableEditions } : {}),
    };
  });
}

function uniqueUsername(base: string, taken: Set<string>) {
  const normalized = base.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 24) || 'colecionador';
  let candidate = normalized.length >= 3 ? normalized : `${normalized}-kurio`;
  let suffix = 2;
  while (taken.has(candidate)) {
    candidate = `${normalized}-${suffix}`;
    suffix += 1;
  }
  taken.add(candidate);
  return candidate;
}

/** Schema 7: perfis ganham username/ENS/apelido e carteiras os campos do formulário do Figma. */
function migrateProfilesAndWallets(value: Record<string, unknown>) {
  const defaultSeed = marketplaceScenarios.default;
  const takenUsernames = new Set<string>();
  const rawProfiles = Array.isArray(value.profiles) ? value.profiles : [];
  const profiles = rawProfiles.map((profile) => {
    if (!isRecord(profile)) return profile;
    const seed = defaultSeed.profiles.find(({ userId }) => userId === profile.userId);
    const preferred = typeof profile.username === 'string' && profile.username
      ? profile.username
      : seed?.username ?? (typeof profile.email === 'string' ? profile.email.split('@')[0] : 'colecionador');
    return {
      ...profile,
      username: uniqueUsername(preferred, takenUsernames),
      ensName: typeof profile.ensName === 'string' ? profile.ensName : seed?.ensName ?? null,
      walletNickname: typeof profile.walletNickname === 'string'
        ? profile.walletNickname
        : seed?.walletNickname ?? null,
    };
  });

  const seenRoles = new Set<string>();
  const rawWallets = Array.isArray(value.wallets) ? value.wallets : [];
  const wallets = rawWallets.flatMap((wallet) => {
    if (!isRecord(wallet)) return [wallet];
    const roleKey = `${String(wallet.userId)}:${String(wallet.role)}`;
    // Versões anteriores aceitavam várias carteiras secundárias; mantém a primeira de cada papel.
    if (seenRoles.has(roleKey)) return [];
    seenRoles.add(roleKey);
    const seed = defaultSeed.wallets.find(({ id }) => id === wallet.id);
    const owner = profiles.find((profile) => isRecord(profile) && profile.userId === wallet.userId);
    const ownerRecord: Record<string, unknown> = isRecord(owner) ? owner : {};
    const ownerUsername = typeof ownerRecord.username === 'string' ? ownerRecord.username : 'colecionador';
    return [{
      displayName: seed?.displayName ?? String(ownerRecord.name ?? ownerUsername),
      nickname: seed?.nickname ?? (typeof ownerRecord.walletNickname === 'string'
        ? ownerRecord.walletNickname
        : `Carteira ${String(wallet.network ?? '')}`.trim()),
      profileName: seed?.profileName ?? ownerUsername,
      walletType: seed?.walletType ?? 'MetaMask',
      referralCode: seed?.referralCode ?? 'KURIO-DEMO',
      email: seed?.email ?? String(ownerRecord.email ?? ''),
      ensName: seed?.ensName ?? (typeof ownerRecord.ensName === 'string'
        ? ownerRecord.ensName
        : `${ownerUsername.replace(/[^a-z0-9-]/g, '-')}.eth`),
      alternateAddress: null,
      ...wallet,
    }];
  });

  return { profiles, wallets };
}

/** Schema 8: carrinhos passam a guardar o cupom aplicado (`couponCode`). */
function migrateCarts(value: Record<string, unknown>) {
  const carts = Array.isArray(value.carts) ? value.carts : [];
  return carts.map((cart) => (isRecord(cart)
    ? { ...cart, couponCode: typeof cart.couponCode === 'string' && cart.couponCode ? cart.couponCode : null }
    : cart));
}

function migrateToSchema9(value: unknown): unknown {
  if (isRecord(value) && value.schemaVersion === 8) {
    // Schema 9: catálogo ampliado (vitrine e páginas do frame "Início"), preservando alterações por eventos.
    return {
      ...value,
      nfts: currentNftFixtures(value, typeof value.scenario === 'string' ? value.scenario : 'default'),
      schemaVersion: 9,
    };
  }
  if (isRecord(value) && value.schemaVersion === 7) {
    return {
      ...value,
      // Metadados do catálogo (IDs de token do frame do carrinho) mantendo preços/estoque alterados por eventos.
      nfts: currentNftFixtures(value, typeof value.scenario === 'string' ? value.scenario : 'default'),
      carts: migrateCarts(value),
      schemaVersion: 9,
    };
  }
  if (isRecord(value) && value.schemaVersion === 6) {
    return {
      ...value,
      ...migrateProfilesAndWallets(value),
      carts: migrateCarts(value),
      schemaVersion: 9,
    };
  }
  if (!isRecord(value)
    || (value.schemaVersion !== 1
      && value.schemaVersion !== 2
      && value.schemaVersion !== 3
      && value.schemaVersion !== 4
      && value.schemaVersion !== 5)) return value;

  const defaultSeed = marketplaceScenarios.default;
  const existingCredentials = isRecord(value.credentials) ? value.credentials : undefined;
  const existingSessions = isRecord(value.sessions) ? value.sessions : undefined;
  const existingOrderRequests = isRecord(value.orderRequests) ? value.orderRequests : undefined;
  const existingOrderOwners = isRecord(value.orderOwners) ? value.orderOwners : undefined;
  const profiles = Array.isArray(value.profiles) ? value.profiles : [];
  const orders = Array.isArray(value.orders) ? value.orders : [];
  const credentials = Object.fromEntries(
    profiles.flatMap((profile) => {
      if (!isRecord(profile) || typeof profile.userId !== 'string' || typeof profile.email !== 'string') {
        return [];
      }

      const seedProfile = defaultSeed.profiles.find(({ email }) => email === profile.email);
      const seedCredential = seedProfile && defaultSeed.credentials[seedProfile.userId];
      return seedCredential ? [[profile.userId, seedCredential]] : [];
    }),
  );
  const orderOwners = Object.fromEntries(
    orders.flatMap((order) => {
      if (!isRecord(order) || typeof order.id !== 'string') return [];
      const owner = defaultSeed.orderOwners[order.id];
      return owner ? [[order.id, owner]] : [];
    }),
  );

  return {
    ...value,
    ...migrateProfilesAndWallets(value),
    carts: migrateCarts(value),
    schemaVersion: 9,
    networkScenario: value.schemaVersion >= 4 && isMarketplaceNetworkScenarioId(value.networkScenario)
      ? value.networkScenario
      : 'success',
    nfts: currentNftFixtures(value, typeof value.scenario === 'string' ? value.scenario : 'default'),
    credentials: existingCredentials ?? credentials,
    sessions: existingSessions ?? {},
    orderRequests: existingOrderRequests ?? {},
    orderOwners: existingOrderOwners ?? orderOwners,
  };
}

/**
 * Schema 10: pedidos guardam o snapshot da compra (itens, cotação, carteira, rede, provedor) e o
 * recibo ganha rede/provedor/bloco. Pedidos do fixture recebem o snapshot conhecido; pedidos
 * criados em versões anteriores (sem itens registrados) ficam com snapshot vazio, sem inventar dados.
 */
function migrateOrdersToSchema10(value: Record<string, unknown>) {
  const seed = marketplaceScenarios.default;
  const wallets = Array.isArray(value.wallets) ? value.wallets.filter(isRecord) : [];
  const owners = isRecord(value.orderOwners) ? value.orderOwners : {};
  const receipts = Array.isArray(value.receipts) ? value.receipts : [];
  const orders = (Array.isArray(value.orders) ? value.orders : []).map((order) => {
    if (!isRecord(order) || Array.isArray(order.items)) return order;
    const fixture = seed.orders.find(({ id }) => id === order.id);
    if (fixture) return { ...clone(fixture), status: order.status, version: order.version };
    const ownerWallet = wallets.find((wallet) => wallet.userId === owners[String(order.id)] && wallet.role === 'principal')
      ?? wallets.find((wallet) => wallet.userId === owners[String(order.id)]);
    return {
      ...order,
      updatedAt: order.createdAt,
      items: [],
      quote: {
        currency: 'ETH',
        cartVersion: 0,
        couponCode: null,
        subtotalEth: '0',
        discountEth: '0',
        networkFeeEth: '0',
        totalEth: '0',
        expiresAt: order.createdAt,
      },
      walletId: ownerWallet?.id ?? '',
      walletAddress: ownerWallet?.address ?? '',
      network: ownerWallet?.network === 'Polygon' ? 'Polygon' : 'Ethereum',
      provider: ownerWallet?.walletType ?? 'MetaMask',
      collector: null,
      failureReason: null,
    };
  });
  const migratedReceipts = receipts.map((receipt) => {
    if (!isRecord(receipt) || typeof receipt.blockNumber === 'number') return receipt;
    const fixture = seed.receipts.find(({ orderId }) => orderId === receipt.orderId);
    if (fixture) return clone(fixture);
    const order = orders.find((item) => isRecord(item) && item.id === receipt.orderId);
    const orderRecord: Record<string, unknown> = isRecord(order) ? order : {};
    return {
      ...receipt,
      items: orderRecord.items ?? [],
      network: orderRecord.network ?? 'Ethereum',
      provider: orderRecord.provider ?? 'MetaMask',
      blockNumber: 19_000_000,
    };
  });
  return { orders, receipts: migratedReceipts, orderSettlements: {} };
}

function migrateMarketplaceState(value: unknown): unknown {
  const schema9 = migrateToSchema9(value);
  if (!isRecord(schema9) || schema9.schemaVersion !== 9) return backfillNftFixtureFields(schema9);
  return backfillNftFixtureFields({ ...schema9, ...migrateOrdersToSchema10(schema9), schemaVersion: SCHEMA_VERSION });
}

const BACKFILLED_NFT_FIELDS = ['imageUrl', 'category', 'network'] as const;
/**
 * Campos derivados do build (URLs de assets geradas pelo Vite): mudam entre dev/preview/deploy
 * e a cada novo hash, então sempre vêm do fixture atual em vez do valor persistido.
 */
const BUILD_DERIVED_NFT_FIELDS: ReadonlySet<string> = new Set(['imageUrl']);

/**
 * Preenche arte, categoria e rede de NFTs salvos antes de o fixture ganhar esses campos,
 * sem sobrescrever valores existentes nem o resto do estado (preço, disponibilidade etc.).
 * A arte é sempre atualizada para a URL do build atual, evitando imagens quebradas.
 */
function backfillNftFixtureFields(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.nfts)) return value;
  let changed = false;
  const nfts = value.nfts.map((nft) => {
    if (!isRecord(nft)) return nft;
    const fixture = marketplaceScenarios.default.nfts.find(({ id }) => id === nft.id);
    if (!fixture) return nft;
    const missing = Object.fromEntries(BACKFILLED_NFT_FIELDS
      .filter((field) => fixture[field] && (BUILD_DERIVED_NFT_FIELDS.has(field)
        ? nft[field] !== fixture[field]
        : !nft[field]))
      .map((field) => [field, fixture[field]]));
    if (Object.keys(missing).length === 0) return nft;
    changed = true;
    return { ...nft, ...missing };
  });

  // Pedidos e recibos congelam a arte no momento da compra; atualiza só a URL do asset.
  const refreshItemArt = (record: unknown): unknown => {
    if (!isRecord(record) || !Array.isArray(record.items)) return record;
    let itemsChanged = false;
    const items = record.items.map((item) => {
      if (!isRecord(item) || !item.imageUrl) return item;
      const fixture = marketplaceScenarios.default.nfts.find(({ id }) => id === item.nftId);
      if (!fixture?.imageUrl || fixture.imageUrl === item.imageUrl) return item;
      itemsChanged = true;
      return { ...item, imageUrl: fixture.imageUrl };
    });
    if (!itemsChanged) return record;
    changed = true;
    return { ...record, items };
  };
  const orders = Array.isArray(value.orders) ? value.orders.map(refreshItemArt) : value.orders;
  const receipts = Array.isArray(value.receipts) ? value.receipts.map(refreshItemArt) : value.receipts;

  return changed ? { ...value, nfts, orders, receipts } : value;
}

export function createMarketplaceStore(
  storage?: MarketplaceStorage | null,
): MarketplaceStore {
  let state: MarketplaceState | undefined;

  function resolveStorage(): MarketplaceStorage | undefined {
    if (storage !== undefined) return storage ?? undefined;
    if (typeof window === 'undefined') return undefined;

    try {
      return window.localStorage;
    } catch (error) {
      throw new Error('Não foi possível acessar o armazenamento local do marketplace.', { cause: error });
    }
  }

  function persist(nextState: MarketplaceState) {
    const browserStorage = resolveStorage();
    if (!browserStorage) return;

    try {
      browserStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    } catch (error) {
      throw new Error('Não foi possível persistir o estado simulado do marketplace.', { cause: error });
    }
  }

  function ensureState() {
    if (state) return state;

    const browserStorage = resolveStorage();
    if (!browserStorage) {
      state = createScenarioState('default');
      return state;
    }

    let savedState: string | null;
    try {
      savedState = browserStorage.getItem(STORAGE_KEY);
    } catch (error) {
      throw new Error('Não foi possível ler o estado persistido do marketplace.', { cause: error });
    }

    if (savedState === null) {
      const initialState = createScenarioState('default');
      persist(initialState);
      state = initialState;
      return state;
    }

    let parsedState: unknown;
    try {
      parsedState = JSON.parse(savedState);
    } catch (error) {
      throw new Error('O estado persistido do marketplace contém JSON inválido; use o reset para restaurá-lo.', { cause: error });
    }

    const migratedState = migrateMarketplaceState(parsedState);
    assertMarketplaceState(migratedState);
    state = migratedState;
    if (migratedState !== parsedState) persist(migratedState);
    return state;
  }

  function replaceState(nextState: MarketplaceState) {
    assertMarketplaceState(nextState);
    persist(nextState);
    state = nextState;
    return clone(nextState);
  }

  return {
    read() {
      return clone(ensureState());
    },
    update(mutator) {
      const draft = clone(ensureState());
      mutator(draft);
      assertMarketplaceState(draft);
      return replaceState(draft);
    },
    selectScenario(scenario) {
      return replaceState(createScenarioState(scenario));
    },
    selectNetworkScenario(scenario) {
      const fixtureScenario = scenario === 'empty-catalog' ? 'empty-catalog' : 'default';
      const nextState = createScenarioState(fixtureScenario);
      nextState.networkScenario = scenario;
      return replaceState(nextState);
    },
    reset(scenario) {
      const selectedScenario = scenario ?? ensureState().scenario;
      return replaceState(createScenarioState(selectedScenario));
    },
  };
}

const marketplaceStore = createMarketplaceStore();

export function readMarketplaceState() {
  return marketplaceStore.read();
}

export function updateMarketplaceState(mutator: (draft: MarketplaceState) => void) {
  return marketplaceStore.update(mutator);
}

export function selectMarketplaceScenario(scenario: MarketplaceScenarioId) {
  return marketplaceStore.selectScenario(scenario);
}

export function selectMarketplaceNetworkScenario(scenario: MarketplaceNetworkScenarioId) {
  return marketplaceStore.selectNetworkScenario(scenario);
}

export function resetMarketplaceState(scenario?: MarketplaceScenarioId) {
  return marketplaceStore.reset(scenario);
}
