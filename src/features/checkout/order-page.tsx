import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusMessage } from '@/components/ui/status-message';
import type { Order, OrderItem, OrderReceipt } from '@/domain/contracts';
import { useOrder, useReceipt } from '@/features/checkout/use-orders';
import { ApiError, errorMessage } from '@/lib/api-error';
import { compareDecimal, formatEth } from '@/lib/decimal';
import thankYouIcon from '@/assets/thank-you.svg';

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Data no formato do frame ("29 Jul, 2026"), no fuso do usuário. */
function formatReceiptDate(iso: string) {
  const date = new Date(iso);
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]}, ${date.getFullYear()}`;
}

/** Hash curto no formato do frame ("0xA91F…E82C"). */
function shortHash(hash: string) {
  return `0x${hash.slice(2, 6).toUpperCase()}…${hash.slice(-4).toUpperCase()}`;
}

const providerNames: Record<string, string> = { MetaMask: 'MetaMask', WalletConnect: 'WalletConnect', Coinbase: 'Coinbase Wallet' };

function OrderItems({ items }: { items: OrderItem[] }) {
  return (
    <ul className="mt-3 space-y-3" aria-label="NFTs do pedido">
      {items.map((item) => (
        <li key={`${item.nftId}:${item.editionId}`} className="flex items-center gap-3" data-testid="order-item">
          <div className="size-14 shrink-0 overflow-hidden rounded-[4px] md:size-[70px]">
            {item.imageUrl
              ? <img src={item.imageUrl} alt={`Arte do NFT ${item.title}`} className="size-full object-cover" />
              : <span className="grid size-full place-items-center bg-raised text-[10px] text-secondary">Sem imagem</span>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-5 md:truncate md:text-[15px]">{item.title}</p>
            {item.tokenId
              ? <p className="text-xs text-secondary md:truncate md:text-[13px]">ID do token: {item.tokenId}</p>
              : item.editionLabel && <p className="text-xs text-secondary md:truncate md:text-[13px]">Edição: {item.editionLabel}</p>}
          </div>
          <span className="w-10 shrink-0 text-center text-[13px] text-secondary md:w-[60px]" aria-label={`${item.quantity} edições`}>(x {item.quantity})</span>
          <span className="w-[84px] shrink-0 text-right text-[15px] font-bold text-primary md:w-[100px] md:text-[17px]">{formatEth(item.lineTotalEth)} ETH</span>
        </li>
      ))}
    </ul>
  );
}

/** Recibo confirmado (frame "Confirmação de Pedido"): reproduz o snapshot do pedido. */
function ReceiptDialog({ order, receipt }: { order: Order; receipt: OrderReceipt }) {
  const navigate = useNavigate();
  const hasDiscount = compareDecimal(receipt.quote.discountEth, '0') !== 0;
  const meta = [
    { label: 'ID da transação', value: shortHash(receipt.transactionReference), strong: true, title: receipt.transactionReference },
    { label: 'Data', value: formatReceiptDate(receipt.confirmedAt) },
    { label: 'Total', value: `${formatEth(receipt.quote.totalEth, 3)} ETH` },
    { label: 'Carteira', value: providerNames[receipt.provider] ?? receipt.provider, strong: true },
  ];

  return (
    <Dialog open onOpenChange={(open) => { if (!open) void navigate({ to: '/' }); }}>
      <DialogContent
        data-testid="receipt-dialog"
        overlayClassName="bg-canvas"
        closeLabel="Fechar recibo"
        closeClassName="right-3 top-3"
        className="inset-0 overflow-y-auto bg-surface font-mono md:inset-auto md:left-1/2 md:top-[166px] md:max-h-[calc(100vh-180px)] md:w-[578px] md:-translate-x-1/2"
      >
        <header className="flex h-[156px] flex-col items-center justify-end pb-[22px] max-md:mt-6">
          <img src={thankYouIcon} alt="" className="h-20 w-[65px]" />
          <DialogTitle className="mt-4 text-center text-[15px] font-bold text-secondary">Seus NFTs agora estão na sua carteira</DialogTitle>
        </header>
        <dl className="grid grid-cols-2 gap-y-3 border-y border-primary/80 px-6 py-3 md:flex md:h-[65px] md:items-center md:justify-between md:px-9 md:py-0">
          {meta.map((entry, index) => (
            <div key={entry.label} className={index > 0 ? 'md:border-l md:border-primary md:pl-4' : undefined}>
              <dt className={entry.strong ? 'text-[13px] font-bold text-secondary' : 'text-[13px] text-secondary'}>{entry.label}</dt>
              <dd className="text-[14px] text-secondary" title={entry.title} data-testid={`receipt-${index}`}>{entry.value}</dd>
            </div>
          ))}
        </dl>

        <section className="px-6 pb-12 pt-5 md:px-11" aria-labelledby="receipt-details-title">
          <h3 id="receipt-details-title" className="text-[15px] font-bold">Detalhes da transação</h3>
          <div aria-hidden="true" className="mt-3 flex border-b border-border pb-2 text-[15px] font-bold">
            <span className="flex-1">NFTs</span>
            <span className="w-[56px] text-center md:w-[80px]">Edições</span>
            <span className="w-[84px] text-right md:w-[100px]">Subtotal</span>
          </div>
          <OrderItems items={receipt.items} />
          <dl className="ml-auto mt-3 w-full max-w-[321px] space-y-1.5 border-b border-border pb-2" data-testid="receipt-totals">
            {hasDiscount && (
              <div className="flex justify-between text-[15px]"><dt>Desconto</dt><dd>(-) {formatEth(receipt.quote.discountEth, 3)} ETH</dd></div>
            )}
            <div className="flex justify-between text-[15px]"><dt>Taxa de rede</dt><dd>{formatEth(receipt.quote.networkFeeEth, 3)} ETH</dd></div>
            <div className="flex justify-between text-[17px] font-bold"><dt>Total</dt><dd className="text-primary" data-testid="receipt-total">{formatEth(receipt.quote.totalEth, 3)} ETH</dd></div>
          </dl>
          <DialogDescription className="mt-4 text-center text-[13px] leading-[22px] text-secondary">
            Transação confirmada na {receipt.network}. A propriedade foi transferida para sua carteira conectada e registrada na rede.
          </DialogDescription>
          <div className="mt-5 flex justify-center">
            <Button asChild className="h-12 rounded-[4px] px-4 text-[15px] font-bold text-canvas">
              <Link to="/pedidos/$orderId/transacao" params={{ orderId: order.id }} aria-label="Ver no Etherscan (explorador simulado)">
                Ver no Etherscan
              </Link>
            </Button>
          </div>
        </section>
        <div aria-hidden="true" className="h-2.5 bg-primary" />
      </DialogContent>
    </Dialog>
  );
}

function PendingOrder({ order }: { order: Order }) {
  return (
    <section aria-labelledby="order-title" className="mx-auto mt-10 max-w-[578px] rounded-[4px] bg-surface p-6 md:p-9" data-testid="order-pending">
      <div role="status" aria-live="polite" className="flex items-center gap-3">
        <Loader2 aria-hidden="true" className="animate-spin text-primary motion-reduce:animate-none" size={24} />
        <h1 id="order-title" className="text-lg font-bold">Pagamento em processamento</h1>
      </div>
      <p className="mt-3 text-sm leading-6 text-secondary">
        Aguardando a confirmação da rede {order.network}. A compra só é concluída quando a confirmação chegar.
        Você pode atualizar ou fechar a página: o pedido continua sendo acompanhado e não será cobrado de novo.
      </p>
      <p className="mt-3 text-xs text-secondary">Pedido {order.id}</p>
      <OrderItems items={order.items} />
      <p className="mt-4 flex justify-between border-t border-border pt-3 font-bold">
        <span>Total</span>
        <span className="text-primary">{formatEth(order.quote.totalEth, 3)} ETH</span>
      </p>
    </section>
  );
}

function RefusedOrder({ order }: { order: Order }) {
  const reason = order.failureReason === 'AVAILABILITY_CONFLICT'
    ? 'Uma ou mais edições ficaram indisponíveis antes da confirmação.'
    : 'O pagamento foi recusado pela carteira ou pela rede.';
  return (
    <section aria-labelledby="order-title" className="mx-auto mt-10 max-w-[578px] rounded-[4px] bg-surface p-6 md:p-9" data-testid="order-refused">
      <h1 id="order-title" className="text-lg font-bold">Pagamento não concluído</h1>
      <StatusMessage variant="error" role="alert" className="mt-4">
        {reason} Nenhum valor foi cobrado e os itens continuam no seu carrinho.
      </StatusMessage>
      <OrderItems items={order.items} />
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild><Link to="/pagamento">Tentar novamente</Link></Button>
        <Button asChild variant="secondary"><Link to="/carrinho">Voltar ao carrinho</Link></Button>
      </div>
    </section>
  );
}

function ConfirmedOrder({ order }: { order: Order }) {
  const receiptQuery = useReceipt(order.id, true);
  if (receiptQuery.isPending) {
    return (
      <div className="mx-auto mt-10 max-w-[578px]" aria-busy="true" data-testid="receipt-skeleton">
        <Skeleton className="h-[600px] w-full rounded-[4px]" />
      </div>
    );
  }
  if (receiptQuery.isError) {
    return (
      <StatusMessage variant="error" role="alert" className="mx-auto mt-10 max-w-[578px]">
        {errorMessage(receiptQuery.error, 'Não foi possível carregar o recibo.')}{' '}
        <Button type="button" variant="secondary" size="sm" onClick={() => void receiptQuery.refetch()}>Tentar novamente</Button>
      </StatusMessage>
    );
  }
  return <ReceiptDialog order={order} receipt={receiptQuery.data} />;
}

export function OrderPage() {
  const { orderId = '' } = useParams({ strict: false }) as { orderId?: string };
  const orderQuery = useOrder(orderId);

  let content: React.ReactNode;
  if (orderQuery.isPending) {
    content = <div className="mx-auto mt-10 max-w-[578px]" aria-busy="true"><Skeleton className="h-[320px] w-full rounded-[4px]" /></div>;
  } else if (orderQuery.isError) {
    const notFound = orderQuery.error instanceof ApiError && orderQuery.error.status === 404;
    content = (
      <StatusMessage variant="error" role="alert" className="mx-auto mt-10 max-w-[578px]">
        {notFound ? 'Pedido não encontrado.' : errorMessage(orderQuery.error, 'Não foi possível carregar o pedido.')}{' '}
        {notFound
          ? <Link to="/" className="font-bold underline">Voltar ao início</Link>
          : <Button type="button" variant="secondary" size="sm" onClick={() => void orderQuery.refetch()}>Tentar novamente</Button>}
      </StatusMessage>
    );
  } else if (orderQuery.data.status === 'confirmado') {
    content = <ConfirmedOrder order={orderQuery.data} />;
  } else if (orderQuery.data.status === 'recusado') {
    content = <RefusedOrder order={orderQuery.data} />;
  } else {
    content = <PendingOrder order={orderQuery.data} />;
  }

  return (
    <div className="w-full px-4 pb-16 font-mono" data-order-status={orderQuery.data?.status}>
      {content}
    </div>
  );
}
