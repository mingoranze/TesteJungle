import { queryOptions, useQuery } from '@tanstack/react-query';
import type { AnyRouter } from '@tanstack/react-router';
import type { AuthResponse, Session } from '@/domain/contracts';
import { onUnauthorizedResponse } from '@/lib/api-client';
import { clearPrivateQueryCache, queryClient } from '@/lib/query-client';
import { getSession } from '@/features/session/api';
import { disposeSessionSubscriptions } from '@/features/session/session-subscriptions';

export const sessionKeys = {
  current: ['session'] as const,
};

export const sessionQueryOptions = queryOptions({
  queryKey: sessionKeys.current,
  queryFn: ({ signal }) => getSession(signal),
  staleTime: 60_000,
});

export type AuthenticatedSession = Extract<Session, { status: 'authenticated' }>;

export function useSession() {
  return useQuery(sessionQueryOptions);
}

export function useAuthenticatedSession(): AuthenticatedSession | undefined {
  const { data } = useSession();
  return data?.status === 'authenticated' ? data : undefined;
}

function cachedSession() {
  return queryClient.getQueryData<Session>(sessionKeys.current);
}

export function cachedUserId() {
  const session = cachedSession();
  return session?.status === 'authenticated' ? session.userId : undefined;
}

/**
 * Aplica a sessão retornada por login/cadastro. Se o usuário mudou, descarta cache privado
 * e subscriptions da sessão anterior antes de expor os dados do novo usuário.
 */
export async function applyAuthenticatedSession({ session }: AuthResponse) {
  const previousUserId = cachedUserId();
  if (previousUserId !== session.userId) {
    disposeSessionSubscriptions();
    await clearPrivateQueryCache();
  }
  queryClient.setQueryData<Session>(sessionKeys.current, session);
  await queryClient.invalidateQueries({ queryKey: ['cart'] });
}

/** Encerra a sessão local: subscriptions, cache privado e estado de sessão. */
export async function endLocalSession() {
  disposeSessionSubscriptions();
  await clearPrivateQueryCache();
  queryClient.setQueryData<Session>(sessionKeys.current, { status: 'anonymous' });
  await queryClient.invalidateQueries({ queryKey: ['cart'] });
}

/**
 * Trata 401 de endpoints privados durante a navegação: se havia sessão autenticada no cliente
 * (ou o servidor informou expiração), encerra a sessão local e leva ao login preservando o destino.
 */
export function installSessionExpiryHandler(router: AnyRouter) {
  let handling = false;

  return onUnauthorizedResponse((error) => {
    const wasAuthenticated = cachedSession()?.status === 'authenticated';
    if (handling || (!wasAuthenticated && error.code !== 'SESSION_EXPIRED')) return;
    handling = true;

    void (async () => {
      try {
        await endLocalSession();
        const location = router.state.location;
        if (location.pathname === '/login' || location.pathname === '/cadastro') return;
        await router.navigate({
          to: '/login',
          search: { redirect: location.href, reason: 'expired' },
          replace: true,
        });
      } finally {
        handling = false;
      }
    })();
  });
}
