import { ApiError } from '@/lib/api-error';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const USERNAME_PATTERN = /^[a-z0-9_.-]{3,30}$/i;
export const ENS_LABEL_PATTERN = /^[a-z0-9-]{3,63}$/;
export const WALLET_ADDRESS_PATTERN = /^0x[a-f\d]{40}$/i;
export const ENS_NAME_PATTERN = /^[a-z0-9-]{3,63}\.eth$/;
export const REFERRAL_PATTERN = /^[a-z0-9-]{4,20}$/i;

/** Parte do nome ENS sem o sufixo `.eth`, exibida no campo ao lado do seletor de domínio. */
export function ensLabel(ensName: string | null | undefined) {
  return ensName ? ensName.replace(/\.eth$/, '') : '';
}

/** Extrai `details.fields` de erros da API, renomeando campos do contrato para os do formulário. */
export function apiFieldErrors(error: unknown, rename: Record<string, string> = {}) {
  if (!(error instanceof ApiError) || typeof error.details !== 'object' || error.details === null) return {};
  const fields = (error.details as { fields?: unknown }).fields;
  if (typeof fields !== 'object' || fields === null) return {};
  return Object.fromEntries(
    Object.entries(fields as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([field, message]) => [rename[field] ?? field, message]),
  );
}
