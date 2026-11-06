import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-error';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) =>
        failureCount < 1 && (!(error instanceof ApiError) || error.status === null || error.status >= 500),
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

export async function clearPrivateQueryCache() {
  await queryClient.cancelQueries({ queryKey: ['private'] });
  queryClient.removeQueries({ queryKey: ['private'] });
}
