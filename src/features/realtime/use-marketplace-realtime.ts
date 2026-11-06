import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import {
  isTerminalOrderStatus,
  type CartResponse,
  type Nft,
  type NftUpdatedEvent,
  type Order,
  type OrderUpdatedEvent,
  type PaginatedResponse,
} from '@/domain/contracts';
import { orderKeys } from '@/features/checkout/api';
import { cartKeys } from '@/features/cart/use-cart';
import { createEventGuard } from '@/features/realtime/event-guard';
import { clearRealtimeNotices, pushRealtimeNotice } from '@/features/realtime/realtime-notices';
import { registerSessionSubscription } from '@/features/session/session-subscriptions';
import { useSession } from '@/features/session/session';
import { compareDecimal, formatEth } from '@/lib/decimal';
import { nftKeys } from '@/lib/query-keys';

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';

/** Estado da conexão exposto no `<html data-realtime>` para diagnóstico e testes, sem ruído para leitores de tela. */
function setRealtimeStatus(status: RealtimeStatus) {
  document.documentElement.dataset.realtime = status;
}

/**
 * Cliente Socket.IO da aplicação: polling Engine.IO (interceptado pelo MSW na demonstração) com
 * reconexão automática. Cada sessão (visitante ou usuário) usa sua própria conexão.
 */
function connectRealtimeSocket() {
  return io(import.meta.env.VITE_SOCKET_URL, {
    path: '/socket.io/',
    transports: ['polling'],
    forceNew: true,
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3_000,
  });
}

function isNftUpdatedEvent(value: unknown): value is NftUpdatedEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Partial<NftUpdatedEvent>;
  return typeof event.eventId === 'string'
    && typeof event.version === 'number'
    && typeof event.resource?.id === 'string'
    && typeof event.resource.priceEth === 'string'
    && typeof event.resource.availableEditions === 'number'
    && event.resource.version === event.version;
}

const ORDER_STATUSES: readonly string[] = ['pendente', 'confirmado', 'recusado'];

function isOrderUpdatedEvent(value: unknown): value is OrderUpdatedEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Partial<OrderUpdatedEvent>;
  return typeof event.eventId === 'string'
    && typeof event.version === 'number'
    && typeof event.resource?.id === 'string'
    && ORDER_STATUSES.includes(event.resource.status)
    && event.resource.version === event.version;
}

/**
 * Aplica um `order.updated` aceito ao pedido do usuário da conexão: somente versões mais novas, e
 * nunca depois de um estado terminal (confirmado/recusado não regridem). Confirmação também
 * revalida carrinho (itens comprados saem) e recibo via REST.
 */
function applyOrderUpdate(queryClient: QueryClient, event: OrderUpdatedEvent, userId: string) {
  const order = event.resource;
  queryClient.setQueryData<Order>(orderKeys.detail(userId, order.id), (current) => {
    if (!current || isTerminalOrderStatus(current.status) || current.version >= order.version) return current;
    return order;
  });
  void queryClient.invalidateQueries({ queryKey: orderKeys.list(userId) });
  if (isTerminalOrderStatus(order.status)) {
    void queryClient.invalidateQueries({ queryKey: cartKeys.current(userId) });
    void queryClient.invalidateQueries({ queryKey: orderKeys.receipt(userId, order.id) });
  }
}

function cachedCart(queryClient: QueryClient, userId: string | null) {
  return queryClient.getQueryData<CartResponse>(cartKeys.current(userId));
}

function previousNftState(queryClient: QueryClient, nftId: string) {
  const detail = queryClient.getQueryData<Nft>(nftKeys.detail(nftId));
  if (detail) return detail;
  for (const [, page] of queryClient.getQueriesData<PaginatedResponse<Nft>>({ queryKey: nftKeys.lists() })) {
    const item = page?.items.find(({ id }) => id === nftId);
    if (item) return item;
  }
  return undefined;
}

function describeChange(nft: Nft, previousPrice: string | undefined, previousAvailable: number | undefined) {
  if (nft.availableEditions < 1 && previousAvailable !== 0) return `${nft.title} esgotou. Revise o carrinho.`;
  if (previousPrice && compareDecimal(previousPrice, nft.priceEth) !== 0) {
    return `${nft.title}: preço atualizado de ${formatEth(previousPrice)} para ${formatEth(nft.priceEth)} ETH. Revise o carrinho.`;
  }
  if (previousAvailable !== undefined && previousAvailable !== nft.availableEditions) {
    return `${nft.title}: agora há ${nft.availableEditions} edições disponíveis.`;
  }
  return undefined;
}

/**
 * Aplica um `nft.updated` aceito: atualiza detalhe e listas somente com versões mais novas e
 * revalida via REST (que continua sendo a fonte da verdade). Se o NFT está no carrinho, o
 * carrinho é recarregado — a API devolve as divergências — e o usuário é avisado.
 */
function applyNftUpdate(queryClient: QueryClient, event: NftUpdatedEvent, userId: string | null) {
  const nft = event.resource;
  const previous = previousNftState(queryClient, nft.id);
  const detailKey = nftKeys.detail(nft.id);

  queryClient.setQueryData<Nft>(detailKey, (current) => (
    current && current.version < nft.version ? { ...current, ...nft } : current
  ));
  queryClient.setQueriesData<PaginatedResponse<Nft>>({ queryKey: nftKeys.lists() }, (page) => (page
    ? { ...page, items: page.items.map((item) => (item.id === nft.id && item.version < nft.version ? { ...item, ...nft } : item)) }
    : page));
  // Preço muda ordenação/filtros: listas ativas são reconsultadas; consultas antigas em voo são canceladas.
  void queryClient.invalidateQueries({ queryKey: nftKeys.lists(), refetchType: 'active' });
  void queryClient.invalidateQueries({ queryKey: detailKey, refetchType: 'active' });

  const cart = cachedCart(queryClient, userId);
  const cartItem = cart?.items.find((item) => item.nftId === nft.id);
  if (!cartItem) return;
  void queryClient.invalidateQueries({ queryKey: cartKeys.current(userId) });
  const message = describeChange(
    nft,
    previous && previous.version < nft.version ? previous.priceEth : cartItem.unitPriceEth,
    previous && previous.version < nft.version ? previous.availableEditions : undefined,
  );
  if (message) pushRealtimeNotice(message);
}

/** Reconciliação após (re)conexão: reconsulta catálogo, detalhes e carrinho ativos carregados antes de `before`. */
function reconcileActiveResources(queryClient: QueryClient, userId: string | null, before: number) {
  const stale = {
    refetchType: 'active' as const,
    // Consultas ainda sem dados já estão buscando o estado atual; não as interrompe.
    predicate: (query: { state: { dataUpdatedAt: number } }) => (
      query.state.dataUpdatedAt > 0 && query.state.dataUpdatedAt < before
    ),
  };
  void queryClient.invalidateQueries({ queryKey: nftKeys.all, ...stale });
  void queryClient.invalidateQueries({ queryKey: cartKeys.current(userId), ...stale });
  // Pedidos acompanhados: o estado perdido durante a queda vem do REST.
  if (userId) void queryClient.invalidateQueries({ queryKey: orderKeys.all(userId), ...stale });
}

/**
 * Assina eventos de catálogo pelo `socket.io-client`. A conexão é recriada quando a sessão
 * muda (logout, troca de usuário, expiração) e é registrada nas subscriptions da sessão, para que
 * eventos da sessão anterior sejam descartados. Listeners são liberados ao desmontar.
 */
export function useMarketplaceRealtime() {
  const queryClient = useQueryClient();
  const session = useSession();
  const sessionReady = session.data !== undefined;
  const userId = session.data?.status === 'authenticated' ? session.data.userId : null;

  useEffect(() => {
    if (!sessionReady) return undefined;
    let active = true;
    let connectedOnce = false;
    let guard = createEventGuard();
    const startedAt = Date.now();
    const socket = connectRealtimeSocket();
    setRealtimeStatus('connecting');

    const onConnect = () => {
      if (!active) return;
      setRealtimeStatus('connected');
      // Cada conexão tem seu próprio controle de duplicatas/versões; o que se perdeu no intervalo
      // sem conexão é recuperado pela reconciliação REST.
      guard = createEventGuard();
      reconcileActiveResources(queryClient, userId, connectedOnce ? Date.now() : startedAt);
      connectedOnce = true;
    };
    const onDisconnect = () => {
      if (active) setRealtimeStatus('disconnected');
    };
    const onNftUpdated = (event: unknown) => {
      if (!active || !isNftUpdatedEvent(event) || !guard.accept(event)) return;
      applyNftUpdate(queryClient, event, userId);
    };

    const onOrderUpdated = (event: unknown) => {
      // `order.updated` só chega a conexões autenticadas do proprietário; eventos de outra sessão são descartados.
      if (!active || !userId || !isOrderUpdatedEvent(event) || !guard.accept(event)) return;
      applyOrderUpdate(queryClient, event, userId);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('nft.updated', onNftUpdated);
    socket.on('order.updated', onOrderUpdated);

    const dispose = () => {
      if (!active) return;
      active = false;
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('nft.updated', onNftUpdated);
      socket.off('order.updated', onOrderUpdated);
      socket.disconnect();
      clearRealtimeNotices();
      setRealtimeStatus('disconnected');
    };
    const unregister = userId ? registerSessionSubscription(userId, dispose) : undefined;

    return () => {
      dispose();
      unregister?.();
    };
  }, [queryClient, sessionReady, userId]);
}
