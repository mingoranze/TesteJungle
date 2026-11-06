import { useQueries } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Heart } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusMessage } from '@/components/ui/status-message';
import { getNft } from '@/features/discovery/api';
import { useFavorites, useToggleFavorite } from '@/features/favorites/use-favorites';
import { ApiError } from '@/lib/api-error';
import { nftKeys } from '@/lib/query-keys';

export function FavoritesPage() {
  const favoritesQuery = useFavorites();
  const [error, setError] = useState<string>();
  const toggleFavorite = useToggleFavorite((mutationError) => {
    setError(mutationError instanceof ApiError
      ? mutationError.message
      : 'Não foi possível atualizar a lista de interesse. Tente novamente.');
  });
  const favorites = [...(favoritesQuery.data ?? [])].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const nftQueries = useQueries({
    queries: favorites.map((favorite) => ({
      queryKey: nftKeys.detail(favorite.nftId),
      queryFn: ({ signal }: { signal: AbortSignal }) => getNft(favorite.nftId, signal),
    })),
  });

  return (
    <section aria-labelledby="favorites-title" className="font-mono">
      <h2 id="favorites-title" className="text-base font-bold tracking-[0.02em]">Lista de interesse</h2>
      {error && <StatusMessage role="alert" variant="error" className="mt-4">{error}</StatusMessage>}

      {favoritesQuery.isPending ? (
        <div className="mt-6 grid grid-cols-2 gap-5 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="aspect-square w-full" />)}
        </div>
      ) : favoritesQuery.isError ? (
        <StatusMessage role="alert" variant="error" className="mt-4">
          Não foi possível carregar sua lista de interesse.{' '}
          <Button type="button" variant="secondary" size="sm" onClick={() => void favoritesQuery.refetch()}>Tentar novamente</Button>
        </StatusMessage>
      ) : favorites.length === 0 ? (
        <p className="mt-4 text-[13px] text-secondary">
          Você ainda não adicionou NFTs à lista de interesse.{' '}
          <Link to="/" className="text-primary hover:text-accent">Explorar catálogo</Link>
        </p>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-5 md:grid-cols-3">
          {favorites.map((favorite, index) => {
            const nft = nftQueries[index]?.data;
            return (
              <li key={favorite.nftId} className="min-w-0 bg-surface p-3">
                {nft ? (
                  <>
                    <Link to="/nfts/$nftId" params={{ nftId: nft.id }} className="block">
                      {nft.imageUrl
                        ? <img src={nft.imageUrl} alt={`Ver detalhes de ${nft.title}`} className="aspect-square w-full rounded-lg object-cover" />
                        : <span className="grid aspect-square place-items-center rounded-lg bg-raised text-center text-xs text-secondary">Imagem não disponível</span>}
                    </Link>
                    <div className="mt-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm">{nft.title}</h3>
                        <p className="font-semibold text-primary">{nft.priceEth} ETH</p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remover ${nft.title} da lista de interesse`}
                        disabled={!favoritesQuery.userId}
                        onClick={() => {
                          if (!favoritesQuery.userId) return;
                          setError(undefined);
                          toggleFavorite.mutate({ userId: favoritesQuery.userId, nftId: nft.id, favorite: false });
                        }}
                        className="grid size-9 shrink-0 place-items-center rounded text-primary hover:text-accent"
                      >
                        <Heart aria-hidden="true" size={18} fill="currentColor" />
                      </button>
                    </div>
                  </>
                ) : nftQueries[index]?.isError ? (
                  <p className="text-xs text-secondary">NFT indisponível.</p>
                ) : (
                  <Skeleton className="aspect-square w-full" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
