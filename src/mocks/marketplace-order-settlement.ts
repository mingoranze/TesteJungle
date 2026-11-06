import type {
  Nft,
  NftUpdatedEvent,
  Order,
  OrderFailureReason,
  OrderReceipt,
  OrderUpdatedEvent,
} from '../domain/contracts';
import { readMarketplaceState, updateMarketplaceState, type MarketplaceState } from './marketplace-store';
import { publishMarketplaceEvent } from './socket-io-polling';

/**
 * Liquidação simulada de pedidos: um pedido `pendente` termina como `confirmado` ou `recusado`
 * (estados terminais) numa única mutação persistida, que também atualiza estoque, recibo e
 * carrinho. Os eventos `order.updated`/`nft.updated` são publicados somente depois da mutação,
 * para que REST e Socket.IO reflitam o mesmo estado.
 */

/** Atraso da confirmação automática da "rede" simulada após a criação do pedido. */
export const ORDER_SETTLEMENT_DELAY_MS = 1_500;

export type SettlementOutcome = { status: 'confirmado' } | { status: 'recusado'; reason: OrderFailureReason };

function createEnvelope<T>(resource: T, version: number) {
  return { eventId: crypto.randomUUID(), version, resource, occurredAt: new Date().toISOString() };
}

function transactionReference() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Unidades por NFT no snapshot do pedido (várias edições do mesmo NFT somam). */
function unitsByNft(order: Order) {
  const units = new Map<string, number>();
  for (const item of order.items) units.set(item.nftId, (units.get(item.nftId) ?? 0) + item.quantity);
  return units;
}

/**
 * Aplica o desfecho ao rascunho do estado. Confirmar exige estoque para todo o snapshot; sem ele,
 * o pedido é recusado por disponibilidade. Após a confirmação, somente os itens e quantidades
 * efetivamente comprados saem do carrinho; a recusa preserva o carrinho.
 */
function applySettlement(draft: MarketplaceState, orderId: string, requested: SettlementOutcome) {
  const order = draft.orders.find((item) => item.id === orderId);
  if (!order || order.status !== 'pendente') return undefined;
  const userId = draft.orderOwners[orderId];
  const changedNfts: Nft[] = [];
  let outcome = requested;

  if (outcome.status === 'confirmado') {
    const units = unitsByNft(order);
    const missingStock = [...units].some(([nftId, count]) => {
      const nft = draft.nfts.find((item) => item.id === nftId);
      return !nft || nft.availableEditions < count;
    });
    if (missingStock) outcome = { status: 'recusado', reason: 'AVAILABILITY_CONFLICT' };
  }

  const now = new Date().toISOString();
  order.status = outcome.status;
  order.version += 1;
  order.updatedAt = now;
  order.failureReason = outcome.status === 'recusado' ? outcome.reason : null;
  delete draft.orderSettlements[orderId];

  if (outcome.status === 'confirmado') {
    for (const [nftId, count] of unitsByNft(order)) {
      const nft = draft.nfts.find((item) => item.id === nftId);
      if (!nft) continue;
      nft.availableEditions -= count;
      nft.version += 1;
      changedNfts.push(structuredClone(nft));
    }

    const receipt: OrderReceipt = {
      orderId,
      status: 'confirmado',
      items: structuredClone(order.items),
      quote: structuredClone(order.quote),
      walletAddress: order.walletAddress,
      network: order.network,
      provider: order.provider,
      transactionReference: transactionReference(),
      blockNumber: 19_000_000 + draft.receipts.length + draft.orders.length,
      confirmedAt: now,
    };
    draft.receipts.push(receipt);

    const cart = draft.carts.find((item) => item.userId === userId);
    if (cart) {
      let changed = false;
      for (const purchased of order.items) {
        const line = cart.items.find((item) => item.nftId === purchased.nftId && item.editionId === purchased.editionId);
        if (!line) continue;
        changed = true;
        const remaining = line.quantity - purchased.quantity;
        if (remaining > 0) line.quantity = remaining as typeof line.quantity;
        else cart.items = cart.items.filter((item) => item !== line);
      }
      // O cupom usado na compra é consumido.
      if (order.quote.couponCode && cart.couponCode === order.quote.couponCode) {
        cart.couponCode = null;
        changed = true;
      }
      if (changed) cart.version += 1;
    }
  }

  return { order: structuredClone(order), userId, changedNfts };
}

function publishSettlement(result: NonNullable<ReturnType<typeof applySettlement>>) {
  for (const nft of result.changedNfts) {
    const nftEvent: NftUpdatedEvent = createEnvelope(nft, nft.version);
    publishMarketplaceEvent('nft.updated', nftEvent);
  }
  const event: OrderUpdatedEvent = createEnvelope(result.order, result.order.version);
  if (result.userId) publishMarketplaceEvent('order.updated', event, result.userId);
  return event;
}

/** Leva um pedido pendente a um estado terminal e publica os eventos. `undefined` se já era terminal. */
export function settleOrder(orderId: string, outcome: SettlementOutcome) {
  let result: ReturnType<typeof applySettlement>;
  updateMarketplaceState((draft) => {
    result = applySettlement(draft, orderId, outcome);
  });
  return result ? publishSettlement(result) : undefined;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
let resolveOutcome: () => SettlementOutcome = () => ({ status: 'confirmado' });

/** Define como a rede simulada decide o desfecho automático (depende do cenário ativo). */
export function configureSettlementOutcome(resolver: () => SettlementOutcome) {
  resolveOutcome = resolver;
}

function runSettlement(orderId: string) {
  timers.delete(orderId);
  const state = readMarketplaceState();
  if (!(orderId in state.orderSettlements)) return;
  settleOrder(orderId, resolveOutcome());
}

/** Agenda a liquidação automática de um pedido para `settleAt` (ms desde a época). */
export function scheduleSettlement(orderId: string, settleAt: number) {
  clearTimeout(timers.get(orderId));
  timers.set(orderId, setTimeout(() => runSettlement(orderId), Math.max(0, settleAt - Date.now())));
}

/**
 * Liquida pedidos cuja confirmação já venceu. Chamado antes das leituras de pedidos, para que um
 * refresh (que reinicia os timers do mock no navegador) não deixe pedidos presos em `pendente`.
 */
export function settleDueOrders() {
  const state = readMarketplaceState();
  const now = Date.now();
  for (const [orderId, settleAt] of Object.entries(state.orderSettlements)) {
    if (settleAt <= now) {
      clearTimeout(timers.get(orderId));
      timers.delete(orderId);
      settleOrder(orderId, resolveOutcome());
    } else if (!timers.has(orderId)) {
      scheduleSettlement(orderId, settleAt);
    }
  }
}

export function clearSettlementTimers() {
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
}
