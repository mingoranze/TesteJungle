export const foundationKeys = {
  all: ['foundation'] as const,
  state: ['foundation', 'state'] as const,
};

export const nftKeys = {
  all: ['nfts'] as const,
  lists: () => [...nftKeys.all, 'list'] as const,
  list: (params: Readonly<Record<string, string | number | undefined>>) =>
    [...nftKeys.lists(), params] as const,
  facets: () => [...nftKeys.all, 'facets'] as const,
  details: () => [...nftKeys.all, 'detail'] as const,
  detail: (nftId: string) => [...nftKeys.details(), nftId] as const,
};

export function privateQueryKey(
  userId: string,
  domain: string,
  ...parts: readonly unknown[]
) {
  return ['private', userId, domain, ...parts] as const;
}
