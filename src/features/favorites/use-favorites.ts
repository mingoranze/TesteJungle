import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Favorite } from '@/domain/contracts';
import { apiClient } from '@/lib/api-client';
import { privateQueryKey } from '@/lib/query-keys';
import { cachedUserId, useAuthenticatedSession } from '@/features/session/session';

export const favoriteKeys = {
  list: (userId: string) => privateQueryKey(userId, 'favorites'),
};

async function listFavorites(signal?: AbortSignal) {
  const { data } = await apiClient.get<Favorite[]>('/favorites', { signal });
  return data;
}

export function useFavorites() {
  const session = useAuthenticatedSession();
  const userId = session?.userId;
  const query = useQuery({
    queryKey: favoriteKeys.list(userId ?? 'anonymous'),
    queryFn: ({ signal }) => listFavorites(signal),
    enabled: Boolean(userId),
  });
  return { ...query, userId };
}

interface ToggleFavoriteVariables {
  userId: string;
  nftId: string;
  favorite: boolean;
}

/**
 * Alterna favorito com atualização otimista. A chave inclui o usuário capturado no momento da
 * ação, para que respostas tardias não alterem o cache de outra sessão; falhas restauram o snapshot.
 */
export function useToggleFavorite(onError?: (error: unknown) => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ nftId, favorite }: ToggleFavoriteVariables) => {
      if (favorite) {
        await apiClient.put(`/favorites/${encodeURIComponent(nftId)}`);
      } else {
        await apiClient.delete(`/favorites/${encodeURIComponent(nftId)}`);
      }
    },
    onMutate: async ({ userId, nftId, favorite }) => {
      const key = favoriteKeys.list(userId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Favorite[]>(key);
      queryClient.setQueryData<Favorite[]>(key, (current = []) => (favorite
        ? current.some((item) => item.nftId === nftId)
          ? current
          : [...current, { userId, nftId, createdAt: new Date().toISOString() }]
        : current.filter((item) => item.nftId !== nftId)));
      return { key, previous };
    },
    onError: (error, { userId }, context) => {
      // Após logout/troca de usuário o cache privado já foi descartado; não recriá-lo.
      if (context && cachedUserId() === userId) queryClient.setQueryData(context.key, context.previous);
      onError?.(error);
    },
    onSettled: (_data, _error, { userId }) => (
      cachedUserId() === userId
        ? queryClient.invalidateQueries({ queryKey: favoriteKeys.list(userId) })
        : undefined
    ),
  });
}
