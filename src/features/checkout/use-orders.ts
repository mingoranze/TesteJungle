import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  isTerminalOrderStatus,
  type CreateOrderRequest,
  type IdempotencyKey,
  type Order,
  type WalletConnectionRequest,
} from '@/domain/contracts';
import {
  connectWallet,
  createOrder,
  disconnectWallet,
  getOrder,
  getReceipt,
  listOrders,
  orderKeys,
} from '@/features/checkout/api';
import { clearOrderAttempt } from '@/features/checkout/order-attempt';
import { useAuthenticatedSession } from '@/features/session/session';
import { ApiError } from '@/lib/api-error';

/** Falhas sem resposta conclusiva (rede, timeout, 5xx): o pedido pode ter sido criado. */
export function isTransientOrderError(error: unknown) {
  return error instanceof ApiError && (error.status === null || error.status >= 500);
}

export function useOrders() {
  const session = useAuthenticatedSession();
  return useQuery({
    queryKey: orderKeys.list(session?.userId ?? 'anonymous'),
    queryFn: ({ signal }) => listOrders(signal),
    enabled: Boolean(session),
    staleTime: 0,
  });
}

/**
 * Pedido acompanhado pela tela de status. A API é a fonte da verdade; `order.updated` atualiza o
 * cache somente com versões mais novas e nunca tira o pedido de um estado terminal.
 */
export function useOrder(orderId: string) {
  const session = useAuthenticatedSession();
  return useQuery({
    queryKey: orderKeys.detail(session?.userId ?? 'anonymous', orderId),
    queryFn: ({ signal }) => getOrder(orderId, signal),
    enabled: Boolean(session),
    staleTime: (query) => (query.state.data && isTerminalOrderStatus(query.state.data.status) ? Infinity : 0),
    retry: (failureCount, error) => failureCount < 1 && isTransientOrderError(error),
  });
}

export function useReceipt(orderId: string, enabled: boolean) {
  const session = useAuthenticatedSession();
  return useQuery({
    queryKey: orderKeys.receipt(session?.userId ?? 'anonymous', orderId),
    queryFn: ({ signal }) => getReceipt(orderId, signal),
    enabled: Boolean(session) && enabled,
    // O recibo é um snapshot imutável do pedido confirmado.
    staleTime: Infinity,
  });
}

export function useConnectWallet() {
  return useMutation({ mutationFn: (input: WalletConnectionRequest) => connectWallet(input) });
}

export function useDisconnectWallet() {
  return useMutation({ mutationFn: (connectionId: string) => disconnectWallet(connectionId) });
}

export interface SubmitOrderVariables {
  userId: string;
  request: CreateOrderRequest;
  key: IdempotencyKey;
}

/**
 * Envia o pedido com a chave de idempotência da tentativa. Falhas transitórias são reenviadas
 * automaticamente com a mesma chave e o mesmo conteúdo — a API devolve o pedido já criado em vez
 * de criar outro.
 */
export function useSubmitOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ request, key }: SubmitOrderVariables) => createOrder(request, key),
    retry: (failureCount, error) => failureCount < 2 && isTransientOrderError(error),
    retryDelay: 800,
    onSuccess: (order: Order, { userId }) => {
      clearOrderAttempt(userId);
      queryClient.setQueryData<Order>(orderKeys.detail(userId, order.id), (current) => (
        current && current.version >= order.version ? current : order
      ));
      void queryClient.invalidateQueries({ queryKey: orderKeys.list(userId) });
    },
  });
}
