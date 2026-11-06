import { queryOptions } from '@tanstack/react-query';
import type { Nft, NftFacets, PaginatedResponse } from '@/domain/contracts';
import { apiClient } from '@/lib/api-client';
import { nftKeys } from '@/lib/query-keys';
import type { CatalogSearch } from '@/features/discovery/types';

export interface CatalogParams extends CatalogSearch {
  pageSize?: number;
}

export async function listNfts(params: CatalogParams, signal?: AbortSignal) {
  const { data } = await apiClient.get<PaginatedResponse<Nft>>('/nfts', {
    params,
    signal,
  });
  return data;
}

export async function getNftFacets(signal?: AbortSignal) {
  const { data } = await apiClient.get<NftFacets>('/nfts/facets', { signal });
  return data;
}

export async function getNft(nftId: string, signal?: AbortSignal) {
  const { data } = await apiClient.get<Nft>(`/nfts/${encodeURIComponent(nftId)}`, {
    signal,
  });
  return data;
}

/** Consulta do detalhe compartilhada por detalhe, favoritos e carrinho (mesma chave de cache). */
export function nftDetailQueryOptions(nftId: string) {
  return queryOptions({
    queryKey: nftKeys.detail(nftId),
    queryFn: ({ signal }) => getNft(nftId, signal),
  });
}
