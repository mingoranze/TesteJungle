export const marketplaceNetworkScenarios = [
  { id: 'success', label: 'Sucesso padrão' },
  { id: 'empty-catalog', label: 'Catálogo vazio' },
  { id: 'variable-latency', label: 'Latência variável' },
  { id: 'out-of-order', label: 'Respostas fora de ordem' },
  { id: 'timeout', label: 'Timeout de rede' },
  { id: 'unavailable', label: 'Serviço indisponível' },
  { id: 'http-4xx', label: 'Erro HTTP 4xx' },
  { id: 'http-5xx', label: 'Erro HTTP 5xx' },
  { id: 'session-expired', label: 'Sessão expirada' },
  { id: 'registration-conflict', label: 'Conflito de cadastro' },
  { id: 'coupon-invalid', label: 'Cupom inválido' },
  { id: 'coupon-expired', label: 'Cupom expirado' },
  { id: 'price-change', label: 'Mudança de preço' },
  { id: 'edition-sold-out', label: 'Edição esgotada' },
  { id: 'order-timeout-after-create', label: 'Timeout após criar pedido' },
  { id: 'order-confirm', label: 'Confirmar pedido' },
  { id: 'order-refuse', label: 'Recusar pedido' },
  { id: 'payment-refused', label: 'Pagamento recusado pela rede' },
  { id: 'wallet-connection-refused', label: 'Carteira recusa a conexão' },
  { id: 'wallet-disconnect', label: 'Carteira desconecta no envio' },
] as const;

export type MarketplaceNetworkScenarioId = typeof marketplaceNetworkScenarios[number]['id'];

export function isMarketplaceNetworkScenarioId(value: unknown): value is MarketplaceNetworkScenarioId {
  return typeof value === 'string'
    && marketplaceNetworkScenarios.some((scenario) => scenario.id === value);
}
