import { useQueries, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { ChevronLeft, Minus, Plus } from 'lucide-react';
import deleteIcon from '@/assets/images/Delete.png';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusMessage } from '@/components/ui/status-message';
import {
  nftEditions,
  type CartIssue,
  type CartItem,
  type CartResponse,
  type Nft,
} from '@/domain/contracts';
import { listNfts, nftDetailQueryOptions } from '@/features/discovery/api';
import {
  useCart,
  useQuote,
  useReconcileCart,
  useRemoveCartItem,
  useUpdateCartItem,
} from '@/features/cart/use-cart';
import { errorMessage } from '@/lib/api-error';
import { formatEth, multiplyDecimal } from '@/lib/decimal';
import { nftKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { CouponForm, QuoteSkeleton, QuoteValues } from '@/features/cart/quote-summary';

const RECOMMENDATIONS_PER_PAGE = 5;
const RECOMMENDATION_PARAMS = { sort: 'relevance', page: 1, pageSize: 15 } as const;

function itemKey(item: Pick<CartItem, 'nftId' | 'editionId'>) {
  return `${item.nftId}:${item.editionId}`;
}

/** Limite de unidades no cliente (o servidor valida de novo): disponibilidade menos outras edições, limitada pela edição. */
function itemLimit(nft: Nft | undefined, item: CartItem, cart: CartResponse) {
  if (!nft) return item.quantity;
  const edition = nftEditions(nft).find(({ id }) => id === item.editionId);
  const otherEditions = cart.items
    .filter((entry) => entry.nftId === item.nftId && entry.editionId !== item.editionId)
    .reduce((total, entry) => total + entry.quantity, 0);
  const remaining = Math.max(0, nft.availableEditions - otherEditions);
  return edition?.maxQuantity ? Math.min(remaining, edition.maxQuantity) : remaining;
}

function editionLabel(nft: Nft | undefined, item: CartItem) {
  return nft ? nftEditions(nft).find(({ id }) => id === item.editionId)?.label ?? null : null;
}

function issueText(issue: CartIssue, title: string) {
  const parts: string[] = [];
  if (issue.kinds.includes('price-changed')) {
    parts.push(`preço mudou de ${formatEth(issue.unitPriceEth)} para ${formatEth(issue.currentPriceEth)} ETH`);
  }
  if (issue.kinds.includes('unavailable')) parts.push('esgotado — será removido');
  if (issue.kinds.includes('quantity-exceeds')) {
    parts.push(`apenas ${issue.availableQuantity} disponíve${issue.availableQuantity === 1 ? 'l' : 'is'} — a quantidade será ajustada`);
  }
  return `${title}: ${parts.join('; ')}.`;
}

function QuantityControl({
  title,
  quantity,
  limit,
  disabled,
  onChange,
  onRemove,
  variant,
}: {
  title: string;
  quantity: number;
  limit: number;
  disabled: boolean;
  onChange: (quantity: number) => void;
  onRemove: () => void;
  variant: 'table' | 'card';
}) {
  const buttonClass = variant === 'table'
    ? 'h-[26px] min-h-[26px] w-[18px] rounded-full bg-primary px-0 py-0 text-canvas hover:bg-accent'
    : 'size-[26px] min-h-[26px] rounded-full px-0 py-0';
  return (
    <div className={cn('flex items-center', variant === 'table' ? 'gap-3' : 'gap-2.5')}>
      {/* Mobile: com 1 unidade, o "−" vira a lixeira (diminuir abaixo de 1 significa remover o item). */}
      {variant === 'card' && quantity <= 1 ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`Excluir ${title} do carrinho`}
          className="size-[26px] min-h-[26px] rounded-full bg-white/10 px-0 py-0 hover:bg-white/15"
          disabled={disabled}
          onClick={onRemove}
        >
          <img src={deleteIcon} alt="" aria-hidden="true" className="size-4" />
        </Button>
      ) : (
      <Button
        type="button"
        size="sm"
        variant={variant === 'table' ? 'default' : 'ghost'}
        aria-label={`Diminuir quantidade de ${title}`}
        className={cn(buttonClass, variant === 'card' && 'bg-white/10 text-foreground hover:bg-white/15')}
        disabled={disabled || quantity <= 1}
        onClick={() => onChange(quantity - 1)}
      >
        <Minus aria-hidden="true" size={12} strokeWidth={3} />
      </Button>
      )}
      <span className="min-w-4 text-center" aria-label={`Quantidade de ${title}`} aria-live="polite">{quantity}</span>
      <Button
        type="button"
        size="sm"
        variant={variant === 'table' ? 'default' : 'ghost'}
        aria-label={`Aumentar quantidade de ${title}`}
        className={cn(buttonClass, variant === 'card' && 'border border-foreground/30 bg-black/30 text-foreground hover:bg-black/40')}
        disabled={disabled || quantity >= limit}
        onClick={() => onChange(quantity + 1)}
      >
        <Plus aria-hidden="true" size={12} strokeWidth={3} />
      </Button>
    </div>
  );
}

function CartItemRow({
  item,
  nft,
  nftError,
  cart,
  issue,
  pending,
  onQuantity,
  onRemove,
}: {
  item: CartItem;
  nft: Nft | undefined;
  nftError: boolean;
  cart: CartResponse;
  issue: CartIssue | undefined;
  pending: boolean;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const title = nft?.title ?? item.nftId;
  const lineTotal = multiplyDecimal(item.unitPriceEth, item.quantity);
  const label = editionLabel(nft, item);
  const detailLine = nft?.tokenId ? `ID do token: ${nft.tokenId}` : label ? `Edição: ${label}` : null;
  const limit = itemLimit(nft, item, cart);
  const image = nft?.imageUrl ? (
    <img src={nft.imageUrl} alt={`Arte do NFT ${title}`} className="size-full object-cover" />
  ) : (
    <span className="grid size-full place-items-center bg-raised p-1 text-center text-[10px] text-secondary">
      {nftError || nft ? 'Sem imagem' : ''}
    </span>
  );
  const issueNote = issue && (
    <p className="mt-0.5 text-[11px] leading-4 text-accent" data-testid="cart-item-issue">
      {issue.kinds.includes('unavailable')
        ? 'Esgotado'
        : issue.kinds.includes('quantity-exceeds')
          ? `Disponíveis: ${issue.availableQuantity}`
          : null}
      {issue.kinds.includes('price-changed') && (
        <>{issue.kinds.length > 1 ? ' · ' : ''}Novo preço: {formatEth(issue.currentPriceEth)} ETH</>
      )}
    </p>
  );
  const removeButton = (className: string) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={`Remover ${title} do carrinho`}
      className={className}
      disabled={pending}
      onClick={onRemove}
    >
      <img src={deleteIcon} alt="" aria-hidden="true" className="size-4.5" />
    </Button>
  );

  return (
    <li data-testid="cart-item" data-nft-id={item.nftId} aria-busy={pending || undefined}>
      {/* Desktop: linha da tabela do Figma (1440 px). */}
      <div className="hidden h-[70px] grid-cols-[311px_138px_136px_150px_1fr] items-center bg-surface lg:grid">
        <div className="flex min-w-0 items-center gap-4">
          <div className="size-[70px] shrink-0 overflow-hidden">
            {nft || nftError ? image : <Skeleton className="size-full rounded-none" />}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold">
              {nft ? (
                <Link to="/nfts/$nftId" params={{ nftId: item.nftId }} className="hover:text-primary">{title}</Link>
              ) : nftError ? title : <Skeleton className="h-4 w-36" />}
            </p>
            {detailLine && <p className="mt-0.5 truncate text-[13px] text-secondary">{detailLine}</p>}
            {issueNote}
          </div>
        </div>
        <p className="text-[15px] font-semibold text-secondary">{formatEth(item.unitPriceEth)} ETH</p>
        <QuantityControl
          variant="table"
          title={title}
          quantity={item.quantity}
          limit={limit}
          disabled={pending || Boolean(issue)}
          onChange={onQuantity}
          onRemove={onRemove}
        />
        <p className="text-[15px] font-bold text-primary" data-testid="cart-line-total">{formatEth(lineTotal)} ETH</p>
        <div className="flex justify-end pr-6">
          {removeButton('size-9 min-h-9 px-0 text-secondary hover:text-primary')}
        </div>
      </div>

      {/* Tablet/mobile: cartão do frame mobile. */}
      <div className="group relative flex min-h-[100px] overflow-hidden rounded-[12px] bg-surface lg:hidden">
        <div className="w-[100px] shrink-0 self-stretch">
          {nft || nftError ? image : <Skeleton className="size-full rounded-none" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center py-2 pl-2.5 pr-1">
          <p className="truncate text-sm font-bold">
            {nft ? (
              <Link to="/nfts/$nftId" params={{ nftId: item.nftId }}>{title}</Link>
            ) : nftError ? title : <Skeleton className="h-4 w-28" />}
          </p>
          {detailLine && <p className="truncate text-sm text-secondary">{label ? `Edição: ${label}` : detailLine}</p>}
          {issueNote}
          <p className="mt-1.5 text-base font-bold text-primary">{formatEth(lineTotal)} ETH</p>
        </div>
        {/* Como no frame, a lixeira só aparece ao passar o ponteiro/tocar no cartão ou ao receber foco pelo teclado. */}
        {removeButton('absolute right-1.5 top-1.5 size-8 min-h-8 px-0 text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100')}
        <div className="flex flex-col items-end justify-center pr-2.5">
          <QuantityControl
            variant="card"
            title={title}
            quantity={item.quantity}
            limit={limit}
            disabled={pending || Boolean(issue)}
            onChange={onQuantity}
            onRemove={onRemove}
          />
        </div>
      </div>
    </li>
  );
}

function CartSummary({ cart }: { cart: CartResponse | undefined }) {
  const navigate = useNavigate();
  const quoteQuery = useQuote(cart);
  const quote = quoteQuery.data && cart && quoteQuery.data.cartVersion === cart.version ? quoteQuery.data : undefined;
  const hasItems = Boolean(cart && cart.items.length > 0);
  const hasIssues = Boolean(cart && cart.issues.length > 0);
  const canFinish = Boolean(quote) && !hasIssues && !quoteQuery.isError;

  const finish = () => {
    if (!cart) return;
    if (cart.userId === null) {
      void navigate({ to: '/login', search: { redirect: '/carrinho' } });
      return;
    }
    void navigate({ to: '/pagamento' });
  };

  let body: React.ReactNode;
  if (!cart) body = <QuoteSkeleton />;
  else if (!hasItems) body = <p className="text-sm text-secondary">Adicione NFTs ao carrinho para ver a cotação.</p>;
  else if (hasIssues) {
    body = (
      <p className="text-sm text-secondary" role="status">
        Os valores serão recalculados depois que você revisar as alterações do carrinho.
      </p>
    );
  } else if (quoteQuery.isError && !quoteQuery.isFetching) {
    body = (
      <StatusMessage variant="error" role="alert">
        {errorMessage(quoteQuery.error, 'Não foi possível calcular a cotação.')}{' '}
        <Button type="button" variant="secondary" size="sm" onClick={() => void quoteQuery.refetch()}>
          Tentar novamente
        </Button>
      </StatusMessage>
    );
  } else body = quote ? <QuoteValues quote={quote} /> : <QuoteSkeleton />;

  return (
    <aside
      aria-labelledby="cart-summary-title"
      aria-busy={hasItems && !hasIssues && !quote ? true : undefined}
      className="max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-4 max-md:mt-6 max-md:rounded-t-[2rem] max-md:bg-surface max-md:px-6 max-md:pb-[max(env(safe-area-inset-bottom),1.5rem)] max-md:pt-6 max-md:shadow-[0_-8px_24px_rgb(0_0_0/0.25)] md:mt-10 lg:mt-0"
    >
      <h2 id="cart-summary-title" className="border-b border-border pb-2 text-lg font-bold leading-[22px] max-md:sr-only">Resumo da carteira</h2>
      <div className="mt-8 space-y-6 max-md:mt-0 max-md:space-y-4">
        {cart && hasItems && <CouponForm cart={cart} />}
        {body}
        <Button
          type="button"
          className="h-10 min-h-10 w-full rounded-sm text-[15px] font-bold text-canvas max-md:h-[60px] max-md:rounded-full max-md:bg-gradient-to-r max-md:from-[#d28a4c] max-md:to-[#8a5a35] max-md:text-base max-md:text-black"
          disabled={!canFinish}
          onClick={finish}
        >
          Conectar e finalizar
        </Button>
        <p className="!mt-3 text-center max-md:hidden">
          <Link to="/" className="text-[15px] text-primary underline-offset-4 hover:underline">Continuar explorando</Link>
        </p>
      </div>
    </aside>
  );
}

function Recommendations() {
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: nftKeys.list(RECOMMENDATION_PARAMS),
    queryFn: ({ signal }) => listNfts(RECOMMENDATION_PARAMS, signal),
  });
  const items = query.data?.items.filter((nft) => nft.imageUrl) ?? [];
  const pageCount = Math.max(1, Math.ceil(items.length / RECOMMENDATIONS_PER_PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = items.slice(currentPage * RECOMMENDATIONS_PER_PAGE, (currentPage + 1) * RECOMMENDATIONS_PER_PAGE);

  return (
    <section aria-labelledby="recommendations-title" className="mt-24 hidden pb-16 md:block">
      <h2 id="recommendations-title" className="border-b border-border pb-2 text-lg font-bold text-primary">
        Colecionadores também viram
      </h2>
      {query.isPending ? (
        <div className="mt-8 grid grid-cols-3 gap-[26px] lg:grid-cols-5">
          {Array.from({ length: RECOMMENDATIONS_PER_PAGE }, (_, index) => (
            <Skeleton key={index} className="aspect-[219/255] w-full rounded-none" />
          ))}
        </div>
      ) : query.isError ? (
        <StatusMessage variant="error" role="alert" className="mt-6">
          Não foi possível carregar recomendações.{' '}
          <Button type="button" variant="secondary" size="sm" onClick={() => void query.refetch()}>Tentar novamente</Button>
        </StatusMessage>
      ) : (
        <>
          <ul className="mt-8 grid grid-cols-3 gap-[26px] lg:grid-cols-5">
            {visible.map((nft) => (
              <li key={nft.id}>
                <Link
                  to="/nfts/$nftId"
                  params={{ nftId: nft.id }}
                  className="group block"
                >
                  <div className="bg-surface p-[15px] pb-[20px]">
                    <img src={nft.imageUrl} alt="" className="aspect-square w-full rounded-[12px] object-cover" loading="lazy" />
                  </div>
                  <p className="mt-3 text-[15px] group-hover:text-primary">
                    <span className="sr-only">Ver detalhes de </span>
                    {nft.title}
                  </p>
                  <p className="mt-1 text-[15px] font-bold text-primary">{formatEth(nft.priceEth)} ETH</p>
                </Link>
              </li>
            ))}
          </ul>
          {pageCount > 1 && (
            <div className="mt-8 flex justify-center gap-2">
              {Array.from({ length: pageCount }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={`Mostrar recomendações ${index + 1} de ${pageCount}`}
                  aria-current={index === currentPage ? 'true' : undefined}
                  onClick={() => setPage(index)}
                  className={cn(
                    'size-3 rounded-full border border-primary',
                    index === currentPage ? 'bg-primary' : 'bg-transparent hover:bg-primary/40',
                  )}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function CartPage() {
  const cartQuery = useCart();
  const cart = cartQuery.data;
  const [notice, setNotice] = useState<string>();
  const updateMutation = useUpdateCartItem();
  const removeMutation = useRemoveCartItem();
  const reconcileMutation = useReconcileCart();
  const nftIds = [...new Set(cart?.items.map(({ nftId }) => nftId) ?? [])];
  const nftQueries = useQueries({ queries: nftIds.map((nftId) => nftDetailQueryOptions(nftId)) });
  const nftById = new Map(nftIds.map((nftId, index) => [nftId, nftQueries[index]]));

  const pendingKey = updateMutation.isPending && updateMutation.variables
    ? itemKey(updateMutation.variables)
    : removeMutation.isPending && removeMutation.variables
      ? itemKey(removeMutation.variables)
      : undefined;

  const changeQuantity = (item: CartItem, quantity: number) => {
    setNotice(undefined);
    updateMutation.mutate(
      { nftId: item.nftId, editionId: item.editionId, quantity },
      { onError: (error) => setNotice(errorMessage(error, 'Não foi possível alterar a quantidade. Tente novamente.')) },
    );
  };
  const removeItem = (item: CartItem) => {
    setNotice(undefined);
    removeMutation.mutate(
      { nftId: item.nftId, editionId: item.editionId },
      { onError: (error) => setNotice(errorMessage(error, 'Não foi possível remover o item. Tente novamente.')) },
    );
  };

  let content: React.ReactNode;
  if (cartQuery.isPending) {
    content = (
      <ul className="space-y-3" aria-hidden="true" data-testid="cart-skeleton">
        {[0, 1, 2].map((row) => <li key={row}><Skeleton className="h-[100px] w-full rounded-[12px] lg:h-[70px] lg:rounded-none" /></li>)}
      </ul>
    );
  } else if (cartQuery.isError) {
    content = (
      <StatusMessage variant="error" role="alert">
        {errorMessage(cartQuery.error, 'Não foi possível carregar o carrinho.')}{' '}
        <Button type="button" variant="secondary" size="sm" onClick={() => void cartQuery.refetch()}>Tentar novamente</Button>
      </StatusMessage>
    );
  } else if (cart && cart.items.length === 0) {
    content = (
      <div className="rounded-[12px] bg-surface px-6 py-10 text-center lg:rounded-none">
        <p className="font-bold">Seu carrinho está vazio.</p>
        <p className="mt-2 text-sm text-secondary">Explore o mercado e adicione NFTs para continuar.</p>
        <Button asChild className="mt-5"><Link to="/">Explorar o mercado</Link></Button>
      </div>
    );
  } else if (cart) {
    content = (
      <ul className="space-y-3 lg:space-y-3" aria-label="Itens do carrinho">
        {cart.items.map((item) => {
          const nftQuery = nftById.get(item.nftId);
          return (
            <CartItemRow
              key={itemKey(item)}
              item={item}
              nft={nftQuery?.data}
              nftError={Boolean(nftQuery?.isError)}
              cart={cart}
              issue={cart.issues.find((issue) => itemKey(issue) === itemKey(item))}
              pending={pendingKey === itemKey(item) || reconcileMutation.isPending}
              onQuantity={(quantity) => changeQuantity(item, quantity)}
              onRemove={() => removeItem(item)}
            />
          );
        })}
      </ul>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 font-mono md:px-6 lg:px-0">
      <div className="relative flex h-[76px] items-center justify-center md:hidden">
        <Link
          to="/"
          aria-label="Voltar ao mercado"
          className="absolute left-2 grid size-9 place-items-center rounded-full bg-[#3a2219] text-primary"
        >
          <ChevronLeft aria-hidden="true" size={20} />
        </Link>
        <h1 className="text-lg font-bold">Carrinho de NFTs</h1>
      </div>
      <nav aria-label="Trilha de navegação" className="hidden pt-[30px] text-[15px] font-bold leading-[22px] md:block">
        <Link to="/" className="hover:text-primary">Início</Link>
        <span className="px-2">/</span>
        <Link to="/" hash="catalogo" className="hover:text-primary">Mercado</Link>
        <span className="px-2">/</span>
        <span aria-current="page">Carrinho</span>
      </nav>

      <div className="lg:mt-3 lg:grid lg:grid-cols-[782px_332px] lg:justify-between">
        <section aria-labelledby="cart-items-title">
          <h2 id="cart-items-title" className="sr-only">Itens do carrinho</h2>
          <div aria-hidden="true" className="hidden grid-cols-[311px_138px_136px_150px_1fr] border-b border-border pb-2 text-[15px] font-bold leading-[22px] lg:grid">
            <span>NFTs</span>
            <span>Preço</span>
            <span>Edições</span>
            <span>Total</span>
          </div>

          {cart && cart.issues.length > 0 && (
            <div role="alert" className="mb-4 rounded-lg border border-primary/60 bg-primary/10 p-4 text-sm lg:mt-3" data-testid="cart-issues">
              <p className="font-bold text-accent">Alguns itens mudaram desde que foram adicionados.</p>
              <ul className="mt-2 space-y-1 text-secondary">
                {cart.issues.map((issue) => (
                  <li key={itemKey(issue)}>{issueText(issue, nftById.get(issue.nftId)?.data?.title ?? issue.nftId)}</li>
                ))}
              </ul>
              <Button
                type="button"
                size="sm"
                className="mt-3"
                disabled={reconcileMutation.isPending}
                onClick={() => {
                  setNotice(undefined);
                  reconcileMutation.mutate(undefined, {
                    onError: (error) => setNotice(errorMessage(error, 'Não foi possível atualizar o carrinho. Tente novamente.')),
                  });
                }}
              >
                Aceitar alterações e recalcular
              </Button>
            </div>
          )}
          {notice && <StatusMessage variant="error" role="alert" className="mb-4 lg:mt-3">{notice}</StatusMessage>}
          {cartQuery.isFetching && !cartQuery.isPending && (
            <p className="sr-only" role="status">Atualizando carrinho…</p>
          )}
          <div className="lg:mt-3">{content}</div>
        </section>

        <CartSummary cart={cartQuery.isError ? undefined : cart} />
      </div>

      <Recommendations />
    </div>
  );
}
