import {
  decimalString,
  idempotencyKey,
  nftCategories,
  nftNetworks,
  quantity,
  type Cart,
  type Favorite,
  type Nft,
  type Order,
  type OrderItem,
  type OrderReceipt,
  type Quote,
  type Profile,
  type Wallet,
} from '../domain/contracts';
const apeEmerald = new URL('../assets/images/Frame 136.png', import.meta.url).href;
const apeSage = new URL('../assets/images/NFT Artwork 04.png', import.meta.url).href;
const apeNeon = new URL('../assets/images/NFT Artwork 05.png', import.meta.url).href;
const apeGolden = new URL('../assets/images/NFT Artwork 11.png', import.meta.url).href;

export type MarketplaceScenarioId = 'default' | 'empty-catalog';

export interface MarketplaceSeed {
  nfts: Nft[];
  profiles: Profile[];
  wallets: Wallet[];
  favorites: Favorite[];
  carts: Cart[];
  orders: Order[];
  receipts: OrderReceipt[];
  credentials: Record<string, { salt: string; hash: string }>;
  sessions: Record<string, { userId: string; expiresAt: number }>;
  orderRequests: Record<string, string>;
  orderOwners: Record<string, string>;
  /** Liquidação simulada agendada (timestamp em ms) para pedidos pendentes criados pela API. */
  orderSettlements: Record<string, number>;
}

const catalogNfts: Nft[] = [
  {
    id: 'nft-001',
    title: 'Emerald Ape #042',
    collectionId: 'celestial',
    collectionName: 'Kurio Apes',
    tokenId: '#0042',
    priceEth: decimalString('1.19'),
    availableEditions: 50,
    version: 1,
    imageUrl: apeEmerald,
    description: 'Um colecionável digital 1/50 finalizado à mão da coleção Kurio Editions, verificado na Ethereum.',
    editionOptions: ['1/10', '1/10', '1/50', 'ABERTA'],
    attributes: [{ traitType: 'Atributos', value: 'Óculos, Esmeralda, Raro' }],
    rating: 4.8,
    reviewCount: 19,
    detailSections: [
      {
        body: 'Emerald Ape #042 é uma obra digital 1/50 finalizada à mão da coleção Kurio Editions. Cada atributo fica armazenado nos metadados do token e verificado na Ethereum. A obra explora identidade, movimento e luz em um mundo digital sem fronteiras.',
      },
      {
        body: 'A propriedade inclui a arte em alta resolução, lançamentos exclusivos para colecionadores e um registro permanente de procedência registrada na rede. Nova Sato recebe 5% de direitos autorais nas vendas secundárias, apoiando novos trabalhos e lançamentos da comunidade.',
      },
      { heading: 'Rede:', body: 'Cunhado na Ethereum com procedência imutável e metadados armazenados no IPFS.' },
      {
        heading: 'Contrato:',
        body: 'Direitos autorais do criador: 5% nas vendas secundárias, pagos automaticamente pelos mercados compatíveis.',
      },
      { heading: 'Direitos autorais:', body: '0x7A42...19E8 • Contrato inteligente ERC-721 verificado.' },
    ],
  },
  { id: 'nft-002', title: 'Sage Nomad #009', collectionId: 'monuments', priceEth: decimalString('1.69'), availableEditions: 5, version: 3, imageUrl: apeSage },
  { id: 'nft-003', title: 'Neon Vessel #552', collectionId: 'signals', priceEth: decimalString('1.99'), availableEditions: 10, version: 1, imageUrl: apeNeon },
  { id: 'nft-004', title: 'Cosmic Bloom #118', collectionId: 'celestial', priceEth: decimalString('1.29'), availableEditions: 4, version: 2, imageUrl: apeSage },
  { id: 'nft-005', title: 'Violet Nomad #314', tokenId: '#0009', collectionId: 'monuments', priceEth: decimalString('1.39'), availableEditions: 10, version: 1, imageUrl: apeSage },
  { id: 'nft-006', title: 'Ivory Baron #088', tokenId: '#0552', collectionId: 'signals', priceEth: decimalString('1.79'), availableEditions: 12, version: 2, imageUrl: apeNeon, editionOptions: ['1/10'] },
  { id: 'nft-007', title: 'Golden Beat #207', collectionId: 'celestial', priceEth: decimalString('0.99'), availableEditions: 20, version: 1, imageUrl: apeGolden, editionOptions: ['1/50'] },
  // 8ª posição do frame "Início": cartão apenas com a arte dourada, sem nome/preço visíveis.
  { id: 'nft-013', title: 'Golden Beat #208', collectionId: 'celestial', priceEth: decimalString('0.99'), availableEditions: 20, version: 1, imageUrl: apeGolden, showcaseOnly: true },
  { id: 'nft-009', title: 'Golden Signal #160', collectionId: 'signals', priceEth: decimalString('0.39'), availableEditions: 7, version: 1, imageUrl: apeGolden },
  { id: 'nft-008', title: 'Pillar in Fog', collectionId: 'monuments', priceEth: decimalString('0.78'), availableEditions: 3, version: 4, imageUrl: apeEmerald },
  { id: 'nft-010', title: 'Solar Archive', collectionId: 'celestial', priceEth: decimalString('2.05'), availableEditions: 1, version: 5, imageUrl: apeNeon },
  { id: 'nft-011', title: 'Monument in Blue', collectionId: 'monuments', priceEth: decimalString('0.56'), availableEditions: 6, version: 2, imageUrl: apeNeon },
  { id: 'nft-012', title: 'Echo Garden', collectionId: 'signals', priceEth: decimalString('0.22'), availableEditions: 9, version: 1, imageUrl: apeSage },
  // Registros de catálogo para as 4 páginas de 9 itens do frame "Início" (artes reaproveitadas).
  ...catalogFill(),
];

/**
 * Categoria e rede de cada NFT, distribuídas em ciclo pela ordem do catálogo para que todo
 * filtro de "Coleções" e "Rede" tenha resultados. Campos explícitos no registro têm prioridade.
 */
const nfts: Nft[] = catalogNfts.map((nft, index) => ({
  category: nftCategories[index % nftCategories.length].id,
  network: nftNetworks[index % nftNetworks.length].id,
  ...nft,
}));

function catalogFill(): Nft[] {
  const arts = [apeEmerald, apeSage, apeNeon, apeGolden];
  const names = ['Emerald', 'Sage', 'Onyx', 'Amber'];
  const roles = ['Wanderer', 'Keeper', 'Drifter', 'Scholar', 'Pilot', 'Herald'];
  const collections = ['celestial', 'monuments', 'signals'];
  return Array.from({ length: 23 }, (_, index) => {
    const number = 14 + index;
    const cents = 45 + ((index * 37) % 180);
    return {
      id: `nft-${String(number).padStart(3, '0')}`,
      title: `${names[index % 4]} ${roles[index % 6]} #${String(300 + index * 17).padStart(3, '0')}`,
      collectionId: collections[index % 3],
      priceEth: decimalString(`${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`),
      availableEditions: 3 + (index % 12),
      version: 1,
      imageUrl: arts[index % 4],
    };
  });
}

const profiles: Profile[] = [
  {
    userId: 'user-ana',
    name: 'Ana Silva',
    username: 'ana.silva',
    email: 'ana@kurio.test',
    ensName: 'anasilva.eth',
    walletNickname: 'Cofre da Ana',
    avatarUrl: null,
  },
  {
    userId: 'user-caio',
    name: 'Caio Nunes',
    username: 'caio.nunes',
    email: 'caio@kurio.test',
    ensName: 'caionunes.eth',
    walletNickname: 'Carteira do Caio',
    avatarUrl: null,
  },
];

const wallets: Wallet[] = [
  {
    id: 'wallet-ana-main',
    userId: 'user-ana',
    address: '0x1111111111111111111111111111111111111111',
    network: 'Ethereum',
    role: 'principal',
    displayName: 'Ana Silva',
    nickname: 'Cofre da Ana',
    profileName: 'ana.silva',
    walletType: 'MetaMask',
    referralCode: 'KURIO-ANA',
    email: 'ana@kurio.test',
    ensName: 'anasilva.eth',
    alternateAddress: null,
  },
  {
    id: 'wallet-ana-secondary',
    userId: 'user-ana',
    address: '0x2222222222222222222222222222222222222222',
    network: 'Polygon',
    role: 'secundaria',
    displayName: 'Ana Silva',
    nickname: 'Ana Polygon',
    profileName: 'ana.silva',
    walletType: 'WalletConnect',
    referralCode: 'KURIO-ANA',
    email: 'ana@kurio.test',
    ensName: 'anasilva.eth',
    alternateAddress: null,
  },
  {
    id: 'wallet-caio-main',
    userId: 'user-caio',
    address: '0x3333333333333333333333333333333333333333',
    network: 'Ethereum',
    role: 'principal',
    displayName: 'Caio Nunes',
    nickname: 'Carteira do Caio',
    profileName: 'caio.nunes',
    walletType: 'Coinbase',
    referralCode: 'KURIO-CAIO',
    email: 'caio@kurio.test',
    ensName: 'caionunes.eth',
    alternateAddress: null,
  },
];

const favorites: Favorite[] = [
  { userId: 'user-ana', nftId: 'nft-001', createdAt: '2026-01-15T10:00:00.000Z' },
  { userId: 'user-ana', nftId: 'nft-007', createdAt: '2026-01-16T10:00:00.000Z' },
  { userId: 'user-caio', nftId: 'nft-002', createdAt: '2026-01-17T10:00:00.000Z' },
];

const carts: Cart[] = [
  {
    id: 'cart-ana',
    userId: 'user-ana',
    version: 1,
    couponCode: null,
    items: [
      // Itens e quantidades do frame desktop "Carrinho de NFTs".
      { nftId: 'nft-001', editionId: 'nft-001-edition-03', quantity: quantity(2), unitPriceEth: decimalString('1.19') },
      { nftId: 'nft-005', editionId: 'nft-005-edition-01', quantity: quantity(6), unitPriceEth: decimalString('1.39') },
      { nftId: 'nft-006', editionId: 'nft-006-edition-01', quantity: quantity(9), unitPriceEth: decimalString('1.79') },
    ],
  },
  { id: 'cart-caio', userId: 'user-caio', version: 0, couponCode: null, items: [] },
  // O carrinho do visitante começa vazio; itens adicionados sem sessão são incorporados ao autenticar.
  { id: 'cart-guest', userId: null, version: 0, couponCode: null, items: [] },
];

/** Snapshots históricos dos pedidos do fixture (valores da época, independentes do catálogo atual). */
const order0001Items: OrderItem[] = [
  {
    nftId: 'nft-006',
    editionId: 'nft-006-edition-01',
    quantity: quantity(1),
    unitPriceEth: decimalString('0.25'),
    title: 'Ivory Baron #088',
    tokenId: '#0552',
    imageUrl: apeNeon,
    editionLabel: '1/10',
    lineTotalEth: decimalString('0.25'),
  },
];
const order0001Quote: Quote = {
  currency: 'ETH',
  cartVersion: 0,
  couponCode: null,
  subtotalEth: decimalString('0.25'),
  discountEth: decimalString('0'),
  networkFeeEth: decimalString('0.005'),
  totalEth: decimalString('0.255'),
  expiresAt: '2026-01-20T12:05:00.000Z',
};
const order0002Items: OrderItem[] = [
  {
    nftId: 'nft-007',
    editionId: 'nft-007-edition-01',
    quantity: quantity(1),
    unitPriceEth: decimalString('0.99'),
    title: 'Golden Beat #207',
    tokenId: null,
    imageUrl: apeGolden,
    editionLabel: '1/50',
    lineTotalEth: decimalString('0.99'),
  },
];
const order0002Quote: Quote = {
  currency: 'ETH',
  cartVersion: 0,
  couponCode: null,
  subtotalEth: decimalString('0.99'),
  discountEth: decimalString('0'),
  networkFeeEth: decimalString('0.016'),
  totalEth: decimalString('1.006'),
  expiresAt: '2026-01-21T12:05:00.000Z',
};

const orders: Order[] = [
  {
    id: 'order-0001',
    idempotencyKey: idempotencyKey('fixture-order-0001'),
    status: 'confirmado',
    version: 2,
    createdAt: '2026-01-20T12:00:00.000Z',
    updatedAt: '2026-01-20T12:01:00.000Z',
    items: order0001Items,
    quote: order0001Quote,
    walletId: wallets[0].id,
    walletAddress: wallets[0].address,
    network: 'Ethereum',
    provider: 'MetaMask',
    collector: null,
    failureReason: null,
  },
  {
    id: 'order-0002',
    idempotencyKey: idempotencyKey('fixture-order-0002'),
    status: 'pendente',
    version: 1,
    createdAt: '2026-01-21T12:00:00.000Z',
    updatedAt: '2026-01-21T12:00:00.000Z',
    items: order0002Items,
    quote: order0002Quote,
    walletId: wallets[0].id,
    walletAddress: wallets[0].address,
    network: 'Ethereum',
    provider: 'MetaMask',
    collector: null,
    failureReason: null,
  },
];

const receipts: OrderReceipt[] = [
  {
    orderId: 'order-0001',
    status: 'confirmado',
    items: order0001Items,
    quote: order0001Quote,
    walletAddress: wallets[0].address,
    network: 'Ethereum',
    provider: 'MetaMask',
    transactionReference: '0xa91f00000000000000000000000000000000000000000000000000000000e82c',
    blockNumber: 19_000_001,
    confirmedAt: '2026-01-20T12:01:00.000Z',
  },
];

const credentials = {
  'user-ana': {
    salt: 'kurio-marketplace-ana-salt-v1',
    hash: 'dfc651fe9a8a90f98a209ff008181547d94172dc090ab073f7429045d348ec12',
  },
  'user-caio': {
    salt: 'kurio-marketplace-caio-salt-v1',
    hash: '36d014cf0519473fb53465450be773d02e09f0a858e957b5bc777d1f58b3d07c',
  },
};

export const marketplaceScenarios: Record<MarketplaceScenarioId, MarketplaceSeed> = {
  default: {
    nfts,
    profiles,
    wallets,
    favorites,
    carts,
    orders,
    receipts,
    credentials,
    sessions: {},
    orderRequests: {},
    orderSettlements: {},
    orderOwners: {
      'order-0001': 'user-ana',
      'order-0002': 'user-ana',
    },
  },
  'empty-catalog': {
    nfts: [],
    profiles,
    wallets,
    favorites: [],
    carts: carts.map((cart) => ({ ...cart, items: [] })),
    orders: [],
    receipts: [],
    credentials,
    sessions: {},
    orderRequests: {},
    orderOwners: {},
    orderSettlements: {},
  },
};

export const marketplaceScenarioOptions: ReadonlyArray<{
  id: MarketplaceScenarioId;
  label: string;
}> = [
  { id: 'default', label: 'Catálogo padrão' },
  { id: 'empty-catalog', label: 'Catálogo vazio' },
];
