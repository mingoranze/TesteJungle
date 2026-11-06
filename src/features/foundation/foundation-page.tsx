import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusMessage } from '@/components/ui/status-message';
import { emitFoundationEvent, getFoundationState, resetFoundationProof } from '@/features/foundation/api';
import { useFoundationEvents } from '@/features/foundation/use-foundation-events';
import { useMarketplaceEvents } from '@/features/foundation/use-marketplace-events';
import { foundationKeys } from '@/lib/query-keys';

export function FoundationPage() {
  const queryClient = useQueryClient();
  const { connected } = useFoundationEvents();
  const marketplaceEvents = useMarketplaceEvents();
  const stateQuery = useQuery({
    queryKey: foundationKeys.state,
    queryFn: ({ signal }) => getFoundationState(signal),
  });
  const eventMutation = useMutation({ mutationFn: emitFoundationEvent });
  const resetMutation = useMutation({
    mutationFn: resetFoundationProof,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: foundationKeys.state }),
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Prova de rede</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Fundação técnica
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-secondary sm:text-base sm:leading-7">
          Este ambiente demonstra REST via Axios/MSW e atualização via Socket.IO. Os dados são
          descartáveis e não representam funcionalidades do marketplace.
        </p>
      </header>

      <Card>
        <section aria-labelledby="rest-title">
          <CardHeader>
            <CardTitle id="rest-title">REST · Axios + MSW</CardTitle>
            <CardDescription>Estado de prova obtido pela camada de API simulada.</CardDescription>
          </CardHeader>
          <CardContent>
            {stateQuery.isPending ? (
              <div role="status" aria-label="Carregando estado simulado" className="space-y-3">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : stateQuery.isError ? (
              <StatusMessage role="alert" variant="error">
                {stateQuery.error.message}
              </StatusMessage>
            ) : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <dt className="text-secondary">Estado</dt>
                <dd data-testid="foundation-status" className="font-medium text-foreground">
                  {stateQuery.data.status}
                </dd>
                <dt className="text-secondary">Versão</dt>
                <dd data-testid="foundation-version" className="font-medium text-foreground">
                  {stateQuery.data.version}
                </dd>
              </dl>
            )}
          </CardContent>
        </section>
      </Card>

      <Card>
        <section aria-labelledby="socket-title">
          <CardHeader>
            <CardTitle id="socket-title">Tempo real · Socket.IO</CardTitle>
            <CardDescription>
              Conexão:{' '}
              <span data-testid="socket-status" className="font-medium text-foreground">
                {connected ? 'conectado' : 'conectando'}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => eventMutation.mutate()}
                disabled={!connected || eventMutation.isPending || stateQuery.isPending}
              >
                {eventMutation.isPending ? 'Enviando…' : 'Emitir evento simulado'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
              >
                Resetar cenário
              </Button>
            </div>
            {eventMutation.isError && (
              <StatusMessage role="alert" variant="error" className="mt-4">
                {eventMutation.error.message}
              </StatusMessage>
            )}
            {resetMutation.isError && (
              <StatusMessage role="alert" variant="error" className="mt-4">
                {resetMutation.error.message}
              </StatusMessage>
            )}
          </CardContent>
        </section>
      </Card>

      <Card>
        <section aria-labelledby="marketplace-events-title">
          <CardHeader>
            <CardTitle id="marketplace-events-title">Eventos simulados do marketplace</CardTitle>
            <CardDescription>
              Conexão: <span data-testid="marketplace-socket-status" className="font-medium text-foreground">
                {marketplaceEvents.connected ? 'conectado' : 'conectando'}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 text-sm">
              <dt className="text-secondary">Último evento</dt>
              <dd data-testid="marketplace-event-name" className="text-right text-foreground">
                {marketplaceEvents.lastEvent?.name ?? 'nenhum'}
              </dd>
              <dt className="text-secondary">Recurso</dt>
              <dd
                data-testid="marketplace-event-resource"
                className="break-all text-right text-foreground"
              >
                {marketplaceEvents.lastEvent?.event.resource.id ?? 'nenhum'}
              </dd>
              <dt className="text-secondary">Versão</dt>
              <dd
                data-testid="marketplace-event-version"
                className="text-right text-foreground"
              >
                {marketplaceEvents.lastEvent?.event.version ?? '—'}
              </dd>
            </dl>
          </CardContent>
        </section>
      </Card>
    </div>
  );
}
