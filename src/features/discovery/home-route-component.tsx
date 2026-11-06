import { useNavigate, useRouterState } from '@tanstack/react-router';
import { HomePage } from '@/features/discovery/home-page';
import type { CatalogSearch } from '@/features/discovery/types';
import { validateCatalogSearch } from '@/features/discovery/types';

export function HomeRouteView() {
  const rawSearch = useRouterState({ select: (state) => state.location.search });
  const search = validateCatalogSearch(rawSearch);
  const navigate = useNavigate({ from: '/' });

  return (
    <HomePage
      search={search}
      onSearchChange={(patch: Partial<CatalogSearch>) => {
        void navigate({
          search: (previous) => validateCatalogSearch({ ...previous, ...patch }),
          resetScroll: false,
        });
      }}
    />
  );
}
