import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
} from '@tanstack/react-router';
import { SiteShell } from '@/components/layout/site-shell';
import { FoundationPage } from '@/features/foundation/foundation-page';
import { NotFoundPage } from '@/features/foundation/not-found-page';
import { validateCatalogSearch } from '@/features/discovery/types';
import { HomeRouteView } from '@/features/discovery/home-route-component';
import { validateAuthSearch } from '@/features/session/redirect';
import { sessionQueryOptions } from '@/features/session/session';
import { queryClient } from '@/lib/query-client';

const rootRoute = createRootRoute({
  component: SiteShell,
  notFoundComponent: NotFoundPage,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: validateCatalogSearch,
  component: HomeRouteView,
});

const nftDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/nfts/$nftId',
  component: lazyRouteComponent(
    () => import('@/features/discovery/nft-detail-route-component'),
    'NftDetailRouteView',
  ),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: validateAuthSearch,
  component: lazyRouteComponent(() => import('@/features/session/auth-route-component'), 'LoginRouteView'),
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cadastro',
  validateSearch: validateAuthSearch,
  component: lazyRouteComponent(() => import('@/features/session/auth-route-component'), 'RegisterRouteView'),
});

/** Rotas privadas: exigem sessão autenticada e preservam o destino completo para retomada pós-login. */
async function requireAuthenticatedSession({ location }: { location: { href: string } }) {
  const session = await queryClient.ensureQueryData(sessionQueryOptions);
  if (session.status !== 'authenticated') {
    throw redirect({ to: '/login', search: { redirect: location.href }, replace: true });
  }
}

const cartRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/carrinho',
  component: lazyRouteComponent(() => import('@/features/cart/cart-page'), 'CartPage'),
});

const checkoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pagamento',
  beforeLoad: requireAuthenticatedSession,
  component: lazyRouteComponent(() => import('@/features/checkout/checkout-page'), 'CheckoutPage'),
});

const orderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pedidos/$orderId',
  beforeLoad: requireAuthenticatedSession,
  component: lazyRouteComponent(() => import('@/features/checkout/order-page'), 'OrderPage'),
});

const transactionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pedidos/$orderId/transacao',
  beforeLoad: requireAuthenticatedSession,
  component: lazyRouteComponent(() => import('@/features/checkout/transaction-page'), 'TransactionPage'),
});

const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/perfil',
  beforeLoad: requireAuthenticatedSession,
  component: lazyRouteComponent(() => import('@/features/account/account-layout'), 'AccountLayout'),
});

const profileRoute = createRoute({
  getParentRoute: () => accountRoute,
  path: '/',
  component: lazyRouteComponent(() => import('@/features/account/profile-page'), 'ProfilePage'),
});

const walletsRoute = createRoute({
  getParentRoute: () => accountRoute,
  path: 'carteiras',
  component: lazyRouteComponent(() => import('@/features/account/wallets-page'), 'WalletsPage'),
});

const favoritesRoute = createRoute({
  getParentRoute: () => accountRoute,
  path: 'favoritos',
  component: lazyRouteComponent(() => import('@/features/account/favorites-page'), 'FavoritesPage'),
});

const foundationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/foundation',
  validateSearch: (search: Record<string, unknown>) => ({
    scenario: typeof search.scenario === 'string' ? search.scenario : 'baseline',
  }),
  component: FoundationPage,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  nftDetailRoute,
  loginRoute,
  registerRoute,
  cartRoute,
  checkoutRoute,
  orderRoute,
  transactionRoute,
  accountRoute.addChildren([profileRoute, walletsRoute, favoritesRoute]),
  foundationRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
