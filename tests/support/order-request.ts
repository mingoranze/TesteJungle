/** Utilitários para montar pedidos válidos nos testes de API (Node + MSW). */
export type ApiCall = (path: string, init?: RequestInit) => Promise<Response>;

export const anaPrimaryWallet = {
  id: 'wallet-ana-main',
  address: '0x1111111111111111111111111111111111111111',
  network: 'Ethereum',
  provider: 'MetaMask',
} as const;

export const anaCollector = {
  displayName: 'Ana Silva',
  username: 'ana.silva',
  profileName: 'ana.silva',
  email: 'ana@kurio.test',
  ensName: 'anasilva.eth',
  referralCode: 'KURIO-ANA',
  alternateAddress: null,
  note: null,
};

export async function connectWallet(
  api: ApiCall,
  cookie: string,
  wallet: { id: string; network: string; provider: string } = anaPrimaryWallet,
) {
  const response = await api('/wallet-connections', {
    method: 'POST',
    headers: { Cookie: cookie },
    body: JSON.stringify({ walletId: wallet.id, provider: wallet.provider, network: wallet.network }),
  });
  if (response.status !== 201) throw new Error(`Conexão da carteira falhou: ${response.status}`);
  return (await response.json()) as { id: string };
}

/** Corpo de `POST /orders` com a cotação atual do carrinho (o que o usuário revisou). */
export async function reviewedOrderBody(api: ApiCall, cookie: string, connectionId: string, overrides: Record<string, unknown> = {}) {
  const cart = await (await api('/cart', { headers: { Cookie: cookie } })).json();
  const quote = await (await api('/quotes', { method: 'POST', headers: { Cookie: cookie }, body: '{}' })).json();
  return {
    walletAddress: anaPrimaryWallet.address,
    connectionId,
    network: anaPrimaryWallet.network,
    provider: anaPrimaryWallet.provider,
    cartVersion: cart.version,
    expectedTotalEth: quote.totalEth,
    couponCode: cart.couponCode,
    collector: anaCollector,
    ...overrides,
  };
}
