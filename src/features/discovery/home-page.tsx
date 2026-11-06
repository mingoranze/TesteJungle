import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusMessage } from '@/components/ui/status-message';
import {
  nftCategories,
  nftNetworks,
  type Nft,
  type NftCategoryId,
  type NftFacets,
  type NftNetworkId,
} from '@/domain/contracts';
import { getNftFacets, listNfts } from '@/features/discovery/api';
import type { CatalogSearch } from '@/features/discovery/types';
import { ApiError } from '@/lib/api-error';
import { nftKeys } from '@/lib/query-keys';
import apeEmerald from '../../assets/images/Frame 136.png';
import apeSage from '../../assets/images/NFT Artwork 04.png';
import apeNeon from '../../assets/images/NFT Artwork 05.png';
import apeGolden from '../../assets/images/NFT Artwork 11.png';
import heroBanner from '../../assets/images/Hero Banner.png';

const articles = [
  {
    image: apeNeon,
    date: '12 de setembro',
    readingTime: '6 min',
    title: 'Como funciona a propriedade de NFTs',
    description: 'Aprenda a colecionar, negociar e verificar ativos digitais.',
  },
  {
    image: apeEmerald,
    date: '13 de setembro',
    readingTime: '2 min',
    title: '10 artistas digitais para acompanhar',
    description: 'Conheça criadores que moldam a cultura digital.',
  },
  {
    image: apeSage,
    date: '15 de setembro',
    readingTime: '3 min',
    title: 'Raridade, atributos e procedência',
    description: 'Entenda raridade, procedência, direitos autorais e utilidade.',
  },
  {
    image: apeGolden,
    date: '15 de setembro',
    readingTime: '2 min',
    title: 'Como proteger sua carteira',
    description: 'Proteja sua carteira, seus ativos e sua identidade.',
  },
];

const priceFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Limites do slider em centésimos de ETH (passo 0,01), arredondados para fora da faixa real. */
function priceBounds(facets: NftFacets | undefined) {
  if (!facets?.minPriceEth || !facets.maxPriceEth) return undefined;
  return {
    min: Math.floor(Number(facets.minPriceEth) * 100),
    max: Math.ceil(Number(facets.maxPriceEth) * 100),
  };
}

function toCents(value: string | undefined, fallback: number) {
  return value === undefined ? fallback : Math.round(Number(value) * 100);
}

function centsToEth(cents: number) {
  return (cents / 100).toFixed(2);
}

function FilterOption({
  label,
  count,
  active,
  emphasizeCount,
  onSelect,
}: {
  label: string;
  count: number | undefined;
  active: boolean;
  emphasizeCount: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={active}
        onClick={onSelect}
        className={`flex min-h-[43px] w-full items-center justify-between px-[13px] text-left text-[15px] tracking-wide transition-colors hover:text-primary ${
          active ? 'text-primary' : 'text-secondary'
        }`}
      >
        <span>{label}</span>
        {count !== undefined && (
          <span className={emphasizeCount ? 'font-bold' : undefined}>({count})</span>
        )}
      </button>
    </li>
  );
}

function CollectionFilters({
  search,
  onChange,
  onClose,
}: {
  search: CatalogSearch;
  onChange: (patch: Partial<CatalogSearch>) => void;
  onClose: () => void;
}) {
  const facetsQuery = useQuery({
    queryKey: nftKeys.facets(),
    queryFn: ({ signal }) => getNftFacets(signal),
  });
  const facets = facetsQuery.data;
  const bounds = priceBounds(facets);
  // Valores em edição (centésimos de ETH); `undefined` = usar o filtro da URL ou o limite do catálogo.
  const [minimum, setMinimum] = useState<number>();
  const [maximum, setMaximum] = useState<number>();

  useEffect(() => {
    setMinimum(undefined);
    setMaximum(undefined);
  }, [search.minPriceEth, search.maxPriceEth]);

  const low = bounds
    ? Math.max(bounds.min, Math.min(minimum ?? toCents(search.minPriceEth, bounds.min), bounds.max))
    : 0;
  const high = bounds
    ? Math.min(bounds.max, Math.max(maximum ?? toCents(search.maxPriceEth, bounds.max), low))
    : 0;
  const categoryCount = (id: NftCategoryId) => facets?.categories.find((item) => item.id === id)?.count;
  const networkCount = (id: NftNetworkId) => facets?.networks.find((item) => item.id === id)?.count;
  const hasFilters = Boolean(
    search.collectionId || search.category || search.network || search.minPriceEth || search.maxPriceEth,
  );

  const select = (patch: Partial<CatalogSearch>) => {
    onChange({ ...patch, page: 1 });
    onClose();
  };

  const applyPriceFilter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!bounds) return;
    select({
      minPriceEth: low > bounds.min ? centsToEth(low) : undefined,
      maxPriceEth: high < bounds.max ? centsToEth(high) : undefined,
    });
  };

  return (
    <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-[341px]">
      <section className="rounded-md bg-surface px-[25px] pb-6 pt-[22px] font-mono" aria-label="Filtros do catálogo">
        <h2 className="text-lg font-bold text-foreground">Coleções</h2>
        <ul className="mt-[9px]">
          {nftCategories.map(({ id, label }) => (
            <FilterOption
              key={id}
              label={label}
              count={categoryCount(id)}
              active={search.category === id}
              emphasizeCount
              onSelect={() => select({ category: search.category === id ? undefined : id })}
            />
          ))}
        </ul>

        <h3 className="mt-[34px] text-lg font-bold text-foreground">Faixa de preço</h3>
        <form className="mt-3" onSubmit={applyPriceFilter}>
          {bounds ? (
            <>
              <div className="price-range relative h-6">
                <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary" />
                <input
                  type="range"
                  min={bounds.min}
                  max={bounds.max}
                  step={1}
                  value={low}
                  onChange={(event) => setMinimum(Math.min(Number(event.target.value), high))}
                  aria-label="Preço mínimo em ETH"
                  aria-valuetext={`${priceFormatter.format(low / 100)} ETH`}
                />
                <input
                  type="range"
                  min={bounds.min}
                  max={bounds.max}
                  step={1}
                  value={high}
                  onChange={(event) => setMaximum(Math.max(Number(event.target.value), low))}
                  aria-label="Preço máximo em ETH"
                  aria-valuetext={`${priceFormatter.format(high / 100)} ETH`}
                />
              </div>
              <p className="mt-3 text-[15px] text-foreground" aria-live="polite">
                Preço: {priceFormatter.format(low / 100)} - {priceFormatter.format(high / 100)} ETH
              </p>
            </>
          ) : (
            <p className="text-sm text-secondary">
              {facetsQuery.isPending ? 'Carregando faixa de preço…' : 'Faixa de preço indisponível.'}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              disabled={!bounds}
              className="min-h-[38px] rounded-md px-4 py-1 font-mono text-base font-bold text-canvas"
            >
              Aplicar
            </Button>
            {hasFilters && (
              <Button
                type="button"
                variant="ghost"
                className="min-h-[38px] px-3 py-1 text-sm"
                onClick={() => select({
                  collectionId: undefined,
                  category: undefined,
                  network: undefined,
                  minPriceEth: undefined,
                  maxPriceEth: undefined,
                })}
              >
                Limpar filtros
              </Button>
            )}
          </div>
        </form>

        <h3 className="mt-[34px] text-lg font-bold text-foreground">Rede</h3>
        <ul className="mt-[9px]">
          {nftNetworks.map(({ id, label }) => (
            <FilterOption
              key={id}
              label={label}
              count={networkCount(id)}
              active={search.network === id}
              emphasizeCount={false}
              onSelect={() => select({ network: search.network === id ? undefined : id })}
            />
          ))}
        </ul>

        {facetsQuery.isError && (
          <p className="mt-3 text-xs text-secondary" role="status">
            Não foi possível carregar as contagens.{' '}
            <button type="button" className="underline" onClick={() => void facetsQuery.refetch()}>
              Tentar novamente
            </button>
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-xl bg-surface text-center">
        <h2 className="px-3 pt-5 text-xl font-bold text-primary">NFT EM DESTAQUE</h2>
        <p className="mt-1 text-lg font-bold">OFERTA LIMITADA</p>
        <img src={apeSage} alt="NFT em destaque: macaco com chapéu e moletom roxo" className="w-full" />
      </section>
    </aside>
  );
}

function NftCard({ nft, index }: { nft: Nft; index: number }) {
  return (
    <article className={`min-w-0 ${index % 2 === 1 ? 'translate-y-6 lg:translate-y-0' : ''}`}>
      <Link
        to="/nfts/$nftId"
        params={{ nftId: nft.id }}
        className="block rounded-[1.4rem] bg-surface p-1 focus-visible:outline-offset-4 lg:rounded-sm lg:bg-raised lg:p-2"
      >
        {nft.imageUrl ? (
          <img
            src={nft.imageUrl}
            alt={`Ver detalhes de ${nft.title}`}
            className="aspect-square w-full rounded-[1.1rem] object-cover lg:rounded-lg"
          />
        ) : (
          <div className="grid aspect-square place-items-center rounded-[1.1rem] bg-surface px-3 text-center text-sm text-secondary lg:rounded-lg">
            <span className="sr-only">Ver detalhes de {nft.title}. </span>
            Imagem não disponível
          </div>
        )}
      </Link>
      <div className={nft.showcaseOnly ? 'sr-only' : 'px-2 pt-2 font-mono lg:px-0'}>
        <h3 className="text-sm text-foreground">{nft.title}</h3>
        <p className="text-base font-semibold text-primary">{nft.priceEth} ETH</p>
      </div>
    </article>
  );
}

function Journal() {
  return (
    <section id="diario" className="mt-20 lg:mt-24">
      <header className="text-center">
        <h2 className="text-2xl font-bold">Diário da Cunhagem</h2>
        <p className="mt-2 text-sm text-secondary">
          Histórias, guias e insights para colecionadores sobre o universo da propriedade digital.
        </p>
      </header>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {articles.map((article) => (
          <article key={article.title} className="overflow-hidden rounded-md bg-surface">
            <img src={article.image} alt="" className="aspect-[1.3] w-full object-cover" />
            <div className="p-4">
              <p className="text-xs text-secondary">
                {article.date} <span className="px-1">|</span> Leitura de {article.readingTime}
              </p>
              <h3 className="mt-2 text-sm font-bold leading-snug">{article.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-secondary">{article.description}</p>
              <a href="#diario" className="mt-2 inline-block text-xs font-semibold text-primary">
                Ler mais →
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function HomePage({
  search,
  onSearchChange,
}: {
  search: CatalogSearch;
  onSearchChange: (patch: Partial<CatalogSearch>) => void;
}) {
  const [searchText, setSearchText] = useState(search.q ?? '');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const pageSize = 9;
  const params = {
    q: search.q,
    collectionId: search.collectionId,
    category: search.category,
    network: search.network,
    minPriceEth: search.minPriceEth,
    maxPriceEth: search.maxPriceEth,
    sort: search.sort ?? 'relevance',
    page: search.page ?? 1,
    pageSize,
  };
  const catalogQuery = useQuery({
    queryKey: nftKeys.list(params),
    queryFn: ({ signal }) => listNfts(params, signal),
    placeholderData: keepPreviousData,
  });
  const featuredQuery = useQuery({
    queryKey: nftKeys.list({ sort: 'relevance', page: 1, pageSize: 1 }),
    queryFn: ({ signal }) => listNfts({ sort: 'relevance', page: 1, pageSize: 1 }, signal),
  });
  const catalog = catalogQuery.data;
  const featuredNft = featuredQuery.data?.items[0];
  const totalPages = catalog ? Math.max(1, Math.ceil(catalog.total / catalog.pageSize)) : 1;
  const errorMessage = catalogQuery.error instanceof ApiError
    ? catalogQuery.error.message
    : 'Não foi possível carregar o catálogo. Tente novamente.';

  useEffect(() => {
    setSearchText(search.q ?? '');
  }, [search.q]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearchChange({ q: searchText.trim() || undefined, page: 1 });
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 pb-14 pt-10 font-mono sm:px-6 lg:px-0 lg:pb-24 lg:pt-8">
      <div className="mb-3 flex gap-2 lg:hidden">
        <form onSubmit={submitSearch} className="flex min-h-12 flex-1 items-center gap-3 rounded-xl bg-surface px-4 text-secondary">
          <Search aria-hidden="true" size={20} />
          <input
            aria-label="Explorar coleções"
            placeholder="Explorar coleções"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            className="min-w-0 flex-1 bg-transparent font-mono text-sm font-semibold outline-none placeholder:text-secondary"
          />
        </form>
        <button
          type="button"
          aria-label="Filtros"
          aria-expanded={filtersOpen}
          aria-controls="mobile-catalog-filters"
          onClick={() => setFiltersOpen((open) => !open)}
          className="grid size-11 place-items-center rounded-xl bg-primary text-canvas"
        >
          <SlidersHorizontal aria-hidden="true" size={20} />
        </button>
      </div>

      <section
        aria-labelledby="home-title"
        className="relative isolate flex min-h-[190px] overflow-hidden rounded-[1.8rem] bg-surface px-5 py-2 sm:min-h-[280px] sm:px-10 lg:min-h-[450px] lg:items-center lg:rounded-none lg:bg-transparent lg:px-0 lg:py-5"
      >
        <img src={heroBanner} alt="" aria-hidden="true" className="absolute inset-0 -z-10 size-full object-cover lg:hidden" />
        <div className="relative z-10 w-[58%] self-start lg:ml-10 lg:w-1/2 lg:translate-y-4">
          <p className="font-mono text-xs tracking-wide text-foreground lg:mb-4">Bem-vindo à Kurio</p>
          <h1 id="home-title" className="mt-2 max-w-[460px] font-mono text-lg font-bold leading-snug sm:text-2xl lg:mt-0 lg:text-[44px] lg:leading-[1.5]">
            <span className="lg:hidden">SEJA DONO DA CULTURA DIGITAL</span>
            <span className="hidden lg:inline">SEJA DONO DO FUTURO DA ARTE DIGITAL</span>
          </h1>
          <p className="mt-[10px] max-w-md text-[11px] leading-[18px] text-secondary sm:text-sm sm:leading-relaxed lg:mt-3">
            <span className="lg:hidden">
              Descubra NFTs selecionados<br />de criadores do mundo<br />todo.
            </span>
            <span className="hidden lg:inline">
              Descubra NFTs selecionados de criadores emergentes e consagrados. Colecione arte
              digital rara, apoie artistas e tenha uma parte da cultura da internet.
            </span>
          </p>
          <a
            href="#catalogo"
            className="-mt-1 inline-flex items-center gap-2 text-xs font-bold text-primary lg:mt-6 lg:rounded-sm lg:bg-primary lg:px-5 lg:py-2 lg:text-sm lg:text-canvas"
          >
            EXPLORAR
            <ArrowRight aria-hidden="true" size={16} className="lg:hidden" />
          </a>
        </div>
        {/* Mobile/tablet: quadrado limitado pela altura e pela largura do banner, centralizado, com os 4 cantos visíveis. */}
        <div className="absolute right-4 top-1/2 aspect-square w-[min(36%,142px)] -translate-y-1/2 overflow-hidden rounded-2xl sm:right-6 sm:w-[min(38%,232px)] lg:right-0 lg:w-[38%] lg:rounded-[1.3rem]">
          {featuredNft?.imageUrl ? (
            <Link to="/nfts/$nftId" params={{ nftId: featuredNft.id }} aria-label={`Ver destaque ${featuredNft.title}`} className="block size-full">
              <img src={featuredNft.imageUrl} alt={`NFT em destaque: ${featuredNft.title}`} className="size-full object-cover" />
            </Link>
          ) : featuredQuery.isError ? (
            <div className="grid size-full place-items-center bg-surface p-3 text-center text-xs text-secondary" role="status">
              Destaque indisponível. Recarregue o catálogo para tentar novamente.
            </div>
          ) : (
            <Skeleton className="size-full" />
          )}
        </div>
        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 lg:bottom-14 lg:left-auto lg:right-[47%] lg:translate-x-0">
          {[0, 1, 2].map((dot) => (
            <span key={dot} className={`size-2 rounded-full ${dot === 0 ? 'bg-primary' : 'bg-accent'}`} />
          ))}
        </div>
      </section>

      <section id="catalogo" className="mt-3 scroll-mt-6 lg:mt-24">
        <div className="mb-3 flex items-center justify-between gap-4 lg:hidden">
          <nav aria-label="Categorias de NFTs" className="flex min-w-0 gap-2 overflow-x-auto font-mono text-sm">
            <button type="button" onClick={() => onSearchChange({ sort: 'relevance', page: 1 })} className={`shrink-0 border-b-2 pb-1 ${!search.sort || search.sort === 'relevance' ? 'border-primary font-bold text-primary' : 'border-transparent'}`}>Todos os NFTs</button>
            <button type="button" disabled title="A API atual não fornece dados de lançamento" className="shrink-0 cursor-not-allowed pb-1 text-secondary/60">Novos lançamentos</button>
            <button type="button" disabled title="A API atual não fornece métricas de popularidade" className="shrink-0 cursor-not-allowed pb-1 text-secondary/60">Em alta</button>
          </nav>
        </div>
        <div className="grid gap-4 lg:grid-cols-[341px_minmax(0,1fr)] lg:gap-14">
          <div id="mobile-catalog-filters" className={filtersOpen ? 'block lg:block' : 'hidden lg:block'}>
            <CollectionFilters search={search} onChange={onSearchChange} onClose={() => setFiltersOpen(false)} />
          </div>
          <div className="min-w-0">
            <form onSubmit={submitSearch} className="mb-4 hidden gap-2 lg:flex">
              <label className="sr-only" htmlFor="desktop-nft-search">Buscar NFTs</label>
              <Input
                id="desktop-nft-search"
                type="search"
                placeholder="Buscar por NFT ou coleção"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
              <Button type="submit" variant="secondary">Buscar</Button>
            </form>
            <div className="mb-5 hidden items-center justify-between gap-4 font-mono text-sm lg:mb-8 lg:flex">
              <nav aria-label="Categorias de NFTs" className="flex gap-5">
                <button type="button" onClick={() => onSearchChange({ sort: 'relevance', page: 1 })} className={`border-b-2 pb-1 ${!search.sort || search.sort === 'relevance' ? 'border-primary font-semibold text-primary' : 'border-transparent'}`}>Todos os NFTs</button>
                <button type="button" disabled title="A API atual não fornece dados de lançamento" className="cursor-not-allowed text-secondary/60">Novos lançamentos</button>
                <button type="button" disabled title="A API atual não fornece métricas de popularidade" className="cursor-not-allowed text-secondary/60">Em alta</button>
              </nav>
              <label className="flex items-center gap-2">
                Ordenar por
                <select
                  aria-label="Ordenar catálogo"
                  value={search.sort ?? 'relevance'}
                  onChange={(event) => onSearchChange({ sort: event.target.value as CatalogSearch['sort'], page: 1 })}
                  className="min-h-10 rounded border border-border bg-surface px-2"
                >
                  <option value="relevance">Relevância</option>
                  <option value="price-asc">Menor preço</option>
                  <option value="price-desc">Maior preço</option>
                  <option value="title-asc">Nome A–Z</option>
                  <option value="title-desc">Nome Z–A</option>
                </select>
              </label>
            </div>
            {search.q && (
              <p className="mb-4 font-mono text-sm text-secondary" aria-live="polite">
                Busca: “{search.q}”
              </p>
            )}
            {catalogQuery.isFetching && catalog && (
              <p className="mb-3 text-sm text-secondary" role="status">Atualizando catálogo…</p>
            )}
            {catalogQuery.isPending ? (
              <div className="grid grid-cols-2 gap-x-5 gap-y-8 pb-10 lg:grid-cols-3 lg:gap-x-8">
                {Array.from({ length: 6 }, (_, index) => (
                  <div key={index} className="space-y-3" data-testid="catalog-skeleton">
                    <Skeleton className="aspect-square w-full rounded-xl" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                ))}
              </div>
            ) : catalogQuery.isError ? (
              <StatusMessage variant="error" role="alert">
                <strong>Não foi possível carregar o catálogo.</strong>{' '}
                {errorMessage}{' '}
                <Button type="button" onClick={() => void catalogQuery.refetch()}>Tentar novamente</Button>
              </StatusMessage>
            ) : catalog && catalog.items.length === 0 ? (
              <StatusMessage>
                <strong>Nenhum NFT encontrado.</strong>{' '}
                Altere a busca ou remova filtros para ver outras obras.{' '}
                <Button type="button" variant="secondary" onClick={() => {
                  setSearchText('');
                  onSearchChange({
                    q: undefined,
                    collectionId: undefined,
                    category: undefined,
                    network: undefined,
                    minPriceEth: undefined,
                    maxPriceEth: undefined,
                    page: 1,
                  });
                }}>Limpar busca e filtros</Button>
              </StatusMessage>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-x-5 gap-y-8 pb-10 lg:grid-cols-3 lg:gap-x-8 lg:gap-y-12" aria-busy={catalogQuery.isFetching}>
                  {catalog?.items.map((nft, index) => (
                    <NftCard key={nft.id} nft={nft} index={index} />
                  ))}
                </div>
                {catalog && totalPages > 1 && (
                  <nav aria-label="Paginação" className="flex justify-center gap-2 pb-10 lg:justify-end">
                    {(search.page ?? 1) > 1 && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        aria-label="Página anterior"
                        disabled={catalogQuery.isPlaceholderData}
                        onClick={() => onSearchChange({ page: (search.page ?? 1) - 1 })}
                      >
                        <ChevronLeft aria-hidden="true" size={16} />
                      </Button>
                    )}
                    {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                      <Button
                        key={page}
                        type="button"
                        variant={(search.page ?? 1) === page ? 'default' : 'secondary'}
                        size="sm"
                        aria-current={(search.page ?? 1) === page ? 'page' : undefined}
                        onClick={() => onSearchChange({ page })}
                      >
                        {page}
                      </Button>
                    ))}
                    {(search.page ?? 1) < totalPages && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        aria-label="Próxima página"
                        disabled={catalogQuery.isPlaceholderData}
                        onClick={() => onSearchChange({ page: (search.page ?? 1) + 1 })}
                      >
                        <ChevronRight aria-hidden="true" size={16} />
                      </Button>
                    )}
                  </nav>
                )}
              </>
            )}
            <div className="mb-6 lg:hidden">
              <label className="flex items-center gap-2 text-sm">
                Ordenar por
                <select
                  aria-label="Ordenar catálogo"
                  value={search.sort ?? 'relevance'}
                  onChange={(event) => onSearchChange({ sort: event.target.value as CatalogSearch['sort'], page: 1 })}
                  className="min-h-10 flex-1 rounded border border-border bg-surface px-2"
                >
                  <option value="relevance">Relevância</option>
                  <option value="price-asc">Menor preço</option>
                  <option value="price-desc">Maior preço</option>
                  <option value="title-asc">Nome A–Z</option>
                  <option value="title-desc">Nome Z–A</option>
                </select>
              </label>
            </div>
            {catalog && (
              <p className="sr-only" role="status" aria-live="polite">
                {catalog.total} NFTs encontrados. Página {catalog.page} de {totalPages}.
              </p>
            )}
          </div>
        </div>
      </section>

      <section id="destaques" className="mt-12 grid gap-5 lg:mt-24 lg:grid-cols-2">
        <article className="flex min-h-40 overflow-hidden rounded-lg bg-surface">
          <img src={apeEmerald} alt="" className="w-[42%] object-cover" />
          <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
            <h2 className="text-sm font-bold">Lançamentos gênesis de edição limitada</h2>
            <p className="mt-2 text-xs leading-relaxed text-secondary">
              Colecione edições escassas diretamente dos criadores antes da revelação pública.
            </p>
            <a href="#catalogo" className="mt-2 inline-flex items-center gap-1 rounded bg-primary px-4 py-1.5 text-xs font-semibold text-canvas">
              Explorar <ArrowRight aria-hidden="true" size={13} />
            </a>
          </div>
        </article>
        <article className="flex min-h-40 overflow-hidden rounded-lg bg-surface">
          <img src={apeNeon} alt="" className="w-[42%] object-cover" />
          <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
            <h2 className="text-sm font-bold">Arte digital selecionada e muito mais</h2>
            <p className="mt-2 text-xs leading-relaxed text-secondary">
              Explore novos artistas, coleções verificadas e obras digitais que definem a cultura.
            </p>
            <a href="#catalogo" className="mt-2 inline-flex items-center gap-1 rounded bg-primary px-4 py-1.5 text-xs font-semibold text-canvas">
              Explorar <ArrowRight aria-hidden="true" size={13} />
            </a>
          </div>
        </article>
      </section>

      <Journal />

    </div>
  );
}
