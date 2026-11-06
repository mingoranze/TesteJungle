import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Loader2, PlugZap, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { StatusMessage } from '@/components/ui/status-message';
import {
  decimalString,
  type CartResponse,
  type CollectorDetails,
  type CreateOrderRequest,
  type Quote,
  type Wallet,
  type WalletConnection,
  type WalletNetwork,
  type WalletType,
} from '@/domain/contracts';
import { QuoteSkeleton, QuoteValues } from '@/features/cart/quote-summary';
import { cartKeys, useReconcileCart } from '@/features/cart/use-cart';
import { shortAddress } from '@/features/checkout/checkout-form';
import { attemptKeyFor } from '@/features/checkout/order-attempt';
import {
  isTransientOrderError,
  useConnectWallet,
  useDisconnectWallet,
  useSubmitOrder,
} from '@/features/checkout/use-orders';
import { ApiError, errorMessage } from '@/lib/api-error';
import { formatEth } from '@/lib/decimal';

interface ReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  cart: CartResponse | undefined;
  /** Cotação atual do carrinho (revalidada ao abrir a revisão). */
  quote: Quote | undefined;
  quotePending: boolean;
  /** Valores que o usuário viu na tela antes de pedir a revisão. */
  reviewedQuote: Quote | undefined;
  wallet: Wallet;
  provider: WalletType;
  network: WalletNetwork;
  collector: CollectorDetails;
  connection: WalletConnection | null;
  onConnectionChange: (connection: WalletConnection | null) => void;
  titles: ReadonlyMap<string, string>;
}

function sameQuote(left: Quote | undefined, right: Quote | undefined) {
  return Boolean(left && right && left.cartVersion === right.cartVersion
    && left.totalEth === right.totalEth && left.couponCode === right.couponCode);
}

function connectionMatches(connection: WalletConnection | null, wallet: Wallet, provider: WalletType, network: WalletNetwork) {
  return Boolean(connection && connection.walletId === wallet.id && connection.provider === provider && connection.network === network);
}

/**
 * Revisão antes do envio: mostra a cotação revalidada pela API, exige nova confirmação quando os
 * valores mudaram, conecta a carteira (simulação com recusa/desconexão) e envia o pedido com a
 * chave de idempotência da tentativa.
 */
export function ReviewDialog({
  open,
  onOpenChange,
  userId,
  cart,
  quote,
  quotePending,
  reviewedQuote,
  wallet,
  provider,
  network,
  collector,
  connection,
  onConnectionChange,
  titles,
}: ReviewDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const connectMutation = useConnectWallet();
  const disconnectMutation = useDisconnectWallet();
  const submitMutation = useSubmitOrder();
  const reconcileMutation = useReconcileCart();
  const [acceptedQuote, setAcceptedQuote] = useState<Quote | undefined>(reviewedQuote);
  const [message, setMessage] = useState<{ text: string; variant: 'neutral' | 'error' }>();
  const [pendingRetry, setPendingRetry] = useState(false);
  const submittingRef = useRef(false);

  // Ao abrir, revalida carrinho e cotação no servidor (preço, disponibilidade, cupom e taxas).
  useEffect(() => {
    if (!open) return;
    setAcceptedQuote(reviewedQuote);
    setMessage(undefined);
    setPendingRetry(false);
    void queryClient.invalidateQueries({ queryKey: cartKeys.current(userId) });
    // Só ao abrir: a cotação vista na tela é o ponto de partida desta revisão.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const connected = connectionMatches(connection, wallet, provider, network);
  const hasIssues = Boolean(cart && cart.issues.length > 0);
  const currentQuote = quote && cart && quote.cartVersion === cart.version && !hasIssues ? quote : undefined;
  const changed = Boolean(currentQuote && !sameQuote(currentQuote, acceptedQuote));
  const busy = submitMutation.isPending || connectMutation.isPending || disconnectMutation.isPending;
  const canPay = Boolean(currentQuote) && !changed && connected && !busy;

  const connect = () => {
    setMessage(undefined);
    connectMutation.mutate({ walletId: wallet.id, provider, network }, {
      onSuccess: (result) => onConnectionChange(result),
      onError: (error) => setMessage({
        variant: 'error',
        text: error instanceof ApiError && error.code === 'WALLET_CONNECTION_REJECTED'
          ? `A conexão foi recusada na ${provider}. Aprove a solicitação na carteira e tente novamente.`
          : errorMessage(error, 'Não foi possível conectar a carteira. Tente novamente.'),
      }),
    });
  };

  const disconnect = () => {
    if (!connection) return;
    const current = connection;
    onConnectionChange(null);
    setMessage({ variant: 'neutral', text: `${provider} desconectada. Conecte novamente para concluir a compra.` });
    disconnectMutation.mutate(current.id);
  };

  const pay = () => {
    if (!currentQuote || !connection || submittingRef.current) return;
    submittingRef.current = true;
    setMessage(undefined);
    const request: CreateOrderRequest = {
      walletAddress: wallet.address,
      connectionId: connection.id,
      network,
      provider,
      cartVersion: currentQuote.cartVersion,
      expectedTotalEth: decimalString(currentQuote.totalEth),
      couponCode: currentQuote.couponCode,
      collector,
    };
    const key = attemptKeyFor(userId, request);
    submitMutation.mutate({ userId, request, key }, {
      onSuccess: (order) => {
        onOpenChange(false);
        void navigate({ to: '/pedidos/$orderId', params: { orderId: order.id }, replace: true });
      },
      onError: (error) => {
        if (isTransientOrderError(error)) {
          setPendingRetry(true);
          setMessage({
            variant: 'error',
            text: 'Não recebemos a confirmação do envio. Tentar novamente usa a mesma solicitação e não cria um pedido duplicado.',
          });
          return;
        }
        if (!(error instanceof ApiError)) {
          setMessage({ variant: 'error', text: 'Não foi possível enviar o pedido.' });
          return;
        }
        if (error.code === 'ORDER_ALREADY_PENDING') {
          const orderId = (error.details as { orderId?: unknown } | undefined)?.orderId;
          if (typeof orderId === 'string') {
            onOpenChange(false);
            void navigate({ to: '/pedidos/$orderId', params: { orderId }, replace: true });
            return;
          }
        }
        if (error.code === 'WALLET_DISCONNECTED') onConnectionChange(null);
        if (['QUOTE_CHANGED', 'CART_OUT_OF_DATE', 'AVAILABILITY_CONFLICT', 'CART_EMPTY', 'COUPON_INVALID', 'COUPON_EXPIRED'].includes(error.code)) {
          void queryClient.invalidateQueries({ queryKey: cartKeys.current(userId) });
        }
        setMessage({
          variant: 'error',
          text: error.code === 'QUOTE_CHANGED' || error.code === 'CART_OUT_OF_DATE'
            ? 'Os valores mudaram antes do envio. Revise a nova cotação e confirme novamente.'
            : error.message,
        });
      },
      onSettled: () => {
        submittingRef.current = false;
      },
    });
  };

  let quoteBody: React.ReactNode;
  if (hasIssues && cart) {
    quoteBody = (
      <div role="alert" className="rounded-lg border border-primary/60 bg-primary/10 p-4 text-sm" data-testid="review-issues">
        <p className="font-bold text-accent">Preço ou disponibilidade mudaram desde a revisão.</p>
        <ul className="mt-2 space-y-1 text-secondary">
          {cart.issues.map((issue) => (
            <li key={`${issue.nftId}:${issue.editionId}`}>
              {titles.get(issue.nftId) ?? issue.nftId}:{' '}
              {issue.kinds.includes('unavailable')
                ? 'esgotado'
                : issue.kinds.includes('quantity-exceeds')
                  ? `apenas ${issue.availableQuantity} disponíveis`
                  : `de ${formatEth(issue.unitPriceEth)} para ${formatEth(issue.currentPriceEth)} ETH`}
            </li>
          ))}
        </ul>
        <Button
          type="button"
          size="sm"
          className="mt-3"
          disabled={reconcileMutation.isPending}
          onClick={() => reconcileMutation.mutate(undefined, {
            onError: (error) => setMessage({ variant: 'error', text: errorMessage(error, 'Não foi possível atualizar o carrinho.') }),
          })}
        >
          Aceitar alterações e recalcular
        </Button>
      </div>
    );
  } else if (currentQuote) {
    quoteBody = <QuoteValues quote={currentQuote} />;
  } else if (!quotePending && cart?.items.length === 0) {
    quoteBody = <StatusMessage>Seu carrinho está vazio. <Link to="/" className="text-primary underline">Explorar o mercado</Link></StatusMessage>;
  } else {
    quoteBody = <QuoteSkeleton />;
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitMutation.isPending && onOpenChange(next)}>
      <DialogContent
        data-testid="review-dialog"
        onCloseAutoFocus={(event) => {
          // O diálogo abre pelo envio do formulário (sem DialogTrigger): devolve o foco ao botão que o abriu.
          const trigger = document.getElementById('checkout-submit');
          if (trigger) {
            event.preventDefault();
            trigger.focus();
          }
        }}
        overlayClassName="bg-black/70"
        className="inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-[2rem] px-6 pb-8 pt-10 font-mono md:inset-auto md:left-1/2 md:top-1/2 md:w-[560px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[4px] md:px-9"
      >
        <DialogTitle className="text-lg font-bold">Revisar compra</DialogTitle>
        <DialogDescription className="mt-1 text-[13px] text-secondary">
          Confira os valores revalidados, conecte a carteira e confirme o pagamento.
        </DialogDescription>

        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
          <dt className="text-secondary">Carteira</dt>
          <dd className="text-right" data-testid="review-wallet">{wallet.nickname} · {shortAddress(wallet.address)}</dd>
          <dt className="text-secondary">Rede</dt>
          <dd className="text-right">{network}</dd>
          <dt className="text-secondary">Provedor</dt>
          <dd className="text-right">{provider}</dd>
          <dt className="text-secondary">Itens</dt>
          <dd className="text-right">{cart?.items.reduce((total, item) => total + item.quantity, 0) ?? '—'} edições</dd>
        </dl>

        <section aria-label="Valores revalidados" className="mt-5 border-t border-border pt-4" aria-busy={!currentQuote && !hasIssues ? true : undefined}>
          {quoteBody}
          {changed && currentQuote && (
            <div role="alert" className="mt-4 rounded-lg border border-primary/60 bg-primary/10 p-4 text-sm" data-testid="review-quote-changed">
              <p className="font-bold text-accent">Os valores mudaram desde a sua revisão.</p>
              {acceptedQuote && (
                <p className="mt-1 text-secondary">
                  Total anterior: {formatEth(acceptedQuote.totalEth, 3)} ETH · novo total: {formatEth(currentQuote.totalEth, 3)} ETH
                </p>
              )}
              <Button type="button" size="sm" className="mt-3" onClick={() => { setAcceptedQuote(currentQuote); setMessage(undefined); }}>
                Confirmar novos valores
              </Button>
            </div>
          )}
        </section>

        <section aria-labelledby="review-connection-title" className="mt-5 rounded-[4px] border border-border p-4">
          <h3 id="review-connection-title" className="text-sm font-bold">Conexão da carteira</h3>
          {connected && connection ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-[13px]">
              <p role="status" data-testid="wallet-connection-status">
                <span className="mr-2 inline-block size-2 rounded-full bg-[#5ccf7a]" aria-hidden="true" />
                {provider} conectada · {shortAddress(connection.address)} · {network}
              </p>
              <Button type="button" variant="ghost" size="sm" onClick={disconnect} disabled={busy}>
                <Unplug aria-hidden="true" size={16} /> Desconectar
              </Button>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-[13px]">
              <p className="text-secondary">Carteira não conectada.</p>
              <Button type="button" variant="secondary" size="sm" onClick={connect} disabled={busy}>
                {connectMutation.isPending
                  ? <Loader2 aria-hidden="true" size={16} className="animate-spin" />
                  : <PlugZap aria-hidden="true" size={16} />}
                Conectar {provider}
              </Button>
            </div>
          )}
        </section>

        {message && (
          <StatusMessage className="mt-4" variant={message.variant} role={message.variant === 'error' ? 'alert' : 'status'}>
            {message.text}
          </StatusMessage>
        )}
        {submitMutation.isPending && (
          <p role="status" className="mt-4 text-[13px] text-secondary">Enviando pedido… não feche esta janela.</p>
        )}

        <Button
          type="button"
          className="mt-6 h-[45px] min-h-[45px] w-full rounded-[4px] text-[15px] font-bold text-canvas"
          disabled={!canPay}
          aria-disabled={!canPay}
          onClick={pay}
          data-testid="confirm-payment"
        >
          {submitMutation.isPending
            ? 'Enviando pedido…'
            : pendingRetry
              ? 'Tentar novamente'
              : currentQuote
                ? `Pagar ${formatEth(currentQuote.totalEth, 3)} ETH`
                : 'Pagar'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
