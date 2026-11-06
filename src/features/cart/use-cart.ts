import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { CartItemInput, CartResponse } from '@/domain/contracts';
import {
  addCartItem,
  applyCoupon,
  getCart,
  getQuote,
  reconcileCart,
  removeCartItem,
  removeCoupon,
  updateCartItem,
} from '@/features/cart/api';
import { cachedUserId, useSession } from '@/features/session/session';
import { ApiError } from '@/lib/api-error';
import { privateQueryKey } from '@/lib/query-keys';

/**
 * O carrinho do visitante fica fora da partição privada; o do usuário autenticado fica em
 * `['private', userId, 'cart']`, descartado no logout/troca de usuário. A cotação é filha da
 * chave do carrinho e inclui a versão: mudar o carrinho nunca reaproveita uma cotação antiga.
 */
export const cartKeys = {
  all: ['cart'] as const,
  guest: ['cart', 'guest'] as const,
  current: (userId?: string | null) => (userId ? privateQueryKey(userId, 'cart') : cartKeys.guest),
  quote: (userId: string | null | undefined, cartVersion: number) =>
    [...cartKeys.current(userId), 'quote', cartVersion] as const,
};

export function invalidateCart(queryClient: QueryClient) {
  const userId = cachedUserId();
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: cartKeys.guest }),
    userId ? queryClient.invalidateQueries({ queryKey: cartKeys.current(userId) }) : undefined,
  ]);
}

export function useCart() {
  const session = useSession();
  const userId = session.data?.status === 'authenticated' ? session.data.userId : undefined;
  const query = useQuery({
    queryKey: cartKeys.current(userId),
    queryFn: ({ signal }) => getCart(signal),
    // A API resolve o carrinho pelo cookie; esperar a sessão evita gravar o carrinho na chave errada.
    enabled: session.data !== undefined,
  });
  return { ...query, userId, sessionPending: session.isPending };
}

export function cartUnitCount(cart: CartResponse | undefined) {
  return cart?.items.reduce((total, item) => total + item.quantity, 0) ?? 0;
}

/**
 * Mutations do carrinho: a resposta da API é o carrinho completo e substitui o cache somente se
 * pertencer à sessão atual e não for mais antiga que o cache (cliques concorrentes).
 */
function useCartMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<CartResponse>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variables: TVariables) => ({ cart: await mutationFn(variables), userId: cachedUserId() }),
    onSuccess: ({ cart, userId }) => {
      if ((cart.userId ?? undefined) !== userId || cachedUserId() !== userId) {
        void invalidateCart(queryClient);
        return;
      }
      queryClient.setQueryData<CartResponse>(
        cartKeys.current(userId),
        (current) => (current && current.id === cart.id && current.version > cart.version ? current : cart),
      );
    },
    onError: (error) => {
      // Conflitos (disponibilidade, carrinho alterado) exigem o estado atual do servidor.
      if (error instanceof ApiError && (error.status === 409 || error.status === 404)) {
        void invalidateCart(queryClient);
      }
    },
  });
}

export function useAddToCart() {
  return useCartMutation((input: CartItemInput) => addCartItem(input));
}

export function useUpdateCartItem() {
  return useCartMutation((input: Required<CartItemInput>) => updateCartItem(input));
}

export function useRemoveCartItem() {
  return useCartMutation((input: { nftId: string; editionId: string }) => removeCartItem(input));
}

export function useReconcileCart() {
  return useCartMutation(() => reconcileCart());
}

export function useApplyCoupon() {
  return useCartMutation((couponCode: string) => applyCoupon(couponCode));
}

export function useRemoveCoupon() {
  return useCartMutation(() => removeCoupon());
}

/**
 * Cotação da versão atual do carrinho. Só é consultada sem divergências; se a API apontar que o
 * carrinho mudou (`CART_OUT_OF_DATE`), o carrinho é recarregado para exibir as alterações.
 * Antes de expirar, a cotação é renovada.
 */
export function useQuote(cart: CartResponse | undefined) {
  const queryClient = useQueryClient();
  const userId = cart?.userId;
  return useQuery({
    queryKey: cartKeys.quote(userId, cart?.version ?? -1),
    queryFn: async ({ signal }) => {
      try {
        return await getQuote(signal);
      } catch (error) {
        if (error instanceof ApiError && error.code === 'CART_OUT_OF_DATE') void invalidateCart(queryClient);
        throw error;
      }
    },
    enabled: Boolean(cart && cart.items.length > 0 && cart.issues.length === 0),
    staleTime: 0,
    gcTime: 60_000,
    refetchInterval: (query) => {
      const expiresAt = query.state.data ? Date.parse(query.state.data.expiresAt) : Number.NaN;
      return Number.isFinite(expiresAt) ? Math.max(5_000, expiresAt - Date.now() - 5_000) : false;
    },
  });
}
