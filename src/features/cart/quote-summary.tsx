import { useState, type FormEvent } from 'react';
import type { CartResponse, Quote } from '@/domain/contracts';
import { Skeleton } from '@/components/ui/skeleton';
import { useApplyCoupon, useRemoveCoupon } from '@/features/cart/use-cart';
import { ApiError, errorMessage } from '@/lib/api-error';
import { compareDecimal, formatEth } from '@/lib/decimal';
import { cn } from '@/lib/utils';

/** Partes do resumo de cotação e do cupom, compartilhadas entre carrinho e pagamento. */

export function SummaryRow({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <>
      <dt className={cn('flex min-h-8 items-center', strong && 'pt-5 font-bold')}>{label}</dt>
      <dd className={cn(
        'flex min-h-8 flex-col justify-center text-right leading-6',
        strong ? 'pt-5 text-lg font-bold text-primary' : 'text-[15px] md:text-lg',
      )}>
        {children}
      </dd>
    </>
  );
}

export function QuoteValues({ quote }: { quote: Quote }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] text-[15px] max-md:gap-y-1" data-testid="quote-summary">
      <SummaryRow label="Subtotal"><span data-testid="quote-subtotal">{formatEth(quote.subtotalEth)} ETH</span></SummaryRow>
      <SummaryRow label="Desconto do lançamento">
        <span data-testid="quote-discount" className="md:text-[15px]">
          (-) {compareDecimal(quote.discountEth, '0') === 0 ? '00.00' : formatEth(quote.discountEth)}
        </span>
      </SummaryRow>
      <SummaryRow label="Taxa de rede">
        <span data-testid="quote-fee">{formatEth(quote.networkFeeEth, 3)} ETH</span>
        <span className="text-[11px] text-primary">Taxa estimada</span>
      </SummaryRow>
      <SummaryRow label="Total" strong><span data-testid="quote-total">{formatEth(quote.totalEth, 3)} ETH</span></SummaryRow>
    </dl>
  );
}

export function QuoteSkeleton() {
  return (
    <div data-testid="quote-skeleton" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex h-8 items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
      <Skeleton className="ml-auto h-3 w-16" />
      <div className="flex h-[52px] items-end justify-between">
        <Skeleton className="h-5 w-14" />
        <Skeleton className="h-6 w-24" />
      </div>
    </div>
  );
}

export function CouponForm({ cart }: { cart: CartResponse }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const applyMutation = useApplyCoupon();
  const removeMutation = useRemoveCoupon();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const couponCode = code.trim();
    if (!couponCode) {
      setError('Informe o código promocional.');
      return;
    }
    setError(undefined);
    applyMutation.mutate(couponCode, {
      onSuccess: () => setCode(''),
      onError: (mutationError) => setError(
        mutationError instanceof ApiError && mutationError.code === 'COUPON_EXPIRED'
          ? 'Este cupom expirou.'
          : mutationError instanceof ApiError && mutationError.code === 'COUPON_INVALID'
            ? 'Cupom inválido. Confira o código e tente novamente.'
            : errorMessage(mutationError, 'Não foi possível aplicar o cupom. Tente novamente.'),
      ),
    });
  };

  if (cart.couponCode) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-sm border border-border px-3 py-2 text-sm max-md:rounded-full">
        <p role="status">Cupom <strong className="text-primary">{cart.couponCode}</strong> aplicado.</p>
        <button
          type="button"
          className="text-primary underline-offset-4 hover:underline disabled:opacity-50"
          disabled={removeMutation.isPending}
          onClick={() => removeMutation.mutate(undefined, {
            onError: (mutationError) => setError(errorMessage(mutationError, 'Não foi possível remover o cupom.')),
          })}
        >
          Remover cupom
        </button>
        {error && <p role="alert" className="sr-only">{error}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor="coupon-code" className="mb-2 block text-[13px] font-bold max-md:sr-only">Código promocional</label>
      <div className="flex h-10 max-md:h-[50px] max-md:rounded-full max-md:border max-md:border-border max-md:bg-canvas/40">
        <input
          id="coupon-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Digite o código promocional..."
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'coupon-error' : undefined}
          className="min-w-0 flex-1 rounded-l-sm border border-r-0 border-primary bg-transparent px-2 text-[11px] text-foreground outline-none transition-colors placeholder:text-secondary/80 hover:bg-white/5 focus:bg-white/5 focus:outline-none focus-visible:outline-none aria-invalid:border-error max-md:rounded-l-full max-md:border-0 max-md:px-4 max-md:text-[13px]"
        />
        <button
          type="submit"
          disabled={applyMutation.isPending}
          className="rounded-r-sm bg-primary px-5 text-[15px] font-bold text-canvas outline-none transition-colors hover:bg-accent focus:outline-none focus-visible:bg-accent focus-visible:outline-none active:bg-accent disabled:opacity-60 max-md:m-0 max-md:rounded-full max-md:bg-gradient-to-r max-md:from-[#d28a4c] max-md:to-[#8a5a35] max-md:px-4 max-md:text-foreground"
        >
          Aplicar
        </button>
      </div>
      {error && <p id="coupon-error" role="alert" className="mt-2 text-xs text-error">{error}</p>}
    </form>
  );
}
