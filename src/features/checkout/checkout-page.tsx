import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ChevronDown, ChevronLeft, EllipsisVertical, Wallet as WalletIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fieldInputClass, FormField } from '@/components/ui/form-field';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusMessage } from '@/components/ui/status-message';
import {
  walletNetworks,
  walletTypes,
  type CartItem,
  type Nft,
  type Profile,
  type Quote,
  type Wallet,
  type WalletConnection,
  type WalletType,
} from '@/domain/contracts';
import { getProfile, listWallets, accountKeys } from '@/features/account/api';
import { CouponForm, QuoteSkeleton, QuoteValues } from '@/features/cart/quote-summary';
import { useCart, useQuote } from '@/features/cart/use-cart';
import {
  checkoutFieldOrder,
  collectorFrom,
  emptyCheckoutForm,
  findWalletByAddress,
  prefillFromWallet,
  shortAddress,
  validateCheckoutForm,
  type CheckoutErrors,
  type CheckoutField,
  type CheckoutFormValues,
} from '@/features/checkout/checkout-form';
import { ReviewDialog } from '@/features/checkout/review-dialog';
import { useOrders } from '@/features/checkout/use-orders';
import { nftDetailQueryOptions } from '@/features/discovery/api';
import { useAuthenticatedSession } from '@/features/session/session';
import { errorMessage } from '@/lib/api-error';
import { formatEth, multiplyDecimal } from '@/lib/decimal';
import { cn } from '@/lib/utils';

const FORM_ID = 'checkout';
/** Rádio do frame: contorno laranja; selecionado com miolo preenchido. */
const radioClass = 'size-4 shrink-0 cursor-pointer appearance-none rounded-full border border-primary checked:bg-primary checked:shadow-[inset_0_0_0_3px_#1c120e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** Rótulos e marcas dos provedores, na ordem do frame mobile (W, M e ícone de carteira). */
const providerOptions: ReadonlyArray<{ value: WalletType; label: string; mark: string | null }> = [
  { value: 'WalletConnect', label: 'WalletConnect', mark: 'W' },
  { value: 'MetaMask', label: 'MetaMask', mark: 'M' },
  { value: 'Coinbase', label: 'Coinbase Wallet', mark: null },
];

function SelectField({
  value,
  onChange,
  placeholder,
  options,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: readonly string[];
  id: string;
  'aria-invalid': boolean | undefined;
  'aria-describedby': string | undefined;
  'aria-required': boolean | undefined;
}) {
  return (
    <div className="relative">
      <select
        {...props}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(fieldInputClass, 'appearance-none pr-10', !value && 'text-secondary')}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <ChevronDown aria-hidden="true" size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-secondary" />
    </div>
  );
}

function walletRoleLabel(wallet: Wallet) {
  return wallet.role === 'principal' ? 'Principal' : 'Reserva';
}

function networkLabel(network: string) {
  return network === 'Ethereum' ? 'Rede principal Ethereum' : `Rede ${network}`;
}

function CheckoutItemRow({ item, nft }: { item: CartItem; nft: Nft | undefined }) {
  const title = nft?.title ?? item.nftId;
  return (
    <li className="flex h-[70px] items-center gap-2 bg-surface pr-3" data-testid="checkout-item">
      <div className="size-[70px] shrink-0 overflow-hidden">
        {nft?.imageUrl
          ? <img src={nft.imageUrl} alt={`Arte do NFT ${title}`} className="size-full object-cover" />
          : nft ? <span className="grid size-full place-items-center bg-raised text-[10px] text-secondary">Sem imagem</span>
            : <Skeleton className="size-full rounded-none" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold">{nft ? title : <Skeleton className="h-4 w-32" />}</p>
        {nft?.tokenId && <p className="truncate text-[13px] text-secondary">ID do token: {nft.tokenId}</p>}
      </div>
      <span className="shrink-0 text-[13px] text-secondary">(x {item.quantity})</span>
      <span className="w-[92px] shrink-0 text-right text-[17px] font-bold text-primary">
        {formatEth(multiplyDecimal(item.unitPriceEth, item.quantity))} ETH
      </span>
    </li>
  );
}

function ProviderOption({
  option,
  selected,
  onSelect,
  variant,
}: {
  option: (typeof providerOptions)[number];
  selected: boolean;
  onSelect: () => void;
  variant: 'desktop' | 'mobile';
}) {
  const inputId = `provider-${variant}-${option.value}`;
  if (variant === 'mobile') {
    return (
      <label htmlFor={inputId} className={cn('flex h-[65px] cursor-pointer items-center gap-4 rounded-[12px] bg-surface px-5')}>
        <span aria-hidden="true" className="grid size-[38px] place-items-center rounded-full border border-border bg-[#2a1a14] text-sm font-bold text-primary">
          {option.mark ?? <WalletIcon size={20} />}
        </span>
        <span className="flex-1 text-[15px]">{option.label}</span>
        <input id={inputId} type="radio" name="provider-mobile" checked={selected} onChange={onSelect} className={radioClass} />
      </label>
    );
  }
  return (
    <label
      htmlFor={inputId}
      className={cn(
        'flex h-[45px] cursor-pointer items-center gap-3 rounded-[2px] border px-3 text-[15px]',
        selected ? 'border-foreground' : 'border-border',
      )}
    >
      <input id={inputId} type="radio" name="provider-desktop" checked={selected} onChange={onSelect} className={radioClass} />
      {option.value === 'WalletConnect' ? (
        <>
          <span aria-hidden="true" className="rounded-[4px] border border-primary/60 bg-[#3a2219] px-2 py-1 text-[8px] font-bold tracking-wide text-primary">
            METAMASK · WALLETCONNECT · COINBASE
          </span>
          <span className="sr-only">WalletConnect</span>
        </>
      ) : (
        <span className={option.value === 'Coinbase' ? 'pl-4' : undefined}>{option.label}</span>
      )}
    </label>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[763px_405px] lg:justify-between" aria-hidden="true" data-testid="checkout-skeleton">
      <div className="grid grid-cols-2 gap-x-6 gap-y-6">
        {Array.from({ length: 10 }, (_, index) => <Skeleton key={index} className="h-[66px]" />)}
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((row) => <Skeleton key={row} className="h-[70px]" />)}
        <QuoteSkeleton />
      </div>
    </div>
  );
}

export function CheckoutPage() {
  const session = useAuthenticatedSession();
  const userId = session?.userId;
  const walletsQuery = useQuery({
    queryKey: accountKeys.wallets(userId ?? 'anonymous'),
    queryFn: ({ signal }) => listWallets(signal),
    enabled: Boolean(userId),
  });
  const profileQuery = useQuery({
    queryKey: accountKeys.profile(userId ?? 'anonymous'),
    queryFn: ({ signal }) => getProfile(signal),
    enabled: Boolean(userId),
  });
  const cartQuery = useCart();

  let content: React.ReactNode;
  if (!userId || walletsQuery.isPending || profileQuery.isPending || cartQuery.isPending) {
    content = <CheckoutSkeleton />;
  } else if (walletsQuery.isError || profileQuery.isError || cartQuery.isError) {
    const error = walletsQuery.error ?? profileQuery.error ?? cartQuery.error;
    content = (
      <StatusMessage variant="error" role="alert" className="mt-8">
        {errorMessage(error, 'Não foi possível carregar o pagamento.')}{' '}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            void walletsQuery.refetch();
            void profileQuery.refetch();
            void cartQuery.refetch();
          }}
        >
          Tentar novamente
        </Button>
      </StatusMessage>
    );
  } else if (cartQuery.data && cartQuery.data.items.length === 0) {
    content = (
      <div className="mt-8 rounded-[12px] bg-surface px-6 py-10 text-center">
        <p className="font-bold">Seu carrinho está vazio.</p>
        <p className="mt-2 text-sm text-secondary">Adicione NFTs ao carrinho para finalizar uma compra.</p>
        <Button asChild className="mt-5"><Link to="/">Explorar o mercado</Link></Button>
      </div>
    );
  } else if (walletsQuery.data.length === 0) {
    content = (
      <StatusMessage className="mt-8">
        Cadastre uma carteira para pagar.{' '}
        <Link to="/perfil/carteiras" className="font-bold text-primary underline-offset-4 hover:underline">Cadastrar carteira</Link>
      </StatusMessage>
    );
  } else {
    content = <CheckoutContent userId={userId} wallets={walletsQuery.data} profile={profileQuery.data} />;
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-10 font-mono md:px-6 lg:px-0">
      <div className="relative flex h-[76px] items-center md:hidden">
        <Link to="/carrinho" aria-label="Voltar ao carrinho" className="grid size-[35px] place-items-center rounded-full bg-[#3a2219] text-primary">
          <ChevronLeft aria-hidden="true" size={20} />
        </Link>
        <h1 className="ml-6 text-lg font-bold">Pagamento com carteira</h1>
      </div>
      <nav aria-label="Trilha de navegação" className="hidden pt-[30px] text-[15px] font-bold leading-[22px] md:block">
        <Link to="/" className="hover:text-primary">Início</Link>
        <span className="px-2">/</span>
        <Link to="/" hash="catalogo" className="hover:text-primary">Mercado</Link>
        <span className="px-2">/</span>
        <span aria-current="page">Pagamento</span>
      </nav>
      <h1 className="sr-only max-md:hidden">Pagamento</h1>
      {content}
    </div>
  );
}

function CheckoutContent({ userId, wallets, profile }: { userId: string; wallets: Wallet[]; profile: Profile }) {
  const cartQuery = useCart();
  const cart = cartQuery.data;
  const quoteQuery = useQuote(cart);
  const quote = quoteQuery.data && cart && quoteQuery.data.cartVersion === cart.version && cart.issues.length === 0
    ? quoteQuery.data
    : undefined;
  const ordersQuery = useOrders();
  const pendingOrder = ordersQuery.data?.find((order) => order.status === 'pendente' && cart && order.quote.cartVersion === cart.version);
  const principal = wallets.find((wallet) => wallet.role === 'principal') ?? wallets[0];
  const secondary = wallets.find((wallet) => wallet.role === 'secundaria');

  const [values, setValues] = useState<CheckoutFormValues>(() => (principal ? prefillFromWallet(principal, profile) : emptyCheckoutForm()));
  const [errors, setErrors] = useState<CheckoutErrors>({});
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showCoupon, setShowCoupon] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewedQuote, setReviewedQuote] = useState<Quote>();
  const [connection, setConnection] = useState<WalletConnection | null>(null);

  const selectedWallet = findWalletByAddress(wallets, values.walletAddress);
  const useOther = Boolean(secondary && selectedWallet?.id === secondary.id);

  const nftIds = useMemo(() => [...new Set(cart?.items.map(({ nftId }) => nftId) ?? [])], [cart]);
  const nftQueries = useQueries({ queries: nftIds.map((nftId) => nftDetailQueryOptions(nftId)) });
  const nftById = new Map(nftIds.map((nftId, index) => [nftId, nftQueries[index]?.data]));
  const titles = new Map(nftIds.map((nftId, index) => [nftId, nftQueries[index]?.data?.title ?? nftId]));

  // Um pedido pendente para este carrinho não pode ser duplicado: o usuário acompanha o existente.
  useEffect(() => {
    if (reviewOpen && pendingOrder) setReviewOpen(false);
  }, [pendingOrder, reviewOpen]);

  const setField = (field: CheckoutField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const selectWallet = (wallet: Wallet) => {
    setValues((current) => prefillFromWallet(wallet, profile, current.note));
    setErrors({});
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateCheckoutForm(values, wallets);
    setErrors(nextErrors);
    const firstError = checkoutFieldOrder.find((field) => nextErrors[field]);
    if (firstError) {
      setDetailsOpen(true);
      // Espera o formulário mobile abrir antes de mover o foco.
      requestAnimationFrame(() => {
        const target = document.getElementById(`${FORM_ID}-${firstError}`)
          ?? document.getElementById(`provider-mobile-${values.provider || 'WalletConnect'}`);
        target?.focus();
      });
      return;
    }
    setReviewedQuote(quote);
    setReviewOpen(true);
  };

  const text = (field: CheckoutField, label: string, options: { type?: string; required?: boolean; placeholder?: string; hideLabel?: boolean; autoComplete?: string } = {}) => (
    <FormField id={`${FORM_ID}-${field}`} label={label} required={options.required ?? true} error={errors[field]} hideLabel={options.hideLabel}>
      {(props) => (
        <input
          {...props}
          type={options.type ?? 'text'}
          value={values[field]}
          placeholder={options.placeholder}
          autoComplete={options.autoComplete ?? 'off'}
          onChange={(event) => setField(field, event.target.value)}
          className={fieldInputClass}
        />
      )}
    </FormField>
  );

  const canReview = Boolean(quote) && !pendingOrder && !quoteQuery.isError;

  let summary: React.ReactNode;
  if (!cart) summary = <QuoteSkeleton />;
  else if (cart.issues.length > 0) {
    summary = (
      <StatusMessage role="alert" variant="error">
        Preço ou disponibilidade mudaram.{' '}
        <Link to="/carrinho" className="font-bold underline">Revise o carrinho</Link> antes de pagar.
      </StatusMessage>
    );
  } else if (quoteQuery.isError && !quoteQuery.isFetching) {
    summary = (
      <StatusMessage variant="error" role="alert">
        {errorMessage(quoteQuery.error, 'Não foi possível calcular a cotação.')}{' '}
        <Button type="button" variant="secondary" size="sm" onClick={() => void quoteQuery.refetch()}>Tentar novamente</Button>
      </StatusMessage>
    );
  } else summary = quote ? <QuoteValues quote={quote} /> : <QuoteSkeleton />;

  return (
    <form id={FORM_ID} onSubmit={submit} noValidate className="pb-[110px] md:pb-0">
      {pendingOrder && (
        <StatusMessage className="mt-6" role="status">
          Você já tem um pedido em processamento para este carrinho.{' '}
          <Link to="/pedidos/$orderId" params={{ orderId: pendingOrder.id }} className="font-bold text-primary underline-offset-4 hover:underline">
            Acompanhar pedido
          </Link>
        </StatusMessage>
      )}

      {/* Mobile: carteiras cadastradas (frame "Pagamento com carteira"). */}
      <section aria-labelledby="checkout-wallets-title" className="md:hidden">
        <div className="mt-4 flex items-center justify-between">
          <h2 id="checkout-wallets-title" className="text-base font-bold">Carteira conectada</h2>
          <Link to="/perfil/carteiras" className="text-[15px] font-bold text-primary">Trocar carteira</Link>
        </div>
        <ul className="mt-4 space-y-5" aria-label="Carteiras cadastradas">
          {[...wallets].sort((left, right) => (left.role === right.role ? 0 : left.role === 'secundaria' ? -1 : 1)).map((wallet) => {
            const selected = selectedWallet?.id === wallet.id;
            return (
              <li key={wallet.id}>
                <label htmlFor={`wallet-card-${wallet.id}`} className="relative flex min-h-[93px] cursor-pointer gap-4 rounded-[12px] bg-surface py-4 pl-5 pr-10" data-testid="checkout-wallet-card">
                  <input
                    id={`wallet-card-${wallet.id}`}
                    type="radio"
                    name="checkout-wallet"
                    checked={selected}
                    onChange={() => selectWallet(wallet)}
                    className={cn(radioClass, 'mt-[22px]')}
                  />
                  <span className="min-w-0">
                    <span className="block text-base font-bold">{walletRoleLabel(wallet)}</span>
                    <span className="mt-1.5 block text-sm leading-[22px] text-secondary">
                      {wallet.role === 'principal' ? shortAddress(wallet.address) : wallet.ensName}
                      <br />
                      {networkLabel(wallet.network)}
                    </span>
                  </span>
                  <EllipsisVertical aria-hidden="true" size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-secondary" />
                </label>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          aria-expanded={detailsOpen}
          aria-controls="checkout-collector"
          onClick={() => setDetailsOpen((open) => !open)}
          className="mt-5 flex w-full items-center justify-between rounded-[12px] border border-border px-5 py-3 text-left text-sm"
        >
          Dados do colecionador
          <ChevronDown aria-hidden="true" size={18} className={cn('transition-transform', detailsOpen && 'rotate-180')} />
        </button>
      </section>

      <div className="md:mt-[30px] lg:grid lg:grid-cols-[763px_405px] lg:justify-between">
        <section
          id="checkout-collector"
          aria-labelledby="checkout-collector-title"
          className={cn('max-md:mt-4', !detailsOpen && 'max-md:hidden')}
        >
          <h2 id="checkout-collector-title" className="text-lg font-bold max-md:sr-only">Perfil do colecionador</h2>
          <div className="mt-3 grid gap-x-6 gap-y-5 md:grid-cols-2">
            {text('displayName', 'Nome de exibição', { autoComplete: 'name' })}
            {text('username', 'Nome de usuário', { autoComplete: 'username' })}
            <FormField id={`${FORM_ID}-network`} label="Rede " required error={errors.network}>
              {(props) => (
                <SelectField {...props} value={values.network} onChange={(value) => setField('network', value)} placeholder="Selecione uma rede" options={walletNetworks} />
              )}
            </FormField>
            {text('profileName', 'Nome do perfil')}
            {text('walletAddress', 'Endereço da carteira', { placeholder: 'Endereço 0x da carteira' })}
            <div className="md:pt-[34px]">
              {text('alternateAddress', 'ENS ou carteira secundária (opcional)', { required: false, hideLabel: true, placeholder: 'ENS ou carteira secundária (opcional)' })}
            </div>
            <FormField id={`${FORM_ID}-provider`} label="Tipo de carteira" required error={errors.provider}>
              {(props) => (
                <SelectField {...props} value={values.provider} onChange={(value) => setField('provider', value)} placeholder="Selecione uma carteira" options={walletTypes} />
              )}
            </FormField>
            {text('referralCode', 'Código de indicação')}
            {text('email', 'E-mail', { type: 'email', autoComplete: 'email' })}
            <FormField id={`${FORM_ID}-ensLabel`} label="Nome ENS " required error={errors.ensLabel}>
              {(props) => (
                <div className="flex gap-2.5">
                  <div className="relative w-[78px] shrink-0">
                    <select aria-label="Domínio ENS" className={cn(fieldInputClass, 'appearance-none pr-7')} defaultValue=".eth">
                      <option value=".eth">.eth</option>
                    </select>
                    <ChevronDown aria-hidden="true" size={16} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
                  </div>
                  <input {...props} value={values.ensLabel} onChange={(event) => setField('ensLabel', event.target.value)} className={fieldInputClass} />
                </div>
              )}
            </FormField>
          </div>

          <label className="mt-6 inline-flex cursor-pointer items-center gap-2 text-[15px]">
            <input
              type="checkbox"
              checked={useOther}
              disabled={!secondary}
              onChange={(event) => {
                const wallet = event.target.checked ? secondary : principal;
                if (wallet) selectWallet(wallet);
              }}
              className="size-4 appearance-none rounded-full border-2 border-primary checked:bg-primary checked:shadow-[inset_0_0_0_2px_#140c09] disabled:opacity-50"
            />
            Usar outra carteira?
          </label>
          {!secondary && (
            <p className="mt-1 text-xs text-secondary">
              Nenhuma carteira secundária cadastrada. <Link to="/perfil/carteiras" className="text-primary underline">Cadastrar</Link>
            </p>
          )}

          <FormField id={`${FORM_ID}-note`} label="Observação do colecionador (opcional)" error={errors.note} className="mt-6 md:w-[350px]">
            {(props) => (
              <textarea
                {...props}
                value={values.note}
                maxLength={500}
                onChange={(event) => setField('note', event.target.value)}
                className={cn(fieldInputClass, 'h-[152px] resize-none py-2')}
              />
            )}
          </FormField>
        </section>

        <aside aria-labelledby="checkout-summary-title" className="mt-8 lg:mt-0">
          <h2 id="checkout-summary-title" className="text-lg font-bold max-md:hidden">Seus NFTs</h2>
          <div aria-hidden="true" className="mt-3 flex justify-between border-b border-border pb-2 text-[15px] font-bold max-md:hidden">
            <span>NFTs</span>
            <span>Subtotal</span>
          </div>
          <ul className="mt-2.5 space-y-3 max-md:hidden" aria-label="NFTs da compra">
            {cart?.items.map((item) => (
              <CheckoutItemRow key={`${item.nftId}:${item.editionId}`} item={item} nft={nftById.get(item.nftId)} />
            ))}
          </ul>

          <div className="mt-4 max-md:hidden">
            {cart && (showCoupon || cart.couponCode ? (
              <CouponForm cart={cart} />
            ) : (
              <p className="text-center text-[13px]">
                Tem um código promocional?{' '}
                <button type="button" className="text-foreground underline-offset-4 hover:text-primary hover:underline" onClick={() => setShowCoupon(true)}>
                  Aplique aqui
                </button>
              </p>
            ))}
          </div>
          <div className="mt-2 max-md:hidden" aria-busy={!quote ? true : undefined}>{summary}</div>

          <h2 className="mt-3 text-center text-[15px] font-bold max-md:mt-0 max-md:text-left max-md:text-base">Carteira e rede</h2>
          <fieldset className="mt-4">
            <legend className="sr-only">Provedor da carteira</legend>
            <div className="space-y-4 max-md:hidden">
              {providerOptions.map((option) => (
                <ProviderOption key={option.value} variant="desktop" option={option} selected={values.provider === option.value} onSelect={() => setField('provider', option.value)} />
              ))}
            </div>
            <div className="space-y-4 md:hidden">
              {providerOptions.map((option) => (
                <ProviderOption key={option.value} variant="mobile" option={option} selected={values.provider === option.value} onSelect={() => setField('provider', option.value)} />
              ))}
            </div>
          </fieldset>
          {errors.provider && <p className="mt-2 text-xs text-error md:hidden">{errors.provider}</p>}

          <div className="mt-5 md:hidden">
            {quote ? (
              <p className="flex justify-end gap-7 text-lg font-bold" data-testid="checkout-mobile-total">
                <span>Total:</span>
                <span className="text-primary">{formatEth(quote.totalEth, 3)} ETH</span>
              </p>
            ) : summary}
          </div>

          <div className="max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:bg-canvas max-md:px-7 max-md:pb-[max(env(safe-area-inset-bottom),1.25rem)] max-md:pt-3">
            <Button
              id="checkout-submit"
              type="submit"
              disabled={!canReview}
              className="mt-6 h-[45px] min-h-[45px] w-full rounded-[4px] text-[15px] font-bold text-canvas max-md:mt-0 max-md:h-[60px] max-md:rounded-full max-md:bg-gradient-to-r max-md:from-[#d28a4c] max-md:to-[#8a5a35] max-md:text-base"
            >
              Confirmar compra
            </Button>
          </div>
        </aside>
      </div>

      {selectedWallet && values.provider && values.network && (
        <ReviewDialog
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          userId={userId}
          cart={cart}
          quote={quoteQuery.data}
          quotePending={quoteQuery.isPending}
          reviewedQuote={reviewedQuote}
          wallet={selectedWallet}
          provider={values.provider}
          network={values.network}
          collector={collectorFrom(values)}
          connection={connection}
          onConnectionChange={setConnection}
          titles={titles}
        />
      )}
    </form>
  );
}
