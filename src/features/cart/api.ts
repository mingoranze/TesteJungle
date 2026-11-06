import type { CartItemInput, CartResponse, Quote } from '@/domain/contracts';
import { apiClient } from '@/lib/api-client';

export async function getCart(signal?: AbortSignal) {
  const { data } = await apiClient.get<CartResponse>('/cart', { signal });
  return data;
}

export async function addCartItem(input: CartItemInput) {
  const { data } = await apiClient.post<CartResponse>('/cart/items', input);
  return data;
}

export async function updateCartItem(input: Required<CartItemInput>) {
  const { data } = await apiClient.patch<CartResponse>(
    `/cart/items/${encodeURIComponent(input.nftId)}`,
    { quantity: input.quantity, editionId: input.editionId },
  );
  return data;
}

export async function removeCartItem(input: { nftId: string; editionId: string }) {
  const { data } = await apiClient.delete<CartResponse>(`/cart/items/${encodeURIComponent(input.nftId)}`, {
    params: { editionId: input.editionId },
  });
  return data;
}

/** Aceita as divergências apontadas pela API (preço atual, quantidades e itens esgotados). */
export async function reconcileCart() {
  const { data } = await apiClient.post<CartResponse>('/cart/reconcile');
  return data;
}

export async function applyCoupon(couponCode: string) {
  const { data } = await apiClient.put<CartResponse>('/cart/coupon', { couponCode });
  return data;
}

export async function removeCoupon() {
  const { data } = await apiClient.delete<CartResponse>('/cart/coupon');
  return data;
}

/** Cotação do carrinho atual; a API usa o cupom aplicado ao carrinho. */
export async function getQuote(signal?: AbortSignal) {
  const { data } = await apiClient.post<Quote>('/quotes', {}, { signal });
  return data;
}
