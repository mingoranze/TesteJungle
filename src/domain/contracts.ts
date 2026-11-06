export type DecimalString = string & { readonly __brand: 'DecimalString' };
export type Quantity = number & { readonly __brand: 'Quantity' };
export type IdempotencyKey = string & { readonly __brand: 'IdempotencyKey' };

export type Session =
  | { status: 'anonymous' }
  | { status: 'authenticated'; userId: string; expiresAt: string; token?: string };

/** Categorias de NFT exibidas no filtro "Coleções" do catálogo (ordem da interface). */
export const nftCategories = [
  { id: 'arte-digital', label: 'Arte digital' },
  { id: 'fotografia', label: 'Fotografia' },
  { id: 'musica', label: 'Música' },
  { id: 'arte-3d', label: 'Arte 3D' },
  { id: 'colecionaveis', label: 'Colecionáveis' },
  { id: 'generativa', label: 'Generativa' },
  { id: 'jogos', label: 'Jogos' },
  { id: 'assinaturas', label: 'Assinaturas' },
  { id: 'utilidade', label: 'Utilidade' },
] as const;
export type NftCategoryId = (typeof nftCategories)[number]['id'];

/** Redes em que os NFTs são cunhados (filtro "Rede" do catálogo). */
export const nftNetworks = [
  { id: 'ethereum', label: 'Ethereum' },
  { id: 'polygon', label: 'Polygon' },
  { id: 'solana', label: 'Solana' },
] as const;
export type NftNetworkId = (typeof nftNetworks)[number]['id'];

export function isNftCategoryId(value: unknown): value is NftCategoryId {
  return nftCategories.some(({ id }) => id === value);
}

export function isNftNetworkId(value: unknown): value is NftNetworkId {
  return nftNetworks.some(({ id }) => id === value);
}

export interface Nft {
  id: string;
  title: string;
  collectionId: string;
  category?: NftCategoryId;
  network?: NftNetworkId;
  priceEth: DecimalString;
  availableEditions: number;
  version: number;
  imageUrl?: string;
  collectionName?: string;
  tokenId?: string;
  description?: string;
  editionOptions?: string[];
  attributes?: Array<{ traitType: string; value: string }>;
  rating?: number;
  reviewCount?: number;
  detailSections?: Array<{ heading?: string; body: string }>;
  /**
   * Item de vitrine: no cartão do catálogo aparece somente a arte, como no frame "Início"
   * (nome e preço continuam disponíveis para leitores de tela, no detalhe e na compra).
   */
  showcaseOnly?: boolean;
}

export interface Favorite {
  userId: string;
  nftId: string;
  createdAt: string;
}

export interface CartItem {
  nftId: string;
  editionId: string;
  quantity: Quantity;
  unitPriceEth: DecimalString;
}

export interface Cart {
  id: string;
  userId: string | null;
  items: CartItem[];
  version: number;
  /** Cupom aplicado ao carrinho (validado pela API); `null` quando não há cupom. */
  couponCode: string | null;
}

/**
 * Divergência entre um item do carrinho e o catálogo atual, calculada pela API a cada leitura.
 * `price-changed`: o preço atual difere do preço registrado no item;
 * `quantity-exceeds`: a quantidade excede as edições ainda disponíveis;
 * `unavailable`: o NFT ou a edição não tem mais unidades disponíveis.
 */
export type CartIssueKind = 'price-changed' | 'quantity-exceeds' | 'unavailable';

export interface CartIssue {
  nftId: string;
  editionId: string;
  kinds: CartIssueKind[];
  unitPriceEth: DecimalString;
  currentPriceEth: DecimalString;
  quantity: Quantity;
  availableQuantity: number;
}

/** Carrinho retornado pela API: estado persistido + divergências atuais em relação ao catálogo. */
export interface CartResponse extends Cart {
  issues: CartIssue[];
}

export interface Quote {
  currency: 'ETH';
  /** Versão do carrinho usada no cálculo; a UI só exibe a cotação da versão atual. */
  cartVersion: number;
  couponCode: string | null;
  subtotalEth: DecimalString;
  discountEth: DecimalString;
  networkFeeEth: DecimalString;
  totalEth: DecimalString;
  expiresAt: string;
}

export type OrderStatus = 'pendente' | 'confirmado' | 'recusado';
export const terminalOrderStatuses: readonly OrderStatus[] = ['confirmado', 'recusado'];

export function isTerminalOrderStatus(status: OrderStatus) {
  return terminalOrderStatuses.includes(status);
}

/**
 * Item comprado, congelado no momento da criação do pedido: título, arte, token e edição não
 * mudam com alterações posteriores do catálogo (o recibo reproduz este snapshot).
 */
export interface OrderItem extends CartItem {
  title: string;
  tokenId: string | null;
  imageUrl: string | null;
  editionLabel: string | null;
  lineTotalEth: DecimalString;
}

/** Dados do formulário "Perfil do colecionador" informados na compra. */
export interface CollectorDetails {
  displayName: string;
  username: string;
  profileName: string;
  email: string;
  ensName: string;
  referralCode: string;
  /** ENS ou endereço 0x alternativo (opcional). */
  alternateAddress: string | null;
  note: string | null;
}

/** Motivo de recusa de um pedido (estado terminal `recusado`). */
export type OrderFailureReason = 'PAYMENT_REFUSED' | 'AVAILABILITY_CONFLICT';

export interface Order {
  id: string;
  idempotencyKey: IdempotencyKey;
  status: OrderStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  /** Cotação revalidada pela API no momento da criação (referência para o recibo). */
  quote: Quote;
  walletId: string;
  walletAddress: string;
  network: WalletNetwork;
  provider: WalletType;
  collector: CollectorDetails | null;
  failureReason: OrderFailureReason | null;
}

export interface OrderReceipt {
  orderId: string;
  status: 'confirmado';
  items: OrderItem[];
  quote: Quote;
  walletAddress: string;
  network: WalletNetwork;
  provider: WalletType;
  transactionReference: string;
  blockNumber: number;
  confirmedAt: string;
}

/** Conexão simulada entre a conta e o provedor da carteira (MetaMask, WalletConnect, Coinbase). */
export interface WalletConnection {
  id: string;
  walletId: string;
  address: string;
  provider: WalletType;
  network: WalletNetwork;
  connectedAt: string;
}

export interface WalletConnectionRequest {
  walletId: string;
  provider: WalletType;
  network: WalletNetwork;
}

export interface Profile {
  userId: string;
  /** Nome de exibição. */
  name: string;
  /** Nome de usuário único (comparação sem diferenciar maiúsculas). */
  username: string;
  email: string;
  /** Nome ENS completo, por exemplo `colecionador.eth`. */
  ensName: string | null;
  walletNickname: string | null;
  /** URL http(s) ou data URL de imagem PNG/JPEG/WebP. */
  avatarUrl: string | null;
}

export type WalletRole = 'principal' | 'secundaria';
export const walletNetworks = ['Ethereum', 'Polygon'] as const;
export type WalletNetwork = (typeof walletNetworks)[number];
export const walletTypes = ['MetaMask', 'WalletConnect', 'Coinbase'] as const;
export type WalletType = (typeof walletTypes)[number];

export interface Wallet {
  id: string;
  userId: string;
  address: string;
  network: string;
  role: WalletRole;
  displayName: string;
  nickname: string;
  profileName: string;
  walletType: WalletType;
  referralCode: string;
  email: string;
  /** Nome ENS completo, por exemplo `colecionador.eth`. */
  ensName: string;
  /** ENS ou endereço 0x alternativo (opcional). */
  alternateAddress: string | null;
}

export type WalletInput = Omit<Wallet, 'id' | 'userId'>;

export interface RegisterRequest {
  name: string;
  username?: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  session: Extract<Session, { status: 'authenticated' }>;
  profile: Profile;
}

export type UpdateProfileRequest = Partial<
  Pick<Profile, 'name' | 'username' | 'email' | 'ensName' | 'walletNickname' | 'avatarUrl'>
>;

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Contagens e faixa de preço do catálogo inteiro, usadas pelos filtros da página inicial. */
export interface NftFacets {
  categories: Array<{ id: NftCategoryId; count: number }>;
  networks: Array<{ id: NftNetworkId; count: number }>;
  /** Menor e maior preço do catálogo; `null` quando o catálogo está vazio. */
  minPriceEth: DecimalString | null;
  maxPriceEth: DecimalString | null;
}

export interface CartItemInput {
  nftId: string;
  quantity: number;
  /** Edição escolhida (`<nftId>-edition-NN`); padrão: primeira edição do NFT. */
  editionId?: string;
}

export interface CouponRequest {
  couponCode: string;
}

export interface QuoteRequest {
  couponCode?: string;
}

/**
 * Pedido criado a partir do carrinho revisado. `cartVersion`, `expectedTotalEth` e `couponCode`
 * descrevem o que o usuário confirmou; se a API recalcular algo diferente, responde
 * `409 QUOTE_CHANGED` e exige nova confirmação. Enviado com o cabeçalho `Idempotency-Key`.
 */
export interface CreateOrderRequest {
  walletAddress: string;
  connectionId: string;
  network: WalletNetwork;
  provider: WalletType;
  cartVersion: number;
  expectedTotalEth: DecimalString;
  couponCode: string | null;
  collector: CollectorDetails;
}

export interface CreateOrderResponse {
  order: Order;
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface EventEnvelope<TResource> {
  eventId: string;
  version: number;
  resource: TResource;
  occurredAt: string;
}

export type NftUpdatedEvent = EventEnvelope<Nft>;
export type OrderUpdatedEvent = EventEnvelope<Order>;

export interface FoundationState {
  id: 'stage-one';
  status: 'ready' | 'updated';
  version: number;
}

export type FoundationUpdatedEvent = EventEnvelope<FoundationState>;

export function decimalString(value: string): DecimalString {
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(value)) {
    throw new TypeError(`Valor decimal inválido: ${value}`);
  }

  return value as DecimalString;
}

export function quantity(value: number): Quantity {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError('A quantidade deve ser um inteiro positivo.');
  }

  return value as Quantity;
}

/** Identificador estável da edição de índice `index` (base 0) de um NFT. */
export function editionIdFor(nftId: string, index = 0) {
  return `${nftId}-edition-${String(index + 1).padStart(2, '0')}`;
}

export interface NftEdition {
  id: string;
  /** Rótulo exibido (por exemplo `1/50`); `null` quando o NFT não declara edições. */
  label: string | null;
  /** Limite próprio da edição (`1/10` → 10); `null` para edição aberta ou não declarada. */
  maxQuantity: number | null;
}

/** Edições ofertadas por um NFT. Sem `editionOptions`, há uma única edição padrão. */
export function nftEditions(nft: Pick<Nft, 'id' | 'editionOptions'>): NftEdition[] {
  const options: Array<string | null> = nft.editionOptions?.length ? nft.editionOptions : [null];
  return options.map((label, index) => {
    const total = label?.match(/\/(\d+)$/)?.[1];
    return { id: editionIdFor(nft.id, index), label, maxQuantity: total ? Number(total) : null };
  });
}

export function idempotencyKey(value: string = crypto.randomUUID()): IdempotencyKey {
  if (!value.trim()) {
    throw new TypeError('A chave de idempotência não pode ser vazia.');
  }

  return value as IdempotencyKey;
}
