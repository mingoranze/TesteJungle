import type {
  CreateOrderRequest,
  CreateOrderResponse,
  IdempotencyKey,
  Order,
  OrderReceipt,
  WalletConnection,
  WalletConnectionRequest,
} from '@/domain/contracts';
import { apiClient } from '@/lib/api-client';
import { privateQueryKey } from '@/lib/query-keys';

/** Pedidos e recibos ficam na partição privada do usuário (descartada no logout/troca). */
export const orderKeys = {
  all: (userId: string) => privateQueryKey(userId, 'orders'),
  list: (userId: string) => privateQueryKey(userId, 'orders', 'list'),
  detail: (userId: string, orderId: string) => privateQueryKey(userId, 'orders', 'detail', orderId),
  receipt: (userId: string, orderId: string) => privateQueryKey(userId, 'orders', 'receipt', orderId),
};

export async function connectWallet(input: WalletConnectionRequest) {
  const { data } = await apiClient.post<WalletConnection>('/wallet-connections', input);
  return data;
}

export async function disconnectWallet(connectionId: string) {
  await apiClient.delete(`/wallet-connections/${encodeURIComponent(connectionId)}`);
}

export async function createOrder(input: CreateOrderRequest, key: IdempotencyKey) {
  const { data } = await apiClient.post<CreateOrderResponse>('/orders', input, {
    headers: { 'Idempotency-Key': key },
  });
  return data.order;
}

export async function listOrders(signal?: AbortSignal) {
  const { data } = await apiClient.get<Order[]>('/orders', { signal });
  return data;
}

export async function getOrder(orderId: string, signal?: AbortSignal) {
  const { data } = await apiClient.get<Order>(`/orders/${encodeURIComponent(orderId)}`, { signal });
  return data;
}

export async function getReceipt(orderId: string, signal?: AbortSignal) {
  const { data } = await apiClient.get<OrderReceipt>(`/orders/${encodeURIComponent(orderId)}/receipt`, { signal });
  return data;
}
