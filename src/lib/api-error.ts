import axios from 'axios';
import type { ApiErrorPayload } from '@/domain/contracts';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function normalizeApiError(error: unknown): ApiError | unknown {
  if (!axios.isAxiosError<ApiErrorPayload>(error) || axios.isCancel(error)) {
    return error;
  }

  const payload = error.response?.data?.error;

  return new ApiError(
    payload?.message ?? error.message ?? 'Falha na comunicação com a API.',
    error.response?.status ?? null,
    payload?.code ?? 'NETWORK_ERROR',
    payload?.details,
  );
}

/** Mensagem da API para exibição, ou o texto padrão para falhas sem resposta tipada. */
export function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}
