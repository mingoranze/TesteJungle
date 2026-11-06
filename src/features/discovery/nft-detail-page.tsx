import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Heart, Linkedin, Mail, Minus, Plus, ShoppingCart, Star, Twitter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusMessage } from '@/components/ui/status-message';
import { nftEditions, type Nft, type PaginatedResponse } from '@/domain/contracts';
import { listNfts, nftDetailQueryOptions } from '@/features/discovery/api';
import { useAddToCart } from '@/features/cart/use-cart';
import { ApiError } from '@/lib/api-error';
import { compareDecimal, formatEth } from '@/lib/decimal';
import { nftKeys } from '@/lib/query-keys';
import { useFavorites, useToggleFavorite } from '@/features/favorites/use-favorites';

function DetailSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-[1200px] gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10 lg:px-0">
      <Skeleton className="aspect-square w-full rounded-2xl" data-testid="detail-skeleton" />
      <div className="space-y-5">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}

/** Descreve mudanças de preço/disponibilidade recebidas enquanto o detalhe está aberto. */
function useNftChangeNotice(nft: Nft | undefined) {
  const previous = useRef<Nft | undefined>(undefined);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    const before = previous.current;
    previous.current = nft;
    if (!nft || !before || before.id !== nft.id) {
      setMessage(undefined);
      return;
    }
    if (nft.version <= before.version) return;
    if (nft.availableEditions < 1 && before.availableEditions > 0) {
      setMessage('Este NFT acabou de esgotar.');
    } else if (compareDecimal(before.priceEth, nft.priceEth) !== 0) {
      setMessage(`O preço foi atualizado de ${formatEth(before.priceEth)} para ${formatEth(nft.priceEth)} ETH.`);
    } else if (before.availableEditions !== nft.availableEditions) {
      setMessage(`Disponibilidade atualizada: ${nft.availableEditions} edições.`);
    }
  }, [nft]);

  return message;
}

function NftCard({ nft }: { nft: Nft }) {
  return (
    <article className="min-w-0">
      <Link
        to="/nfts/$nftId"
        params={{ nftId: nft.id }}
        className="block"
      >
        {nft.imageUrl ? (
          <img src={nft.imageUrl} alt={`Ver detalhes de ${nft.title}`} className="aspect-square w-full rounded-lg object-cover" />
        ) : (
          <div className="grid aspect-square place-items-center rounded-lg bg-surface p-3 text-center text-sm text-secondary">
            Imagem não disponível
          </div>
        )}
      </Link>
      <h3 className="mt-2 font-mono text-sm">{nft.title}</h3>
      <p className="font-mono font-semibold text-primary">{nft.priceEth} ETH</p>
    </article>
  );
}

export function NftDetailPage({ nftId }: { nftId: string }) {
  const [quantity, setQuantity] = useState(1);
  const [editionIndex, setEditionIndex] = useState<number>();
  const navigate = useNavigate();
  const favoritesQuery = useFavorites();
  const favorite = Boolean(favoritesQuery.data?.some((item) => item.nftId === nftId));
  const [notice, setNotice] = useState<{ message: string; error: boolean }>();
  const [tab, setTab] = useState<'details' | 'reviews'>('details');
  const nftQuery = useQuery(nftDetailQueryOptions(nftId));
  const nft = nftQuery.data;
  const changeNotice = useNftChangeNotice(nft);
  const editions = nft ? nftEditions(nft) : [];
  const defaultEditionIndex = Math.max(0, editions.findIndex(({ label }) => label === '1/50'));
  const activeEdition = editions[editionIndex ?? defaultEditionIndex];
  const quantityLimit = nft
    ? Math.min(nft.availableEditions, activeEdition?.maxQuantity ?? nft.availableEditions)
    : 1;
  const relatedQuery = useQuery({
    queryKey: nftKeys.list({ collectionId: nft?.collectionId, page: 1, pageSize: 50 }),
    queryFn: ({ signal }) => listNfts({
      collectionId: nft?.collectionId,
      page: 1,
      pageSize: 50,
    }, signal),
    enabled: Boolean(nft?.collectionId),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    setQuantity(1);
    setEditionIndex(undefined);
    setNotice(undefined);
    setTab('details');
  }, [nftId]);

  useEffect(() => {
    if (quantity > quantityLimit) setQuantity(Math.max(1, quantityLimit));
  }, [quantity, quantityLimit]);

  const favoriteMutation = useToggleFavorite((error) => {
    setNotice({
      message: `${error instanceof ApiError ? error.message : 'Falha de comunicação.'} O favorito foi restaurado; tente novamente.`,
      error: true,
    });
  });
  const toggleFavorite = () => {
    if (!favoritesQuery.userId) {
      void navigate({ to: '/login', search: { redirect: `/nfts/${nftId}` } });
      return;
    }
    const nextFavorite = !favorite;
    setNotice(undefined);
    favoriteMutation.mutate(
      { userId: favoritesQuery.userId, nftId, favorite: nextFavorite },
      {
        onSuccess: () => setNotice({
          message: nextFavorite ? 'NFT adicionado aos favoritos.' : 'NFT removido dos favoritos.',
          error: false,
        }),
      },
    );
  };

  const addToCartMutation = useAddToCart();
  const addToCart = (goToCart: boolean) => {
    if (!activeEdition) return;
    setNotice(undefined);
    addToCartMutation.mutate({ nftId, quantity, editionId: activeEdition.id }, {
      onSuccess: () => {
        if (goToCart) void navigate({ to: '/carrinho' });
        else setNotice({ message: 'NFT adicionado ao carrinho.', error: false });
      },
      onError: (error: unknown) => {
        const details = error instanceof ApiError && error.code === 'AVAILABILITY_CONFLICT'
          && typeof error.details === 'object' && error.details !== null
          ? error.details as { availableQuantity?: unknown }
          : undefined;
        const available = typeof details?.availableQuantity === 'number' ? details.availableQuantity : undefined;
        const hint = available === undefined
          ? ''
          : ` Limite desta edição considerando o carrinho: ${available} unidade(s).`;
        setNotice({
          message: error instanceof ApiError
            ? error.message + hint
            : 'Não foi possível adicionar este NFT ao carrinho. Tente novamente.',
          error: true,
        });
      },
    });
  };

  if (nftQuery.isPending) return <DetailSkeleton />;

  if (nftQuery.isError) {
    const notFound = nftQuery.error instanceof ApiError && nftQuery.error.status === 404;
    return (
      <section className="mx-auto w-full max-w-[1200px] px-6 py-12 lg:px-0" aria-live="polite">
        <StatusMessage variant={notFound ? 'neutral' : 'error'} role={notFound ? 'status' : 'alert'}>
          <strong>{notFound ? 'NFT não encontrado.' : 'Não foi possível carregar este NFT.'}</strong>{' '}
          {nftQuery.error instanceof ApiError
            ? nftQuery.error.message
            : 'Verifique sua conexão e tente novamente.'}{' '}
          {notFound ? (
            <Button asChild variant="secondary"><Link to="/">Voltar ao catálogo</Link></Button>
          ) : (
            <Button type="button" onClick={() => void nftQuery.refetch()}>Tentar novamente</Button>
          )}
        </StatusMessage>
      </section>
    );
  }

  if (!nft) return null;

  const related = (relatedQuery.data as PaginatedResponse<Nft> | undefined)?.items
    .filter((item) => item.id !== nft.id)
    .slice(0, 5) ?? [];
  const soldOut = nft.availableEditions < 1;
  const galleryImages = nft.imageUrl ? Array.from({ length: 4 }, () => nft.imageUrl as string) : [];

  return (
    <div className="relative mx-auto w-full font-mono max-lg:h-[100svh] max-lg:w-[calc(100%-16px)] max-lg:max-w-[448px] max-lg:overflow-hidden max-lg:rounded-[2rem] max-lg:bg-[#21140f]">
      <div className="mx-auto max-w-[1200px] px-4 pt-4 sm:px-6 lg:px-0 lg:pt-8 max-lg:relative max-lg:h-full max-lg:px-0 max-lg:pt-0">
        <div className="mb-5 flex items-center justify-between lg:hidden max-lg:absolute max-lg:left-7 max-lg:right-7 max-lg:top-[22px] max-lg:z-20 max-lg:mb-0">
          <Button asChild variant="secondary" size="sm" aria-label="Voltar ao catálogo" className="size-9 min-h-9 rounded-full border-border bg-transparent p-0 text-primary">
            <Link to="/"><ArrowLeft aria-hidden="true" size={18} /></Link>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label={favorite ? 'Favoritado — remover dos favoritos' : 'Favoritar NFT'}
            aria-pressed={favorite}
            disabled={favoriteMutation.isPending}
            onClick={toggleFavorite}
            className="size-9 min-h-9 rounded-full border-border bg-transparent p-0 text-primary"
          >
            <Heart aria-hidden="true" size={18} fill={favorite ? 'currentColor' : 'none'} />
          </Button>
        </div>

        <nav aria-label="Trilha de navegação" className="mb-5 hidden text-sm lg:block">
          <Link to="/" className="hover:text-primary">Início</Link>
          <span className="px-2 text-secondary">/</span>
          <a href="/#catalogo" className="hover:text-primary">Mercado</a>
        </nav>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-8 max-lg:absolute max-lg:inset-0 max-lg:block">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[88px_minmax(0,1fr)] max-lg:block">
            {galleryImages.length > 1 && (
              <div className="order-2 hidden grid-cols-4 gap-2 lg:order-1 lg:grid lg:grid-cols-1">
                {galleryImages.map((image, index) => (
                  <button
                    key={`${nft.id}-gallery-${index}`}
                    type="button"
                    aria-label={`Visualização ${index + 1} de ${nft.title}`}
                    className="overflow-hidden rounded-lg border border-transparent bg-transparent p-0 hover:border-primary"
                  >
                    <img src={image} alt="" className="aspect-square w-full rounded-md object-cover" />
                  </button>
                ))}
              </div>
            )}
            <div className="relative order-1 overflow-hidden rounded-2xl bg-surface p-3 sm:order-2 sm:p-4 max-lg:absolute max-lg:left-7 max-lg:right-7 max-lg:top-[63px] max-lg:aspect-square max-lg:rounded-[1.5rem] max-lg:bg-transparent max-lg:p-0">
              {nft.imageUrl ? (
                <img
                  src={nft.imageUrl}
                  alt={`Arte do NFT ${nft.title}`}
                  className="aspect-square w-full rounded-[1.2rem] object-cover max-lg:mx-auto"
                />
              ) : (
                <div className="grid aspect-square place-items-center rounded-[1.2rem] bg-raised text-secondary">
                  Imagem não disponível
                </div>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="absolute right-6 top-6 hidden lg:inline-flex"
                aria-label={favorite ? 'Favoritado — remover dos favoritos' : 'Favoritar NFT'}
                aria-pressed={favorite}
                disabled={favoriteMutation.isPending}
                onClick={toggleFavorite}
              >
                <Heart aria-hidden="true" size={18} fill={favorite ? 'currentColor' : 'none'} />
                <span className="hidden sm:inline">{favorite ? 'Favoritado' : 'Favoritar'}</span>
              </Button>
            </div>
          </div>

          <section
            aria-labelledby="nft-title"
            className="-mt-8 rounded-t-[2rem] bg-surface px-6 pb-6 pt-6 lg:mt-0 lg:rounded-none lg:bg-transparent lg:px-0 lg:pt-1 max-lg:absolute max-lg:inset-x-px max-lg:bottom-0 max-lg:z-10 max-lg:mt-0 max-lg:overflow-y-auto max-lg:rounded-t-[2rem] max-lg:bg-surface max-lg:px-6 max-lg:pb-[116px] max-lg:pt-3 nft-detail-mobile-panel"
          >
            <h1 id="nft-title" className="text-2xl font-bold sm:text-3xl max-lg:pr-[116px] max-lg:text-xl">{nft.title}</h1>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 max-lg:absolute max-lg:right-6 max-lg:top-4 max-lg:m-0 max-lg:rounded-full max-lg:border max-lg:border-primary max-lg:px-2 max-lg:py-1 max-lg:pb-1">
              <p className="text-xl font-bold text-primary max-lg:hidden">{nft.priceEth} ETH</p>
              {nft.rating !== undefined && (
                <p className="flex items-center gap-1 text-sm max-lg:text-xs" aria-label={`Avaliação ${nft.rating} de 5, ${nft.reviewCount ?? 0} avaliações`}>
                  <span data-testid="rating-stars" className="hidden items-center gap-0.5 lg:inline-flex" aria-hidden="true">
                    {Array.from({ length: 5 }, (_, index) => (
                      <Star
                        key={index}
                        size={14}
                        fill="currentColor"
                        className={index < Math.round(nft.rating ?? 0) ? 'text-primary' : 'text-secondary'}
                      />
                    ))}
                  </span>
                  <Star aria-hidden="true" size={14} fill="currentColor" className="text-primary lg:hidden" />
                  <span className="lg:hidden">{nft.rating.toFixed(1)}</span>
                  <span className="max-lg:hidden">{nft.reviewCount ?? 0} avaliações de colecionadores</span>
                  <span className="lg:hidden text-secondary">({nft.reviewCount ?? 0})</span>
                </p>
              )}
            </div>

            <h2 className="mt-4 font-semibold max-lg:hidden">Sobre este NFT:</h2>
            <p className="mt-2 text-sm leading-6 text-secondary max-lg:mt-1 max-lg:text-[13px] max-lg:leading-[1.4]">
              {nft.description ?? 'Descrição não disponível para esta obra.'}
            </p>

            {nft.editionOptions && nft.editionOptions.length > 0 && (
              <fieldset className="mt-4 max-lg:mt-2">
                <legend className="font-semibold">Edição:</legend>
                <div className="mt-2 flex flex-wrap gap-2 max-lg:mt-1">
                  {nft.editionOptions.map((option, index) => (
                    <button
                      key={`${option}-${index}`}
                      type="button"
                      aria-pressed={activeEdition?.id === editions[index]?.id}
                      onClick={() => {
                        setEditionIndex(index);
                        setQuantity(1);
                      }}
                      className={`min-h-9 rounded-full border px-3 text-sm max-lg:min-h-7 max-lg:px-2 max-lg:text-[10px] ${
                        activeEdition?.id === editions[index]?.id
                          ? 'border-primary text-primary'
                          : 'border-border text-secondary hover:border-primary'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 max-lg:hidden">
              <div className="inline-flex items-center gap-2" aria-label="Quantidade">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  aria-label="Diminuir quantidade"
                  className="h-10 min-h-10 w-6 rounded-full px-0 py-0 text-canvas"
                  disabled={quantity <= 1 || soldOut}
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                >
                  <Minus aria-hidden="true" size={16} className="text-canvas" />
                </Button>
                <span aria-label="Quantidade selecionada" aria-live="polite" className="min-w-6 text-center">{quantity}</span>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  aria-label="Aumentar quantidade"
                  className="h-10 min-h-10 w-6 rounded-full px-0 py-0 text-canvas"
                  disabled={soldOut || quantity >= quantityLimit}
                  onClick={() => setQuantity((value) => Math.min(quantityLimit, value + 1))}
                >
                  <Plus aria-hidden="true" size={16} className="text-canvas" />
                </Button>
                <span className="ml-1 text-xs text-secondary">
                  {soldOut ? 'Indisponível' : `${nft.availableEditions} disponíveis`}
                </span>
              </div>
              <div className="hidden gap-2 lg:flex">
                <Button
                  type="button"
                  disabled={soldOut || addToCartMutation.isPending}
                  onClick={() => addToCart(true)}
                >
                  Comprar
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={favoriteMutation.isPending}
                  onClick={toggleFavorite}
                >
                  <Heart aria-hidden="true" size={17} fill={favorite ? 'currentColor' : 'none'} />
                  {favorite ? 'Favoritado' : 'Favoritar'}
                </Button>
              </div>
            </div>

            <dl className="mt-4 space-y-2 text-sm text-secondary max-lg:mt-1 max-lg:space-y-1 max-lg:text-xs max-lg:leading-5">
              {nft.tokenId && <div><dt className="inline">ID do token: </dt><dd className="inline">{nft.tokenId}</dd></div>}
              <div><dt className="inline">Coleção: </dt><dd className="inline">{nft.collectionName ?? nft.collectionId}</dd></div>
              <div className="max-lg:hidden"><dt className="inline">Edições disponíveis: </dt><dd className="inline">{nft.availableEditions}</dd></div>
              {nft.attributes && nft.attributes.length > 0 && (
                <div>
                  <dt className="inline">Atributos: </dt>
                  <dd className="inline">{nft.attributes.map(({ value }) => value).join(', ')}</dd>
                </div>
              )}
            </dl>

            <div className="mt-2 flex items-center gap-1.5 text-sm max-lg:hidden">
              <strong className="text-foreground">Compartilhar este NFT:</strong>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Compartilhar no LinkedIn"
                className="text-foreground hover:text-primary"
              >
                <Linkedin aria-hidden="true" size={14} />
              </a>
              <a
                href={`mailto:?subject=${encodeURIComponent(nft.title)}&body=${encodeURIComponent(window.location.href)}`}
                aria-label="Compartilhar por e-mail"
                className="text-foreground hover:text-primary"
              >
                <Mail aria-hidden="true" size={14} />
              </a>
              <a
                href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(nft.title)}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Compartilhar no Twitter"
                className="text-foreground hover:text-primary"
              >
                <Twitter aria-hidden="true" size={14} fill="currentColor" />
              </a>
            </div>

            {changeNotice && (
              <StatusMessage className="mt-4" role="status">{changeNotice}</StatusMessage>
            )}
            {notice && (
              <StatusMessage variant={notice.error ? 'error' : 'neutral'} role={notice.error ? 'alert' : 'status'} className="mt-4">
                {notice.message}
              </StatusMessage>
            )}
            {nftQuery.isFetching && (
              <p className="mt-3 text-xs text-secondary" role="status">Atualizando informações…</p>
            )}
          </section>
        </div>

        <section className="mt-10 border-b border-border max-lg:hidden" aria-label="Informações do NFT">
          <div className="flex gap-6">
            <button
              type="button"
              aria-current={tab === 'details' ? 'page' : undefined}
              onClick={() => setTab('details')}
              className={`border-b-2 pb-3 font-semibold ${tab === 'details' ? 'border-primary text-primary' : 'border-transparent'}`}
            >
              Detalhes do NFT
            </button>
            <button
              type="button"
              aria-current={tab === 'reviews' ? 'page' : undefined}
              onClick={() => setTab('reviews')}
              className={`border-b-2 pb-3 ${tab === 'reviews' ? 'border-primary text-primary' : 'border-transparent'}`}
            >
              Avaliações de colecionadores{nft.reviewCount !== undefined ? ` (${nft.reviewCount})` : ''}
            </button>
          </div>
        </section>
        <section className="min-h-40 py-5 text-sm leading-7 text-secondary max-lg:hidden" aria-live="polite">
          {tab === 'details' ? (
            <div className="space-y-3">
              {nft.detailSections?.length ? nft.detailSections.map(({ heading, body }, index) => (
                <p key={`${heading ?? 'paragraph'}-${index}`}>
                  {heading && <strong className="text-foreground">{heading}<br /></strong>}
                  {body}
                </p>
              )) : (
                <>
                  <p>{nft.description ?? 'Informações adicionais não disponíveis para esta obra.'}</p>
                  {nft.attributes?.map(({ traitType, value }) => (
                    <p key={traitType}><strong className="text-foreground">{traitType}:</strong> {value}</p>
                  ))}
                </>
              )}
            </div>
          ) : (
            <p>
              {nft.reviewCount
                ? `${nft.reviewCount} avaliações de colecionadores.`
                : 'Não há avaliações disponíveis para esta obra.'}
            </p>
          )}
        </section>

        <section className="mt-8 pb-20 lg:pb-16 max-lg:hidden" aria-labelledby="related-title">
          <h2 id="related-title" className="border-b border-border pb-3 text-lg font-bold text-primary">Mais desta coleção</h2>
          {relatedQuery.isPending ? (
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="aspect-square rounded-lg" />)}
            </div>
          ) : relatedQuery.isError ? (
            <StatusMessage variant="error" role="alert" className="mt-4">
              Não foi possível carregar outros NFTs desta coleção.{' '}
              <Button type="button" variant="secondary" onClick={() => void relatedQuery.refetch()}>Tentar novamente</Button>
            </StatusMessage>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
              {related.map((item) => <NftCard key={item.id} nft={item} />)}
            </div>
          )}
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 rounded-t-[2rem] bg-surface px-6 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4 shadow-[0_-8px_24px_rgb(0_0_0/0.18)] lg:hidden max-lg:absolute max-lg:inset-x-px max-lg:bottom-0 max-lg:z-20 max-lg:h-[116px] max-lg:rounded-t-[2rem] max-lg:bg-[#21140f] max-lg:px-6 max-lg:pb-[18px] max-lg:pt-3 max-lg:shadow-none">
        <div className="mx-auto flex max-w-[600px] items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-secondary">Qtd.</span>
            <Button
              type="button"
              variant="default"
              size="sm"
              aria-label="Diminuir quantidade"
              className="size-6 min-h-6 rounded-full px-0 py-0"
              disabled={quantity <= 1 || soldOut}
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
            >
              <Minus aria-hidden="true" size={12} />
            </Button>
            <span aria-label="Quantidade selecionada" aria-live="polite" className="min-w-4 text-center">{quantity}</span>
            <Button
              type="button"
              variant="default"
              size="sm"
              aria-label="Aumentar quantidade"
              className="size-6 min-h-6 rounded-full px-0 py-0"
              disabled={soldOut || quantity >= quantityLimit}
              onClick={() => setQuantity((value) => Math.min(quantityLimit, value + 1))}
            >
              <Plus aria-hidden="true" size={12} />
            </Button>
          </div>
          <strong className="font-mono text-base text-primary">{nft.priceEth} ETH</strong>
        </div>
        <div className="mx-auto mt-2.5 flex max-w-[600px] gap-2.5">
          <Button
            type="button"
            className="min-h-12 flex-1 rounded-full text-sm max-lg:min-h-[52px] max-lg:bg-[#d28a4c] max-lg:text-black"
            disabled={soldOut || addToCartMutation.isPending}
            onClick={() => addToCart(true)}
          >
            Comprar NFT
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="min-h-12 rounded-full max-lg:size-[52px] max-lg:min-h-[52px] max-lg:border-border max-lg:bg-transparent max-lg:text-primary"
            aria-label="Adicionar ao carrinho"
            disabled={soldOut || addToCartMutation.isPending}
            onClick={() => addToCart(false)}
          >
            <ShoppingCart aria-hidden="true" size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
