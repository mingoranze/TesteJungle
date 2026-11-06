import { Link, useParams } from '@tanstack/react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusMessage } from '@/components/ui/status-message';
import { useOrder, useReceipt } from '@/features/checkout/use-orders';
import { errorMessage } from '@/lib/api-error';
import { formatEth } from '@/lib/decimal';

/** Endereço fictício do contrato do marketplace na simulação (não existe em nenhuma rede real). */
const SIMULATED_MARKETPLACE_CONTRACT = '0x0000000000000000000000000000000000004b52';

/**
 * Explorador de blocos simulado: destino do botão "Ver no Etherscan" do recibo. Mostra somente o
 * snapshot do pedido confirmado e deixa claro que nenhuma transação real foi registrada.
 */
export function TransactionPage() {
  const { orderId = '' } = useParams({ strict: false }) as { orderId?: string };
  const orderQuery = useOrder(orderId);
  const confirmed = orderQuery.data?.status === 'confirmado';
  const receiptQuery = useReceipt(orderId, confirmed);

  let content: React.ReactNode;
  if (orderQuery.isPending || (confirmed && receiptQuery.isPending)) {
    content = <Skeleton className="h-[360px] w-full rounded-[4px]" />;
  } else if (orderQuery.isError || receiptQuery.isError || !confirmed || !receiptQuery.data) {
    content = (
      <StatusMessage variant="error" role="alert">
        {orderQuery.isError || receiptQuery.isError
          ? errorMessage(orderQuery.error ?? receiptQuery.error, 'Não foi possível carregar a transação.')
          : 'Este pedido ainda não tem transação confirmada.'}
      </StatusMessage>
    );
  } else {
    const receipt = receiptQuery.data;
    const rows: Array<[string, React.ReactNode]> = [
      ['Hash da transação', <span className="break-all" data-testid="tx-hash">{receipt.transactionReference}</span>],
      ['Status', <span className="text-[#5ccf7a]">Sucesso</span>],
      ['Bloco', receipt.blockNumber.toLocaleString('pt-BR')],
      ['Data', new Date(receipt.confirmedAt).toLocaleString('pt-BR')],
      ['Rede', receipt.network],
      ['De', <span className="break-all">{receipt.walletAddress}</span>],
      ['Para (contrato simulado)', <span className="break-all">{SIMULATED_MARKETPLACE_CONTRACT}</span>],
      ['Valor', `${formatEth(receipt.quote.totalEth, 3)} ETH`],
      ['Taxa de rede', `${formatEth(receipt.quote.networkFeeEth, 3)} ETH`],
      ['Tokens', receipt.items.map((item) => `${item.title} ×${item.quantity}`).join(', ')],
    ];
    content = (
      <dl className="divide-y divide-border rounded-[4px] border border-border bg-surface">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 px-4 py-3 text-sm md:grid-cols-[220px_1fr]">
            <dt className="text-secondary">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <section aria-labelledby="tx-title" className="mx-auto w-full max-w-[900px] px-4 py-10 font-mono">
      <h1 id="tx-title" className="text-2xl font-bold">Explorador de blocos simulado</h1>
      <p className="mt-2 text-sm text-secondary">
        Ambiente de demonstração: os dados abaixo vêm da simulação e não correspondem a uma transação real na blockchain.
      </p>
      <div className="mt-6">{content}</div>
      <p className="mt-6">
        <Link to="/pedidos/$orderId" params={{ orderId }} className="text-primary underline-offset-4 hover:underline">
          Voltar ao recibo
        </Link>
      </p>
    </section>
  );
}
