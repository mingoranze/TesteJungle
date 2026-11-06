import { isNftCategoryId, isNftNetworkId, type NftCategoryId, type NftNetworkId } from '@/domain/contracts';

export type NftSort = 'relevance' | 'price-asc' | 'price-desc' | 'title-asc' | 'title-desc';

export interface CatalogSearch {
  q?: string;
  collectionId?: string;
  category?: NftCategoryId;
  network?: NftNetworkId;
  minPriceEth?: string;
  maxPriceEth?: string;
  sort?: NftSort;
  page?: number;
}

export const defaultCatalogSearch: CatalogSearch = {
  sort: 'relevance',
  page: 1,
};

export function validateCatalogSearch(search: Record<string, unknown>): CatalogSearch {
  const sort = search.sort;
  const minPriceEth = search.minPriceEth;
  const maxPriceEth = search.maxPriceEth;
  const page = Number(search.page ?? 1);
  const decimalPattern = /^(0|[1-9]\d*)(\.\d+)?$/;

  return {
    ...(typeof search.q === 'string' && search.q.trim() ? { q: search.q.trim() } : {}),
    ...(typeof search.collectionId === 'string' && search.collectionId
      ? { collectionId: search.collectionId }
      : {}),
    ...(isNftCategoryId(search.category) ? { category: search.category } : {}),
    ...(isNftNetworkId(search.network) ? { network: search.network } : {}),
    ...(typeof minPriceEth === 'string' && decimalPattern.test(minPriceEth)
      ? { minPriceEth }
      : {}),
    ...(typeof maxPriceEth === 'string' && decimalPattern.test(maxPriceEth)
      ? { maxPriceEth }
      : {}),
    ...(sort === 'relevance' || sort === 'price-asc' || sort === 'price-desc'
      || sort === 'title-asc' || sort === 'title-desc'
      ? { sort }
      : {}),
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}
