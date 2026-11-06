import { idempotencyKey, type CreateOrderRequest, type IdempotencyKey } from '@/domain/contracts';

/**
 * Tentativa de compra em andamento, por usuário, guardada no `sessionStorage`: enquanto o
 * conteúdo revisado for o mesmo, a mesma `Idempotency-Key` é reutilizada — em cliques repetidos,
 * em reenvios após timeout e mesmo depois de um refresh. Conteúdo diferente gera uma nova chave.
 * A conexão da carteira é transitória e fica fora da comparação (como na API).
 */
interface StoredAttempt {
  key: string;
  fingerprint: string;
}

const storageKey = (userId: string) => `kurio.checkout.attempt.${userId}`;

export function orderFingerprint(request: CreateOrderRequest) {
  return JSON.stringify({ ...request, connectionId: undefined });
}

function readAttempt(userId: string): StoredAttempt | undefined {
  try {
    const raw = window.sessionStorage.getItem(storageKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    if (typeof parsed === 'object' && parsed !== null
      && typeof (parsed as StoredAttempt).key === 'string'
      && typeof (parsed as StoredAttempt).fingerprint === 'string') {
      return parsed as StoredAttempt;
    }
  } catch {
    // Armazenamento indisponível: a chave vale só para esta página.
  }
  return undefined;
}

let memoryAttempt: (StoredAttempt & { userId: string }) | undefined;

export function attemptKeyFor(userId: string, request: CreateOrderRequest): IdempotencyKey {
  const fingerprint = orderFingerprint(request);
  const stored = readAttempt(userId)
    ?? (memoryAttempt?.userId === userId ? memoryAttempt : undefined);
  if (stored?.fingerprint === fingerprint) return idempotencyKey(stored.key);

  const attempt = { key: idempotencyKey(), fingerprint };
  memoryAttempt = { ...attempt, userId };
  try {
    window.sessionStorage.setItem(storageKey(userId), JSON.stringify(attempt));
  } catch {
    // Sem persistência: segue com a chave em memória.
  }
  return attempt.key;
}

/** Encerra a tentativa depois que a API confirmou a criação (ou recuperação) do pedido. */
export function clearOrderAttempt(userId: string) {
  if (memoryAttempt?.userId === userId) memoryAttempt = undefined;
  try {
    window.sessionStorage.removeItem(storageKey(userId));
  } catch {
    // Nada a limpar.
  }
}
