/**
 * Registro de recursos vinculados à sessão autenticada (listeners e conexões Socket.IO
 * autenticadas). Logout, troca de usuário e expiração descartam tudo o que foi registrado,
 * para que eventos da sessão anterior não alcancem a sessão atual.
 */
const disposers = new Map<symbol, { userId: string; dispose: () => void }>();

export function registerSessionSubscription(userId: string, dispose: () => void) {
  const key = Symbol(userId);
  disposers.set(key, { userId, dispose });
  return () => {
    const entry = disposers.get(key);
    if (!entry) return;
    disposers.delete(key);
    entry.dispose();
  };
}

export function disposeSessionSubscriptions(exceptUserId?: string) {
  for (const [key, entry] of disposers) {
    if (exceptUserId !== undefined && entry.userId === exceptUserId) continue;
    disposers.delete(key);
    entry.dispose();
  }
}

export function activeSessionSubscriptionCount() {
  return disposers.size;
}
