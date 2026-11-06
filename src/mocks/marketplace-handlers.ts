import { delay, http, HttpResponse } from 'msw';
import {
  decimalString,
  editionIdFor,
  idempotencyKey,
  isNftCategoryId,
  isNftNetworkId,
  nftCategories,
  nftEditions,
  nftNetworks,
  quantity,
  type ApiErrorPayload,
  type CreateOrderRequest,
  type Cart,
  type CartIssue,
  type CartIssueKind,
  type CartItem,
  type CartResponse,
  type Nft,
  type NftFacets,
  type NftUpdatedEvent,
  type Order,
  type OrderItem,
  type OrderUpdatedEvent,
  type PaginatedResponse,
  type Profile,
  type Quote,
  type Wallet,
  type WalletConnection,
  type WalletInput,
  type WalletNetwork,
  type WalletType,
  walletNetworks,
  walletTypes,
} from '../domain/contracts';
import {
  readMarketplaceState,
  resetMarketplaceState,
  selectMarketplaceNetworkScenario,
  updateMarketplaceState,
} from './marketplace-store';
import { marketplaceScenarioOptions } from './marketplace-fixtures';
import {
  isMarketplaceNetworkScenarioId,
  marketplaceNetworkScenarios,
  type MarketplaceNetworkScenarioId,
} from './marketplace-network-scenarios';
import {
  clearSettlementTimers,
  configureSettlementOutcome,
  ORDER_SETTLEMENT_DELAY_MS,
  scheduleSettlement,
  settleDueOrders,
  settleOrder,
} from './marketplace-order-settlement';
import { publishMarketplaceEvent, replayMarketplaceEvent, resetSocketSessions } from './socket-io-polling';

const SESSION_COOKIE = 'kurio_session';
const SESSION_LIFETIME_SECONDS = 60 * 60 * 24;
const PASSWORD_ITERATIONS = 100_000;
/** Taxa de rede estimada exibida no frame do carrinho. */
const NETWORK_FEE_ETH = '0.016';
const DECIMAL_PATTERN = /^(0|[1-9]\d*)(\.\d+)?$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WALLET_PATTERN = /^0x[a-f\d]{40}$/i;
const USERNAME_PATTERN = /^[a-z0-9_.-]{3,30}$/i;
const ENS_PATTERN = /^[a-z0-9-]{3,63}\.eth$/;
const REFERRAL_PATTERN = /^[a-z0-9-]{4,20}$/i;
const AVATAR_DATA_URL_PATTERN = /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/]+=*$/i;
const AVATAR_MAX_LENGTH = 400_000;
const WALLET_TYPES: readonly string[] = walletTypes;
const WALLET_FIELDS = [
  'address', 'network', 'role', 'displayName', 'nickname', 'profileName',
  'walletType', 'referralCode', 'email', 'ensName', 'alternateAddress',
] as const;

function isValidAvatar(value: unknown) {
  if (value === null) return true;
  if (typeof value !== 'string' || value.length > AVATAR_MAX_LENGTH) return false;
  return /^https?:\/\/\S+$/i.test(value) || AVATAR_DATA_URL_PATTERN.test(value);
}

function textInRange(value: unknown, min: number, max: number) {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
}

/** Valida campos de carteira; `partial` permite omitir campos (PATCH). Retorna o primeiro campo inválido. */
function invalidWalletField(body: Record<string, unknown>, partial: boolean) {
  const checks: Record<(typeof WALLET_FIELDS)[number], (value: unknown) => boolean> = {
    address: (value) => typeof value === 'string' && WALLET_PATTERN.test(value),
    network: (value) => textInRange(value, 1, 40),
    role: (value) => value === 'principal' || value === 'secundaria',
    displayName: (value) => textInRange(value, 1, 80),
    nickname: (value) => textInRange(value, 1, 40),
    profileName: (value) => textInRange(value, 1, 80),
    walletType: (value) => typeof value === 'string' && WALLET_TYPES.includes(value),
    referralCode: (value) => typeof value === 'string' && REFERRAL_PATTERN.test(value.trim()),
    email: (value) => typeof value === 'string' && EMAIL_PATTERN.test(value.trim()),
    ensName: (value) => typeof value === 'string' && ENS_PATTERN.test(value.trim().toLowerCase()),
    alternateAddress: (value) => value === null || (typeof value === 'string'
      && (value.trim() === '' || WALLET_PATTERN.test(value.trim()) || ENS_PATTERN.test(value.trim().toLowerCase()))),
  };
  if (!hasOnlyKeys(body, WALLET_FIELDS)) return 'body';
  for (const field of WALLET_FIELDS) {
    const optional = partial || field === 'role' || field === 'alternateAddress';
    if (body[field] === undefined) {
      if (optional) continue;
      return field;
    }
    if (!checks[field](body[field])) return field;
  }
  return undefined;
}

function normalizedWalletFields(body: Record<string, unknown>): Partial<WalletInput> {
  const result: Partial<WalletInput> = {};
  if (typeof body.address === 'string') result.address = body.address;
  if (typeof body.network === 'string') result.network = body.network.trim();
  if (typeof body.displayName === 'string') result.displayName = body.displayName.trim();
  if (typeof body.nickname === 'string') result.nickname = body.nickname.trim();
  if (typeof body.profileName === 'string') result.profileName = body.profileName.trim();
  if (typeof body.walletType === 'string') result.walletType = body.walletType as WalletInput['walletType'];
  if (typeof body.referralCode === 'string') result.referralCode = body.referralCode.trim().toUpperCase();
  if (typeof body.email === 'string') result.email = body.email.trim().toLowerCase();
  if (typeof body.ensName === 'string') result.ensName = body.ensName.trim().toLowerCase();
  if (body.alternateAddress === null || typeof body.alternateAddress === 'string') {
    result.alternateAddress = typeof body.alternateAddress === 'string' && body.alternateAddress.trim()
      ? body.alternateAddress.trim()
      : null;
  }
  return result;
}

function suggestUsername(email: string, taken: readonly string[]) {
  const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 24).padEnd(3, '0');
  const used = new Set(taken.map((name) => name.toLowerCase()));
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(body: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(body).every((key) => keys.includes(key));
}

function apiError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  const body: ApiErrorPayload = {
    error: { code, message, ...(details === undefined ? {} : { details }) },
  };
  return HttpResponse.json(body, { status });
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

function getCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return undefined;

  const cookie = cookieHeader.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return cookie?.slice(name.length + 1);
}

type RequestCookies = Record<string, string>;

/**
 * Resolve o token da sessão. No navegador o header `Cookie` é proibido e não chega ao handler;
 * o MSW entrega os cookies do seu cookie store (inclusive HttpOnly) pelo argumento `cookies`.
 * Em Node (testes de API), o header `Cookie` continua sendo aceito.
 */
function getSessionToken(request: Request, cookies: RequestCookies = {}) {
  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) return authorization.slice('Bearer '.length);

  if (cookies[SESSION_COOKIE]) return cookies[SESSION_COOKIE];
  const encoded = getCookie(request, SESSION_COOKIE);
  if (!encoded) return undefined;

  try {
    return decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
}

function getAuthenticatedSession(request: Request, cookies: RequestCookies = {}) {
  const token = getSessionToken(request, cookies);
  if (!token) return undefined;

  const state = readMarketplaceState();
  const session = state.sessions[token];
  if (!session || session.expiresAt <= Date.now()
    || !state.profiles.some((profile) => profile.userId === session.userId)) return undefined;
  return session;
}

function requireUser(request: Request, cookies: RequestCookies = {}): string | Response {
  const session = getAuthenticatedSession(request, cookies);
  return session?.userId ?? apiError(401, 'UNAUTHENTICATED', 'É necessário entrar na conta.');
}

function createSession(userId: string) {
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + SESSION_LIFETIME_SECONDS * 1000;
  updateMarketplaceState((draft) => {
    draft.sessions[token] = { userId, expiresAt };
    mergeGuestCart(draft, userId);
  });
  return {
    token,
    expiresAt,
    headers: {
      'Set-Cookie': `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_LIFETIME_SECONDS}`,
    },
  };
}

function clearSessionCookie() {
  return {
    'Set-Cookie': `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
  };
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const derived = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt: new TextEncoder().encode(salt),
    iterations: PASSWORD_ITERATIONS,
    hash: 'SHA-256',
  }, key, 256);
  return toHex(new Uint8Array(derived));
}

function hashesMatch(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function getCart(state: ReturnType<typeof readMarketplaceState>, userId: string | null): Cart {
  const cart = state.carts.find((item) => item.userId === userId);
  if (!cart) throw new Error(`Carrinho não encontrado para ${userId ?? 'visitante'}.`);
  return cart;
}

function decimalScale(value: string) {
  return value.split('.')[1]?.length ?? 0;
}

function decimalUnits(value: string, scale: number) {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(`${whole}${fraction.padEnd(scale, '0')}`);
}

function decimalFromUnits(value: bigint, scale: number) {
  if (scale === 0) return decimalString(value.toString());

  const digits = value.toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return decimalString(fraction ? `${whole}.${fraction}` : whole);
}

function compareDecimals(left: string, right: string) {
  const scale = Math.max(decimalScale(left), decimalScale(right));
  const leftUnits = decimalUnits(left, scale);
  const rightUnits = decimalUnits(right, scale);
  return leftUnits === rightUnits ? 0 : leftUnits < rightUnits ? -1 : 1;
}

function buildQuote(cart: Cart, couponCode?: string): Quote {
  const scale = Math.max(3, ...cart.items.map(({ unitPriceEth }) => decimalScale(unitPriceEth)));
  const subtotal = cart.items.reduce(
    (total, item) => total + decimalUnits(item.unitPriceEth, scale) * BigInt(item.quantity),
    0n,
  );
  const discount = couponCode === 'WELCOME10' ? subtotal / 10n : 0n;
  const networkFee = decimalUnits(NETWORK_FEE_ETH, scale);

  return {
    currency: 'ETH',
    cartVersion: cart.version,
    couponCode: couponCode ?? null,
    subtotalEth: decimalFromUnits(subtotal, scale),
    discountEth: decimalFromUnits(discount, scale),
    networkFeeEth: decimalFromUnits(networkFee, scale),
    totalEth: decimalFromUnits(subtotal - discount + networkFee, scale),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };
}

function resolveCoupon(body: Record<string, unknown>) {
  if (body.couponCode === undefined || body.couponCode === '') return { couponCode: undefined };
  if (typeof body.couponCode !== 'string' || body.couponCode.trim() === '') {
    return { response: apiError(400, 'VALIDATION_ERROR', 'O cupom informado é inválido.') };
  }

  const couponCode = body.couponCode.trim().toUpperCase();
  if (couponCode !== 'WELCOME10') {
    return { response: apiError(422, 'COUPON_INVALID', 'O cupom é inválido ou expirou.') };
  }
  return { couponCode };
}

function validateCartQuantity(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value > 0;
}

function findNft(state: ReturnType<typeof readMarketplaceState>, nftId: string) {
  return state.nfts.find((nft) => nft.id === nftId);
}

function cartItemFor(nft: Nft, editionId: string, requestedQuantity: number): CartItem {
  return {
    nftId: nft.id,
    editionId,
    quantity: quantity(requestedQuantity),
    unitPriceEth: nft.priceEth,
  };
}

type MarketplaceSnapshot = ReturnType<typeof readMarketplaceState>;

function findEdition(nft: Nft, editionId: string) {
  return nftEditions(nft).find((edition) => edition.id === editionId);
}

/**
 * Unidades que um item pode ter: limitado pelas edições disponíveis do NFT (descontando as
 * demais edições do mesmo NFT no carrinho) e pelo limite próprio da edição (`1/10` → 10).
 */
function editionLimit(nft: Nft, editionId: string, cart: Cart) {
  const edition = findEdition(nft, editionId);
  if (!edition) return 0;
  const otherEditions = cart.items
    .filter((item) => item.nftId === nft.id && item.editionId !== editionId)
    .reduce((total, item) => total + item.quantity, 0);
  const remaining = Math.max(0, nft.availableEditions - otherEditions);
  return edition.maxQuantity === null ? remaining : Math.min(remaining, edition.maxQuantity);
}

/** Divergências entre o carrinho e o catálogo atual (preço, quantidade e disponibilidade). */
function cartIssues(state: MarketplaceSnapshot, cart: Cart): CartIssue[] {
  return cart.items.flatMap((item) => {
    const nft = findNft(state, item.nftId);
    const available = nft ? editionLimit(nft, item.editionId, cart) : 0;
    const kinds: CartIssueKind[] = [];
    if (available < 1) kinds.push('unavailable');
    else if (item.quantity > available) kinds.push('quantity-exceeds');
    if (nft && compareDecimals(nft.priceEth, item.unitPriceEth) !== 0) kinds.push('price-changed');
    if (kinds.length === 0) return [];
    return [{
      nftId: item.nftId,
      editionId: item.editionId,
      kinds,
      unitPriceEth: item.unitPriceEth,
      currentPriceEth: nft?.priceEth ?? item.unitPriceEth,
      quantity: item.quantity,
      availableQuantity: available,
    }];
  });
}

function cartResponse(userId: string | null): CartResponse {
  const state = readMarketplaceState();
  const cart = getCart(state, userId);
  return { ...cart, issues: cartIssues(state, cart) };
}

/** Resolve o item alvo: `editionId` explícito ou, sem ele, o único item do NFT (senão a edição padrão). */
function resolveCartEditionId(cart: Cart, nftId: string, editionId: unknown) {
  if (typeof editionId === 'string' && editionId) return editionId;
  const items = cart.items.filter((item) => item.nftId === nftId);
  return items.length === 1 ? items[0].editionId : editionIdFor(nftId);
}

/**
 * Incorpora o carrinho do visitante ao carrinho do usuário que acabou de autenticar.
 * Quantidades da mesma edição são somadas (sem perda nem duplicação de linhas); excessos de
 * disponibilidade aparecem como divergências do carrinho para o usuário revisar. O carrinho do
 * visitante é esvaziado na mesma mutação, então um novo login não reaplica os itens.
 */
function mergeGuestCart(draft: MarketplaceSnapshot, userId: string) {
  const guest = draft.carts.find((cart) => cart.userId === null);
  const target = draft.carts.find((cart) => cart.userId === userId);
  if (!guest || !target || (guest.items.length === 0 && guest.couponCode === null)) return;

  for (const item of guest.items) {
    const existing = target.items.find((entry) => entry.nftId === item.nftId && entry.editionId === item.editionId);
    if (existing) existing.quantity = quantity(existing.quantity + item.quantity);
    else target.items.push(structuredClone(item));
  }
  target.couponCode ??= guest.couponCode;
  target.version += 1;
  guest.items = [];
  guest.couponCode = null;
  guest.version += 1;
}

const NETWORKS: readonly string[] = walletNetworks;

/** Conexões de carteira simuladas: transitórias (memória do mock), limpas no reset/troca de cenário. */
const walletConnections = new Map<string, WalletConnection & { userId: string }>();

const COLLECTOR_FIELDS = ['displayName', 'username', 'profileName', 'email', 'ensName', 'referralCode', 'alternateAddress', 'note'] as const;

/** Valida o corpo de `POST /orders`; erros de campos do colecionador vêm em `details.fields`. */
function parseOrderRequest(body: Record<string, unknown>):
  | { value: CreateOrderRequest }
  | { error: string; details?: unknown } {
  if (!hasOnlyKeys(body, ['walletAddress', 'connectionId', 'network', 'provider', 'cartVersion', 'expectedTotalEth', 'couponCode', 'collector'])) {
    return { error: 'A requisição contém campos desconhecidos.' };
  }
  if (typeof body.walletAddress !== 'string' || !WALLET_PATTERN.test(body.walletAddress)) {
    return { error: 'O endereço da carteira informado é inválido.' };
  }
  if (typeof body.connectionId !== 'string' || !body.connectionId
    || typeof body.network !== 'string' || !NETWORKS.includes(body.network)
    || typeof body.provider !== 'string' || !WALLET_TYPES.includes(body.provider)) {
    return { error: 'Informe a conexão, a rede e o provedor da carteira.' };
  }
  if (typeof body.cartVersion !== 'number' || !Number.isSafeInteger(body.cartVersion) || body.cartVersion < 0
    || typeof body.expectedTotalEth !== 'string' || !DECIMAL_PATTERN.test(body.expectedTotalEth)) {
    return { error: 'Informe a versão do carrinho e o total revisado.' };
  }
  if (body.couponCode !== null && (typeof body.couponCode !== 'string' || !body.couponCode.trim())) {
    return { error: 'O cupom informado é inválido.' };
  }
  const collector = body.collector;
  if (!isRecord(collector) || !hasOnlyKeys(collector, COLLECTOR_FIELDS)) {
    return { error: 'Informe os dados do colecionador.' };
  }
  const fields: Record<string, string> = {};
  if (!textInRange(collector.displayName, 2, 60)) fields.displayName = 'Informe o nome de exibição (2–60 caracteres).';
  if (typeof collector.username !== 'string' || !USERNAME_PATTERN.test(collector.username)) {
    fields.username = 'Use 3–30 letras, números, ponto, hífen ou sublinhado.';
  }
  if (!textInRange(collector.profileName, 2, 60)) fields.profileName = 'Informe o nome do perfil (2–60 caracteres).';
  if (typeof collector.email !== 'string' || !EMAIL_PATTERN.test(collector.email)) fields.email = 'Informe um e-mail válido.';
  if (typeof collector.ensName !== 'string' || !ENS_PATTERN.test(collector.ensName)) fields.ensName = 'Informe um nome ENS terminado em .eth.';
  if (typeof collector.referralCode !== 'string' || !REFERRAL_PATTERN.test(collector.referralCode)) {
    fields.referralCode = 'Use 4–20 letras, números ou hífen.';
  }
  if (collector.alternateAddress !== null && (typeof collector.alternateAddress !== 'string'
    || !(WALLET_PATTERN.test(collector.alternateAddress) || ENS_PATTERN.test(collector.alternateAddress)))) {
    fields.alternateAddress = 'Informe um nome ENS (.eth) ou um endereço 0x.';
  }
  if (collector.note !== null && (typeof collector.note !== 'string' || collector.note.length > 500)) {
    fields.note = 'A observação deve ter no máximo 500 caracteres.';
  }
  if (Object.keys(fields).length > 0) return { error: 'Revise os dados do colecionador.', details: { fields } };

  return {
    value: {
      walletAddress: body.walletAddress,
      connectionId: body.connectionId,
      network: body.network as WalletNetwork,
      provider: body.provider as WalletType,
      cartVersion: body.cartVersion,
      expectedTotalEth: decimalString(body.expectedTotalEth),
      couponCode: typeof body.couponCode === 'string' ? body.couponCode.trim().toUpperCase() : null,
      collector: {
        displayName: String(collector.displayName).trim(),
        username: String(collector.username),
        profileName: String(collector.profileName).trim(),
        email: String(collector.email).trim().toLowerCase(),
        ensName: String(collector.ensName),
        referralCode: String(collector.referralCode),
        alternateAddress: typeof collector.alternateAddress === 'string' ? collector.alternateAddress : null,
        note: typeof collector.note === 'string' && collector.note.trim() ? collector.note.trim() : null,
      },
    },
  };
}

/** Snapshot do item no momento da compra (título, arte, token e edição congelados). */
function orderItemFor(state: MarketplaceSnapshot, item: CartItem): OrderItem {
  const nft = findNft(state, item.nftId);
  const scale = decimalScale(item.unitPriceEth);
  return {
    ...structuredClone(item),
    title: nft?.title ?? item.nftId,
    tokenId: nft?.tokenId ?? null,
    imageUrl: nft?.imageUrl ?? null,
    editionLabel: nft ? findEdition(nft, item.editionId)?.label ?? null : null,
    lineTotalEth: decimalString(decimalFromUnits(decimalUnits(item.unitPriceEth, scale) * BigInt(item.quantity), scale)),
  };
}

function isTransientFailure(request: Request) {
  return request.headers.get('x-mock-failure') === 'transient';
}

function isMockControlRequest(request: Request) {
  const pathname = new URL(request.url).pathname;
  return pathname === '/api/mock/reset'
    || pathname === '/api/mock/scenarios'
    || pathname === '/api/mock/scenario'
    || pathname === '/api/mock/scenario/trigger'
    || pathname === '/api/mock/fail-next'
    || pathname === '/api/mock/socket/disconnect'
    || pathname === '/api/mock/socket/replay';
}

/**
 * Falhas pontuais armadas por `POST /api/mock/fail-next`: a próxima requisição que corresponder
 * ao método e ao prefixo de caminho responde 503 (após `delayMs`). Fica em memória do contexto
 * do mock (não persiste em refresh) e é limpa pelo reset, para exercitar rollback de mutations
 * sem trocar o cenário nem revogar a sessão.
 */
interface ArmedFailure {
  method: string;
  pathPrefix: string;
  remaining: number;
  delayMs: number;
}

let armedFailures: ArmedFailure[] = [];

function consumeArmedFailure(request: Request) {
  const pathname = new URL(request.url).pathname;
  const failure = armedFailures.find((item) => item.method === request.method
    && pathname.startsWith(item.pathPrefix) && item.remaining > 0);
  if (!failure) return undefined;
  failure.remaining -= 1;
  armedFailures = armedFailures.filter((item) => item.remaining > 0);
  return failure;
}

function waitForDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener('abort', finish, { once: true });
  });
}

function createEnvelope<T>(resource: T, version: number) {
  return {
    eventId: crypto.randomUUID(),
    version,
    resource,
    occurredAt: new Date().toISOString(),
  };
}

function increaseDecimal(value: string, increment: string) {
  const scale = Math.max(decimalScale(value), decimalScale(increment));
  return decimalFromUnits(decimalUnits(value, scale) + decimalUnits(increment, scale), scale);
}

function selectedScenario() {
  return readMarketplaceState().networkScenario;
}

function currentScenarioError(scenario: MarketplaceNetworkScenarioId) {
  if (scenario === 'unavailable') {
    return apiError(503, 'SERVICE_UNAVAILABLE', 'O serviço simulado está temporariamente indisponível.');
  }
  if (scenario === 'http-4xx') {
    return apiError(422, 'SCENARIO_HTTP_4XX', 'Falha HTTP 4xx configurada para este cenário.');
  }
  if (scenario === 'http-5xx') {
    return apiError(500, 'SCENARIO_HTTP_5XX', 'Falha HTTP 5xx configurada para este cenário.');
  }
  return undefined;
}

export const marketplaceHandlers = [
  http.all('*/api/*', async ({ request }) => {
    if (isMockControlRequest(request)) return undefined;
    if (isTransientFailure(request)) {
      return apiError(503, 'SERVICE_UNAVAILABLE', 'O serviço simulado está temporariamente indisponível.');
    }
    const armedFailure = consumeArmedFailure(request);
    if (armedFailure) {
      if (armedFailure.delayMs > 0) await waitForDelay(armedFailure.delayMs, request.signal);
      return apiError(503, 'SERVICE_UNAVAILABLE', 'O serviço simulado está temporariamente indisponível.');
    }

    const scenario = selectedScenario();
    const url = new URL(request.url);

    if (scenario === 'timeout' && !(request.method === 'POST' && url.pathname.endsWith('/api/orders'))) {
      await waitForDelay(10_500, request.signal);
      return apiError(504, 'NETWORK_TIMEOUT', 'A resposta excedeu o tempo limite configurado.');
    }
    if (scenario === 'variable-latency') {
      const requestNumber = Number(url.searchParams.get('page') ?? '1');
      await delay(35 + ((Math.abs(requestNumber * 37 + url.pathname.length * 11)) % 140));
    }
    if (scenario === 'out-of-order' && request.method === 'GET' && url.pathname.endsWith('/api/nfts')) {
      await delay(url.searchParams.get('page') === '1' ? 250 : 25);
    }
    if (scenario === 'session-expired') {
      if (url.pathname.endsWith('/api/session')
        || url.pathname.endsWith('/api/session/login')
        || url.pathname.endsWith('/api/session/register')) return undefined;
      updateMarketplaceState((draft) => {
        draft.sessions = {};
        draft.networkScenario = 'success';
      });
      resetSocketSessions();
      return apiError(401, 'SESSION_EXPIRED', 'A sessão simulada expirou.');
    }
    if (scenario === 'registration-conflict'
      && request.method === 'POST' && url.pathname.endsWith('/api/session/register')) {
      return apiError(409, 'EMAIL_ALREADY_REGISTERED', 'O cenário simula conflito para este cadastro.');
    }
    if ((scenario === 'coupon-invalid' || scenario === 'coupon-expired')
      && ((request.method === 'POST'
        && (url.pathname.endsWith('/api/quotes') || url.pathname.endsWith('/api/orders')))
        || (request.method === 'PUT' && url.pathname.endsWith('/api/cart/coupon')))) {
      const body = await readBody(request.clone());
      if (body && typeof body.couponCode === 'string' && body.couponCode.length > 0) {
        return scenario === 'coupon-expired'
          ? apiError(422, 'COUPON_EXPIRED', 'O cupom informado expirou.')
          : apiError(422, 'COUPON_INVALID', 'O cupom informado é inválido.');
      }
    }

    return currentScenarioError(scenario);
  }),

  http.get('*/api/mock/scenarios', () => HttpResponse.json({
    active: selectedScenario(),
    scenarios: marketplaceNetworkScenarios,
  })),

  http.post('*/api/mock/scenario', async ({ request }) => {
    const body = await readBody(request);
    if (!body || !isMarketplaceNetworkScenarioId(body.scenario)) {
      return apiError(400, 'VALIDATION_ERROR', 'O cenário de rede informado não existe.');
    }

    const state = selectMarketplaceNetworkScenario(body.scenario);
    resetSocketSessions();
    walletConnections.clear();
    clearSettlementTimers();
    return HttpResponse.json({
      active: state.networkScenario,
      fixture: state.scenario,
      counts: {
        nfts: state.nfts.length,
        users: state.profiles.length,
        carts: state.carts.length,
        orders: state.orders.length,
      },
    }, { headers: clearSessionCookie() });
  }),

  http.post('*/api/mock/scenario/trigger', async ({ request, cookies }) => {
    const body = await readBody(request);
    if (!body) return apiError(400, 'VALIDATION_ERROR', 'O corpo da requisição deve ser um objeto JSON.');

    const scenario = selectedScenario();
    if (scenario === 'price-change' || scenario === 'edition-sold-out') {
      const nftId = typeof body.nftId === 'string' ? body.nftId : 'nft-004';
      const state = readMarketplaceState();
      const nft = findNft(state, nftId);
      if (!nft) return apiError(404, 'NOT_FOUND', 'NFT não encontrado.');

      let updatedNft: Nft | undefined;
      updateMarketplaceState((draft) => {
        const resource = draft.nfts.find((item) => item.id === nftId);
        if (!resource) return;
        if (scenario === 'price-change') resource.priceEth = increaseDecimal(resource.priceEth, '0.1');
        else resource.availableEditions = 0;
        resource.version += 1;
        updatedNft = resource;
      });

      if (!updatedNft) return apiError(404, 'NOT_FOUND', 'NFT não encontrado.');
      const event: NftUpdatedEvent = createEnvelope(updatedNft, updatedNft.version);
      publishMarketplaceEvent('nft.updated', event);
      return HttpResponse.json(event, { status: 202 });
    }

    if (scenario === 'order-confirm' || scenario === 'order-refuse') {
      const userId = requireUser(request, cookies);
      if (typeof userId !== 'string') return userId;
      const state = readMarketplaceState();
      const orderId = typeof body.orderId === 'string' ? body.orderId : 'order-0002';
      const order = state.orders.find((item) => item.id === orderId && state.orderOwners[item.id] === userId);
      if (!order) return apiError(404, 'NOT_FOUND', 'Pedido pendente do usuário não encontrado.');
      if (order.status !== 'pendente') {
        return apiError(409, 'ORDER_TERMINAL', 'O pedido já está em estado terminal.');
      }

      const event = settleOrder(orderId, scenario === 'order-confirm'
        ? { status: 'confirmado' }
        : { status: 'recusado', reason: 'PAYMENT_REFUSED' });
      if (!event) return apiError(409, 'ORDER_TERMINAL', 'O pedido já foi alterado.');
      return HttpResponse.json(event, { status: 202 });
    }

    return apiError(409, 'SCENARIO_NOT_TRIGGERABLE', 'O cenário ativo não possui uma alteração manual.');
  }),

  /** Derruba as conexões Socket.IO abertas (o cliente reconecta e reconcilia via REST). */
  http.post('*/api/mock/socket/disconnect', () => {
    resetSocketSessions();
    return new HttpResponse(null, { status: 204 });
  }),

  /** Reenvia um evento já publicado (mesmo `eventId`/versão) para exercitar duplicatas e eventos antigos. */
  http.post('*/api/mock/socket/replay', async ({ request }) => {
    const body = await readBody(request);
    if (typeof body?.eventId !== 'string') return apiError(400, 'VALIDATION_ERROR', 'Informe o eventId a reenviar.');
    return replayMarketplaceEvent(body.eventId)
      ? new HttpResponse(null, { status: 202 })
      : apiError(404, 'NOT_FOUND', 'Evento não encontrado no histórico do mock.');
  }),

  http.post('*/api/mock/fail-next', async ({ request }) => {
    const body = await readBody(request);
    const method = typeof body?.method === 'string' ? body.method.toUpperCase() : '';
    const pathPrefix = body?.pathPrefix;
    const count = body?.count ?? 1;
    const delayMs = body?.delayMs ?? 0;
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
      || typeof pathPrefix !== 'string' || !pathPrefix.startsWith('/api/') || pathPrefix.startsWith('/api/mock')
      || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1 || count > 10
      || typeof delayMs !== 'number' || !Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 5_000) {
      return apiError(400, 'VALIDATION_ERROR', 'Informe método, prefixo /api/, quantidade (1–10) e atraso (0–5000 ms).');
    }
    armedFailures.push({ method, pathPrefix, remaining: count, delayMs });
    return HttpResponse.json({ armed: armedFailures.length }, { status: 201 });
  }),

  http.post('*/api/mock/reset', async ({ request }) => {
    const body = await readBody(request);
    if (body === null) return apiError(400, 'VALIDATION_ERROR', 'O corpo da requisição deve ser um objeto JSON.');

    const scenario = body.scenario;
    if (scenario !== undefined && (typeof scenario !== 'string'
      || !marketplaceScenarioOptions.some((option) => option.id === scenario))) {
      return apiError(400, 'VALIDATION_ERROR', 'O cenário informado não existe.');
    }

    const selectedScenario = marketplaceScenarioOptions.find((option) => option.id === scenario)?.id;
    const state = resetMarketplaceState(selectedScenario);
    resetSocketSessions();
    armedFailures = [];
    walletConnections.clear();
    clearSettlementTimers();
    return HttpResponse.json(
      {
        scenario: state.scenario,
        counts: {
          nfts: state.nfts.length,
          users: state.profiles.length,
          carts: state.carts.length,
          orders: state.orders.length,
        },
      },
      { headers: clearSessionCookie() },
    );
  }),

  http.get('*/api/session', ({ request, cookies }) => {
    const session = getAuthenticatedSession(request, cookies);
    return HttpResponse.json(session
      ? { status: 'authenticated', userId: session.userId, expiresAt: new Date(session.expiresAt).toISOString() }
      : { status: 'anonymous' });
  }),

  http.post('*/api/session/register', async ({ request }) => {
    const body = await readBody(request);
    if (body === null) return apiError(400, 'VALIDATION_ERROR', 'O corpo da requisição deve ser um objeto JSON.');

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const requestedUsername = typeof body.username === 'string' ? body.username.trim() : undefined;
    const password = body.password;
    if (name.length < 1 || name.length > 80 || !EMAIL_PATTERN.test(email)
      || (body.username !== undefined && (requestedUsername === undefined || !USERNAME_PATTERN.test(requestedUsername)))
      || typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return apiError(400, 'VALIDATION_ERROR', 'Nome, e-mail ou senha inválidos.');
    }

    const state = readMarketplaceState();
    if (state.profiles.some((profile) => profile.email.toLowerCase() === email)) {
      return apiError(409, 'EMAIL_ALREADY_REGISTERED', 'Já existe uma conta com este e-mail.');
    }
    if (requestedUsername
      && state.profiles.some((profile) => profile.username.toLowerCase() === requestedUsername.toLowerCase())) {
      return apiError(409, 'USERNAME_TAKEN', 'Este nome de usuário já está em uso.');
    }

    const userId = `user-${crypto.randomUUID()}`;
    const username = requestedUsername
      ?? suggestUsername(email, state.profiles.map((profile) => profile.username));
    const profile: Profile = {
      userId,
      name,
      username,
      email,
      ensName: null,
      walletNickname: null,
      avatarUrl: null,
    };
    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await hashPassword(password, salt);
    let conflict: 'email' | 'username' | undefined;
    updateMarketplaceState((draft) => {
      if (draft.profiles.some((item) => item.email.toLowerCase() === email)) {
        conflict = 'email';
        return;
      }
      if (draft.profiles.some((item) => item.username.toLowerCase() === username.toLowerCase())) {
        conflict = 'username';
        return;
      }
      draft.profiles.push(profile);
      draft.credentials[userId] = { salt, hash };
      draft.carts.push({ id: `cart-${crypto.randomUUID()}`, userId, version: 0, couponCode: null, items: [] });
    });
    if (conflict === 'email') return apiError(409, 'EMAIL_ALREADY_REGISTERED', 'Já existe uma conta com este e-mail.');
    if (conflict === 'username') return apiError(409, 'USERNAME_TAKEN', 'Este nome de usuário já está em uso.');

    const session = createSession(userId);
    return HttpResponse.json(
      { session: { status: 'authenticated', userId, expiresAt: new Date(session.expiresAt).toISOString(), token: session.token }, profile },
      { status: 201, headers: session.headers },
    );
  }),

  http.post('*/api/session/login', async ({ request }) => {
    const body = await readBody(request);
    if (body === null) return apiError(400, 'VALIDATION_ERROR', 'O corpo da requisição deve ser um objeto JSON.');

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = body.password;
    if (!EMAIL_PATTERN.test(email) || typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return apiError(400, 'VALIDATION_ERROR', 'E-mail ou senha inválidos.');
    }

    const state = readMarketplaceState();
    const profile = state.profiles.find((item) => item.email.toLowerCase() === email);
    const credential = profile ? state.credentials[profile.userId] : undefined;
    const suppliedHash = credential ? await hashPassword(password, credential.salt) : '';
    if (!profile || !credential || !hashesMatch(suppliedHash, credential.hash)) {
      return apiError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos.');
    }

    const session = createSession(profile.userId);
    return HttpResponse.json(
      { session: { status: 'authenticated', userId: profile.userId, expiresAt: new Date(session.expiresAt).toISOString(), token: session.token }, profile },
      { headers: session.headers },
    );
  }),

  http.post('*/api/session/logout', ({ request, cookies }) => {
    const token = getSessionToken(request, cookies);
    if (token) {
      updateMarketplaceState((draft) => {
        delete draft.sessions[token];
      });
    }
    return new HttpResponse(null, { status: 204, headers: clearSessionCookie() });
  }),

  http.get('*/api/nfts', ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? '1');
    const pageSize = Number(url.searchParams.get('pageSize') ?? '12');
    const sort = url.searchParams.get('sort') ?? 'relevance';
    const search = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    const collectionId = url.searchParams.get('collectionId');
    const category = url.searchParams.get('category');
    const network = url.searchParams.get('network');
    const minPrice = url.searchParams.get('minPriceEth');
    const maxPrice = url.searchParams.get('maxPriceEth');

    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) {
      return apiError(400, 'VALIDATION_ERROR', 'A página ou o tamanho da página são inválidos.');
    }
    if (!['relevance', 'price-asc', 'price-desc', 'title-asc', 'title-desc'].includes(sort)) {
      return apiError(400, 'VALIDATION_ERROR', 'A ordenação informada não é suportada.');
    }
    if ((category !== null && !isNftCategoryId(category)) || (network !== null && !isNftNetworkId(network))) {
      return apiError(400, 'VALIDATION_ERROR', 'A categoria ou a rede informada não existe.');
    }
    if ((minPrice !== null && !DECIMAL_PATTERN.test(minPrice))
      || (maxPrice !== null && !DECIMAL_PATTERN.test(maxPrice))) {
      return apiError(400, 'VALIDATION_ERROR', 'Os limites de preço devem ser decimais não negativos.');
    }
    if (minPrice !== null && maxPrice !== null && compareDecimals(minPrice, maxPrice) > 0) {
      return apiError(400, 'VALIDATION_ERROR', 'O preço mínimo não pode superar o preço máximo.');
    }

    let items = readMarketplaceState().nfts.filter((nft) => (
      (!search || `${nft.title} ${nft.collectionId}`.toLowerCase().includes(search))
      && (!collectionId || nft.collectionId === collectionId)
      && (!category || nft.category === category)
      && (!network || nft.network === network)
      && (minPrice === null || compareDecimals(nft.priceEth, minPrice) >= 0)
      && (maxPrice === null || compareDecimals(nft.priceEth, maxPrice) <= 0)
    ));

    if (sort === 'price-asc') items = [...items].sort((left, right) => compareDecimals(left.priceEth, right.priceEth));
    if (sort === 'price-desc') items = [...items].sort((left, right) => compareDecimals(right.priceEth, left.priceEth));
    if (sort === 'title-asc') items = [...items].sort((left, right) => left.title.localeCompare(right.title));
    if (sort === 'title-desc') items = [...items].sort((left, right) => right.title.localeCompare(left.title));

    const total = items.length;
    const response: PaginatedResponse<Nft> = {
      items: items.slice((page - 1) * pageSize, page * pageSize),
      total,
      page,
      pageSize,
    };
    return HttpResponse.json(response);
  }),

  // Registrado antes de `/api/nfts/:nftId` para que "facets" não seja tratado como ID de NFT.
  http.get('*/api/nfts/facets', () => {
    const catalog = readMarketplaceState().nfts;
    const prices = catalog.map(({ priceEth }) => priceEth).sort(compareDecimals);
    const facets: NftFacets = {
      categories: nftCategories.map(({ id }) => ({ id, count: catalog.filter((nft) => nft.category === id).length })),
      networks: nftNetworks.map(({ id }) => ({ id, count: catalog.filter((nft) => nft.network === id).length })),
      minPriceEth: prices[0] ?? null,
      maxPriceEth: prices.at(-1) ?? null,
    };
    return HttpResponse.json(facets);
  }),

  http.get('*/api/nfts/:nftId', ({ params }) => {
    const nft = findNft(readMarketplaceState(), String(params.nftId));
    return nft
      ? HttpResponse.json(nft)
      : apiError(404, 'NOT_FOUND', 'NFT não encontrado.');
  }),

  http.get('*/api/favorites', ({ request, cookies }) => {
    const userId = requireUser(request, cookies);
    if (typeof userId !== 'string') return userId;
    return HttpResponse.json(readMarketplaceState().favorites.filter((favorite) => favorite.userId === userId));
  }),

  http.put('*/api/favorites/:nftId', ({ request, params, cookies }) => {
    const userId = requireUser(request, cookies);
    if (typeof userId !== 'string') return userId;

    const nftId = String(params.nftId);
    if (!findNft(readMarketplaceState(), nftId)) return apiError(404, 'NOT_FOUND', 'NFT não encontrado.');
    const existing = readMarketplaceState().favorites.find((favorite) => favorite.userId === userId && favorite.nftId === nftId);
    if (existing) return HttpResponse.json(existing);

    const favorite = { userId, nftId, createdAt: new Date().toISOString() };
    updateMarketplaceState((draft) => { draft.favorites.push(favorite); });
    return HttpResponse.json(favorite, { status: 201 });
  }),

  http.delete('*/api/favorites/:nftId', ({ request, params, cookies }) => {
    const userId = requireUser(request, cookies);
    if (typeof userId !== 'string') return userId;

    if (!findNft(readMarketplaceState(), String(params.nftId))) {
      return apiError(404, 'NOT_FOUND', 'NFT não encontrado.');
    }
    updateMarketplaceState((draft) => {
      draft.favorites = draft.favorites.filter((favorite) => (
        favorite.userId !== userId || favorite.nftId !== String(params.nftId)
      ));
    });
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('*/api/cart', ({ request, cookies }) => {
    const userId = getAuthenticatedSession(request, cookies)?.userId ?? null;
    return HttpResponse.json(cartResponse(userId));
  }),

  http.post('*/api/cart/items', async ({ request, cookies }) => {
    const body = await readBody(request);
    if (body === null) return apiError(400, 'VALIDATION_ERROR', 'O corpo da requisição deve ser um objeto JSON.');
    if (typeof body.nftId !== 'string' || !validateCartQuantity(body.quantity)
      || (body.editionId !== undefined && typeof body.editionId !== 'string')) {
      return apiError(400, 'VALIDATION_ERROR', 'NFT, edição ou quantidade inválidos.');
    }
    const requestedQuantity = body.quantity;

    const userId = getAuthenticatedSession(request, cookies)?.userId ?? null;
    const state = readMarketplaceState();
    const nft = findNft(state, body.nftId);
    if (!nft) return apiError(404, 'NOT_FOUND', 'NFT não encontrado.');
    const editionId = typeof body.editionId === 'string' ? body.editionId : editionIdFor(nft.id);
    if (!findEdition(nft, editionId)) return apiError(404, 'NOT_FOUND', 'Edição não encontrada para este NFT.');

    let availableQuantity = 0;
    let availabilityConflict = false;
    let itemAlreadyInCart = false;
    updateMarketplaceState((draft) => {
      const target = getCart(draft, userId);
      const item = target.items.find((entry) => entry.nftId === nft.id && entry.editionId === editionId);
      availableQuantity = editionLimit(nft, editionId, target);
      const nextQuantity = (item?.quantity ?? 0) + requestedQuantity;
      if (nextQuantity > availableQuantity) {
        availabilityConflict = true;
        return;
      }
      itemAlreadyInCart = Boolean(item);
      // O preço registrado só muda quando o usuário aceita as alterações (POST /cart/reconcile).
      if (item) item.quantity = quantity(nextQuantity);
      else target.items.push(cartItemFor(nft, editionId, requestedQuantity));
      target.version += 1;
    });
    if (availabilityConflict) {
      return apiError(409, 'AVAILABILITY_CONFLICT', 'A quantidade solicitada excede as edições disponíveis.', {
        availableEditions: nft.availableEditions,
        availableQuantity,
      });
    }
    return HttpResponse.json(cartResponse(userId), { status: itemAlreadyInCart ? 200 : 201 });
  }),

  http.patch('*/api/cart/items/:nftId', async ({ request, params, cookies }) => {
    const body = await readBody(request);
    if (body === null || !validateCartQuantity(body.quantity)
      || (body.editionId !== undefined && typeof body.editionId !== 'string')) {
      return apiError(400, 'VALIDATION_ERROR', 'A quantidade informada deve ser um inteiro positivo.');
    }
    const requestedQuantity = body.quantity;

    const userId = getAuthenticatedSession(request, cookies)?.userId ?? null;
    const state = readMarketplaceState();
    const nft = findNft(state, String(params.nftId));
    if (!nft) return apiError(404, 'NOT_FOUND', 'NFT não encontrado.');
    const cart = getCart(state, userId);
    const editionId = resolveCartEditionId(
      cart,
      nft.id,
      body.editionId ?? new URL(request.url).searchParams.get('editionId'),
    );
    if (!cart.items.some((item) => item.nftId === nft.id && item.editionId === editionId)) {
      return apiError(404, 'NOT_FOUND', 'O item não está no carrinho.');
    }
    const availableQuantity = editionLimit(nft, editionId, cart);
    if (requestedQuantity > availableQuantity) {
      return apiError(409, 'AVAILABILITY_CONFLICT', 'A quantidade solicitada excede as edições disponíveis.', {
        availableEditions: nft.availableEditions,
        availableQuantity,
      });
    }

    updateMarketplaceState((draft) => {
      const target = getCart(draft, userId);
      const item = target.items.find((entry) => entry.nftId === nft.id && entry.editionId === editionId);
      if (!item || item.quantity === requestedQuantity) return;
      item.quantity = quantity(requestedQuantity);
      target.version += 1;
    });
    return HttpResponse.json(cartResponse(userId));
  }),

  http.delete('*/api/cart/items/:nftId', ({ request, params, cookies }) => {
    const userId = getAuthenticatedSession(request, cookies)?.userId ?? null;
    const nftId = String(params.nftId);
    const editionId = resolveCartEditionId(
      getCart(readMarketplaceState(), userId),
      nftId,
      new URL(request.url).searchParams.get('editionId'),
    );
    let removed = false;
    updateMarketplaceState((draft) => {
      const cart = getCart(draft, userId);
      const itemCount = cart.items.length;
      cart.items = cart.items.filter((item) => item.nftId !== nftId || item.editionId !== editionId);
      removed = itemCount !== cart.items.length;
      if (removed) cart.version += 1;
    });
    return removed
      ? HttpResponse.json(cartResponse(userId))
      : apiError(404, 'NOT_FOUND', 'O item não está no carrinho.');
  }),

  /** Aceita as divergências: aplica preços atuais, reduz quantidades excedentes e remove itens esgotados. */
  http.post('*/api/cart/reconcile', ({ request, cookies }) => {
    const userId = getAuthenticatedSession(request, cookies)?.userId ?? null;
    updateMarketplaceState((draft) => {
      const cart = getCart(draft, userId);
      if (cartIssues(draft, cart).length === 0) return;
      for (const item of [...cart.items]) {
        const nft = findNft(draft, item.nftId);
        const available = nft ? editionLimit(nft, item.editionId, cart) : 0;
        if (!nft || available < 1) {
          cart.items = cart.items.filter((entry) => entry !== item);
          continue;
        }
        item.quantity = quantity(Math.min(item.quantity, available));
        item.unitPriceEth = nft.priceEth;
      }
      cart.version += 1;
    });
    return HttpResponse.json(cartResponse(userId));
  }),

  http.put('*/api/cart/coupon', async ({ request, cookies }) => {
    const body = await readBody(request);
    if (body === null || !hasOnlyKeys(body, ['couponCode'])
      || typeof body.couponCode !== 'string' || !body.couponCode.trim()) {
      return apiError(400, 'VALIDATION_ERROR', 'Informe o código promocional.', {
        fields: { couponCode: 'Informe o código promocional.' },
      });
    }
    const coupon = resolveCoupon(body);
    if (coupon.response) return coupon.response;

    const userId = getAuthenticatedSession(request, cookies)?.userId ?? null;
    if (getCart(readMarketplaceState(), userId).items.length === 0) {
      return apiError(409, 'CART_EMPTY', 'Adicione um NFT ao carrinho antes de aplicar um cupom.');
    }
    updateMarketplaceState((draft) => {
      const cart = getCart(draft, userId);
      if (cart.couponCode === coupon.couponCode) return;
      cart.couponCode = coupon.couponCode ?? null;
      cart.version += 1;
    });
    return HttpResponse.json(cartResponse(userId));
  }),

  http.delete('*/api/cart/coupon', ({ request, cookies }) => {
    const userId = getAuthenticatedSession(request, cookies)?.userId ?? null;
    updateMarketplaceState((draft) => {
      const cart = getCart(draft, userId);
      if (cart.couponCode === null) return;
      cart.couponCode = null;
      cart.version += 1;
    });
    return HttpResponse.json(cartResponse(userId));
  }),

  /**
   * Cotação do carrinho da sessão (visitante ou usuário). Usa o cupom do corpo, se enviado, ou o
   * cupom aplicado ao carrinho. Recusa carrinhos com divergências: a UI precisa informar a mudança
   * e obter o aceite antes de exibir valores atualizados.
   */
  http.post('*/api/quotes', async ({ request, cookies }) => {
    const userId = getAuthenticatedSession(request, cookies)?.userId ?? null;
    const body = await readBody(request);
    if (body === null) return apiError(400, 'VALIDATION_ERROR', 'O corpo da requisição deve ser um objeto JSON.');

    const state = readMarketplaceState();
    const cart = getCart(state, userId);
    const coupon = resolveCoupon(Object.hasOwn(body, 'couponCode') ? body : { couponCode: cart.couponCode ?? undefined });
    if (coupon.response) return coupon.response;
    if (cart.items.length === 0) return apiError(409, 'CART_EMPTY', 'Não é possível cotar um carrinho vazio.');
    const issues = cartIssues(state, cart);
    if (issues.length > 0) {
      return apiError(409, 'CART_OUT_OF_DATE', 'Preço ou disponibilidade de itens do carrinho mudou.', { issues });
    }
    return HttpResponse.json(buildQuote(cart, coupon.couponCode));
  }),

  http.get('*/api/profile', ({ request, cookies }) => {
    const userId = requireUser(request, cookies);
    if (typeof userId !== 'string') return userId;
    const profile = readMarketplaceState().profiles.find((item) => item.userId === userId);
    return profile ? HttpResponse.json(profile) : apiError(404, 'NOT_FOUND', 'Perfil não encontrado.');
  }),

  http.patch('*/api/profile', async ({ request, cookies }) => {
    const userId = requireUser(request, cookies);
    if (typeof userId !== 'string') return userId;
    const body = await readBody(request);
    const profileFields = ['name', 'username', 'email', 'ensName', 'walletNickname', 'avatarUrl'];
    if (body === null || Object.keys(body).length === 0 || !hasOnlyKeys(body, profileFields)) {
      return apiError(400, 'VALIDATION_ERROR', 'Informe ao menos um campo válido do perfil.');
    }
    const fieldErrors: Record<string, string> = {};
    if (body.name !== undefined && !textInRange(body.name, 1, 80)) fieldErrors.name = 'Informe um nome de exibição com até 80 caracteres.';
    if (body.username !== undefined && (typeof body.username !== 'string' || !USERNAME_PATTERN.test(body.username.trim()))) {
      fieldErrors.username = 'Use de 3 a 30 letras, números, ponto, hífen ou sublinhado.';
    }
    if (body.email !== undefined && (typeof body.email !== 'string' || !EMAIL_PATTERN.test(body.email.trim()))) {
      fieldErrors.email = 'Informe um e-mail válido.';
    }
    if (body.ensName !== undefined && body.ensName !== null
      && (typeof body.ensName !== 'string' || !ENS_PATTERN.test(body.ensName.trim().toLowerCase()))) {
      fieldErrors.ensName = 'Informe um nome ENS válido terminado em .eth.';
    }
    if (body.walletNickname !== undefined && body.walletNickname !== null && !textInRange(body.walletNickname, 1, 40)) {
      fieldErrors.walletNickname = 'Informe um apelido com até 40 caracteres.';
    }
    if (body.avatarUrl !== undefined && !isValidAvatar(body.avatarUrl)) {
      fieldErrors.avatarUrl = 'Use uma imagem PNG, JPEG ou WebP de até 300 KB.';
    }
    if (Object.keys(fieldErrors).length > 0) {
      return apiError(400, 'VALIDATION_ERROR', 'Revise os campos destacados do perfil.', { fields: fieldErrors });
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined;
    const username = typeof body.username === 'string' ? body.username.trim() : undefined;
    let conflict: 'email' | 'username' | undefined;
    updateMarketplaceState((draft) => {
      const others = draft.profiles.filter((item) => item.userId !== userId);
      if (email && others.some((item) => item.email.toLowerCase() === email)) {
        conflict = 'email';
        return;
      }
      if (username && others.some((item) => item.username.toLowerCase() === username.toLowerCase())) {
        conflict = 'username';
        return;
      }
      const profile = draft.profiles.find((item) => item.userId === userId);
      if (!profile) return;
      if (typeof body.name === 'string') profile.name = body.name.trim();
      if (username) profile.username = username;
      if (email) profile.email = email;
      if (body.ensName === null) profile.ensName = null;
      if (typeof body.ensName === 'string') profile.ensName = body.ensName.trim().toLowerCase();
      if (body.walletNickname === null) profile.walletNickname = null;
      if (typeof body.walletNickname === 'string') profile.walletNickname = body.walletNickname.trim();
      if (body.avatarUrl === null || typeof body.avatarUrl === 'string') profile.avatarUrl = body.avatarUrl;
    });
    if (conflict === 'email') {
      return apiError(409, 'EMAIL_ALREADY_REGISTERED', 'Já existe uma conta com este e-mail.', {
        fields: { email: 'Já existe uma conta com este e-mail.' },
      });
    }
    if (conflict === 'username') {
      return apiError(409, 'USERNAME_TAKEN', 'Este nome de usuário já está em uso.', {
        fields: { username: 'Este nome de usuário já está em uso.' },
      });
    }
    const profile = readMarketplaceState().profiles.find((item) => item.userId === userId);
    return profile ? HttpResponse.json(profile) : apiError(404, 'NOT_FOUND', 'Perfil não encontrado.');
  }),

  http.post('*/api/profile/password', async ({ request, cookies }) => {
    const session = getAuthenticatedSession(request, cookies);
    if (!session) return apiError(401, 'UNAUTHENTICATED', 'É necessário entrar na conta.');
    const body = await readBody(request);
    if (body === null || !hasOnlyKeys(body, ['currentPassword', 'newPassword'])
      || typeof body.currentPassword !== 'string' || body.currentPassword.length < 1
      || typeof body.newPassword !== 'string' || body.newPassword.length < 8 || body.newPassword.length > 128) {
      return apiError(400, 'VALIDATION_ERROR', 'A nova senha deve ter entre 8 e 128 caracteres.', {
        fields: { newPassword: 'A nova senha deve ter entre 8 e 128 caracteres.' },
      });
    }
    if (body.currentPassword === body.newPassword) {
      return apiError(400, 'VALIDATION_ERROR', 'A nova senha deve ser diferente da atual.', {
        fields: { newPassword: 'A nova senha deve ser diferente da atual.' },
      });
    }

    const credential = readMarketplaceState().credentials[session.userId];
    const currentHash = credential ? await hashPassword(body.currentPassword, credential.salt) : '';
    if (!credential || !hashesMatch(currentHash, credential.hash)) {
      // 422 em vez de 401: a sessão continua válida, apenas a confirmação da senha falhou.
      return apiError(422, 'INVALID_CURRENT_PASSWORD', 'A senha atual está incorreta.', {
        fields: { currentPassword: 'A senha atual está incorreta.' },
      });
    }

    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await hashPassword(body.newPassword, salt);
    const currentToken = getSessionToken(request, cookies);
    updateMarketplaceState((draft) => {
      draft.credentials[session.userId] = { salt, hash };
      // Revoga as demais sessões do usuário; a sessão atual permanece ativa.
      for (const [token, item] of Object.entries(draft.sessions)) {
        if (item.userId === session.userId && token !== currentToken) delete draft.sessions[token];
      }
    });
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('*/api/wallets', ({ request, cookies }) => {
    const userId = requireUser(request, cookies);
    if (typeof userId !== 'string') return userId;
    return HttpResponse.json(readMarketplaceState().wallets.filter((wallet) => wallet.userId === userId));
  }),

  http.post('*/api/wallets', async ({ request, cookies }) => {
    const userId = requireUser(request, cookies);
    if (typeof userId !== 'string') return userId;
    const body = await readBody(request);
    const state = readMarketplaceState();
    const invalidField = body === null ? 'body' : invalidWalletField(body, false);
    if (body === null || invalidField) {
      return apiError(400, 'VALIDATION_ERROR', 'Revise os campos obrigatórios da carteira.', {
        ...(invalidField && invalidField !== 'body' ? { fields: { [invalidField]: 'Campo inválido.' } } : {}),
      });
    }

    const currentWallets = state.wallets.filter((wallet) => wallet.userId === userId);
    const hasPrincipal = currentWallets.some((wallet) => wallet.role === 'principal');
    const role = body.role === 'principal' || body.role === 'secundaria'
      ? body.role
      : hasPrincipal ? 'secundaria' : 'principal';
    if (role === 'secundaria' && !hasPrincipal) {
      return apiError(409, 'PRIMARY_WALLET_REQUIRED', 'Cadastre a carteira principal antes da secundária.');
    }
    if (currentWallets.some((wallet) => wallet.role === role)) {
      return apiError(409, 'WALLET_ROLE_TAKEN', `Já existe uma carteira ${role === 'principal' ? 'principal' : 'secundária'}.`);
    }
    const fields = normalizedWalletFields(body) as WalletInput;
    if (currentWallets.some((wallet) => wallet.address.toLowerCase() === fields.address.toLowerCase())) {
      return apiError(409, 'WALLET_ADDRESS_DUPLICATE', 'Este endereço já está cadastrado em outra carteira.', {
        fields: { address: 'Este endereço já está cadastrado em outra carteira.' },
      });
    }
    const wallet: Wallet = {
      ...fields,
      alternateAddress: fields.alternateAddress ?? null,
      id: `wallet-${crypto.randomUUID()}`,
      userId,
      role,
    };
    updateMarketplaceState((draft) => {
      draft.wallets.push(wallet);
    });
    return HttpResponse.json(wallet, { status: 201 });
  }),

  http.patch('*/api/wallets/:walletId', async ({ request, params, cookies }) => {
    const userId = requireUser(request, cookies);
    if (typeof userId !== 'string') return userId;
    const body = await readBody(request);
    const invalidField = body === null || Object.keys(body).length === 0 ? 'body' : invalidWalletField(body, true);
    if (body === null || invalidField) {
      return apiError(400, 'VALIDATION_ERROR', 'Informe campos válidos para atualizar a carteira.', {
        ...(invalidField && invalidField !== 'body' ? { fields: { [invalidField]: 'Campo inválido.' } } : {}),
      });
    }

    const walletId = String(params.walletId);
    const userWallets = readMarketplaceState().wallets.filter((item) => item.userId === userId);
    const wallet = userWallets.find((item) => item.id === walletId);
    if (!wallet) return apiError(404, 'NOT_FOUND', 'Carteira não encontrada.');
    if (body.role === 'secundaria' && wallet.role === 'principal'
      && !userWallets.some((item) => item.role === 'secundaria')) {
      return apiError(409, 'PRIMARY_WALLET_REQUIRED', 'Defina outra carteira como principal antes de rebaixar esta.');
    }
    const fields = normalizedWalletFields(body);
    if (fields.address && userWallets.some((item) => item.id !== walletId
      && item.address.toLowerCase() === fields.address?.toLowerCase())) {
      return apiError(409, 'WALLET_ADDRESS_DUPLICATE', 'Este endereço já está cadastrado em outra carteira.', {
        fields: { address: 'Este endereço já está cadastrado em outra carteira.' },
      });
    }
    updateMarketplaceState((draft) => {
      const target = draft.wallets.find((item) => item.id === walletId && item.userId === userId);
      if (!target) return;
      if ((body.role === 'principal' || body.role === 'secundaria') && body.role !== target.role) {
        // Troca de papéis: a carteira que ocupava o papel desejado assume o papel antigo.
        const occupant = draft.wallets.find((item) => item.userId === userId && item.role === body.role);
        if (occupant) occupant.role = target.role;
        target.role = body.role;
      }
      Object.assign(target, fields);
    });
    const updated = readMarketplaceState().wallets.find((item) => item.id === walletId);
    return updated ? HttpResponse.json(updated) : apiError(404, 'NOT_FOUND', 'Carteira não encontrada.');
  }),

  http.delete('*/api/wallets/:walletId', ({ request, params, cookies }) => {
    const userId = requireUser(request, cookies);
    if (typeof userId !== 'string') return userId;
    const walletId = String(params.walletId);
    const wallet = readMarketplaceState().wallets.find((item) => item.id === walletId && item.userId === userId);
    if (!wallet) return apiError(404, 'NOT_FOUND', 'Carteira não encontrada.');

    updateMarketplaceState((draft) => {
      draft.wallets = draft.wallets.filter((item) => item.id !== walletId || item.userId !== userId);
      if (wallet.role === 'principal') {
        const replacement = draft.wallets.find((item) => item.userId === userId);
        if (replacement) replacement.role = 'principal';
      }
    });
    return new HttpResponse(null, { status: 204 });
  }),

  /**
   * Conexão simulada com o provedor da carteira (etapa 7). A carteira precisa ser do usuário e estar
   * cadastrada na rede escolhida. Cenário `wallet-connection-refused`: o usuário "recusa" no provedor.
   */
  http.post('*/api/wallet-connections', async ({ request, cookies }) => {
    const userId = requireUser(request, cookies);
    if (typeof userId !== 'string') return userId;
    const body = await readBody(request);
    if (!body || !hasOnlyKeys(body, ['walletId', 'provider', 'network'])
      || typeof body.walletId !== 'string'
      || typeof body.provider !== 'string' || !WALLET_TYPES.includes(body.provider)
      || typeof body.network !== 'string' || !NETWORKS.includes(body.network)) {
      return apiError(400, 'VALIDATION_ERROR', 'Informe carteira, provedor e rede válidos.');
    }
    const wallet = readMarketplaceState().wallets.find((item) => item.id === body.walletId && item.userId === userId);
    if (!wallet) return apiError(404, 'NOT_FOUND', 'Carteira não encontrada.');
    if (wallet.network !== body.network) {
      return apiError(422, 'NETWORK_MISMATCH', `Esta carteira está cadastrada na rede ${wallet.network}.`, {
        fields: { network: `Selecione a rede ${wallet.network} para esta carteira.` },
      });
    }
    if (selectedScenario() === 'wallet-connection-refused') {
      return apiError(422, 'WALLET_CONNECTION_REJECTED', `A conexão foi recusada na ${body.provider}.`);
    }

    const connection: WalletConnection = {
      id: `conn-${crypto.randomUUID()}`,
      walletId: wallet.id,
      address: wallet.address,
      provider: body.provider as WalletType,
      network: body.network as WalletNetwork,
      connectedAt: new Date().toISOString(),
    };
    walletConnections.set(connection.id, { ...connection, userId });
    return HttpResponse.json(connection, { status: 201 });
  }),

  http.delete('*/api/wallet-connections/:connectionId', ({ request, params, cookies }) => {
    const userId = requireUser(request, cookies);
    if (typeof userId !== 'string') return userId;
    const connection = walletConnections.get(String(params.connectionId));
    if (connection?.userId === userId) walletConnections.delete(connection.id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('*/api/orders', ({ request, cookies }) => {
    const userId = requireUser(request, cookies);
    if (typeof userId !== 'string') return userId;
    settleDueOrders();
    const state = readMarketplaceState();
    return HttpResponse.json(state.orders.filter((order) => state.orderOwners[order.id] === userId));
  }),

  /**
   * Cria o pedido a partir do carrinho revisado. Ordem das verificações:
   * 1. formato e `Idempotency-Key`; 2. posse da carteira; 3. idempotência — a mesma chave e o mesmo
   * conteúdo recuperam o pedido existente mesmo após timeout ou queda da conexão da carteira;
   * 4. conexão da carteira; 5. pedido pendente do mesmo carrinho; 6. revalidação de disponibilidade,
   * preço, cupom e total (mudanças exigem nova confirmação).
   */
  http.post('*/api/orders', async ({ request, cookies }) => {
    const userId = requireUser(request, cookies);
    if (typeof userId !== 'string') return userId;
    const body = await readBody(request);
    const keyHeader = request.headers.get('idempotency-key');
    const parsed = body ? parseOrderRequest(body) : { error: 'O corpo da requisição deve ser um objeto JSON.' };
    if ('error' in parsed) return apiError(400, 'VALIDATION_ERROR', parsed.error, parsed.details);
    const input = parsed.value;
    if (!keyHeader || keyHeader.trim().length === 0 || keyHeader.length > 200) {
      return apiError(400, 'VALIDATION_ERROR', 'O cabeçalho Idempotency-Key é obrigatório.');
    }
    let key;
    try {
      key = idempotencyKey(keyHeader);
    } catch {
      return apiError(400, 'VALIDATION_ERROR', 'A chave de idempotência é inválida.');
    }
    if (input.couponCode !== null && input.couponCode !== 'WELCOME10') {
      return apiError(422, 'COUPON_INVALID', 'O cupom é inválido ou expirou.');
    }

    const state = readMarketplaceState();
    const wallet = state.wallets.find((item) => item.userId === userId && item.address === input.walletAddress);
    if (!wallet) return apiError(403, 'FORBIDDEN', 'A carteira não pertence à conta autenticada.');

    // A conexão é transitória e fica fora da impressão digital: reenviar após reconectar recupera o pedido.
    const { connectionId, ...fingerprintInput } = input;
    const requestFingerprint = JSON.stringify({ userId, ...fingerprintInput });
    const existingOrder = state.orders.find((order) => order.idempotencyKey === key);
    if (existingOrder) {
      if (state.orderOwners[existingOrder.id] === userId
        && state.orderRequests[key] === requestFingerprint) {
        return HttpResponse.json({ order: existingOrder }, { status: 200 });
      }
      return apiError(409, 'IDEMPOTENCY_CONFLICT', 'A chave de idempotência já foi usada com outro conteúdo.');
    }

    const connection = walletConnections.get(connectionId);
    if (!connection || connection.userId !== userId || connection.walletId !== wallet.id
      || connection.provider !== input.provider || connection.network !== input.network) {
      return apiError(409, 'WALLET_DISCONNECTED', 'A carteira não está conectada. Conecte-a novamente para continuar.');
    }
    if (selectedScenario() === 'wallet-disconnect') {
      walletConnections.delete(connectionId);
      return apiError(409, 'WALLET_DISCONNECTED', `A ${input.provider} foi desconectada antes do envio. Conecte-a novamente.`);
    }

    const cart = getCart(state, userId);
    const pendingOrder = state.orders.find((order) => order.status === 'pendente'
      && state.orderOwners[order.id] === userId && order.quote.cartVersion === cart.version);
    if (pendingOrder) {
      return apiError(409, 'ORDER_ALREADY_PENDING', 'Já existe um pedido em processamento para este carrinho.', {
        orderId: pendingOrder.id,
      });
    }
    if (cart.items.length === 0) return apiError(409, 'CART_EMPTY', 'Não é possível criar um pedido com carrinho vazio.');
    const issues = cartIssues(state, cart);
    if (issues.length > 0) {
      return apiError(409, 'CART_OUT_OF_DATE', 'Preço ou disponibilidade mudaram. Revise o carrinho.', { issues });
    }
    const quote = buildQuote(cart, cart.couponCode ?? undefined);
    if (cart.version !== input.cartVersion || cart.couponCode !== input.couponCode
      || compareDecimals(quote.totalEth, input.expectedTotalEth) !== 0) {
      return apiError(409, 'QUOTE_CHANGED', 'Os valores do pedido mudaram. Revise e confirme novamente.', { quote });
    }

    const now = new Date().toISOString();
    const order: Order = {
      id: `order-${crypto.randomUUID()}`,
      idempotencyKey: key,
      status: 'pendente',
      version: 1,
      createdAt: now,
      updatedAt: now,
      items: cart.items.map((item) => orderItemFor(state, item)),
      quote,
      walletId: wallet.id,
      walletAddress: wallet.address,
      network: input.network,
      provider: input.provider,
      collector: input.collector,
      failureReason: null,
    };
    const manualSettlement = selectedScenario() === 'order-confirm' || selectedScenario() === 'order-refuse';
    const settleAt = Date.now() + ORDER_SETTLEMENT_DELAY_MS;
    updateMarketplaceState((draft) => {
      draft.orders.push(order);
      draft.orderRequests[key] = requestFingerprint;
      draft.orderOwners[order.id] = userId;
      if (!manualSettlement) draft.orderSettlements[order.id] = settleAt;
    });
    if (!manualSettlement) scheduleSettlement(order.id, settleAt);
    const event: OrderUpdatedEvent = createEnvelope(order, order.version);
    publishMarketplaceEvent('order.updated', event, userId);
    if (selectedScenario() === 'order-timeout-after-create') {
      return apiError(504, 'ORDER_RESPONSE_TIMEOUT', 'O pedido foi criado, mas a resposta simulada expirou.');
    }
    return HttpResponse.json({ order }, { status: 201 });
  }),

  http.get('*/api/orders/:orderId', ({ request, params, cookies }) => {
    const userId = requireUser(request, cookies);
    if (typeof userId !== 'string') return userId;
    settleDueOrders();
    const state = readMarketplaceState();
    const orderId = String(params.orderId);
    const order = state.orders.find((item) => item.id === orderId && state.orderOwners[item.id] === userId);
    return order ? HttpResponse.json(order) : apiError(404, 'NOT_FOUND', 'Pedido não encontrado.');
  }),

  http.get('*/api/orders/:orderId/receipt', ({ request, params, cookies }) => {
    const userId = requireUser(request, cookies);
    if (typeof userId !== 'string') return userId;
    settleDueOrders();
    const state = readMarketplaceState();
    const orderId = String(params.orderId);
    if (state.orderOwners[orderId] !== userId) return apiError(404, 'NOT_FOUND', 'Pedido não encontrado.');
    const receipt = state.receipts.find((item) => item.orderId === orderId);
    return receipt
      ? HttpResponse.json(receipt)
      : apiError(404, 'NOT_FOUND', 'Recibo ainda não disponível.');
  }),
];

configureSettlementOutcome(() => (selectedScenario() === 'payment-refused'
  ? { status: 'recusado', reason: 'PAYMENT_REFUSED' }
  : { status: 'confirmado' }));
// Retoma liquidações agendadas antes de um refresh (os timers do mock vivem na página).
try {
  settleDueOrders();
} catch (error) {
  console.error('Não foi possível retomar a liquidação dos pedidos simulados.', error);
}
